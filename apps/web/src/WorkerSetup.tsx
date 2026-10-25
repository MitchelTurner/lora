import React from 'react';

function commands(origin: string) {
  const windowsInstall = `cd /d %USERPROFILE% && git clone https://github.com/MitchelTurner/lora.git && cd /d %USERPROFILE%\\lora\\workers\\trainer && py -m pip install torch --index-url https://download.pytorch.org/whl/cu124 && py -m pip install -r requirements.txt && py -m trainer --token paste-your-token --api ${origin}`;
  const windowsStart = `cd /d %USERPROFILE%\\lora\\workers\\trainer && py -m trainer --token paste-your-token --api ${origin}`;
  const unixInstall = `cd "$HOME" && git clone https://github.com/MitchelTurner/lora.git && cd "$HOME/lora/workers/trainer" && python3 -m pip install torch --index-url https://download.pytorch.org/whl/cu124 && python3 -m pip install -r requirements.txt && python3 -m trainer --token paste-your-token --api ${origin}`;
  const unixStart = `cd "$HOME/lora/workers/trainer" && python3 -m trainer --token paste-your-token --api ${origin}`;
  return { windowsInstall, windowsStart, unixInstall, unixStart };
}

function copyWithFallback(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.focus();
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [notice, setNotice] = React.useState('');

  async function copy() {
    setNotice('Copying…');
    let ok = false;
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('clipboard timeout')), 1500);
        }),
      ]);
      ok = true;
    } catch {
      ok = copyWithFallback(text);
    }
    setNotice(ok ? 'Copied' : 'Select the command and copy it');
    window.setTimeout(() => setNotice(''), 2000);
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <button type="button" onClick={() => void copy()} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-moss hover:bg-white">
          {notice || 'Copy'}
        </button>
      </div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-paper p-3 text-left text-xs leading-relaxed text-ink">{text}</pre>
    </div>
  );
}

export function WorkerSetup({ flux = false }: { flux?: boolean }) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const script = commands(origin);

  return (
    <div>
      <div className="space-y-2 text-sm leading-relaxed text-ink/70">
        <p>This page cannot start the GPU. Leave Command Prompt open on the computer with the NVIDIA card. The worker trains the next SDXL job and uploads the .safetensors file. The percentage stays at 0% until that window is running.</p>
        <p>On Windows, open Command Prompt. Copy the Windows line, paste it as one line, and press Enter once. Pasting several lines at once joins them into a bad path.</p>
        <p>On the API service, set <span className="font-semibold text-ink">WORKER_TOKEN</span> to a long secret and restart that service. Paste the same secret in place of <span className="font-semibold text-ink">paste-your-token</span>.</p>
        {flux && <p className="text-sm text-red-800" role="alert">This worker trains SDXL. A Flux job stays waiting, because this computer cannot finish it.</p>}
      </div>
      <CopyBlock label="Windows, first time" text={script.windowsInstall} />
      <CopyBlock label="Windows, start again" text={script.windowsStart} />
      <CopyBlock label="Mac or Linux, first time" text={script.unixInstall} />
      <CopyBlock label="Mac or Linux, start again" text={script.unixStart} />
    </div>
  );
}
