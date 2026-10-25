import React from 'react';
import { adoptOwnerKey, isOwnerKey, ownerKey } from './session';

export function Shell({
  children,
  onHome,
  onCreate,
}: {
  children: React.ReactNode;
  onHome: () => void;
  onCreate?: () => void;
}) {
  const [recoveryOpen, setRecoveryOpen] = React.useState(false);
  const [code, setCode] = React.useState(ownerKey);
  const [draft, setDraft] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [recoveryError, setRecoveryError] = React.useState('');

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  function useCode(event: React.FormEvent) {
    event.preventDefault();
    if (!isOwnerKey(draft)) {
      setRecoveryError('A recovery code is four groups of letters and numbers, like 1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d.');
      return;
    }
    adoptOwnerKey(draft);
    window.location.assign('/');
  }

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <button type="button" onClick={onHome} className="flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss">
            <span className="grid h-9 w-9 grid-cols-2 gap-0.5 rounded-md bg-ink p-1.5" aria-hidden="true">
              <span className="bg-paper" />
              <span className="bg-moss" />
              <span className="bg-paper/70" />
              <span className="bg-paper" />
            </span>
            <span className="font-serif text-2xl leading-none tracking-tight">LoRA Forge</span>
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setRecoveryOpen((open) => !open); setCode(ownerKey()); setCopied(false); setRecoveryError(''); }} className="rounded-full px-3 py-2 text-sm font-semibold text-ink/70 hover:text-ink">
              Recovery code
            </button>
            {onCreate && (
              <button type="button" onClick={onCreate} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink/90">
                New LoRA
              </button>
            )}
          </div>
        </div>
        {recoveryOpen && (
          <div className="border-t border-line bg-card">
            <div className="mx-auto grid max-w-5xl gap-4 px-5 py-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold">This browser’s code</p>
                <p className="mt-1 text-sm text-ink/70">Your LoRAs and photos stay tied to this code. Copy it before you switch devices.</p>
                <p className="mt-3 break-all rounded-2xl bg-paper px-3 py-2 font-mono text-sm">{code}</p>
                <button type="button" onClick={() => void copyCode().catch(() => setRecoveryError('Could not copy. Select the code and copy it yourself.'))} className="mt-3 text-sm font-semibold text-moss">
                  {copied ? 'Copied' : 'Copy code'}
                </button>
              </div>
              <form onSubmit={useCode}>
                <p className="text-sm font-semibold">Open LoRAs from another code</p>
                <p className="mt-1 text-sm text-ink/70">Paste a recovery code to see the LoRAs saved with it on this browser.</p>
                <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Paste a recovery code" className="mt-3 w-full rounded-2xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-moss" />
                {recoveryError && <p className="mt-2 text-sm text-red-800" role="alert">{recoveryError}</p>}
                <button type="submit" className="mt-3 rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white">Use this code</button>
              </form>
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{children}</p>;
}

export function Hint({
  hint,
  children,
  className = '',
  align = 'start',
  inline = false,
}: {
  hint: string;
  children: (describedBy: string) => React.ReactNode;
  className?: string;
  align?: 'start' | 'end';
  inline?: boolean;
}) {
  const id = React.useId();
  const rootRef = React.useRef<HTMLElement>(null);
  const tipRef = React.useRef<HTMLSpanElement>(null);
  const [above, setAbove] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const place = align === 'end' ? 'right-0' : 'left-0';
  const vertical = above ? 'bottom-full mb-2' : 'top-full mt-2';

  React.useLayoutEffect(() => {
    if (!open || above) return;
    const node = rootRef.current;
    const tip = tipRef.current;
    if (!node || !tip) return;
    const rect = node.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const needed = tip.offsetHeight + 12;
    if (below < needed && rect.top > below) setAbove(true);
  }, [open, above]);

  function show() {
    setAbove(false);
    setOpen(true);
  }

  function hide(event: React.FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }

  const Tag = inline ? 'span' : 'div';
  return (
    <Tag
      ref={rootRef as React.Ref<HTMLDivElement>}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={show}
      onBlurCapture={hide}
      className={`${inline ? 'inline-block' : ''} relative ${open ? 'z-30' : ''} ${className}`}
    >
      {children(id)}
      <span id={id} className="sr-only">{hint}</span>
      <span
        ref={tipRef}
        aria-hidden="true"
        className={`pointer-events-none absolute ${place} ${vertical} z-30 w-72 max-w-[min(18rem,calc(100vw-3rem))] rounded-2xl bg-ink px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-paper shadow-[0_12px_40px_rgba(27,25,20,0.18)] ${open ? 'opacity-100' : 'opacity-0'}`}
      >
        {hint}
      </span>
    </Tag>
  );
}

export const hintLabel = 'underline decoration-dotted decoration-ink/30 underline-offset-4';

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Add photos',
  READY: 'Ready to train',
  TRAINING: 'Waiting for a GPU',
  COMPLETED: 'Ready to download',
  FAILED: 'Needs a look',
};

