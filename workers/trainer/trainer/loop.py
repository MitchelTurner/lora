import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

DEFAULT_API = 'https://lora-forgeapi-production.up.railway.app'


def argument(args: list[str], name: str) -> str:
    flag = f'--{name}'
    prefix = f'--{name}='
    for index, arg in enumerate(args):
        if arg == flag and index + 1 < len(args) and not args[index + 1].startswith('--'):
            return args[index + 1].strip()
        if arg.startswith(prefix):
            return arg[len(prefix):].strip()
    return ''


def worker_settings(argv: list[str] | None = None) -> tuple[str, str, bool]:
    args = list(sys.argv[1:] if argv is None else argv)
    token = argument(args, 'token') or os.environ.get('WORKER_TOKEN', '')
    base = argument(args, 'api') or os.environ.get('API_BASE', '') or DEFAULT_API
    return token.strip(), base.strip().rstrip('/'), '--once' in args


def main() -> None:
    token, base, once = worker_settings()
    if not token:
        raise SystemExit(
            'Start it with: py -m trainer --token YOUR_TOKEN --api https://your-lora-forge-site\n'
            'Use the same token you set as WORKER_TOKEN on the API service. '
            'Run this from the lora\\workers\\trainer folder.'
        )
    ensure_gpu()
    print(f'GPU worker watching {base}', flush=True)
    while True:
        claimed = run_once(base, token)
        if once:
            return
        time.sleep(2 if claimed else 5)


def ensure_gpu() -> None:
    try:
        import torch
    except ImportError as error:
        raise SystemExit(
            'Install the CUDA build of PyTorch, then start the worker again.\n'
            'pip install torch --index-url https://download.pytorch.org/whl/cu126'
        ) from error
    if not torch.cuda.is_available():
        raise SystemExit(
            'PyTorch cannot see an NVIDIA GPU. Install a current NVIDIA driver and the CUDA build of PyTorch, then start the worker again.'
        )
    print(f'Using GPU {torch.cuda.get_device_name(0)}', flush=True)


def run_once(base: str, token: str) -> bool:
    status, body = call('POST', f'{base}/api/worker/claim', token)
    if status == 204 or not body:
        return False
    if status != 200:
        print(message_from(body, status), flush=True)
        return False
    job = json.loads(body)
    job_id = job['jobId']
    print(f"Training {job.get('name', job_id)}", flush=True)
    try:
        if job.get('baseModel') != 'SDXL':
            raise RuntimeError('This GPU worker trains SDXL LoRAs. Flux training is not available on it yet.')
        with tempfile.TemporaryDirectory(prefix='lora-forge-') as directory:
            dataset = Path(directory)
            download_dataset(base, token, job_id, dataset)
            post_progress(base, token, job_id, 5, 'preprocessing')
            output = dataset / 'lora.safetensors'
            from trainer.train_sdxl import train_sdxl
            train_sdxl(dataset, output, lambda percent: post_progress(base, token, job_id, percent, 'training'))
            upload_model(base, token, job_id, output)
        print(f'Finished {job.get("name", job_id)}', flush=True)
    except Exception as error:
        text = f'{error.__class__.__name__}: {error}'.replace('\n', ' ').strip()[:500]
        print(text, flush=True)
        try:
            call('POST', f'{base}/api/worker/jobs/{job_id}/fail', token, {'error': text})
        except Exception as report_error:
            print(f'Could not report the training error: {report_error}', flush=True)
    return True


def download_dataset(base: str, token: str, job_id: str, dataset: Path) -> None:
    status, body = call('GET', f'{base}/api/worker/jobs/{job_id}/dataset', token, timeout=300)
    if status != 200:
        raise RuntimeError(message_from(body, status))
    zip_path = dataset / 'dataset.zip'
    zip_path.write_bytes(body)
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(dataset)
    zip_path.unlink()


def post_progress(base: str, token: str, job_id: str, progress: int, status: str) -> None:
    code, body = call(
        'POST',
        f'{base}/api/worker/jobs/{job_id}/progress',
        token,
        {'progress': int(progress), 'status': status},
    )
    if code != 200:
        raise RuntimeError(message_from(body, code))


def upload_model(base: str, token: str, job_id: str, path: Path) -> None:
    boundary = '----loraforgeworker'
    payload = path.read_bytes()
    head = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="model"; filename="{path.name}"\r\n'
        'Content-Type: application/octet-stream\r\n\r\n'
    ).encode()
    tail = f'\r\n--{boundary}--\r\n'.encode()
    status, body = call(
        'POST',
        f'{base}/api/worker/jobs/{job_id}/artifact',
        token,
        raw=head + payload + tail,
        content_type=f'multipart/form-data; boundary={boundary}',
        timeout=300,
    )
    if status != 201:
        raise RuntimeError(message_from(body, status))


def call(
    method: str,
    url: str,
    token: str,
    payload: dict | None = None,
    raw: bytes | None = None,
    content_type: str | None = None,
    timeout: int = 60,
) -> tuple[int, bytes]:
    headers = {'authorization': f'Bearer {token}'}
    data = raw
    if payload is not None:
        data = json.dumps(payload).encode()
        headers['content-type'] = 'application/json'
    elif content_type:
        headers['content-type'] = content_type
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def message_from(body: bytes, status: int) -> str:
    try:
        parsed = json.loads(body.decode())
        if isinstance(parsed, dict) and isinstance(parsed.get('error'), str):
            return parsed['error']
    except (UnicodeDecodeError, json.JSONDecodeError):
        pass
    return f'The LoRA service returned {status}.'
