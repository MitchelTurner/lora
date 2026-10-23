export const BASE_MODELS = ['SDXL', 'FLUX1_DEV'] as const;
export type BaseModel = (typeof BASE_MODELS)[number];

export const LORA_TYPES = ['CHARACTER', 'STYLE', 'OBJECT'] as const;
export type LoraType = (typeof LORA_TYPES)[number];

export const PROJECT_STATUSES = ['DRAFT', 'READY', 'TRAINING', 'COMPLETED', 'FAILED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const JOB_STATUSES = ['queued', 'preprocessing', 'training', 'succeeded', 'failed', 'canceled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const ARTIFACT_TYPES = ['lora', 'sample', 'config', 'dataset_zip'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export interface CropBox { x: number; y: number; width: number; height: number }

export interface JobProgressEvent {
  jobId: string;
  status: JobStatus;
  progress: number;
  currentStep: number;
  totalSteps: number;
  loss?: number;
  etaSeconds?: number;
  sampleKeys?: string[];
}

export interface DatasetManifestImage { url: string; caption: string; cropBox?: CropBox }
export interface DatasetManifest {
  jobId: string;
  baseModel: BaseModel;
  triggerWord: string;
  images: DatasetManifestImage[];
  config: Record<string, unknown>;
  webhookUrl: string;
}
