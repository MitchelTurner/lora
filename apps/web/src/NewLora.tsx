import React from 'react';
import { createProject, type BaseModel, type LoraType } from './api';
import { ErrorNote, Hint, MODEL_HINT, NAME_HINT, TRIGGER_HINT, TYPE_HINT, hintLabel } from './ui';

const TYPES: { id: LoraType; title: string; copy: string; hint: string }[] = [
  { id: 'CHARACTER', title: 'A person', copy: 'A face or character you want to reuse.', hint: TYPE_HINT.CHARACTER },
  { id: 'STYLE', title: 'A style', copy: 'A look, medium, or visual style.', hint: TYPE_HINT.STYLE },
  { id: 'OBJECT', title: 'An object', copy: 'A product, pet, or specific thing.', hint: TYPE_HINT.OBJECT },
];

const MODELS: { id: BaseModel; title: string; copy: string; hint: string }[] = [
  { id: 'SDXL', title: 'SDXL', copy: 'Works in Forge, ComfyUI, and Automatic1111.', hint: MODEL_HINT.SDXL },
  { id: 'FLUX1_DEV', title: 'Flux', copy: 'For newer Flux workflows.', hint: MODEL_HINT.FLUX1_DEV },
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

      <Hint hint={NAME_HINT} className="mt-8">
        {(id) => (
          <label className="block">
            <span className={`text-sm font-semibold ${hintLabel}`}>What should we call it?</span>
            <input aria-describedby={id} value={name} onChange={(event) => changeName(event.target.value)} required minLength={2} placeholder="Mara’s portrait" className="mt-2 w-full rounded-2xl border border-line bg-card px-4 py-3 outline-none focus:border-moss" />
          </label>
        )}
      </Hint>

      <fieldset className="mt-8">
        <legend>
          <Hint inline hint="Choose what this LoRA should learn. A person, a style, and an object need different kinds of photos.">
            {(id) => <span aria-describedby={id} className={`text-sm font-semibold ${hintLabel}`}>What are you training?</span>}
          </Hint>
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {TYPES.map((type) => (
            <Hint key={type.id} hint={type.hint} className="h-full">
              {(id) => (
                <label aria-describedby={id} className={`block h-full cursor-pointer rounded-2xl border px-4 py-4 ${loraType === type.id ? 'border-moss bg-moss/5' : 'border-line bg-card'}`}>
                  <input type="radio" name="type" className="sr-only" checked={loraType === type.id} onChange={() => setLoraType(type.id)} />
                  <span className="block font-semibold">{type.title}</span>
                  <span className="mt-1 block text-sm text-ink/65">{type.copy}</span>
                </label>
              )}
            </Hint>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend>
          <Hint inline hint="The finished LoRA only works with the base model you pick here. Match it to the checkpoint you already use.">
            {(id) => <span aria-describedby={id} className={`text-sm font-semibold ${hintLabel}`}>Which base model?</span>}
          </Hint>
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {MODELS.map((model) => (
            <Hint key={model.id} hint={model.hint} className="h-full">
              {(id) => (
                <label aria-describedby={id} className={`block h-full cursor-pointer rounded-2xl border px-4 py-4 ${baseModel === model.id ? 'border-moss bg-moss/5' : 'border-line bg-card'}`}>
                  <input type="radio" name="model" className="sr-only" checked={baseModel === model.id} onChange={() => setBaseModel(model.id)} />
                  <span className="block font-semibold">{model.title}</span>
                  <span className="mt-1 block text-sm text-ink/65">{model.copy}</span>
                </label>
              )}
            </Hint>
          ))}
        </div>
      </fieldset>

      <Hint hint={TRIGGER_HINT} className="mt-8">
        {(id) => (
          <label className="block">
            <span className={`text-sm font-semibold ${hintLabel}`}>Trigger word</span>
            <span className="mt-1 block text-sm text-ink/65">A short unique word you will type to use this LoRA, like <span className="font-semibold text-ink">maraface</span>.</span>
            <input aria-describedby={id} value={triggerWord} onChange={(event) => { setTriggerTouched(true); setTriggerWord(event.target.value); }} required pattern="[A-Za-z][A-Za-z0-9]{1,31}" placeholder="maraface" className="mt-2 w-full rounded-2xl border border-line bg-card px-4 py-3 outline-none focus:border-moss" />
          </label>
        )}
      </Hint>

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
