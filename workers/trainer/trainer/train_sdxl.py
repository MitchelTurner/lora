import json
import os
from pathlib import Path

MODEL_ID = os.environ.get('SDXL_MODEL_ID', 'stabilityai/stable-diffusion-xl-base-1.0').strip()


def train_sdxl(dataset: Path, output: Path, on_progress) -> None:
    last_error = None
    for resolution in (1024, 768):
        try:
            train_at(dataset, output, on_progress, resolution)
            return
        except RuntimeError as error:
            last_error = error
            if 'out of memory' not in str(error).lower() or resolution == 768:
                raise
            import torch
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
    on_progress(8)

    def load(cls, subfolder: str, dtype):
        try:
            return cls.from_pretrained(MODEL_ID, subfolder=subfolder, torch_dtype=dtype, use_safetensors=True, variant='fp16')
        except Exception:
            return cls.from_pretrained(MODEL_ID, subfolder=subfolder, torch_dtype=dtype, use_safetensors=True)

    tokenizer_one = CLIPTokenizer.from_pretrained(MODEL_ID, subfolder='tokenizer')
    tokenizer_two = CLIPTokenizer.from_pretrained(MODEL_ID, subfolder='tokenizer_2')
    text_encoder_one = load(CLIPTextModel, 'text_encoder', torch.float16).to(device)
    text_encoder_two = load(CLIPTextModelWithProjection, 'text_encoder_2', torch.float16).to(device)
    text_encoder_one.requires_grad_(False).eval()
    text_encoder_two.requires_grad_(False).eval()
    encoded = [encode_prompt(caption, tokenizer_one, tokenizer_two, text_encoder_one, text_encoder_two, device) for _path, caption in pairs]
    del text_encoder_one, text_encoder_two
    torch.cuda.empty_cache()
    on_progress(18)

    vae = load(AutoencoderKL, 'vae', torch.float32).to(device)
    vae.requires_grad_(False).eval()
    samples = []
    for index, (path, _caption) in enumerate(pairs):
        latent = encode_image(path, vae, resolution, device)
        samples.append((latent, encoded[index]))
        on_progress(18 + int(12 * (index + 1) / len(pairs)))
    del vae
    torch.cuda.empty_cache()

    unet = load(UNet2DConditionModel, 'unet', torch.float16).to(device)
    unet.requires_grad_(False)
    unet.add_adapter(LoraConfig(r=rank, lora_alpha=rank, init_lora_weights='gaussian', target_modules=['to_q', 'to_k', 'to_v', 'to_out.0']))
    unet.enable_gradient_checkpointing()
    trainable = [parameter for parameter in unet.parameters() if parameter.requires_grad]
    for parameter in trainable:
        parameter.data = parameter.data.float()
    optimizer = torch.optim.AdamW(trainable, lr=learning_rate, weight_decay=1e-2)
    scheduler = DDPMScheduler.from_pretrained(MODEL_ID, subfolder='scheduler')
    on_progress(35)

    unet.train()
    for step in range(total_steps):
        latent, (prompt_embeds, pooled) = samples[step % len(samples)]
        noise = torch.randn_like(latent)
        timestep = torch.randint(0, scheduler.config.num_train_timesteps, (1,), device=device).long()
        noisy = scheduler.add_noise(latent, noise, timestep)
        time_ids = torch.tensor([[resolution, resolution, 0, 0, resolution, resolution]], device=device, dtype=prompt_embeds.dtype)
        with torch.autocast(device_type='cuda', dtype=torch.float16):
            prediction = unet(
                noisy,
                timestep,
                prompt_embeds,
                added_cond_kwargs={'text_embeds': pooled, 'time_ids': time_ids},
            ).sample
        loss = F.mse_loss(prediction.float(), noise.float())
        if not torch.isfinite(loss):
            raise RuntimeError('Training produced invalid numbers. Try a smaller LORA_RANK.')
        loss.backward()
        torch.nn.utils.clip_grad_norm_(trainable, 1.0)
        optimizer.step()
        optimizer.zero_grad(set_to_none=True)
        if step % 5 == 0 or step + 1 == total_steps:
            on_progress(35 + int(60 * (step + 1) / total_steps))

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
    on_progress(97)


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
    return latent.to(dtype=torch.float16)


def positive_int(name: str, default: int) -> int:
    raw = os.environ.get(name, '').strip()
    if not raw:
        return default
    value = int(raw)
    if value < 1:
        raise RuntimeError(f'{name} must be at least 1.')
    return value
