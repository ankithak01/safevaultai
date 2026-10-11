import { describe, expect, it } from "vitest";
import { createVaultKeys, decryptVaultValue, encryptVaultValue, unlockVaultKeys } from "./vault-crypto";

describe("private vault encryption", () => {
  it("encrypts values so only the unlocked vault key can read them", async () => {
    const setup = await createVaultKeys("my distinct vault passphrase");
    const encrypted = await encryptVaultValue(setup.encryptionKey, { password: "private value" });

    expect(encrypted.encrypted_payload).not.toContain("private value");
    await expect(decryptVaultValue(setup.encryptionKey, encrypted.encrypted_payload, encrypted.payload_nonce))
      .resolves.toEqual({ password: "private value" });
    await expect(unlockVaultKeys("a different vault passphrase", setup.salt, setup.verifier))
      .rejects.toThrow("did not unlock");
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

    await expect(decryptVaultValue(setup.encryptionKey, tampered, encrypted.payload_nonce)).rejects.toThrow();
  });
});