import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const BASE_MODELS = ['SDXL', 'FLUX1_DEV'] as const;
export const LORA_TYPES = ['CHARACTER', 'STYLE', 'OBJECT'] as const;
export const PROJECT_STATUSES = ['DRAFT', 'READY', 'TRAINING', 'COMPLETED', 'FAILED'] as const;
export const JOB_STATUSES = ['queued', 'preprocessing', 'training', 'succeeded', 'failed', 'canceled'] as const;

export type BaseModel = (typeof BASE_MODELS)[number];
export type LoraType = (typeof LORA_TYPES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface DatasetImage {
  id: string;
  filename: string;
  mime: string;
  storageKey: string;
  width: number;
  height: number;
  sizeBytes: number;
  caption: string;
  excluded: boolean;
  createdAt: string;
}

export interface TrainingJob {
  id: string;
  status: JobStatus;
  progress: number;
  consentStatement: string;
  consentConfirmedAt: string;
  errorMessage?: string;
  createdAt: string;
}

export interface TrainingArtifact {
  id: string;
  jobId: string;
  type: 'lora' | 'dataset_zip';
  filename: string;
  storageKey: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TrainingProject {
  id: string;
  ownerId: string;
  name: string;
  baseModel: BaseModel;
  loraType: LoraType;
  triggerWord: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  images: DatasetImage[];
  jobs: TrainingJob[];
  artifacts: TrainingArtifact[];
}

interface Database {
  projects: TrainingProject[];
}

const MIN_IMAGES_TO_TRAIN = 5;
const MAX_IMAGES = 50;

export function dataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  if (configured) return configured;
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  if (volume) return volume;
  return join(process.cwd(), 'data');
}

function dbPath(): string {
  return join(dataDir(), 'db.json');
}

function readDb(): Database {
  mkdirSync(dataDir(), { recursive: true });
  if (!existsSync(dbPath())) return { projects: [] };
  const parsed = JSON.parse(readFileSync(dbPath(), 'utf8')) as Database;
  return { projects: parsed.projects ?? [] };
}

function writeDb(db: Database): void {
  mkdirSync(dataDir(), { recursive: true });
  const temp = `${dbPath()}.tmp`;
  writeFileSync(temp, JSON.stringify(db, null, 2));
  renameSync(temp, dbPath());
}

let chain: Promise<unknown> = Promise.resolve();

function update<T>(change: (db: Database) => T): Promise<T> {
  const run = chain.then(() => {
    const db = readDb();
    const result = change(db);
    writeDb(db);
    return result;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

export function ownerIdFromKey(key: string): string {
  return createHash('sha256').update(key.trim().toLowerCase()).digest('hex');
}

export function listProjects(ownerId: string): TrainingProject[] {
  return readDb().projects.filter((project) => project.ownerId === ownerId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProject(id: string, ownerId: string): TrainingProject | undefined {
  return readDb().projects.find((project) => project.id === id && project.ownerId === ownerId);
}

export function includedImages(project: TrainingProject): DatasetImage[] {
  return project.images.filter((image) => !image.excluded);
}

export function createProject(input: {
  ownerId: string;
  name: string;
  baseModel: BaseModel;
  loraType: LoraType;
  triggerWord: string;
}): Promise<TrainingProject> {
  const now = new Date().toISOString();
  const project: TrainingProject = {
    id: randomUUID(),
    ownerId: input.ownerId,
    name: input.name.trim(),
    baseModel: input.baseModel,
    loraType: input.loraType,
    triggerWord: input.triggerWord.trim(),
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    images: [],
    jobs: [],
    artifacts: [],
  };
  return update((db) => {
    db.projects.push(project);
    return project;
  });
}

export function saveImage(
  projectId: string,
  ownerId: string,
  file: { filename: string; mime: string; buffer: Buffer; width: number; height: number },
): Promise<DatasetImage> {
  return update((db) => {
    const project = db.projects.find((item) => item.id === projectId && item.ownerId === ownerId);
    if (!project) throw new Error('That LoRA could not be found.');
    if (project.images.length >= MAX_IMAGES) {
      throw new Error(`A LoRA can hold up to ${MAX_IMAGES} photos.`);
    }
    const id = randomUUID();
    const extension = file.mime === 'image/png' ? 'png' : file.mime === 'image/webp' ? 'webp' : 'jpg';
    const storageKey = join('uploads', projectId, `${id}.${extension}`);
    const absolute = join(dataDir(), storageKey);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, file.buffer);
    const image: DatasetImage = {
      id,
      filename: file.filename || `photo.${extension}`,
      mime: file.mime,
      storageKey,
      width: file.width,
      height: file.height,
      sizeBytes: file.buffer.length,
      caption: project.triggerWord,
      excluded: false,
      createdAt: new Date().toISOString(),
    };
    project.images.push(image);
    project.updatedAt = image.createdAt;
    refreshStatus(project);
    return image;
  });
}

function retargetCaption(caption: string, previous: string, next: string): string {
  const trimmed = caption.trim();
  if (trimmed.toLowerCase() === previous.toLowerCase()) return next;
  const prefix = `${previous},`;
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return `${next}${trimmed.slice(previous.length)}`;
  return caption;
}

export function updateProject(
  projectId: string,
  ownerId: string,
  patch: { name?: string; triggerWord?: string; baseModel?: BaseModel; loraType?: LoraType },
): Promise<TrainingProject> {
  return update((db) => {
    const project = db.projects.find((item) => item.id === projectId && item.ownerId === ownerId);
    if (!project) throw new Error('That LoRA could not be found.');
    const locked = project.status === 'TRAINING' || project.status === 'COMPLETED';
    const changesSetup = patch.triggerWord !== undefined || patch.baseModel !== undefined || patch.loraType !== undefined;
    if (locked && changesSetup) {
      throw new Error('While training is queued or finished, you can change the name. The trigger word, subject, and base model stay as submitted.');
    }
    if (patch.name !== undefined) project.name = patch.name.trim();
    if (patch.baseModel !== undefined) project.baseModel = patch.baseModel;
    if (patch.loraType !== undefined) project.loraType = patch.loraType;
    if (patch.triggerWord !== undefined && patch.triggerWord !== project.triggerWord) {
      const previous = project.triggerWord;
      project.triggerWord = patch.triggerWord;
      for (const image of project.images) image.caption = retargetCaption(image.caption, previous, patch.triggerWord);
    }
    project.updatedAt = new Date().toISOString();
    return project;
  });
}

export function updateImage(
  projectId: string,
  ownerId: string,
  imageId: string,
  patch: { caption?: string; excluded?: boolean },
): Promise<DatasetImage> {
  return update((db) => {
    const project = db.projects.find((item) => item.id === projectId && item.ownerId === ownerId);
    const image = project?.images.find((item) => item.id === imageId);
    if (!project || !image) throw new Error('That photo could not be found.');
    if (patch.caption !== undefined) image.caption = patch.caption.trim();
    if (patch.excluded !== undefined) image.excluded = patch.excluded;
    project.updatedAt = new Date().toISOString();
    refreshStatus(project);
    return image;
  });
}

export function deleteImage(projectId: string, ownerId: string, imageId: string): Promise<void> {
  return update((db) => {
    const project = db.projects.find((item) => item.id === projectId && item.ownerId === ownerId);
    if (!project) throw new Error('That LoRA could not be found.');
    const image = project.images.find((item) => item.id === imageId);
    if (!image) throw new Error('That photo could not be found.');
    project.images = project.images.filter((item) => item.id !== imageId);
    project.updatedAt = new Date().toISOString();
    refreshStatus(project);
    const absolute = join(dataDir(), image.storageKey);
    if (existsSync(absolute)) rmSync(absolute);
  });
}

export function deleteProject(id: string, ownerId: string): Promise<void> {
  return update((db) => {
    const project = db.projects.find((item) => item.id === id && item.ownerId === ownerId);
    if (!project) throw new Error('That LoRA could not be found.');
    db.projects = db.projects.filter((item) => item.id !== id);
    const folder = join(dataDir(), 'uploads', id);
    if (existsSync(folder)) rmSync(folder, { recursive: true, force: true });
  });
}

export function submitTraining(projectId: string, ownerId: string, consentStatement: string): Promise<TrainingProject> {
  return update((db) => {
    const project = db.projects.find((item) => item.id === projectId && item.ownerId === ownerId);
    if (!project) throw new Error('That LoRA could not be found.');
    const ready = includedImages(project);
    if (ready.length < MIN_IMAGES_TO_TRAIN) {
      throw new Error(`Add at least ${MIN_IMAGES_TO_TRAIN} photos before training.`);
    }
    const active = project.jobs.find((job) => job.status === 'queued' || job.status === 'preprocessing' || job.status === 'training');
    if (active) throw new Error('Training is already queued for this LoRA.');
    const now = new Date().toISOString();
    project.jobs.unshift({
      id: randomUUID(),
      status: 'queued',
      progress: 0,
      consentStatement: consentStatement.trim(),
      consentConfirmedAt: now,
      createdAt: now,
    });
    project.status = 'TRAINING';
    project.updatedAt = now;
    return project;
  });
}

export function absolutePath(storageKey: string): string {
  const root = dataDir();
  const absolute = join(root, storageKey);
  if (!absolute.startsWith(root)) throw new Error('Invalid file path.');
  return absolute;
}

function refreshStatus(project: TrainingProject): void {
  if (project.status === 'TRAINING' || project.status === 'COMPLETED' || project.status === 'FAILED') return;
  project.status = includedImages(project).length >= MIN_IMAGES_TO_TRAIN ? 'READY' : 'DRAFT';
}

export { MAX_IMAGES, MIN_IMAGES_TO_TRAIN };
