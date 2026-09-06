import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { AUTH_PASSWORD_MIN_LENGTH, isValidAuthEmail, normalizeAuthEmail } from "./contract";
import { PASSWORD_RESET_COOLDOWN_MS, PASSWORD_RESET_TTL_MS, passwordResetDigest, openPasswordResetToken, sealPasswordResetToken } from "./password-reset-crypto";
import type { PasswordResetStore } from "./password-reset-store";

export type PasswordResetResult = { success: true } | { success: false; code: "INVALID_INPUT" | "INVALID_TOKEN" };

export function createPasswordResetService(store: PasswordResetStore, secret: string, now = () => new Date()) {
  return {
    async request(email: unknown): Promise<PasswordResetResult> {
      if (typeof email !== "string" || email.length > 254 || !isValidAuthEmail(email)) return { success: false, code: "INVALID_INPUT" };
      const timestamp = now();
      const token = randomBytes(32).toString("base64url");
      await store.request(normalizeAuthEmail(email), {
        tokenHash: passwordResetDigest(token), sealedToken: sealPasswordResetToken(token, secret),
        requestedAt: timestamp.toISOString(), expiresAt: new Date(timestamp.getTime() + PASSWORD_RESET_TTL_MS).toISOString(),
        retryAt: timestamp.toISOString(), delivery: "pending", attempts: 0,
      }, new Date(timestamp.getTime() - PASSWORD_RESET_COOLDOWN_MS).toISOString());
      // Same result for unknown, OAuth-only and throttled addresses; mail is asynchronous.
      return { success: true };
    },
    async reset(token: unknown, password: unknown): Promise<PasswordResetResult> {
      if (typeof password !== "string" || password.length < AUTH_PASSWORD_MIN_LENGTH || Buffer.byteLength(password, "utf8") > 72) return { success: false, code: "INVALID_INPUT" };
      if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return { success: false, code: "INVALID_TOKEN" };
      const digest = passwordResetDigest(token);
      if (!await store.isValid(digest, now().toISOString())) return { success: false, code: "INVALID_TOKEN" };
      const passwordHash = await hash(password, 12);
      return await store.consume(digest, passwordHash, now().toISOString()) ? { success: true } : { success: false, code: "INVALID_TOKEN" };
    },
  };
}

export interface PasswordResetMailer {
  send(email: string, resetUrl: string, idempotencyKey: string): Promise<void>;
}

export async function deliverPasswordResetMail(input: {
  store: PasswordResetStore; secret: string; origin: string; mailer: PasswordResetMailer; now?: () => Date;
}): Promise<"idle" | "sent" | "retry"> {
  const now = input.now ?? (() => new Date());
  const timestamp = now();
  const job = await input.store.claim(timestamp.toISOString(), new Date(timestamp.getTime() + 60_000).toISOString(), randomUUID());
  if (!job) return "idle";
  let delivered = false;
  try {
    const token = openPasswordResetToken(job.reset.sealedToken, input.secret);
    const url = new URL("/app/account/reset-password", input.origin);
    // Fragment avoids putting the bearer token in server access logs and Referer headers.
    url.hash = new URLSearchParams({ token }).toString();
    await input.mailer.send(job.email, url.toString(), `password-reset/${job.reset.tokenHash}`);
    delivered = true;
  } catch {
    // Provider error bodies may echo email or the secret URL. Never log them.
  }
  const finishedAt = now();
  await input.store.finish(job, delivered, new Date(finishedAt.getTime() + Math.min(300_000, 5_000 * 2 ** job.reset.attempts)).toISOString(), finishedAt.toISOString());
  return delivered ? "sent" : "retry";
}
