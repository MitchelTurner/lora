export interface PhotoInspection {
  hash: string;
  soft: boolean;
  small: boolean;
}

const SOFT_VARIANCE = 18;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that photo.'));
    image.src = url;
  });
}

function grayOf(image: HTMLImageElement, width: number, height: number): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return new Float32Array(width * height);
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const gray = new Float32Array(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    gray[index] = (pixels[offset] ?? 0) * 0.299 + (pixels[offset + 1] ?? 0) * 0.587 + (pixels[offset + 2] ?? 0) * 0.114;
  }
  return gray;
}

function differenceHash(gray: Float32Array): string {
  const width = 9;
  let bits = '';
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = gray[y * width + x] ?? 0;
      const right = gray[y * width + x + 1] ?? 0;
      bits += left < right ? '1' : '0';
    }
  }
  return bits;
}

function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = gray[y * width + x] ?? 0;
      const lap = (gray[(y - 1) * width + x] ?? 0) + (gray[(y + 1) * width + x] ?? 0) + (gray[y * width + x - 1] ?? 0) + (gray[y * width + x + 1] ?? 0) - 4 * center;
      sum += lap;
      sumSquares += lap * lap;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

export function nearDuplicate(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) distance += 1;
  return distance <= 6;
}

export async function inspectPhoto(url: string, width: number, height: number): Promise<PhotoInspection> {
  const image = await loadImage(url);
  const sample = 48;
  const gray = grayOf(image, sample, sample);
  return {
    hash: differenceHash(grayOf(image, 9, 8)),
    soft: laplacianVariance(gray, sample, sample) < SOFT_VARIANCE,
    small: Math.min(width, height) < 512,
  };
}
