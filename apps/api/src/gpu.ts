import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './store';

export interface GpuReport {
  gpuName: string;
  totalMb: number;
  freeMb: number;
  modelCached: boolean;
  stage: string;
  seenAt: string;
}

const FRESH_MS = 20_000;

function gpuPath(): string {
  return join(dataDir(), 'gpu.json');
}

function cleanStage(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function cleanMb(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000) return undefined;
  return Math.round(number);
}

export function recordGpu(input: Record<string, unknown>): GpuReport {
  const gpuName = cleanStage(input.gpuName).slice(0, 80);
  const totalMb = cleanMb(input.totalMb);
  const freeMb = cleanMb(input.freeMb);
  if (!gpuName || totalMb === undefined || freeMb === undefined) {
    throw new Error('The GPU report needs a name and memory amounts.');
  }
  const report: GpuReport = {
    gpuName,
    totalMb,
    freeMb,
    modelCached: input.modelCached === true,
    stage: cleanStage(input.stage),
    seenAt: new Date().toISOString(),
  };
  const directory = dataDir();
  mkdirSync(directory, { recursive: true });
  const path = gpuPath();
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(report));
  renameSync(temporary, path);
  return report;
}

export function currentGpu(): GpuReport | null {
  try {
    const parsed = JSON.parse(readFileSync(gpuPath(), 'utf8')) as Partial<GpuReport>;
    const seenAt = typeof parsed.seenAt === 'string' ? parsed.seenAt : '';
    const age = Date.now() - Date.parse(seenAt);
    if (!Number.isFinite(age) || age < 0 || age > FRESH_MS) return null;
    const totalMb = cleanMb(parsed.totalMb);
    const freeMb = cleanMb(parsed.freeMb);
    const gpuName = cleanStage(parsed.gpuName).slice(0, 80);
    if (!gpuName || totalMb === undefined || freeMb === undefined) return null;
    return {
      gpuName,
      totalMb,
      freeMb,
      modelCached: parsed.modelCached === true,
      stage: cleanStage(parsed.stage),
      seenAt,
    };
  } catch {
    return null;
  }
}
