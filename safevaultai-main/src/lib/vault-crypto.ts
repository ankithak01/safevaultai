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
  const source = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as unknown as ArrayBuffer,
      iterations: ITERATIONS,
    },
    source,
    512,
  );
  const material = new Uint8Array(bits);
  const encryptionKey = await crypto.subtle.importKey(
    "raw",
    material.slice(0, 32),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  const verifierKey = await crypto.subtle.importKey(
    "raw",
    material.slice(32),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  material.fill(0);
  return { encryptionKey, verifierKey };
}

export async function createVaultKeys(passphrase: string) {
  if (passphrase.length < 12)
    throw new Error("Choose a vault passphrase with at least 12 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { encryptionKey, verifierKey } = await deriveKeys(passphrase, salt);
  const signature = await crypto.subtle.sign(
    "HMAC",
    verifierKey,
    new TextEncoder().encode(VERIFIER_LABEL),
  );
  return { encryptionKey, salt: toBase64(salt), verifier: toBase64(new Uint8Array(signature)) };
}

export async function unlockVaultKeys(
  passphrase: string,
  saltValue: string,
  expectedVerifier: string,
) {
  const { encryptionKey, verifierKey } = await deriveKeys(passphrase, fromBase64(saltValue));
  const signature = await crypto.subtle.sign(
    "HMAC",
    verifierKey,
    new TextEncoder().encode(VERIFIER_LABEL),
  );
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
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    plaintext,
  );
  plaintext.fill(0);
  return {
    encrypted_payload: toBase64(new Uint8Array(ciphertext)),
    payload_nonce: toBase64(nonce),
  };
}

export async function decryptVaultValue<T>(
  key: CryptoKey,
  encryptedPayload: string,
  payloadNonce: string,
): Promise<T> {
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

export async function encryptVaultBytes(
  key: CryptoKey,
  data: ArrayBuffer,
): Promise<{ encrypted: Blob; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    data,
  );
  return {
    encrypted: new Blob([encrypted], { type: "application/octet-stream" }),
    nonce: toBase64(nonce),
  };
}

export async function decryptVaultBytes(
  key: CryptoKey,
  data: ArrayBuffer,
  nonce: string,
  mimeType: string,
) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(nonce), tagLength: 128 },
    key,
    data,
  );
  return new Blob([plaintext], { type: mimeType });
}

export async function encryptVaultText(
  key: CryptoKey,
  text: string,
): Promise<{ ciphertext: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(text);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    plaintext,
  );
  plaintext.fill(0);
  return {
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    nonce: toBase64(nonce),
  };
}

export async function decryptVaultText(
  key: CryptoKey,
  ciphertext: string,
  nonce: string,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(nonce), tagLength: 128 },
    key,
    fromBase64(ciphertext),
  );
  const bytes = new Uint8Array(plaintext);
  try {
    return new TextDecoder().decode(bytes);
  } finally {
    bytes.fill(0);
  }
}

export interface PasswordGeneratorOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?";

/**
 * Generates a cryptographically secure random password using Web Crypto API.
 * Never uses Math.random().
 */
export function generateSecurePassword(options: PasswordGeneratorOptions = {}): string {
  const length = Math.max(8, Math.min(64, options.length ?? 16));
  const incUpper = options.uppercase ?? true;
  const incLower = options.lowercase ?? true;
  const incNumbers = options.numbers ?? true;
  const incSymbols = options.symbols ?? true;

  let pool = "";
  const guaranteed: string[] = [];

  if (incUpper) {
    pool += UPPER;
    const char = UPPER[getSecureRandomInt(UPPER.length)];
    if (char) guaranteed.push(char);
  }
  if (incLower) {
    pool += LOWER;
    const char = LOWER[getSecureRandomInt(LOWER.length)];
    if (char) guaranteed.push(char);
  }
  if (incNumbers) {
    pool += NUMBERS;
    const char = NUMBERS[getSecureRandomInt(NUMBERS.length)];
    if (char) guaranteed.push(char);
  }
  if (incSymbols) {
    pool += SYMBOLS;
    const char = SYMBOLS[getSecureRandomInt(SYMBOLS.length)];
    if (char) guaranteed.push(char);
  }

  if (pool.length === 0) {
    pool = LOWER + NUMBERS;
  }

  const result: string[] = [...guaranteed];
  while (result.length < length) {
    const char = pool[getSecureRandomInt(pool.length)];
    if (char) result.push(char);
  }

  // Fisher-Yates shuffle using cryptographically secure random numbers
  for (let i = result.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(i + 1);
    const itemI = result[i];
    const itemJ = result[j];
    if (itemI !== undefined && itemJ !== undefined) {
      result[i] = itemJ;
      result[j] = itemI;
    }
  }

  return result.join("");
}

function getSecureRandomInt(max: number): number {
  if (max <= 1) return 0;
  // Uniform rejection sampling to eliminate modulo bias
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  let value: number = 0;
  do {
    crypto.getRandomValues(buffer);
    const first = buffer[0];
    if (first !== undefined) {
      value = first;
    }
  } while (value >= limit);
  return value % max;
}

export type PasswordStrengthLevel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  score: number;
  level: PasswordStrengthLevel;
  feedback: string[];
}

export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, level: "weak", feedback: ["Enter a password"] };
  }

  let score = 0;
  const feedback: string[] = [];

  // Length scoring
  if (password.length >= 8) score += 20;
  if (password.length >= 12) score += 20;
  if (password.length >= 16) score += 10;
  if (password.length < 8) feedback.push("At least 8 characters recommended");
  else if (password.length < 12) feedback.push("12+ characters recommended for high security");

  // Character variety
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (hasLower) score += 10;
  else feedback.push("Add lowercase letters");

  if (hasUpper) score += 10;
  else feedback.push("Add uppercase letters");

  if (hasNumber) score += 15;
  else feedback.push("Add numbers");

  if (hasSymbol) score += 15;
  else feedback.push("Add symbols or special characters");

  // Variety bonus
  const varietyCount = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;
  if (varietyCount >= 4 && password.length >= 12) score += 10;

  score = Math.min(100, Math.max(0, score));

  let level: PasswordStrengthLevel = "weak";
  if (score >= 80) level = "strong";
  else if (score >= 60) level = "good";
  else if (score >= 40) level = "fair";

  return { score, level, feedback };
}
