import json
import os
from pathlib import Path

from trainer.model_cache import model_id, model_is_cached, resolutions_for

MODEL_ID = model_id()


def train_sdxl(dataset: Path, output: Path, on_progress) -> None:
    import torch
    free_mb = torch.cuda.mem_get_info()[0] / (1024 * 1024) if torch.cuda.is_available() else 0
    choices = resolutions_for(free_mb)
    last_error = None
    for resolution in choices:
        try:
            train_at(dataset, output, on_progress, resolution)
            return
        except RuntimeError as error:
            last_error = error
            if 'out of memory' not in str(error).lower() or resolution == choices[-1]:
                raise
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
    if last_error:
        raise last_error


def train_at(dataset: Path, output: Path, on_progress, resolution: int) -> None:
    import torch
    import torch.nn.functional as F
    from diffusers import AutoencoderKL, DDPMScheduler, UNet2DConditionModel
    from diffusers.utils import convert_all_state_dict_to_peft, convert_state_dict_to_diffusers, convert_state_dict_to_kohya
    from peft import LoraConfig
    from peft.utils import get_peft_model_state_dict
    from PIL import Image
    from safetensors.torch import load_file, save_file
    from transformers import CLIPTextModel, CLIPTextModelWithProjection, CLIPTokenizer

    manifest = json.loads((dataset / 'lora.json').read_text())
    pairs = []
    for image in manifest.get('images', []):
        path = dataset / 'photos' / image['file']
        if path.is_file():
            caption = (image.get('caption') or manifest.get('triggerWord') or '').strip()
            pairs.append((path, caption))
    if not pairs:
        raise RuntimeError('The photos for this LoRA are missing on the server.')

    rank = positive_int('LORA_RANK', 16)
    steps_per_image = positive_int('LORA_STEPS_PER_IMAGE', 40)
    learning_rate = float(os.environ.get('LORA_LR', '0.0001'))
    total_steps = max(len(pairs), len(pairs) * steps_per_image)
    device = torch.device('cuda')
    math = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    on_progress(6, f'Training at {resolution} pixels so the model fits on the GPU.')

    def load(cls, subfolder: str, dtype):
        cached = model_is_cached()
        attempts = []
        if cached:
            attempts.append({'local_files_only': True, 'variant': 'fp16'})
            attempts.append({'local_files_only': True})
        attempts.append({'variant': 'fp16'})
        attempts.append({})
        last = None
        for extra in attempts:
            try:
                return cls.from_pretrained(MODEL_ID, subfolder=subfolder, torch_dtype=dtype, use_safetensors=True, **extra)
            except Exception as error:
                last = error
        raise RuntimeError(f'Could not load the {subfolder} model. {last}')

    on_progress(8, 'Loading the text encoders onto the GPU.')
    tokenizer_one = CLIPTokenizer.from_pretrained(MODEL_ID, subfolder='tokenizer')
    tokenizer_two = CLIPTokenizer.from_pretrained(MODEL_ID, subfolder='tokenizer_2')
    text_encoder_one = load(CLIPTextModel, 'text_encoder', math).to(device)
    text_encoder_two = load(CLIPTextModelWithProjection, 'text_encoder_2', math).to(device)
    text_encoder_one.requires_grad_(False).eval()
    text_encoder_two.requires_grad_(False).eval()
    on_progress(12, 'Reading the photo captions.')
    encoded = []
    for _path, caption in pairs:
        prompt_embeds, pooled = encode_prompt(caption, tokenizer_one, tokenizer_two, text_encoder_one, text_encoder_two, device)
        if not torch.isfinite(prompt_embeds).all() or not torch.isfinite(pooled).all():
            raise RuntimeError('A caption produced invalid numbers. Shorten that caption and submit the LoRA again.')
        encoded.append((prompt_embeds.float(), pooled.float()))
    del text_encoder_one, text_encoder_two
    torch.cuda.empty_cache()
    on_progress(18, 'Captions are ready.')

    on_progress(20, 'Loading the image encoder onto the GPU.')
    vae = load(AutoencoderKL, 'vae', math).to(device)
    vae.requires_grad_(False).eval()
    cpu_vae = None
    samples = []
    for index, (path, _caption) in enumerate(pairs):
        latent = encode_image(path, vae, resolution, device)
        if not torch.isfinite(latent).all():
            if cpu_vae is None:
                cpu_vae = AutoencoderKL.from_config(vae.config)
                cpu_vae.load_state_dict({key: value.detach().float().cpu() for key, value in vae.state_dict().items()})
                cpu_vae.eval()
            latent = encode_image(path, cpu_vae, resolution, torch.device('cpu'))
        if not torch.isfinite(latent).all():
            raise RuntimeError(f'Photo {index + 1} produced invalid numbers. Remove that photo and submit the LoRA again.')
        samples.append((latent.float(), encoded[index]))
        on_progress(20 + int(10 * (index + 1) / len(pairs)), f'Reading photo {index + 1} of {len(pairs)}.')
    del vae, cpu_vae
    torch.cuda.empty_cache()

    on_progress(32, 'Loading the training network onto the GPU.')
    unet = load(UNet2DConditionModel, 'unet', math).to(device)
    unet.requires_grad_(False)
    unet.add_adapter(LoraConfig(r=rank, lora_alpha=rank, init_lora_weights='gaussian', target_modules=['to_q', 'to_k', 'to_v', 'to_out.0']))
    unet.enable_gradient_checkpointing()
    trainable = [parameter for parameter in unet.parameters() if parameter.requires_grad]
    for parameter in trainable:
        parameter.data = parameter.data.float()
    optimizer = torch.optim.AdamW(trainable, lr=learning_rate, weight_decay=1e-2)
    scheduler = DDPMScheduler.from_pretrained(MODEL_ID, subfolder='scheduler')
    on_progress(35, 'Training the LoRA.')

    unet.train()
    scaler = torch.amp.GradScaler('cuda', enabled=math == torch.float16)
    skipped = 0
    for step in range(total_steps):
        latent, (prompt_embeds, pooled) = samples[step % len(samples)]
        latent = latent.to(device=device, dtype=math)
        prompt_embeds = prompt_embeds.to(device=device, dtype=math)
        pooled = pooled.to(device=device, dtype=math)
        noise = torch.randn_like(latent)
        timestep = torch.randint(0, scheduler.config.num_train_timesteps, (1,), device=device).long()
        noisy = scheduler.add_noise(latent, noise, timestep)
        time_ids = torch.tensor([[resolution, resolution, 0, 0, resolution, resolution]], device=device, dtype=math)
        with torch.autocast(device_type='cuda', dtype=math):
            prediction = unet(
                noisy,
                timestep,
                prompt_embeds,
                added_cond_kwargs={'text_embeds': pooled, 'time_ids': time_ids},
            ).sample
        loss = F.mse_loss(prediction.float(), noise.float())
        if not torch.isfinite(loss):
            skipped += 1
            optimizer.zero_grad(set_to_none=True)
            if skipped > 8:
                raise RuntimeError('Training produced invalid numbers. The GPU math overflowed before a LoRA file could be saved.')
            continue
        if scaler.is_enabled():
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(trainable, 1.0)
            scaler.step(optimizer)
            scaler.update()
        else:
            loss.backward()
            torch.nn.utils.clip_grad_norm_(trainable, 1.0)
            optimizer.step()
        optimizer.zero_grad(set_to_none=True)
        if step % 5 == 0 or step + 1 == total_steps:
            on_progress(35 + int(60 * (step + 1) / total_steps), f'Training the LoRA, step {step + 1} of {total_steps}.')

    unet.eval()
    peft_state = get_peft_model_state_dict(unet)
    diffusers_state = convert_state_dict_to_diffusers(peft_state)
    kohya_state = convert_state_dict_to_kohya(convert_all_state_dict_to_peft(diffusers_state))
    if not kohya_state:
        raise RuntimeError('Training finished without LoRA weights to save.')
    save_file(kohya_state, str(output))
    saved = load_file(str(output))
    if not saved:
        raise RuntimeError('The .safetensors file was empty.')
    on_progress(97, 'Saving the .safetensors file.')


