import React from 'react';
import { deletePhoto, deleteProject, downloadUrl, getProject, submitTraining, updatePhoto, uploadPhotos, type ProjectDetail } from './api';
import { CAPTION_HINT, CONSENT_HINT, COUNT_HINT, DELETE_HINT, DOWNLOAD_HINT, ErrorNote, Hint, LEAVE_OUT_HINT, MODEL_HINT, MODEL_LABEL, REMOVE_HINT, STATUS_HINT, STATUS_LABEL, TRAIN_HINT, TRIGGER_HINT, TYPE_HINT, TYPE_LABEL, USE_PHOTO_HINT, hintLabel } from './ui';

const MIN_PHOTOS = 5;

export function ProjectView({ id, onBack }: { id: string; onBack: () => void }) {
  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [error, setError] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [consent, setConsent] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function reload() {
    setProject(await getProject(id));
  }

  React.useEffect(() => {
    let active = true;
    getProject(id)
      .then((result) => { if (active) setProject(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not open this LoRA.'); });
    return () => { active = false; };
  }, [id]);

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      setError('Choose JPG, PNG, or WebP photos.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const result = await uploadPhotos(id, files);
      setProject(result.project);
      if (result.added < files.length) {
        setError(`Added ${result.added} photo${result.added === 1 ? '' : 's'}. The rest were not JPG, PNG, or WebP files under 15 MB.`);
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

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

  if (error && !project) return <div><button type="button" onClick={onBack} className="text-sm font-semibold text-moss">← All LoRAs</button><div className="mt-4"><ErrorNote>{error}</ErrorNote></div></div>;
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

      <section
        className={`mt-8 rounded-[2rem] border-2 border-dashed px-5 py-8 text-center ${dragOver ? 'border-moss bg-moss/5' : 'border-line bg-card'}`}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => { event.preventDefault(); setDragOver(false); if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files); }}
      >
        <h2 className="font-serif text-3xl">Add the photos</h2>
        <p className="mx-auto mt-2 max-w-md text-ink/70">Drop them here or browse. Ten to twenty pictures, with different angles and lighting, train a steadier LoRA.</p>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="mt-5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-60">
          {uploading ? 'Uploading…' : 'Browse photos'}
        </button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.target.value = ''; }} />
        <Hint inline hint={COUNT_HINT} className="mt-3">
          {(describedBy) => <p aria-describedby={describedBy} className={`text-xs text-ink/45 ${hintLabel}`}>{readyCount} included · {project.imageCount} uploaded · 50 max</p>}
        </Hint>
      </section>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      {project.images.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {project.images.map((image) => (
            <li key={image.id} className="relative rounded-2xl border border-line bg-card hover:z-20">
              <img src={image.url} alt={image.caption || image.filename} className={`aspect-square w-full rounded-t-2xl object-cover ${image.excluded ? 'opacity-40' : ''}`} />
              <div className="space-y-2 p-3">
                <Hint hint={CAPTION_HINT}>
                  {(describedBy) => (
                    <label className="block text-xs font-semibold text-ink/50">
                      <span className={hintLabel}>Caption</span>
                      <input aria-describedby={describedBy} value={image.caption} onChange={(event) => {
                        const caption = event.target.value;
                        setProject((current) => current ? { ...current, images: current.images.map((item) => item.id === image.id ? { ...item, caption } : item) } : current);
                      }} onBlur={(event) => { void updatePhoto(id, image.id, { caption: event.target.value }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not save that caption.')); }} className="mt-1 w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-sm font-normal text-ink" />
                    </label>
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
            Download the photos and captions anytime. The <span className="font-semibold text-ink">.safetensors</span> LoRA file is added here when a trainer finishes the job.
          </p>
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
          {queued ? (
            <p className="mt-2 text-sm leading-relaxed text-ink/70">Training is queued. Your photos are saved. The LoRA download shows up on this page when the run finishes.</p>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">Submit at least {MIN_PHOTOS} photos you have the right to use. Training waits for a GPU worker.</p>
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
