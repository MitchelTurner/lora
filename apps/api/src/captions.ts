import { readFileSync, statSync } from 'node:fs';
import { absolutePath, type DatasetImage, type TrainingProject } from './store';

const MAX_CAPTION_BYTES = 7 * 1024 * 1024;
const ANTHROPIC_VERSION = '2023-06-01';

const SUBJECT: Record<TrainingProject['loraType'], string> = {
  CHARACTER: 'a specific person',
  STYLE: 'a visual style',
  OBJECT: 'a specific object',
};

const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export class CaptionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function captionHelpAvailable(): boolean {
  return process.env.CAPTION_PROVIDER === 'mock' || Boolean(anthropicKey()) || Boolean(openaiKey());
}

export function normalizeCaption(triggerWord: string, raw: string): string {
  const withoutFence = raw.replace(/```[a-z]*\n?|```/gi, ' ');
  const line = withoutFence
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part.length > 0) ?? '';
  const cleaned = line.replace(/\s+/g, ' ').replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!cleaned) throw new CaptionError('The caption service returned an empty description.', 502);
  const starts = cleaned.toLowerCase().startsWith(triggerWord.toLowerCase());
  const caption = starts ? cleaned : `${triggerWord}, ${cleaned}`;
  return caption.slice(0, 400);
}

function anthropicKey(): string {
  return process.env.ANTHROPIC_API_KEY?.trim() ?? '';
}

function openaiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() ?? '';
}

function promptFor(project: TrainingProject): string {
  return [
    'Write one training caption for a LoRA dataset.',
    `Trigger word: ${project.triggerWord}`,
    `The LoRA is teaching ${SUBJECT[project.loraType]}.`,
    'Start with the trigger word, then a comma.',
    'One line, under 40 words.',
    'Describe only what is visible: subject, clothing, pose or angle, setting, and light.',
    'Do not invent a name, place, or brand.',
    'No hashtags, quotes, or camera settings.',
  ].join('\n');
}

function mediaType(mime: string): string {
  if (mime === 'image/jpg') return 'image/jpeg';
  return MEDIA_TYPES.has(mime) ? mime : 'image/jpeg';
}

async function readModelText(response: Response, read: (payload: unknown) => string): Promise<string> {
  const payload = await response.json() as { error?: { message?: string } };
  if (!response.ok) {
    const detail = payload.error?.message?.replace(/\s+/g, ' ').trim().slice(0, 180);
    throw new CaptionError(
      detail ? `The caption service could not describe this photo. ${detail}` : 'The caption service could not describe this photo.',
      502,
    );
  }
  return read(payload);
}

export async function suggestCaption(project: TrainingProject, image: DatasetImage): Promise<string> {
  const filePath = absolutePath(image.storageKey);
  const size = statSync(filePath).size;
  if (size > MAX_CAPTION_BYTES) {
    throw new CaptionError('This photo is too large to describe. Use one under 7 MB.', 400);
  }
  if (process.env.CAPTION_PROVIDER === 'mock') {
    return `${project.triggerWord}, a ${image.width} by ${image.height} photo`;
  }
  const anthropic = anthropicKey();
  const openai = openaiKey();
  if (!anthropic && !openai) {
    throw new CaptionError('AI captions need an Anthropic API key on the API service. Add ANTHROPIC_API_KEY, then try again.', 503);
  }

  const buffer = readFileSync(filePath);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const text = anthropic
      ? await askAnthropic(anthropic, project, image, buffer, controller.signal)
      : await askOpenAI(openai, project, image, buffer, controller.signal);
    return normalizeCaption(project.triggerWord, text);
  } catch (error) {
    if (error instanceof CaptionError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CaptionError('The caption service took too long. Try that photo again.', 504);
    }
    throw new CaptionError('The caption service could not be reached.', 502);
  } finally {
    clearTimeout(timer);
  }
}

async function askAnthropic(
  key: string,
  project: TrainingProject,
  image: DatasetImage,
  buffer: Buffer,
  signal: AbortSignal,
): Promise<string> {
  const base = (process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com').replace(/\/$/, '');
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-5-5';
  const response = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    signal,
    headers: {
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 120,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType(image.mime),
              data: buffer.toString('base64'),
            },
          },
          { type: 'text', text: promptFor(project) },
        ],
      }],
    }),
  });
  return readModelText(response, (payload) => {
    const content = (payload as { content?: { type?: string; text?: string }[] }).content ?? [];
    return content.filter((block) => block.type === 'text').map((block) => block.text ?? '').join(' ');
  });
}

async function askOpenAI(
  key: string,
  project: TrainingProject,
  image: DatasetImage,
  buffer: Buffer,
  signal: AbortSignal,
): Promise<string> {
  const base = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_CAPTION_MODEL?.trim() || 'gpt-4o-mini';
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 120,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: promptFor(project) },
          { type: 'image_url', image_url: { url: `data:${image.mime};base64,${buffer.toString('base64')}` } },
        ],
      }],
    }),
  });
  return readModelText(response, (payload) => {
    const choices = (payload as { choices?: { message?: { content?: string } }[] }).choices;
    return choices?.[0]?.message?.content ?? '';
  });
}
