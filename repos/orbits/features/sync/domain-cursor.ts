import { createHmac, timingSafeEqual } from "node:crypto";
import type { CursorClaims } from "../../shared/contract/universal-read";
import { SyncCursorError, SYNC_CURSOR_MAX_BYTES, SYNC_CURSOR_TTL_MS } from "./cursor";

/**
 * Domain cursor (v2): the v1 HMAC envelope extended with domain, schema,
 * registry, authorization epoch and generation. Presenting a cursor whose
 * bound claims differ from the caller's — another actor, a rotated epoch, a
 * new registry — is a SYNC_RESET_REQUIRED, never a partial page.
 */
export const DOMAIN_CURSOR_VERSION = 2 as const;

export type DomainCursorScope = Omit<CursorClaims, "afterRevision" | "highWatermark" | "issuedAt">;

/**
 * Sprint 0118: a partitioned domain (the messages of the AI sessions a device
 * opened) also records which partitions the bookmark already covers, and a
 * partition being caught up to it. Partitions are short digests, never ids.
 */
export interface DomainCursorPartitions {
  partitions?: readonly string[];
  catchUp?: { partitions: readonly string[]; afterRevision: string };
}
export type DomainCursorPosition = Omit<CursorClaims, "issuedAt"> & DomainCursorPartitions;
export type DecodedDomainCursor = CursorClaims & DomainCursorPartitions;

const PARTITION_LIMIT = 40;
function validPartitions(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= PARTITION_LIMIT && value.every((item) => typeof item === "string" && /^[a-f0-9]{12}$/.test(item))
    && value.every((item, index) => index === 0 || value[index - 1]! < item);
}

function resetRequired(): never {
  throw new SyncCursorError("SYNC_RESET_REQUIRED", "Sync cursor is invalid or expired.");
}

function validRevision(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value);
}

function requireSecret(secret: string): string {
  if (!secret.trim() || Buffer.byteLength(secret, "utf8") < 32) {
    throw new SyncCursorError("SYNC_CURSOR_SECRET_MISSING", "The server sync cursor secret is not configured.");
  }
  return secret;
}

function canonicalBase64url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return resetRequired();
  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : resetRequired();
}

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`domain-cursor:v${DOMAIN_CURSOR_VERSION}:`).update(payload).digest();
}

const SCOPE_KEYS = ["actorId", "workspaceId", "domainId", "authorizationEpoch", "generation", "schemaVersion", "registryVersion"] as const;

function validScope(scope: DomainCursorScope): boolean {
  return SCOPE_KEYS.every((key) => {
    const value = scope[key];
    return typeof value === "string" ? value.trim().length > 0 : Number.isSafeInteger(value);
  });
}

export function createDomainCursorCodec({ secret }: { secret: string }) {
  const key = requireSecret(secret);
  return {
    encode(position: DomainCursorPosition, now = Date.now()): string {
      if (
        !validScope(position)
        || !validRevision(position.afterRevision) || !validRevision(position.highWatermark)
        || BigInt(position.afterRevision) > BigInt(position.highWatermark)
        || (position.partitions !== undefined && !validPartitions(position.partitions))
        || (position.catchUp !== undefined && (!validPartitions(position.catchUp.partitions) || !validRevision(position.catchUp.afterRevision)))
      ) throw new SyncCursorError("SYNC_RESET_REQUIRED", "Sync cursor position is invalid.");
      const claims: DecodedDomainCursor = { ...position, issuedAt: now };
      const payload = Buffer.from(JSON.stringify({ version: DOMAIN_CURSOR_VERSION, ...claims }), "utf8").toString("base64url");
      return `${payload}.${signature(payload, key).toString("base64url")}`;
    },
    decode(token: string, scope: DomainCursorScope, now = Date.now()): DecodedDomainCursor {
      if (typeof token !== "string" || token.length === 0 || Buffer.byteLength(token, "utf8") > SYNC_CURSOR_MAX_BYTES) return resetRequired();
      const [payload, sig, ...rest] = token.split(".");
      if (!payload || !sig || rest.length > 0) return resetRequired();
      const expected = signature(payload, key);
      const provided = canonicalBase64url(sig);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return resetRequired();
      let decoded: Record<string, unknown>;
      try {
        decoded = JSON.parse(canonicalBase64url(payload).toString("utf8")) as Record<string, unknown>;
      } catch {
        return resetRequired();
      }
      if (decoded.version !== DOMAIN_CURSOR_VERSION) return resetRequired();
      for (const key of SCOPE_KEYS) if (decoded[key] !== scope[key]) return resetRequired();
      const issuedAt = decoded.issuedAt;
      if (!Number.isSafeInteger(issuedAt) || (issuedAt as number) > now || now - (issuedAt as number) >= SYNC_CURSOR_TTL_MS) return resetRequired();
      if (!validRevision(decoded.afterRevision) || !validRevision(decoded.highWatermark) || BigInt(decoded.afterRevision) > BigInt(decoded.highWatermark)) return resetRequired();
      const partitions = decoded.partitions;
      const catchUp = decoded.catchUp as { partitions?: unknown; afterRevision?: unknown } | undefined;
      if (partitions !== undefined && !validPartitions(partitions)) return resetRequired();
      if (catchUp !== undefined && (typeof catchUp !== "object" || catchUp === null || !validPartitions(catchUp.partitions) || !validRevision(catchUp.afterRevision))) return resetRequired();
      return {
        ...scope, afterRevision: decoded.afterRevision, highWatermark: decoded.highWatermark, issuedAt: issuedAt as number,
        ...(partitions !== undefined ? { partitions: partitions as string[] } : {}),
        ...(catchUp !== undefined ? { catchUp: { partitions: catchUp.partitions as string[], afterRevision: catchUp.afterRevision as string } } : {}),
      };
    },
  };
}
