import React from 'react';
import { captionHelp, deletePhoto, deleteProject, downloadUrl, getProject, MISSING_LORA, submitTraining, suggestCaption, updatePhoto, updateProject, uploadPhotos, type BaseModel, type LoraType, type ProjectDetail } from './api';
import { preparePhotos } from './photos';
import { inspectPhoto, nearDuplicate } from './quality';
import { CAPTION_HINT, CONSENT_HINT, COUNT_HINT, DELETE_HINT, DOWNLOAD_HINT, EDIT_HINT, ErrorNote, Hint, LEAVE_OUT_HINT, MODEL_HINT, MODEL_LABEL, REMOVE_HINT, REVIEW_HINT, SHOT_HINT, STATUS_HINT, STATUS_LABEL, SUGGEST_ALL_HINT, SUGGEST_HINT, SUGGEST_OFF_HINT, TRAIN_HINT, TRIGGER_HINT, TYPE_HINT, TYPE_LABEL, USE_PHOTO_HINT, hintLabel } from './ui';

const MIN_PHOTOS = 5;
const SHOTS = [
  { id: 'close', label: 'Close-up of the face' },
  { id: 'side', label: 'A side angle' },
  { id: 'full', label: 'The full figure' },
  { id: 'light', label: 'Different lighting' },
] as const;

function onlyTrigger(caption: string, trigger: string): boolean {
  const text = caption.trim().toLowerCase();
  return text === '' || text === trigger.trim().toLowerCase();
}

