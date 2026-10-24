import React from 'react';

export function Shell({
  children,
  onHome,
  onCreate,
}: {
  children: React.ReactNode;
  onHome: () => void;
  onCreate?: () => void;
}) {
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
          {onCreate && (
            <button type="button" onClick={onCreate} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink/90">
              New LoRA
            </button>
          )}
        </div>
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
  const [above, setAbove] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const place = align === 'end' ? 'right-0' : 'left-0';
  const vertical = above ? 'bottom-full mb-2' : 'top-full mt-2';

  function show() {
    const node = rootRef.current;
    if (node) {
      const rect = node.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      const aboveRoom = rect.top;
      setAbove(below < 160 && aboveRoom > below);
    }
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
        aria-hidden="true"
        className={`pointer-events-none absolute ${place} ${vertical} z-30 w-72 max-w-[min(18rem,calc(100vw-3rem))] rounded-2xl bg-ink px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-paper shadow-[0_12px_40px_rgba(27,25,20,0.18)] transition-opacity duration-150 ${open ? 'opacity-100' : 'opacity-0'}`}
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
  TRAINING: 'Training queued',
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
  TRAINING: 'Training is waiting for a GPU worker. Your photos stay here, and the LoRA file appears when the run finishes.',
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
export const CAPTION_HINT = 'A short description of this photo. Training reads it to learn what is in the picture. It starts as your trigger word, and you can make it more specific.';
export const LEAVE_OUT_HINT = 'Keeps this photo in the project but skips it for training and for the download.';
export const USE_PHOTO_HINT = 'Puts this photo back into training and into the download.';
export const REMOVE_HINT = 'Deletes this photo from the project. This does not affect the other photos.';
export const DOWNLOAD_HINT = 'Saves a zip of the included photos, their captions, and a small lora.json file. The trained .safetensors file is added here only after training finishes.';
export const CONSENT_HINT = 'Required before training. Confirm that you took these photos, or that you have permission to train a model on them.';
export const TRAIN_HINT = 'Queues training on the included photos. You need at least 5 photos and the permission checkbox. The LoRA file appears on this page when a GPU worker finishes.';
export const DELETE_HINT = 'Removes this LoRA, its photos, and its download from your dashboard.';
export const COUNT_HINT = 'Included photos are the ones used for training and the zip. Uploaded counts every photo, including ones you left out. A project holds up to 50.';
