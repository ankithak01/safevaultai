const ITERATIONS = 310_000;
const VERIFIER_LABEL = "SafeVault vault key check v1";

export type EncryptedPayload = { encrypted_payload: string; payload_nonce: string };

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveKeys(passphrase: string, salt: Uint8Array) {
  const source = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, source, 512);
  const material = new Uint8Array(bits);
  const encryptionKey = await crypto.subtle.importKey("raw", material.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  const verifierKey = await crypto.subtle.importKey("raw", material.slice(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  material.fill(0);
  return { encryptionKey, verifierKey };
}

export async function createVaultKeys(passphrase: string) {
  if (passphrase.length < 12) throw new Error("Choose a vault passphrase with at least 12 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { encryptionKey, verifierKey } = await deriveKeys(passphrase, salt);
  const signature = await crypto.subtle.sign("HMAC", verifierKey, new TextEncoder().encode(VERIFIER_LABEL));
  return { encryptionKey, salt: toBase64(salt), verifier: toBase64(new Uint8Array(signature)) };
}

export async function unlockVaultKeys(passphrase: string, saltValue: string, expectedVerifier: string) {
  const { encryptionKey, verifierKey } = await deriveKeys(passphrase, fromBase64(saltValue));
  const signature = await crypto.subtle.sign("HMAC", verifierKey, new TextEncoder().encode(VERIFIER_LABEL));
  const actual = new Uint8Array(signature);
  const expected = fromBase64(expectedVerifier);
  if (actual.length !== expected.length || actual.some((byte, index) => byte !== expected[index])) {
    throw new Error("That vault passphrase did not unlock this vault.");
  }
  return encryptionKey;
}

export async function encryptVaultValue(key: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, plaintext);
  plaintext.fill(0);
  return { encrypted_payload: toBase64(new Uint8Array(ciphertext)), payload_nonce: toBase64(nonce) };
}

export async function decryptVaultValue<T>(key: CryptoKey, encryptedPayload: string, payloadNonce: string): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payloadNonce), tagLength: 128 },
    key,
    fromBase64(encryptedPayload),
  );
  const bytes = new Uint8Array(plaintext);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } finally {
    bytes.fill(0);
  }
}

export async function encryptVaultBytes(key: CryptoKey, data: ArrayBuffer): Promise<{ encrypted: Blob; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, data);
  return { encrypted: new Blob([encrypted], { type: "application/octet-stream" }), nonce: toBase64(nonce) };
}

export async function decryptVaultBytes(key: CryptoKey, data: ArrayBuffer, nonce: string, mimeType: string) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(nonce), tagLength: 128 },
    key,
    data,
  );
  return new Blob([plaintext], { type: mimeType });
}