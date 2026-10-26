import os
from pathlib import Path

DEFAULT_MODEL = 'stabilityai/stable-diffusion-xl-base-1.0'
FP16_PATTERNS = (
    'model_index.json',
    'scheduler/*',
    'tokenizer/*',
    'tokenizer_2/*',
    'text_encoder/config.json',
    'text_encoder/model.fp16.safetensors',
    'text_encoder_2/config.json',
    'text_encoder_2/model.fp16.safetensors',
    'vae/config.json',
    'vae/diffusion_pytorch_model.fp16.safetensors',
    'unet/config.json',
    'unet/diffusion_pytorch_model.fp16.safetensors',
)
WEIGHT_NAMES = (
    'unet/diffusion_pytorch_model.fp16.safetensors',
    'unet/diffusion_pytorch_model.safetensors',
)


def model_id() -> str:
    return os.environ.get('SDXL_MODEL_ID', DEFAULT_MODEL).strip() or DEFAULT_MODEL


def hub_dir() -> Path:
    override = os.environ.get('HF_HUB_CACHE', '').strip()
    if override:
        return Path(override)
    home = os.environ.get('HF_HOME', '').strip()
    if home:
        return Path(home) / 'hub'
    return Path.home() / '.cache' / 'huggingface' / 'hub'


def resolutions_for(free_mb: float) -> tuple[int, ...]:
    if free_mb >= 10_000:
        return (1024, 768)
    return (768,)


def model_is_cached(identifier: str | None = None) -> bool:
    name = identifier if identifier is not None else model_id()
    direct = Path(name)
    if direct.is_dir():
        return any((direct / weight).is_file() for weight in WEIGHT_NAMES)
    folder = hub_dir() / ('models--' + name.replace('/', '--'))
    if not folder.is_dir():
        return False
    return any(folder.rglob(Path(weight).name) for weight in WEIGHT_NAMES)


def warm_base_model(on_stage) -> None:
    if model_is_cached():
        on_stage('The base model is already saved on this computer.')
        return
    on_stage('Downloading the base model. The first download is about 7 GB.')
    try:
        from huggingface_hub import snapshot_download
        from tqdm.auto import tqdm
    except ImportError:
        on_stage('The base model will download when a job starts.')
        return

    class DownloadBar(tqdm):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._reported = 0.0

        def update(self, n=1):
            shown = super().update(n)
            import time
            now = time.time()
            if self.total and now - self._reported >= 2:
                self._reported = now
                done = self.n / 1_000_000_000
                total = self.total / 1_000_000_000
                on_stage(f'Downloading the base model, {done:.1f} GB of {total:.1f} GB.')
            return shown

    try:
        snapshot_download(repo_id=model_id(), allow_patterns=list(FP16_PATTERNS), tqdm_class=DownloadBar)
    except Exception as error:
        on_stage(f'The base model will download when a job starts. {error}'.replace('\n', ' ')[:180])
        return
    if model_is_cached():
        on_stage('The base model is saved on this computer.')
    else:
        on_stage('The base model will download when a job starts.')