def encode_prompt(caption, tokenizer_one, tokenizer_two, text_encoder_one, text_encoder_two, device):
    import torch

    def tokens(tokenizer, text):
        return tokenizer(
            text,
            padding='max_length',
            max_length=tokenizer.model_max_length,
            truncation=True,
            return_tensors='pt',
        ).input_ids.to(device)

    with torch.no_grad():
        hidden_one = text_encoder_one(tokens(tokenizer_one, caption), output_hidden_states=True).hidden_states[-2]
        second = text_encoder_two(tokens(tokenizer_two, caption), output_hidden_states=True)
        hidden_two = second.hidden_states[-2]
        pooled = second.text_embeds
    return torch.cat([hidden_one, hidden_two], dim=-1), pooled


def encode_image(path: Path, vae, resolution: int, device):
    import numpy as np
    import torch
    from PIL import Image

    image = Image.open(path).convert('RGB')
    width, height = image.size
    scale = resolution / min(width, height)
    resized = image.resize((max(resolution, round(width * scale)), max(resolution, round(height * scale))), Image.Resampling.LANCZOS)
    left = max(0, (resized.width - resolution) // 2)
    top = max(0, (resized.height - resolution) // 2)
    cropped = resized.crop((left, top, left + resolution, top + resolution))
    pixels = torch.from_numpy(np.array(cropped)).float().permute(2, 0, 1).unsqueeze(0) / 127.5 - 1
    pixels = pixels.to(device=device, dtype=vae.dtype)
    with torch.no_grad():
        latent = vae.encode(pixels).latent_dist.sample() * vae.config.scaling_factor
    return latent.float()


def positive_int(name: str, default: int) -> int:
    raw = os.environ.get(name, '').strip()
    if not raw:
        return default
    value = int(raw)
    if value < 1:
        raise RuntimeError(f'{name} must be at least 1.')
    return value