export const TYPE_LABEL: Record<string, string> = {
  CHARACTER: 'Person',
  STYLE: 'Style',
  OBJECT: 'Object',
};

export const MODEL_LABEL: Record<string, string> = {
  SDXL: 'SDXL',
  FLUX1_DEV: 'Flux',
};

export const STATUS_HINT: Record<string, string> = {
  DRAFT: 'This LoRA still needs photos. Add at least 5 included photos before you can submit training.',
  READY: 'At least 5 photos are included. You can submit training whenever you are ready.',
  TRAINING: 'Training stays at 0% until a GPU worker picks up the job. No .safetensors file is written before that. Your photos stay here.',
  COMPLETED: 'Training finished. Open this LoRA to download the model file.',
  FAILED: 'Training did not finish. Open this LoRA to see what needs another try.',
};

export const TYPE_HINT: Record<string, string> = {
  CHARACTER: 'Teaches the model one face or character. Use photos of the same person from several angles and in different light.',
  STYLE: 'Teaches a look, such as a painting style or a kind of photograph. The subject can change from picture to picture.',
  OBJECT: 'Teaches one product, pet, or thing. Photograph that thing from more than one angle, and leave out pictures where it is hard to see.',
};

export const MODEL_HINT: Record<string, string> = {
  SDXL: 'Choose SDXL if you make images in Forge, ComfyUI, or Automatic1111 with an SDXL checkpoint. This LoRA will not load on Flux.',
  FLUX1_DEV: 'Choose Flux if your image workflow is Flux. This LoRA will not load on an SDXL checkpoint.',
};

export const NAME_HINT = 'The title on your dashboard. Use any name you will recognize. This is separate from the trigger word you type in a prompt.';
export const TRIGGER_HINT = 'The word you type in a prompt to turn this LoRA on. Make it unique, like maraface, so it does not collide with ordinary words. Letters and numbers only, and it has to start with a letter.';
export const CAPTION_HINT = 'A short description of this photo. Training reads it to learn what is in the picture. It starts as your trigger word. Suggest with AI can draft a fuller line, and you can edit it.';
export const SUGGEST_HINT = 'Looks at this photo and drafts a training caption that starts with your trigger word. You can change the words before training.';
export const SUGGEST_OFF_HINT = 'AI captions need an Anthropic API key on the API service. Add ANTHROPIC_API_KEY, then Suggest with AI can describe each photo.';
export const SUGGEST_ALL_HINT = 'Writes a caption for every included photo that still uses only the trigger word. A caption you already edited is left alone.';
export const LEAVE_OUT_HINT = 'Keeps this photo in the project but skips it for training and for the download.';
export const USE_PHOTO_HINT = 'Puts this photo back into training and into the download.';
export const REMOVE_HINT = 'Deletes this photo from the project. This does not affect the other photos.';
export const DOWNLOAD_HINT = 'Saves a zip of the included photos, their captions, and a small lora.json file. A .safetensors file is listed here only after a real training run finishes.';
export const EDIT_HINT = 'Change the name, what this LoRA learns, the base model, or the trigger word. Captions that still start with the old trigger word are updated. These stay locked once training is queued.';
export const REVIEW_HINT = 'Read and edit every caption in one list. Undo puts back the caption from before your last change on that photo.';
export const SHOT_HINT = 'A person LoRA learns a face more steadily from a close-up, a side angle, the full figure, and more than one kind of light. Check these off as you look through the photos.';
export const CONSENT_HINT = 'Required before training. Confirm that you took these photos, or that you have permission to train a model on them.';
export const TRAIN_HINT = 'Queues training on the included photos. You need at least 5 photos and the permission checkbox. The percentage stays at 0% and no .safetensors file is written until a GPU worker starts the run.';
export const DELETE_HINT = 'Removes this LoRA, its photos, and its download from your dashboard.';
export const COUNT_HINT = 'Included photos are the ones used for training and the zip. Uploaded counts every photo, including ones you left out. A project holds up to 50.';
