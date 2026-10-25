import { ownerKey } from './session';

export type BaseModel = 'SDXL' | 'FLUX1_DEV';
export type LoraType = 'CHARACTER' | 'STYLE' | 'OBJECT';
export type ProjectStatus = 'DRAFT' | 'READY' | 'TRAINING' | 'COMPLETED' | 'FAILED';
export type JobStatus = 'queued' | 'preprocessing' | 'training' | 'succeeded' | 'failed' | 'canceled';

export interface Preview {
  id: string;
  url: string;
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

export interface DatasetImage {
  id: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
  sizeBytes: number;
  caption: string;
  excluded: boolean;
  createdAt: string;
  url: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  baseModel: BaseModel;
  loraType: LoraType;
  triggerWord: string;
  status: ProjectStatus;
  imageCount: number;
  includedCount: number;
  createdAt: string;
  updatedAt: string;
  previews: Preview[];
  latestJob: TrainingJob | null;
}

export interface LoraFile {
  id: string;
  type: 'lora' | 'dataset_zip';
  filename: string;
  sizeBytes: number;
  url?: string;
}

export interface ProjectDetail extends ProjectSummary {
  images: DatasetImage[];
  jobs: TrainingJob[];
  artifacts: LoraFile[];
}

export const MISSING_LORA = 'This LoRA is no longer on the server for the recovery code in this browser. Start it again from your list. To keep photos when the site updates, mount a volume at /data on the API service and set DATA_DIR to /data.';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('x-lora-key', ownerKey());
  if (init?.body instanceof FormData) headers.delete('content-type');
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) as { error?: string } : {};
  if (!response.ok) {
    const message = body.error || 'Something went wrong. Please try again.';
    throw new Error(message === 'That LoRA could not be found.' ? MISSING_LORA : message);
  }
  return body as T;
}

export function listProjects(): Promise<{ projects: ProjectSummary[] }> {
  return request('/api/projects');
}

export function createProject(input: {
  name: string;
  baseModel: BaseModel;
  loraType: LoraType;
  triggerWord: string;
}): Promise<ProjectDetail> {
  return request('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getProject(id: string): Promise<ProjectDetail> {
  return request(`/api/projects/${id}`);
}

export function updateProject(id: string, patch: {
  name?: string;
  baseModel?: BaseModel;
  loraType?: LoraType;
  triggerWord?: string;
}): Promise<ProjectDetail> {
  return request(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function deleteProject(id: string): Promise<void> {
  return request(`/api/projects/${id}`, { method: 'DELETE' });
}

export function uploadPhotos(id: string, files: File[]): Promise<{ added: number; project: ProjectDetail }> {
  const body = new FormData();
  for (const file of files) body.append('photos', file);
  return request(`/api/projects/${id}/images`, { method: 'POST', body });
}

export function captionHelp(): Promise<{ available: boolean }> {
  return request('/api/caption-help');
}

export function suggestCaption(projectId: string, imageId: string): Promise<{ caption: string }> {
  return request(`/api/projects/${projectId}/images/${imageId}/caption`, { method: 'POST' });
}

export function updatePhoto(projectId: string, imageId: string, patch: { caption?: string; excluded?: boolean }): Promise<DatasetImage> {
  return request(`/api/projects/${projectId}/images/${imageId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function deletePhoto(projectId: string, imageId: string): Promise<void> {
  return request(`/api/projects/${projectId}/images/${imageId}`, { method: 'DELETE' });
}

export function submitTraining(id: string): Promise<ProjectDetail> {
  return request(`/api/projects/${id}/train`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      consent: true,
      consentStatement: 'I have the rights to train a model on these photos.',
    }),
  });
}

export function downloadUrl(id: string): string {
  return `/api/projects/${id}/download`;
}
