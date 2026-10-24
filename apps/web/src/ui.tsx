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
