import Busboy from 'busboy';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { CaptionError, captionHelpAvailable, suggestCaption } from './captions';
import {
  BASE_MODELS,
  LORA_TYPES,
  MAX_IMAGES,
  absolutePath,
  createProject,
  dataDir,
  deleteImage,
  deleteProject,
  getProject,
  includedImages,
  listProjects,
  saveImage,
  submitTraining,
  updateImage,
  type BaseModel,
  type LoraType,
  type TrainingProject,
} from './store';

const DEFAULT_PORT = 3000;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function listenPort(): number {
  const raw = process.env.PORT;
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid PORT: ${raw}`);
  return port;
}

function requestPath(req: IncomingMessage): string {
  const raw = req.url ?? '/';
  const query = raw.indexOf('?');
  return query === -1 ? raw : raw.slice(0, query);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
  });
  res.end(payload);
}

function sendError(res: ServerResponse, status: number, error: string): void {
  sendJson(res, status, { error });
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim() === '') {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) resolve(parsed as Record<string, unknown>);
        else reject(new Error('Expected a JSON object.'));
      } catch {
        reject(new Error('That request was not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function isBaseModel(value: unknown): value is BaseModel {
  return typeof value === 'string' && (BASE_MODELS as readonly string[]).includes(value);
}

function isLoraType(value: unknown): value is LoraType {
  return typeof value === 'string' && (LORA_TYPES as readonly string[]).includes(value);
}

function isHeic(buffer: Buffer): boolean {
  if (buffer.length < 12 || buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
  const brand = buffer.toString('ascii', 8, 12);
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand);
}

function sniffImage(buffer: Buffer): { mime: string; width: number; height: number } | undefined {
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1] ?? 0;
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return { mime: 'image/jpeg', height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
    return { mime: 'image/jpeg', width: 0, height: 0 };
  }
  if (buffer.length > 16 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', width: 0, height: 0 };
  }
  return undefined;
}

function readUploads(req: IncomingMessage): Promise<{ filename: string; buffer: Buffer }[]> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: { files: 20, fileSize: MAX_FILE_BYTES },
    });
    const files: { filename: string; buffer: Buffer }[] = [];
    const pending: Promise<void>[] = [];
    busboy.on('file', (_name, file, info) => {
      const chunks: Buffer[] = [];
      let tooBig = false;
      file.on('data', (chunk: Buffer) => chunks.push(chunk));
      file.on('limit', () => {
        tooBig = true;
      });
      pending.push(new Promise((done) => {
        file.on('close', () => {
          if (!tooBig) files.push({ filename: info.filename || 'photo', buffer: Buffer.concat(chunks) });
          done();
        });
      }));
    });
    busboy.on('error', reject);
    busboy.on('finish', () => {
      void Promise.all(pending).then(() => resolve(files));
    });
    req.pipe(busboy);
  });
}

function projectSummary(project: TrainingProject) {
  const included = includedImages(project);
  return {
    id: project.id,
    name: project.name,
    baseModel: project.baseModel,
    loraType: project.loraType,
    triggerWord: project.triggerWord,
    status: project.status,
    imageCount: project.images.length,
    includedCount: included.length,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    previews: project.images.slice(0, 4).map((image) => ({
      id: image.id,
      url: `/api/projects/${project.id}/images/${image.id}/file`,
    })),
    latestJob: project.jobs[0] ?? null,
    artifacts: project.artifacts,
  };
}

function projectDetail(project: TrainingProject) {
  return {
    ...projectSummary(project),
    images: project.images.map((image) => ({
      ...image,
      url: `/api/projects/${project.id}/images/${image.id}/file`,
    })),
    jobs: project.jobs,
  };
}

function downloadName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lora';
  return `${slug}-photos.zip`;
}

async function sendZip(res: ServerResponse, project: TrainingProject): Promise<void> {
  const images = includedImages(project);
  if (images.length === 0) {
    sendError(res, 400, 'Add at least one photo before downloading.');
    return;
  }
  const { ZipArchive } = await import('archiver');
  res.writeHead(200, {
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename="${downloadName(project.name)}"`,
    'access-control-allow-origin': '*',
  });
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', () => {
    if (!res.headersSent) sendError(res, 500, 'The download could not be built.');
    else res.destroy();
  });
  archive.pipe(res);
  const captions = images.map((image) => `${basename(image.storageKey)}: ${image.caption}`).join('\n');
  archive.append(captions + '\n', { name: 'captions.txt' });
  archive.append(JSON.stringify({
    name: project.name,
    baseModel: project.baseModel,
    loraType: project.loraType,
    triggerWord: project.triggerWord,
    images: images.map((image) => ({
      file: basename(image.storageKey),
      caption: image.caption,
    })),
  }, null, 2), { name: 'lora.json' });
  for (const image of images) {
    const filePath = absolutePath(image.storageKey);
    if (existsSync(filePath)) archive.file(filePath, { name: `photos/${basename(image.storageKey)}` });
  }
  void archive.finalize();
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = requestPath(req);
  if (req.method === 'GET' && (path === '/' || path === '/health')) {
    sendJson(res, 200, { name: 'lora-forge', status: 'ok' });
    return;
  }

  if (req.method === 'GET' && path === '/api/projects') {
    sendJson(res, 200, { projects: listProjects().map(projectSummary) });
    return;
  }

  if (req.method === 'GET' && path === '/api/caption-help') {
    sendJson(res, 200, { available: captionHelpAvailable() });
    return;
  }

  if (req.method === 'POST' && path === '/api/projects') {
    const body = await readJson(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const triggerWord = typeof body.triggerWord === 'string' ? body.triggerWord.trim() : '';
    if (name.length < 2) {
      sendError(res, 400, 'Give this LoRA a name.');
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9]{1,31}$/.test(triggerWord)) {
      sendError(res, 400, 'Use a trigger word of 2–32 letters and numbers, starting with a letter.');
      return;
    }
    if (!isBaseModel(body.baseModel) || !isLoraType(body.loraType)) {
      sendError(res, 400, 'Choose what you are training and which base model to use.');
      return;
    }
    const project = await createProject({ name, triggerWord, baseModel: body.baseModel, loraType: body.loraType });
    sendJson(res, 201, projectDetail(project));
    return;
  }

  const fileMatch = path.match(/^\/api\/projects\/([^/]+)\/images\/([^/]+)\/file$/);
  if (req.method === 'GET' && fileMatch) {
    const project = getProject(fileMatch[1] ?? '');
    const image = project?.images.find((item) => item.id === fileMatch[2]);
    if (!project || !image) {
      sendError(res, 404, 'That photo could not be found.');
      return;
    }
    const filePath = absolutePath(image.storageKey);
    if (!existsSync(filePath)) {
      sendError(res, 404, 'That photo file is missing.');
      return;
    }
    res.writeHead(200, {
      'content-type': image.mime,
      'content-length': statSync(filePath).size,
      'cache-control': 'public, max-age=86400',
      'access-control-allow-origin': '*',
    });
    res.end(readFileSync(filePath));
    return;
  }

  const captionMatch = path.match(/^\/api\/projects\/([^/]+)\/images\/([^/]+)\/caption$/);
  if (captionMatch && req.method === 'POST') {
    const project = getProject(captionMatch[1] ?? '');
    const image = project?.images.find((item) => item.id === captionMatch[2]);
    if (!project || !image) {
      sendError(res, 404, 'That photo could not be found.');
      return;
    }
    try {
      const caption = await suggestCaption(project, image);
      await updateImage(project.id, image.id, { caption });
      sendJson(res, 200, { caption });
    } catch (error) {
      const status = error instanceof CaptionError ? error.status : 502;
      const message = error instanceof Error ? error.message : 'The caption could not be written.';
      sendError(res, status, message);
    }
    return;
  }

  const imageMatch = path.match(/^\/api\/projects\/([^/]+)\/images\/([^/]+)$/);
  if (imageMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    const patch: { caption?: string; excluded?: boolean } = {};
    if (body.caption !== undefined) {
      if (typeof body.caption !== 'string') {
        sendError(res, 400, 'A caption must be text.');
        return;
      }
      patch.caption = body.caption;
    }
    if (body.excluded !== undefined) {
      if (typeof body.excluded !== 'boolean') {
        sendError(res, 400, 'Excluded must be true or false.');
        return;
      }
      patch.excluded = body.excluded;
    }
    const image = await updateImage(imageMatch[1] ?? '', imageMatch[2] ?? '', patch);
    sendJson(res, 200, image);
    return;
  }

  if (imageMatch && req.method === 'DELETE') {
    await deleteImage(imageMatch[1] ?? '', imageMatch[2] ?? '');
    sendJson(res, 200, { ok: true });
    return;
  }

  const imagesMatch = path.match(/^\/api\/projects\/([^/]+)\/images$/);
  if (imagesMatch && req.method === 'POST') {
    const project = getProject(imagesMatch[1] ?? '');
    if (!project) {
      sendError(res, 404, 'That LoRA could not be found.');
      return;
    }
    const uploads = await readUploads(req);
    if (uploads.length === 0) {
      sendError(res, 400, 'Choose JPG, PNG, or WebP photos under 15 MB each.');
      return;
    }
    const saved = [];
    let sawHeic = false;
    for (const upload of uploads) {
      const sniffed = sniffImage(upload.buffer);
      if (!sniffed) {
        if (isHeic(upload.buffer)) sawHeic = true;
        continue;
      }
      saved.push(await saveImage(project.id, {
        filename: upload.filename,
        mime: sniffed.mime,
        buffer: upload.buffer,
        width: sniffed.width,
        height: sniffed.height,
      }));
    }
    if (saved.length === 0) {
      sendError(res, 400, sawHeic
        ? 'Those are iPhone HEIC photos. Save them as JPG, PNG, or WebP and add them again.'
        : 'None of those files were JPG, PNG, or WebP photos.');
      return;
    }
    const updated = getProject(project.id);
    sendJson(res, 201, { added: saved.length, project: updated ? projectDetail(updated) : null, maxImages: MAX_IMAGES });
    return;
  }

  const trainMatch = path.match(/^\/api\/projects\/([^/]+)\/train$/);
  if (trainMatch && req.method === 'POST') {
    const body = await readJson(req);
    if (body.consent !== true) {
      sendError(res, 400, 'Confirm that you have permission to train on these photos.');
      return;
    }
    const statement = typeof body.consentStatement === 'string' && body.consentStatement.trim()
      ? body.consentStatement.trim()
      : 'I have the rights to train a model on these photos.';
    const project = await submitTraining(trainMatch[1] ?? '', statement);
    sendJson(res, 201, projectDetail(project));
    return;
  }

  const downloadMatch = path.match(/^\/api\/projects\/([^/]+)\/download$/);
  if (downloadMatch && req.method === 'GET') {
    const project = getProject(downloadMatch[1] ?? '');
    if (!project) {
      sendError(res, 404, 'That LoRA could not be found.');
      return;
    }
    await sendZip(res, project);
    return;
  }

  const oneMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (oneMatch && req.method === 'GET') {
    const project = getProject(oneMatch[1] ?? '');
    if (!project) {
      sendError(res, 404, 'That LoRA could not be found.');
      return;
    }
    sendJson(res, 200, projectDetail(project));
    return;
  }

  if (oneMatch && req.method === 'DELETE') {
    await deleteProject(oneMatch[1] ?? '');
    sendJson(res, 200, { ok: true });
    return;
  }

  sendError(res, 404, 'Not found.');
}

const port = listenPort();
const server = createServer((req, res) => {
  void handle(req, res).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    if (!res.headersSent) sendError(res, 400, message);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
  console.log(`Photos stored in ${dataDir()}`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}, closing server`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