export function ProjectView({ id, onBack }: { id: string; onBack: () => void }) {
  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [error, setError] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [uploadNote, setUploadNote] = React.useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [consent, setConsent] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [captionHelpOn, setCaptionHelpOn] = React.useState<boolean | null>(null);
  const [suggesting, setSuggesting] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [reviewing, setReviewing] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: '', triggerWord: '', loraType: 'CHARACTER' as LoraType, baseModel: 'SDXL' as BaseModel });
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [photoNotes, setPhotoNotes] = React.useState<Record<string, { soft: boolean; small: boolean; duplicate: boolean }>>({});
  const [priorCaptions, setPriorCaptions] = React.useState<Record<string, string>>({});
  const [shots, setShots] = React.useState<Record<string, boolean>>({});
  const photosRef = React.useRef<HTMLUListElement>(null);
  const uploadRef = React.useRef<(list: FileList | File[]) => void>(() => {});

  async function reload() {
    setProject(await getProject(id));
  }

  React.useEffect(() => {
    let active = true;
    captionHelp()
      .then((result) => { if (active) setCaptionHelpOn(result.available); })
      .catch(() => { if (active) setCaptionHelpOn(false); });
    return () => { active = false; };
  }, []);

  function applyCaption(imageId: string, caption: string) {
    setProject((current) => current ? {
      ...current,
      images: current.images.map((item) => item.id === imageId ? { ...item, caption } : item),
    } : current);
  }

  async function suggestOne(imageId: string) {
    const existing = project?.images.find((item) => item.id === imageId);
    if (existing) rememberCaption(imageId, existing.caption);
    setSuggesting(imageId);
    setError('');
    try {
      const result = await suggestCaption(id, imageId);
      applyCaption(imageId, result.caption);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Could not write a caption.');
    } finally {
      setSuggesting(null);
    }
  }

  async function suggestUntouched() {
    const current = project;
    if (!current) return;
    const targets = current.images.filter((image) => !image.excluded && (image.caption.trim() === '' || image.caption.trim() === current.triggerWord));
    if (targets.length === 0) {
      setError('Every included photo already has its own caption. Use Suggest with AI on a photo to rewrite one.');
      return;
    }
    setError('');
    for (const image of targets) {
      setSuggesting(image.id);
      try {
        const result = await suggestCaption(id, image.id);
        applyCaption(image.id, result.caption);
      } catch (reason: unknown) {
        setSuggesting(null);
        setError(reason instanceof Error ? reason.message : 'Could not write a caption.');
        return;
      }
    }
    setSuggesting(null);
  }

  React.useEffect(() => {
    let active = true;
    getProject(id)
      .then((result) => { if (active) { setError(''); setProject(result); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not open this LoRA.'); });
    return () => { active = false; };
  }, [id]);

  React.useEffect(() => {
    if (project?.status !== 'TRAINING') return;
    const timer = window.setInterval(() => {
      void getProject(id).then(setProject).catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : '';
        if (message === MISSING_LORA) {
          setProject(null);
          setError(message);
        }
      });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [id, project?.status]);

  React.useEffect(() => {
    function onFocus() {
      void getProject(id).catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : '';
        if (message === MISSING_LORA) {
          setProject(null);
          setError(message);
        }
      });
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [id]);

  React.useEffect(() => {
    const saved = localStorage.getItem(`lora-forge-shots:${id}`);
    if (!saved) {
      setShots({});
      return;
    }
    try {
      const parsed = JSON.parse(saved) as Record<string, boolean>;
      setShots(parsed);
    } catch {
      setShots({});
    }
  }, [id]);

  const imagesRef = React.useRef(project?.images ?? []);
  imagesRef.current = project?.images ?? [];
  const inspectionKey = (project?.images ?? []).map((image) => `${image.id}:${image.excluded ? 1 : 0}:${image.width}x${image.height}`).join('|');

  React.useEffect(() => {
    const included = imagesRef.current.filter((image) => !image.excluded);
    let cancel = false;
    void (async () => {
      const inspected: { id: string; hash: string; soft: boolean; small: boolean }[] = [];
      for (const image of included) {
        try {
          const result = await inspectPhoto(image.url, image.width, image.height);
          inspected.push({ id: image.id, ...result });
        } catch {
          inspected.push({ id: image.id, hash: '', soft: false, small: Math.min(image.width, image.height) < 512 });
        }
      }
      if (cancel) return;
      const notes: Record<string, { soft: boolean; small: boolean; duplicate: boolean }> = {};
      for (const image of inspected) {
        notes[image.id] = {
          soft: image.soft,
          small: image.small,
          duplicate: inspected.some((other) => other.id !== image.id && nearDuplicate(image.hash, other.hash)),
        };
      }
      setPhotoNotes(notes);
    })();
    return () => { cancel = true; };
  }, [inspectionKey]);

  function rememberCaption(imageId: string, caption: string) {
    setPriorCaptions((current) => current[imageId] === undefined ? { ...current, [imageId]: caption } : current);
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    setSavingEdit(true);
    setError('');
    try {
      setProject(await updateProject(id, draft));
      setEditing(false);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Could not save those settings.');
    } finally {
      setSavingEdit(false);
    }
  }

  function toggleShot(shotId: string) {
    setShots((current) => {
      const next = { ...current, [shotId]: !current[shotId] };
      localStorage.setItem(`lora-forge-shots:${id}`, JSON.stringify(next));
      return next;
    });
  }

  const scrollPhotos = React.useRef(false);

  React.useEffect(() => {
    if (!scrollPhotos.current || !photosRef.current) return;
    scrollPhotos.current = false;
    photosRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [project]);

  async function addFiles(list: FileList | File[]) {
    const chosen = Array.from(list);
    if (chosen.length === 0) {
      setUploadNote({ tone: 'bad', text: 'No photo was added. Choose a JPG, PNG, or WebP.' });
      return;
    }
    setUploading(true);
    setError('');
    setUploadNote(null);
    try {
      const prepared = await preparePhotos(chosen);
      const skipped = prepared.skippedHeic + prepared.skippedOther;
      if (prepared.files.length === 0) {
        setUploadNote({
          tone: 'bad',
          text: prepared.skippedHeic > 0
            ? 'These are iPhone HEIC photos, so they were not added. Save them as JPG and try again. On iPhone, set Settings → Camera → Formats to Most Compatible.'
            : 'Choose JPG, PNG, or WebP photos.',
        });
        return;
      }
      const result = await uploadPhotos(id, prepared.files);
      const next = result.project?.images ? result.project : await getProject(id);
      setProject(next);
      const added = result.added ?? next.images.length;
      const missed = prepared.files.length - added;
      if (added < 1) {
        setUploadNote({ tone: 'bad', text: 'Those photos were not added. Use JPG, PNG, or WebP under 15 MB each.' });
        return;
      }
      const noun = added === 1 ? 'photo' : 'photos';
      let text = `Added ${added} ${noun}.`;
      if (skipped > 0 || missed > 0) {
        const leftOut = skipped + Math.max(missed, 0);
        text += prepared.skippedHeic > 0
          ? ` ${leftOut} file${leftOut === 1 ? '' : 's'} were left out. HEIC photos need to be saved as JPG.`
          : ` ${leftOut} file${leftOut === 1 ? '' : 's'} were left out because they were not JPG, PNG, or WebP under 15 MB.`;
      } else {
        text += added === 1 ? ' It is listed below.' : ' They are listed below.';
      }
      setUploadNote({ tone: 'ok', text });
      scrollPhotos.current = true;
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'Upload failed.';
      if (message === MISSING_LORA) {
        setProject(null);
        setError(message);
        setUploadNote(null);
        return;
      }
      setUploadNote({ tone: 'bad', text: message });
    } finally {
      setUploading(false);
    }
  }

  uploadRef.current = (list) => { void addFiles(list); };

  React.useEffect(() => {
    function hasFiles(event: DragEvent) {
      return Array.from(event.dataTransfer?.types ?? []).includes('Files');
    }
    function onDragOver(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
    }
    function onDrop(event: DragEvent) {
      if (event.defaultPrevented || !event.dataTransfer?.files?.length) return;
      event.preventDefault();
      uploadRef.current(event.dataTransfer.files);
    }
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  async function train() {
    setSubmitting(true);
    setError('');
    try {
      setProject(await submitTraining(id));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Could not submit training.');
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !project) {
    return (
      <div>
        <button type="button" onClick={onBack} className="text-sm font-semibold text-moss">← All LoRAs</button>
        {error === MISSING_LORA && <h1 className="mt-4 font-serif text-4xl tracking-tight">This LoRA is not on the server</h1>}
        <div className="mt-4 max-w-xl"><ErrorNote>{error}</ErrorNote></div>
      </div>
    );
  }
  if (!project) return <p className="text-ink/60">Loading this LoRA…</p>;

  const queued = project.latestJob && ['queued', 'preprocessing', 'training'].includes(project.latestJob.status);
  const readyCount = project.includedCount;

  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm font-semibold text-moss">← All LoRAs</button>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Hint inline hint={STATUS_HINT[project.status] ?? 'Where this LoRA is in the process.'}>
            {(describedBy) => <span aria-describedby={describedBy} className={`text-sm font-semibold uppercase tracking-[0.14em] text-moss ${hintLabel}`}>{STATUS_LABEL[project.status]}</span>}
          </Hint>
          <h1 className="mt-1 font-serif text-5xl tracking-tight">{project.name}</h1>
          <Hint hint={EDIT_HINT} className="mt-2">
            {(describedBy) => (
              <button type="button" aria-describedby={describedBy} onClick={() => { setDraft({ name: project.name, triggerWord: project.triggerWord, loraType: project.loraType, baseModel: project.baseModel }); setEditing((open) => !open); }} className={`text-sm font-semibold text-moss ${hintLabel}`}>
                {editing ? 'Close settings' : 'Edit settings'}
              </button>
            )}
          </Hint>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 text-ink/70">
            <Hint inline hint={TYPE_HINT[project.loraType] ?? 'What this LoRA is learning.'}>
              {(describedBy) => <span aria-describedby={describedBy} className={hintLabel}>{TYPE_LABEL[project.loraType]}</span>}
            </Hint>
            <span aria-hidden="true">·</span>
            <Hint inline hint={MODEL_HINT[project.baseModel] ?? 'The checkpoint this LoRA was made for.'}>
              {(describedBy) => <span aria-describedby={describedBy} className={hintLabel}>{MODEL_LABEL[project.baseModel]}</span>}
            </Hint>
            <span aria-hidden="true">·</span>
            <Hint inline hint={TRIGGER_HINT}>
              {(describedBy) => <span aria-describedby={describedBy}>trigger word <span className={`font-semibold text-ink ${hintLabel}`}>{project.triggerWord}</span></span>}
            </Hint>
          </div>
        </div>
        <Hint hint={DELETE_HINT} align="end">
          {(describedBy) => (
            <button type="button" aria-describedby={describedBy} onClick={() => { if (window.confirm('Delete this LoRA and its photos?')) void deleteProject(id).then(onBack).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not delete this LoRA.')); }} className={`text-sm font-semibold text-ink/50 hover:text-red-700 ${hintLabel}`}>
              Delete
            </button>
          )}
        </Hint>
      </div>

      {editing && (
        <form onSubmit={(event) => void saveEdit(event)} className="mt-6 grid gap-4 rounded-[2rem] border border-line bg-card p-6">
          <label className="block text-sm font-semibold">
            Name
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required minLength={2} className="mt-2 w-full rounded-2xl border border-line bg-paper px-4 py-3 font-normal outline-none focus:border-moss" />
          </label>
          <label className="block text-sm font-semibold">
            What it learns
            <select value={draft.loraType} disabled={project.status === 'TRAINING' || project.status === 'COMPLETED'} onChange={(event) => setDraft((current) => ({ ...current, loraType: event.target.value as LoraType }))} className="mt-2 w-full rounded-2xl border border-line bg-paper px-4 py-3 font-normal outline-none focus:border-moss disabled:opacity-50">
              <option value="CHARACTER">A person</option>
              <option value="STYLE">A style</option>
              <option value="OBJECT">An object</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Base model
            <select value={draft.baseModel} disabled={project.status === 'TRAINING' || project.status === 'COMPLETED'} onChange={(event) => setDraft((current) => ({ ...current, baseModel: event.target.value as BaseModel }))} className="mt-2 w-full rounded-2xl border border-line bg-paper px-4 py-3 font-normal outline-none focus:border-moss disabled:opacity-50">
              <option value="SDXL">SDXL</option>
              <option value="FLUX1_DEV">Flux</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Trigger word
            <input value={draft.triggerWord} disabled={project.status === 'TRAINING' || project.status === 'COMPLETED'} onChange={(event) => setDraft((current) => ({ ...current, triggerWord: event.target.value }))} required pattern="[A-Za-z][A-Za-z0-9]{1,31}" className="mt-2 w-full rounded-2xl border border-line bg-paper px-4 py-3 font-normal outline-none focus:border-moss disabled:opacity-50" />
          </label>
          {(project.status === 'TRAINING' || project.status === 'COMPLETED') && <p className="text-sm text-ink/60">The name can still change. The trigger word, subject, and base model stay as they were when you submitted.</p>}
          <button type="submit" disabled={savingEdit} className="w-fit rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-50">{savingEdit ? 'Saving…' : 'Save settings'}</button>
        </form>
      )}

      <section
        className={`mt-8 rounded-[2rem] border-2 border-dashed px-5 py-8 text-center ${dragOver ? 'border-moss bg-moss/5' : 'border-line bg-card'}`}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => { event.preventDefault(); setDragOver(false); if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files); }}
      >
        <h2 className="font-serif text-3xl">Add the photos</h2>
        <p className="mx-auto mt-2 max-w-md text-ink/70">Drop them here or browse. Ten to twenty pictures, with different angles and lighting, train a steadier LoRA.</p>
        <div className="mt-5 flex flex-col items-center gap-4">
          <div className={`relative ${uploading ? 'opacity-60' : ''}`}>
            <span aria-hidden="true" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper">
              {uploading ? 'Adding photos…' : 'Browse photos'}
            </span>
            <input
              type="file"
              accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp"
              multiple
              disabled={uploading}
              aria-label="Browse photos"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
              onChange={(event) => {
                const chosen = event.target.files ? Array.from(event.target.files) : [];
                event.target.value = '';
                if (chosen.length === 0) {
                  setUploadNote({ tone: 'bad', text: 'No photo was added. Choose a JPG, PNG, or WebP.' });
                  return;
                }
                void addFiles(chosen);
              }}
            />
          </div>
          {uploadNote?.tone === 'ok' && <p role="status" className="text-sm font-semibold text-moss">{uploadNote.text}</p>}
          {uploadNote?.tone === 'bad' && <div className="w-full max-w-md text-left"><ErrorNote>{uploadNote.text}</ErrorNote></div>}
          <Hint hint={COUNT_HINT}>
            {(describedBy) => <p aria-describedby={describedBy} className={`text-xs text-ink/45 ${hintLabel}`}>{readyCount} included · {project.imageCount} uploaded · 50 max</p>}
          </Hint>
          {project.images.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Hint hint={captionHelpOn === false ? SUGGEST_OFF_HINT : SUGGEST_ALL_HINT}>
                {(describedBy) => (
                  <button type="button" aria-describedby={describedBy} disabled={suggesting !== null} onClick={() => void suggestUntouched()} className={`rounded-full border border-moss px-4 py-2 text-sm font-semibold text-moss disabled:opacity-50 ${hintLabel}`}>
                    {suggesting ? 'Writing captions…' : 'Suggest captions with AI'}
                  </button>
                )}
              </Hint>
              <Hint hint={REVIEW_HINT}>
                {(describedBy) => (
                  <button type="button" aria-describedby={describedBy} onClick={() => setReviewing((open) => !open)} className={`rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink ${hintLabel}`}>
                    {reviewing ? 'Show photo grid' : 'Review captions'}
                  </button>
                )}
              </Hint>
            </div>
          )}
        </div>
      </section>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      {project.images.some((image) => !image.excluded && (onlyTrigger(image.caption, project.triggerWord) || photoNotes[image.id]?.soft || photoNotes[image.id]?.small || photoNotes[image.id]?.duplicate)) && (
        <div className="mt-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink/80" role="status">
          Some included photos need a look before training.
          {' '}
          {project.images.filter((image) => !image.excluded && photoNotes[image.id]?.soft).length > 0 && <span>{project.images.filter((image) => !image.excluded && photoNotes[image.id]?.soft).length} look soft. </span>}
          {project.images.filter((image) => !image.excluded && photoNotes[image.id]?.small).length > 0 && <span>{project.images.filter((image) => !image.excluded && photoNotes[image.id]?.small).length} are small. </span>}
          {project.images.filter((image) => !image.excluded && photoNotes[image.id]?.duplicate).length > 0 && <span>{project.images.filter((image) => !image.excluded && photoNotes[image.id]?.duplicate).length} look like duplicates. </span>}
          {project.images.filter((image) => !image.excluded && onlyTrigger(image.caption, project.triggerWord)).length > 0 && <span>{project.images.filter((image) => !image.excluded && onlyTrigger(image.caption, project.triggerWord)).length} still use only the trigger word as a caption.</span>}
        </div>
      )}

      {reviewing && project.images.length > 0 && (
        <ul className="mt-6 space-y-3">
          {project.images.map((image) => (
            <li key={image.id} className="flex gap-3 rounded-2xl border border-line bg-card p-3">
              <img src={image.url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <textarea rows={3} value={image.caption} onFocus={() => rememberCaption(image.id, image.caption)} onChange={(event) => {
                  const caption = event.target.value;
                  setProject((current) => current ? { ...current, images: current.images.map((item) => item.id === image.id ? { ...item, caption } : item) } : current);
                }} onBlur={(event) => { void updatePhoto(id, image.id, { caption: event.target.value }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not save that caption.')); }} className="w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-sm leading-snug" />
                <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                  <button type="button" disabled={suggesting !== null} onClick={() => void suggestOne(image.id)} className="text-moss disabled:opacity-50">{suggesting === image.id ? 'Writing…' : 'Suggest with AI'}</button>
                  {priorCaptions[image.id] !== undefined && (
                    <button type="button" className="text-ink/60" onClick={() => {
                      const previous = priorCaptions[image.id] ?? '';
                      setPriorCaptions((current) => {
                        const next = { ...current };
                        delete next[image.id];
                        return next;
                      });
                      applyCaption(image.id, previous);
                      void updatePhoto(id, image.id, { caption: previous }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not undo that caption.'));
                    }}>Undo</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!reviewing && project.images.length > 0 && (
        <ul ref={photosRef} className="mt-6 grid scroll-mt-24 grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {project.images.map((image) => (
            <li key={image.id} className="relative rounded-2xl border border-line bg-card hover:z-20">
              <img src={image.url} alt={image.caption || image.filename} className={`aspect-square w-full rounded-t-2xl object-cover ${image.excluded ? 'opacity-40' : ''}`} />
              {!image.excluded && (photoNotes[image.id]?.soft || photoNotes[image.id]?.small || photoNotes[image.id]?.duplicate || onlyTrigger(image.caption, project.triggerWord)) && (
                <p className="px-3 pt-2 text-xs font-semibold text-moss">
                  {[photoNotes[image.id]?.soft ? 'Soft focus' : '', photoNotes[image.id]?.small ? 'Small for training' : '', photoNotes[image.id]?.duplicate ? 'Looks like another photo' : '', onlyTrigger(image.caption, project.triggerWord) ? 'Caption is only the trigger word' : ''].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="space-y-2 p-3">
                <Hint hint={CAPTION_HINT}>
                  {(describedBy) => (
                    <label className="block text-xs font-semibold text-ink/50">
                      <span className={hintLabel}>Caption</span>
                      <textarea aria-describedby={describedBy} rows={3} value={image.caption} onChange={(event) => {
                        const caption = event.target.value;
                        setProject((current) => current ? { ...current, images: current.images.map((item) => item.id === image.id ? { ...item, caption } : item) } : current);
                      }} onBlur={(event) => { void updatePhoto(id, image.id, { caption: event.target.value }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not save that caption.')); }} className="mt-1 w-full resize-none rounded-lg border border-line bg-paper px-2 py-1.5 text-sm font-normal leading-snug text-ink" />
                    </label>
                  )}
                </Hint>
                <Hint hint={captionHelpOn === false ? SUGGEST_OFF_HINT : SUGGEST_HINT}>
                  {(describedBy) => (
                    <button type="button" aria-describedby={describedBy} disabled={suggesting !== null} onClick={() => void suggestOne(image.id)} className={`text-xs font-semibold text-moss disabled:opacity-50 ${hintLabel}`}>
                      {suggesting === image.id ? 'Writing…' : 'Suggest with AI'}
                    </button>
                  )}
                </Hint>
                <div className="flex justify-between text-xs font-semibold">
                  <Hint hint={image.excluded ? USE_PHOTO_HINT : LEAVE_OUT_HINT}>
                    {(describedBy) => (
                      <button type="button" aria-describedby={describedBy} className={`text-ink/60 ${hintLabel}`} onClick={() => { void updatePhoto(id, image.id, { excluded: !image.excluded }).then(() => reload()).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not update that photo.')); }}>
                        {image.excluded ? 'Use photo' : 'Leave out'}
                      </button>
                    )}
                  </Hint>
                  <Hint hint={REMOVE_HINT} align="end">
                    {(describedBy) => (
                      <button type="button" aria-describedby={describedBy} className={`text-red-700 ${hintLabel}`} onClick={() => { void deletePhoto(id, image.id).then(() => reload()).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not remove that photo.')); }}>Remove</button>
                    )}
                  </Hint>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8 grid gap-4 rounded-[2rem] border border-line bg-card p-6 md:grid-cols-2">
        <div>
          <Hint hint={DOWNLOAD_HINT}>
            {(describedBy) => <h2 aria-describedby={describedBy} className={`font-serif text-3xl ${hintLabel}`}>Download</h2>}
          </Hint>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Download the photos and captions anytime. A <span className="font-semibold text-ink">.safetensors</span> file is listed here only after a real training run finishes.
          </p>
          {(project.artifacts ?? []).filter((artifact) => artifact.type === 'lora' && artifact.url).map((artifact) => (
            <a key={artifact.id} href={artifact.url} className="mt-4 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper">{artifact.filename}</a>
          ))}
          {(project.artifacts ?? []).every((artifact) => artifact.type !== 'lora') && (
            <p className="mt-3 text-sm text-ink/60">No .safetensors file yet.</p>
          )}
          <Hint hint={DOWNLOAD_HINT} className="mt-5">
            {(describedBy) => (
              <a aria-describedby={describedBy} href={readyCount > 0 ? downloadUrl(id) : undefined} className={`inline-flex rounded-full px-5 py-2.5 text-sm font-semibold ${readyCount > 0 ? 'bg-moss text-white hover:bg-mossdark' : 'pointer-events-none bg-ink/10 text-ink/40'}`}>
                Download photo set
              </a>
            )}
          </Hint>
        </div>
        <div>
          <Hint hint={TRAIN_HINT}>
            {(describedBy) => <h2 aria-describedby={describedBy} className={`font-serif text-3xl ${hintLabel}`}>Train</h2>}
          </Hint>
          {project.loraType === 'CHARACTER' && project.images.length > 0 && (
            <Hint hint={SHOT_HINT} className="mt-4">
              {(describedBy) => (
                <fieldset aria-describedby={describedBy}>
                  <legend className={`text-sm font-semibold ${hintLabel}`}>For a person, look for</legend>
                  <div className="mt-2 space-y-2">
                    {SHOTS.map((shot) => (
                      <label key={shot.id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" checked={Boolean(shots[shot.id])} onChange={() => toggleShot(shot.id)} className="mt-1" />
                        {shot.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </Hint>
          )}
          {queued ? (
            <p className="mt-2 text-sm leading-relaxed text-ink/70">Waiting for a GPU. Training has not started. Your photos are saved, and the photo set can be downloaded now. The .safetensors file shows up here when a real run finishes.</p>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">Submit at least {MIN_PHOTOS} photos you have the right to use. The job waits for a GPU. This page does not invent a model file.</p>
              {project.loraType === 'CHARACTER' && SHOTS.some((shot) => !shots[shot.id]) && (
                <p className="mt-2 text-sm text-ink/60">Still missing from the checklist: {SHOTS.filter((shot) => !shots[shot.id]).map((shot) => shot.label.toLowerCase()).join(', ')}.</p>
              )}
              <Hint hint={CONSENT_HINT} className="mt-4">
                {(describedBy) => (
                  <label className="flex items-start gap-3 text-sm">
                    <input aria-describedby={describedBy} type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
                    <span className={hintLabel}>I took these photos, or I have permission to train a model on them.</span>
                  </label>
                )}
              </Hint>
              <Hint hint={TRAIN_HINT} className="mt-4">
                {(describedBy) => (
                  <button type="button" aria-describedby={describedBy} disabled={!consent || readyCount < MIN_PHOTOS || submitting} onClick={() => void train()} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-40">
                    {submitting ? 'Submitting…' : 'Submit for training'}
                  </button>
                )}
              </Hint>
              {readyCount < MIN_PHOTOS && <p className="mt-2 text-xs text-ink/50">{MIN_PHOTOS - readyCount} more included photo{MIN_PHOTOS - readyCount === 1 ? '' : 's'} to submit.</p>}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
