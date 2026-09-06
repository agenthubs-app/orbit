import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

export function passwordResetDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Only the mail worker can decrypt the token. API responses and logs never carry it.
export function sealPasswordResetToken(token: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(`orbit-password-reset:${secret}`).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function openPasswordResetToken(sealed: string, secret: string): string {
  const data = Buffer.from(sealed, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(`orbit-password-reset:${secret}`).digest(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
