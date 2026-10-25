const STORAGE_KEY = 'lora-forge-key';

export function isOwnerKey(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function remember(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
  document.cookie = `lora_key=${encodeURIComponent(key)}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

export function ownerKey(): string {
  const existing = localStorage.getItem(STORAGE_KEY) ?? '';
  const key = isOwnerKey(existing) ? existing.trim().toLowerCase() : crypto.randomUUID();
  remember(key);
  return key;
}

export function adoptOwnerKey(value: string): void {
  const key = value.trim().toLowerCase();
  if (!isOwnerKey(key)) throw new Error('A recovery code is four groups of letters and numbers, like 1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d.');
  remember(key);
}
