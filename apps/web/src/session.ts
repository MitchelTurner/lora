const STORAGE_KEY = 'lora-forge-key';

let memoryKey = '';

export function isOwnerKey(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function readStorage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function readCookie(): string {
  const match = /(?:^|;\s*)lora_key=([^;]+)/.exec(document.cookie);
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return '';
  }
}

function remember(key: string): void {
  memoryKey = key;
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Private browsing can block storage. This tab and the cookie still hold the code.
  }
  document.cookie = `lora_key=${encodeURIComponent(key)}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

export function ownerKey(): string {
  if (isOwnerKey(memoryKey)) return memoryKey;
  const stored = readStorage();
  const fromCookie = readCookie();
  const existing = isOwnerKey(stored) ? stored : fromCookie;
  const key = isOwnerKey(existing) ? existing.trim().toLowerCase() : crypto.randomUUID();
  remember(key);
  return key;
}

export function adoptOwnerKey(value: string): void {
  const key = value.trim().toLowerCase();
  if (!isOwnerKey(key)) throw new Error('A recovery code is four groups of letters and numbers, like 1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d.');
  remember(key);
}
