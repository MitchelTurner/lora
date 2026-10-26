import React from 'react';

function safeToken(value: string): string {
  const token = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(token)) return '';
  return token;
}

function commands(origin: string, token: string) {
  const windowsInstall = `cd /d %USERPROFILE% && curl -L --ssl-no-revoke -o lora.zip https://github.com/MitchelTurner/lora/archive/refs/heads/main.zip && tar -xf lora.zip && cd /d %USERPROFILE%\\lora-main\\workers\\trainer && py -m pip install torch --index-url https://download.pytorch.org/whl/cu126 && py -m pip install -r requirements.txt && py -m trainer --token ${token} --api ${origin}`;
  const windowsStart = `cd /d %USERPROFILE%\\lora-main\\workers\\trainer && py -m trainer --token ${token} --api ${origin}`;
  const unixInstall = `cd "$HOME" && git clone https://github.com/MitchelTurner/lora.git && cd "$HOME/lora/workers/trainer" && python3 -m pip install torch --index-url https://download.pytorch.org/whl/cu126 && python3 -m pip install -r requirements.txt && python3 -m trainer --token ${token} --api ${origin}`;
  const unixStart = `cd "$HOME/lora/workers/trainer" && python3 -m trainer --token ${token} --api ${origin}`;
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

function CopyBlock({ label, text, disabled = false }: { label: string; text: string; disabled?: boolean }) {
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
        <button type="button" disabled={disabled} onClick={() => void copy()} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-moss hover:bg-white disabled:cursor-not-allowed disabled:text-ink/30">
          {notice || (disabled ? 'Type a token' : 'Copy')}
        </button>
      </div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-paper p-3 text-left text-xs leading-relaxed text-ink">{text}</pre>
    </div>
  );
}

export function WorkerSetup({ flux = false }: { flux?: boolean }) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const [token, setToken] = React.useState('');
  const ready = safeToken(token);
  const script = commands(origin, ready || 'YOUR-TOKEN');
  const invalid = token.trim() !== '' && ready === '';

  return (
    <div>
      <div className="space-y-2 text-sm leading-relaxed text-ink/70">
        <p>This page cannot start the GPU. Leave Command Prompt open on the computer with the NVIDIA card. The worker trains the next SDXL job and uploads the .safetensors file. The percentage stays at 0% until that window is running.</p>
        <p>On Windows, open Command Prompt. Type the token below, copy the Windows line, paste it as one line, and press Enter once. Git is not required. The line downloads the project as a zip.</p>
        <p>On the API service, set <span className="font-semibold text-ink">WORKER_TOKEN</span> to the same letters and numbers, then restart that service.</p>
        {flux && <p className="text-sm text-red-800" role="alert">This worker trains SDXL. A Flux job stays waiting, because this computer cannot finish it.</p>}
      </div>
      <label className="mt-4 block">
        <span className="text-sm font-semibold">Worker token</span>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="Type the token from the API service"
          className="mt-2 w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-moss"
        />
      </label>
      {invalid && <p className="mt-2 text-sm text-red-800" role="alert">Use letters and numbers only. Spaces and symbols are left out of the copied command.</p>}
      {!ready && <p className="mt-2 text-sm text-ink/60">Type the token, then copy the line. The command updates with what you type.</p>}
      <CopyBlock label="Windows, first time" text={script.windowsInstall} disabled={!ready} />
      <CopyBlock label="Windows, start again" text={script.windowsStart} disabled={!ready} />
      <CopyBlock label="Mac or Linux, first time" text={script.unixInstall} disabled={!ready} />
      <CopyBlock label="Mac or Linux, start again" text={script.unixStart} disabled={!ready} />
    </div>
  );
}
