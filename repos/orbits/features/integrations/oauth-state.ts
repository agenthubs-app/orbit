import { createHmac, timingSafeEqual } from "node:crypto";
import type { OrbitIntegrationProvider } from "./contract";

interface OAuthStatePayload {
  provider: OrbitIntegrationProvider;
  actorId: string;
  sessionBinding: string;
  expiresAt: number;
  nonce: string;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createIntegrationOAuthState(input: {
  provider: OrbitIntegrationProvider;
  actorId: string;
  sessionBinding: string;
  secret: string;
  now?: number;
  nonce?: string;
}): string {
  const payload = Buffer.from(
    JSON.stringify({
      provider: input.provider,
      actorId: input.actorId,
      sessionBinding: input.sessionBinding,
      expiresAt: (input.now ?? Date.now()) + 10 * 60_000,
      nonce: input.nonce ?? crypto.randomUUID(),
    } satisfies OAuthStatePayload),
  ).toString("base64url");
  return `${payload}.${signature(payload, input.secret)}`;
}

export function verifyIntegrationOAuthState(input: {
  state: string;
  provider: OrbitIntegrationProvider;
  actorId: string;
  sessionBinding: string;
  secret: string;
  now?: number;
}): boolean {
  const [payload, providedSignature] = input.state.split(".");
  if (!payload || !providedSignature) return false;
  const expected = signature(payload, input.secret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return false;
  }
  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
    return (
      value.provider === input.provider &&
      value.actorId === input.actorId &&
      value.sessionBinding === input.sessionBinding &&
      value.expiresAt >= (input.now ?? Date.now()) &&
      typeof value.nonce === "string" &&
      value.nonce.length > 0
    );
  } catch {
    return false;
  }
}
