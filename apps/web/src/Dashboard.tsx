import React from 'react';
import { listProjects, type ProjectSummary } from './api';
import { ErrorNote, Hint, MODEL_LABEL, STATUS_HINT, STATUS_LABEL, TYPE_LABEL } from './ui';

export function Dashboard({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void }) {
  const [projects, setProjects] = React.useState<ProjectSummary[] | null>(null);
  const [error, setError] = React.useState('');

  const loaded = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    function load() {
      listProjects()
        .then((result) => {
          if (!active) return;
          loaded.current = true;
          setError('');
          setProjects(result.projects);
        })
        .catch((reason: unknown) => {
          if (!active || loaded.current) return;
          setError(reason instanceof Error ? reason.message : 'Could not load your LoRAs.');
        });
    }
    load();
    window.addEventListener('focus', load);
    return () => {
      active = false;
      window.removeEventListener('focus', load);
    };
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!projects) return <p className="text-ink/60">Loading your LoRAs…</p>;

  if (projects.length === 0) {
    return (
      <section className="overflow-hidden rounded-[2rem] border border-line bg-card">
        <div className="grid gap-8 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-moss">Your LoRAs</p>
            <h1 className="mt-3 max-w-xl font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl">Upload photos. Download a custom LoRA.</h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink/70">
              Teach a model a person, a style, or an object. Add the photos that define it, then download the set when you are ready to train.
            </p>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink/55">
              Your LoRAs stay private to the recovery code in the header. Copy that code if you want them on another device.
            </p>
            <button type="button" onClick={onCreate} className="mt-8 rounded-full bg-moss px-6 py-3 text-base font-semibold text-white hover:bg-mossdark">
              Start a LoRA
            </button>
          </div>
          <ol className="space-y-3 rounded-3xl bg-paper p-5 text-sm">
            <li className="rounded-2xl bg-card px-4 py-3"><span className="font-semibold">1. Name it.</span> Say whether it is a person, style, or object.</li>
            <li className="rounded-2xl bg-card px-4 py-3"><span className="font-semibold">2. Add photos.</span> Ten to twenty clear pictures work best.</li>
            <li className="rounded-2xl bg-card px-4 py-3"><span className="font-semibold">3. Download.</span> Save the photo set, then the LoRA file when training finishes.</li>
          </ol>
        </div>
      </section>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">Your LoRAs</h1>
          <p className="mt-2 text-ink/70">Open one to add photos or download it.</p>
        </div>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {projects.map((project) => (
          <li key={project.id}>
            <button type="button" onClick={() => onOpen(project.id)} className="flex h-full w-full flex-col rounded-3xl border border-line bg-card text-left hover:border-moss/40">
              <div className="grid h-36 grid-cols-4 overflow-hidden rounded-t-3xl bg-paper">
                {project.previews.length === 0 && <div className="col-span-4 flex items-center justify-center text-sm text-ink/40">No photos yet</div>}
                {project.previews.map((preview) => (
                  <img key={preview.id} src={preview.url} alt="" className="h-full w-full object-cover" />
                ))}
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-serif text-2xl leading-tight">{project.name}</h2>
                  <Hint inline hint={STATUS_HINT[project.status] ?? 'Where this LoRA is in the process.'}>
                    {(describedBy) => (
                      <span aria-describedby={describedBy} className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-moss underline decoration-dotted decoration-moss/40 underline-offset-2">
                        {STATUS_LABEL[project.status]}
                        {project.status === 'TRAINING' && project.latestJob ? ` · ${Math.max(0, Math.min(100, Math.round(project.latestJob.progress)))}%` : ''}
                      </span>
                    )}
                  </Hint>
                </div>
                <p className="text-sm text-ink/65">{TYPE_LABEL[project.loraType]} · {MODEL_LABEL[project.baseModel]} · {project.includedCount} photos</p>
                <p className="text-sm text-ink/50">Trigger word <span className="font-semibold text-ink">{project.triggerWord}</span></p>
                {project.status === 'TRAINING' && (
                  <p className="text-sm text-ink/70">{Math.max(0, Math.min(100, Math.round(project.latestJob?.progress ?? 0)))}%. No .safetensors file yet. The GPU worker on your computer has to start the run.</p>
                )}
                {project.latestJob?.errorMessage && <p className="text-sm text-red-800">{project.latestJob.errorMessage}</p>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
