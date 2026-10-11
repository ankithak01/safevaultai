import { describe, expect, it } from "vitest";
import {
  calculatePasswordStrength,
  createVaultKeys,
  decryptVaultText,
  decryptVaultValue,
  encryptVaultText,
  encryptVaultValue,
  generateSecurePassword,
  unlockVaultKeys,
} from "./vault-crypto";

describe("private vault encryption", () => {
  it("encrypts values so only the unlocked vault key can read them", async () => {
    const setup = await createVaultKeys("my distinct vault passphrase");
    const encrypted = await encryptVaultValue(setup.encryptionKey, { password: "private value" });

    expect(encrypted.encrypted_payload).not.toContain("private value");
    await expect(
      decryptVaultValue(setup.encryptionKey, encrypted.encrypted_payload, encrypted.payload_nonce),
    ).resolves.toEqual({ password: "private value" });
    await expect(
      unlockVaultKeys("a different vault passphrase", setup.salt, setup.verifier),
    ).rejects.toThrow("did not unlock");
  });

  it("uses a different authenticated nonce for every saved value", async () => {
    const setup = await createVaultKeys("another distinct vault passphrase");
    const first = await encryptVaultValue(setup.encryptionKey, { title: "same" });
    const second = await encryptVaultValue(setup.encryptionKey, { title: "same" });

    expect(first.payload_nonce).not.toBe(second.payload_nonce);
  });

  it("rejects tampered encrypted values", async () => {
    const setup = await createVaultKeys("third distinct vault passphrase");
    const encrypted = await encryptVaultValue(setup.encryptionKey, { body: "private" });
    const tampered = `${encrypted.encrypted_payload.slice(0, -4)}AAAA`;

    await expect(
      decryptVaultValue(setup.encryptionKey, tampered, encrypted.payload_nonce),
    ).rejects.toThrow();
  });

  it("encrypts and decrypts text strings correctly", async () => {
    const setup = await createVaultKeys("fourth distinct vault passphrase");
    const text = "A highly sensitive voice transcript";
    const encrypted = await encryptVaultText(setup.encryptionKey, text);

    expect(encrypted.ciphertext).not.toContain(text);
    const decrypted = await decryptVaultText(
      setup.encryptionKey,
      encrypted.ciphertext,
      encrypted.nonce,
    );
    expect(decrypted).toBe(text);
  });
});

describe("password generator and strength", () => {
  it("generates secure random passwords with configurable length and character sets", () => {
    const p1 = generateSecurePassword({ length: 24 });
    expect(p1.length).toBe(24);

    const p2 = generateSecurePassword({
      length: 16,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    });
    expect(p2.length).toBe(16);
    expect(/[A-Z]/.test(p2)).toBe(true);
    expect(/[a-z]/.test(p2)).toBe(true);
    expect(/[0-9]/.test(p2)).toBe(true);
    expect(/[^A-Za-z0-9]/.test(p2)).toBe(true);

    // Two generated passwords must be distinct
    const p3 = generateSecurePassword({ length: 20 });
    const p4 = generateSecurePassword({ length: 20 });
    expect(p3).not.toBe(p4);
  });

  it("evaluates password strength accurately", () => {
    expect(calculatePasswordStrength("").level).toBe("weak");
    expect(calculatePasswordStrength("short").level).toBe("weak");
    expect(calculatePasswordStrength("SimplePass123").level).toBe("good");
    const strong = calculatePasswordStrength("Correct-Horse-Battery-Staple-2026!$");
    expect(strong.level).toBe("strong");
    expect(strong.score).toBeGreaterThanOrEqual(80);
  });
});
