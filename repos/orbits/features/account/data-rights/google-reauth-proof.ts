import { createHash, randomUUID } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

const ISSUER = "orbit-account-deletion";
const AUDIENCE = "google-reauth";
const FIVE_MINUTES = 5 * 60;
const TEN_MINUTES = 10 * 60_000;

export interface GoogleReauthPrincipal { actorId: string; userId: string; email: string }
export interface GoogleReauthProof { sub?: unknown; email?: unknown; googleAuthTime?: unknown }

function key(secret: string) { return createHash("sha256").update(secret).digest(); }

/** 主会话代定 §R18c-3: bind the fresh Google round trip to the account that started deletion. */
export async function issueGoogleReauthChallenge(input: GoogleReauthPrincipal & { secret: string; now?: Date }): Promise<string> {
  if (!input.secret || !input.actorId || !input.userId || !input.email) throw new Error("GOOGLE_REAUTH_UNAVAILABLE");
  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new EncryptJWT({ actorId: input.actorId, userId: input.userId, email: input.email.toLowerCase(), purpose: "deletion-request" })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer(ISSUER).setAudience(AUDIENCE).setJti(randomUUID())
    .setIssuedAt(issuedAt).setExpirationTime(issuedAt + FIVE_MINUTES).encrypt(key(input.secret));
}

export async function verifyGoogleReauthProof(input: {
  challenge: string;
  principal: GoogleReauthPrincipal;
  proof: GoogleReauthProof | null;
  secret: string;
  now?: Date;
}): Promise<Date | null> {
  if (!input.secret || !input.proof) return null;
  const now = input.now ?? new Date();
  try {
    const { payload } = await jwtDecrypt(input.challenge, key(input.secret), {
      keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"],
      audience: AUDIENCE, issuer: ISSUER, currentDate: now,
    });
    const authTime = input.proof.googleAuthTime;
    if (payload.purpose !== "deletion-request" || payload.actorId !== input.principal.actorId ||
      payload.userId !== input.principal.userId || payload.email !== input.principal.email.toLowerCase() ||
      input.proof.sub !== input.principal.userId || input.proof.email !== input.principal.email ||
      typeof authTime !== "number" || !Number.isInteger(authTime) || typeof payload.iat !== "number") return null;
    const evidenceAt = new Date(authTime * 1000);
    if (authTime < payload.iat - 30 || evidenceAt.getTime() > now.getTime() + 30_000 ||
      now.getTime() - evidenceAt.getTime() > TEN_MINUTES) return null;
    return evidenceAt;
  } catch { return null; }
}
