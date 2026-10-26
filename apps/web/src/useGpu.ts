import React from 'react';
import { getGpu, type GpuStatus } from './api';

export function useGpu(): GpuStatus | null {
  const [gpu, setGpu] = React.useState<GpuStatus | null>(null);

  React.useEffect(() => {
    let active = true;
    function load() {
      getGpu()
        .then((result) => { if (active) setGpu(result); })
        .catch(() => { if (active) setGpu({ connected: false }); });
    }
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return gpu;
}

export function gpuLine(gpu: GpuStatus): string {
  const name = gpu.gpuName || 'Your GPU';
  const memory = typeof gpu.freeMb === 'number' && typeof gpu.totalMb === 'number'
    ? ` ${gpu.freeMb} MB free of ${gpu.totalMb} MB.`
    : '';
  const saved = gpu.modelCached
    ? ' The base model is already saved on that computer.'
    : ' The first run downloads the base model once.';
  const activity = gpu.stage ? ` ${gpu.stage}` : '';
  return `${name} is connected.${memory}${saved}${activity}`;
}
