/**
 * Sync encryption. The passphrase never leaves the device: PBKDF2 (600k) turns it and the
 * space's salt into 64 bytes, split into an AES-GCM key (contents) and an HMAC key (item names,
 * so the server can't even see which ids exist). The server stores only what comes out of here.
 */

const ITERATIONS = 600_000;
const VERIFIER_TEXT = 'creative-notes-sync-v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export interface SyncKeys {
  aes: CryptoKey;
  hmac: CryptoKey;
}

/** 64 bytes of key material from the passphrase. Stored (as base64) only on this device. */
export async function deriveRaw(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt.slice().buffer, iterations: ITERATIONS }, base, 512));
}

export async function importKeys(raw: Uint8Array): Promise<SyncKeys> {
  const [aes, hmac] = await Promise.all([
    crypto.subtle.importKey('raw', raw.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']),
    crypto.subtle.importKey('raw', raw.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  ]);
  return { aes, hmac };
}

async function gzip(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes.slice().buffer]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function seal(keys: SyncKeys, value: unknown): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = await gzip(enc.encode(JSON.stringify(value)), new CompressionStream('gzip'));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.aes, plain.slice().buffer));
  return { iv: b64(iv), data: b64(data) };
}

export async function open<T>(keys: SyncKeys, iv: string, data: string): Promise<T> {
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv).slice().buffer }, keys.aes, unb64(data).slice().buffer));
  return JSON.parse(dec.decode(await gzip(plain, new DecompressionStream('gzip')))) as T;
}

/** The server-side name for a unit key. */
export async function remoteKey(keys: SyncKeys, key: string): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', keys.hmac, enc.encode(key))));
}

export async function makeVerifier(keys: SyncKeys): Promise<string> {
  const { iv, data } = await seal(keys, VERIFIER_TEXT);
  return iv + data; // a 12-byte iv is always 16 base64 characters
}

/** True when these keys came from the same passphrase as the verifier. */
export async function checkVerifier(keys: SyncKeys, verifier: string): Promise<boolean> {
  try {
    return (await open<string>(keys, verifier.slice(0, 16), verifier.slice(16))) === VERIFIER_TEXT;
  } catch {
    return false;
  }
}

export async function sha256(text: string): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}
