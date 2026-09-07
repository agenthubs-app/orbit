import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export interface EncryptedPushToken {
  algorithm: "aes-256-gcm";
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface PushTokenVault {
  encrypt: (token: string) => EncryptedPushToken;
  decrypt: (payload: EncryptedPushToken) => string;
}

function encryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ORBIT_PUSH_TOKEN_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}

export function pushTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createEncryptedPushTokenVault(input: {
  encryptionKeyBase64: string;
}): PushTokenVault {
  const key = encryptionKey(input.encryptionKeyBase64);

  return {
    encrypt(token) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(token, "utf8"),
        cipher.final(),
      ]);
      return {
        algorithm: "aes-256-gcm",
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
      };
    },
    decrypt(payload) {
      if (payload.algorithm !== "aes-256-gcm") {
        throw new Error("Push token encryption algorithm is invalid.");
      }
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(payload.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

/**
 * Tests and local memory-only runs may inject this vault. It still encrypts
 * with AES-GCM, but its key is intentionally process-local and never suitable
 * for a persisted database deployment.
 */
export function createEphemeralPushTokenVault(): PushTokenVault {
  return createEncryptedPushTokenVault({
    encryptionKeyBase64: randomBytes(32).toString("base64"),
  });
}
