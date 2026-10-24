import React from 'react';
import { createProject, type BaseModel, type LoraType } from './api';
import { ErrorNote } from './ui';

const TYPES: { id: LoraType; title: string; copy: string }[] = [
  { id: 'CHARACTER', title: 'A person', copy: 'A face or character you want to reuse.' },
  { id: 'STYLE', title: 'A style', copy: 'A look, medium, or visual style.' },
  { id: 'OBJECT', title: 'An object', copy: 'A product, pet, or specific thing.' },
];

const MODELS: { id: BaseModel; title: string; copy: string }[] = [
  { id: 'SDXL', title: 'SDXL', copy: 'Works in Forge, ComfyUI, and Automatic1111.' },
  { id: 'FLUX1_DEV', title: 'Flux', copy: 'For newer Flux workflows.' },
];

function suggestTrigger(name: string): string {
  const word = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return word.length >= 2 ? word : '';
}

export function NewLora({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = React.useState('');
  const [triggerWord, setTriggerWord] = React.useState('');
  const [triggerTouched, setTriggerTouched] = React.useState(false);
  const [loraType, setLoraType] = React.useState<LoraType>('CHARACTER');
  const [baseModel, setBaseModel] = React.useState<BaseModel>('SDXL');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  function changeName(value: string) {
    setName(value);
    if (!triggerTouched) setTriggerWord(suggestTrigger(value));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const project = await createProject({ name, triggerWord, loraType, baseModel });
      onCreated(project.id);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Could not create this LoRA.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl">
      <button type="button" onClick={onCancel} className="text-sm font-semibold text-moss">← All LoRAs</button>
      <h1 className="mt-4 font-serif text-5xl tracking-tight">New LoRA</h1>
      <p className="mt-3 text-lg text-ink/70">Tell us what you want the model to learn. You will add photos on the next screen.</p>

      <label className="mt-8 block">
        <span className="text-sm font-semibold">What should we call it?</span>
        <input value={name} onChange={(event) => changeName(event.target.value)} required minLength={2} placeholder="Mara’s portrait" className="mt-2 w-full rounded-2xl border border-line bg-card px-4 py-3 outline-none focus:border-moss" />
      </label>

      <fieldset className="mt-8">
        <legend className="text-sm font-semibold">What are you training?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {TYPES.map((type) => (
            <label key={type.id} className={`cursor-pointer rounded-2xl border px-4 py-4 ${loraType === type.id ? 'border-moss bg-moss/5' : 'border-line bg-card'}`}>
              <input type="radio" name="type" className="sr-only" checked={loraType === type.id} onChange={() => setLoraType(type.id)} />
              <span className="block font-semibold">{type.title}</span>
              <span className="mt-1 block text-sm text-ink/65">{type.copy}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="text-sm font-semibold">Which base model?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {MODELS.map((model) => (
            <label key={model.id} className={`cursor-pointer rounded-2xl border px-4 py-4 ${baseModel === model.id ? 'border-moss bg-moss/5' : 'border-line bg-card'}`}>
              <input type="radio" name="model" className="sr-only" checked={baseModel === model.id} onChange={() => setBaseModel(model.id)} />
              <span className="block font-semibold">{model.title}</span>
              <span className="mt-1 block text-sm text-ink/65">{model.copy}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-8 block">
        <span className="text-sm font-semibold">Trigger word</span>
        <span className="mt-1 block text-sm text-ink/65">A short unique word you will type to use this LoRA, like <span className="font-semibold text-ink">maraface</span>.</span>
        <input value={triggerWord} onChange={(event) => { setTriggerTouched(true); setTriggerWord(event.target.value); }} required pattern="[A-Za-z][A-Za-z0-9]{1,31}" placeholder="maraface" className="mt-2 w-full rounded-2xl border border-line bg-card px-4 py-3 outline-none focus:border-moss" />
      </label>

      {error && <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-8 flex items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-full bg-moss px-6 py-3 font-semibold text-white hover:bg-mossdark disabled:opacity-60">
          {saving ? 'Creating…' : 'Continue to photos'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-3 text-sm font-semibold text-ink/70">Cancel</button>
      </div>
    </form>
  );
}
