export interface PreparedPhotos {
  files: File[];
  skippedHeic: number;
  skippedOther: number;
}

type PhotoKind = 'jpeg' | 'png' | 'webp' | 'heic' | 'other';

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let text = '';
  for (let index = start; index < end && index < bytes.length; index += 1) text += String.fromCharCode(bytes[index] ?? 0);
  return text;
}

export function kindFromBytes(bytes: Uint8Array): PhotoKind {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }
  return 'other';
}

async function sniff(file: File): Promise<PhotoKind> {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  return kindFromBytes(bytes);
}

async function convertHeic(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width < 1 || bitmap.height < 1) return null;
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92));
    if (!blob) return null;
    const base = file.name.replace(/\.(heic|heif)$/i, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return null;
  }
}

export async function preparePhotos(list: FileList | File[]): Promise<PreparedPhotos> {
  const files: File[] = [];
  let skippedHeic = 0;
  let skippedOther = 0;
  for (const file of Array.from(list)) {
    const kind = await sniff(file);
    if (kind === 'jpeg' || kind === 'png' || kind === 'webp') {
      files.push(file);
      continue;
    }
    if (kind === 'heic') {
      const converted = await convertHeic(file);
      if (converted) files.push(converted);
      else skippedHeic += 1;
      continue;
    }
    skippedOther += 1;
  }
  return { files, skippedHeic, skippedOther };
}
