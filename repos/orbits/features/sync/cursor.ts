import { createHmac, timingSafeEqual } from "node:crypto";

export const SYNC_CURSOR_VERSION = 1 as const;
export const SYNC_CURSOR_TTL_MS = 24 * 60 * 60 * 1_000;
export const SYNC_CURSOR_MAX_BYTES = 2_048;

export type SyncCursorErrorCode =
  | "SYNC_CURSOR_SECRET_MISSING"
  | "SYNC_RESET_REQUIRED";

export class SyncCursorError extends Error {
  constructor(
    readonly code: SyncCursorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SyncCursorError";
  }
}

export interface SyncCursorScope {
  actorId: string;
  workspaceId: string;
}

export interface SyncCursorPosition extends SyncCursorScope {
  afterRevision: string;
  highWatermark: string;
}

interface StoredSyncCursor extends SyncCursorPosition {
  issuedAt: number;
  version: typeof SYNC_CURSOR_VERSION;
}

function resetRequired(): never {
  throw new SyncCursorError(
    "SYNC_RESET_REQUIRED",
    "Sync cursor is invalid or expired.",
  );
}

function validRevision(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value);
}

function requireSecret(secret: string): string {
  if (!secret.trim() || Buffer.byteLength(secret, "utf8") < 32) {
    throw new SyncCursorError(
      "SYNC_CURSOR_SECRET_MISSING",
      "The server sync cursor secret is not configured.",
    );
  }
  return secret;
}

function canonicalBase64url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return resetRequired();
  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : resetRequired();
}

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload, "utf8").digest();
}

export function createSyncCursorCodec({ secret }: { secret: string }) {
  const signingSecret = requireSecret(secret);

  return {
    encode(position: SyncCursorPosition, now = Date.now()): string {
      if (
        !position.actorId.trim()
        || !position.workspaceId.trim()
        || !validRevision(position.afterRevision)
        || !validRevision(position.highWatermark)
        || BigInt(position.afterRevision) > BigInt(position.highWatermark)
      ) {
        return resetRequired();
      }
      const stored: StoredSyncCursor = {
        version: SYNC_CURSOR_VERSION,
        actorId: position.actorId,
        workspaceId: position.workspaceId,
        afterRevision: position.afterRevision,
        highWatermark: position.highWatermark,
        issuedAt: now,
      };
      const payload = Buffer.from(JSON.stringify(stored), "utf8").toString("base64url");
      const token = `${payload}.${signature(payload, signingSecret).toString("base64url")}`;
      return Buffer.byteLength(token, "utf8") <= SYNC_CURSOR_MAX_BYTES
        ? token
        : resetRequired();
    },

    decode(token: string, scope: SyncCursorScope, now = Date.now()): SyncCursorPosition {
      if (!token || Buffer.byteLength(token, "utf8") > SYNC_CURSOR_MAX_BYTES) {
        return resetRequired();
      }
      const segments = token.split(".");
      if (
        segments.length !== 2
        || !segments[0]
        || !segments[1]
        || segments[1].length !== 43
      ) {
        return resetRequired();
      }
      try {
        const expected = signature(segments[0], signingSecret);
        canonicalBase64url(segments[0]);
        const supplied = canonicalBase64url(segments[1]);
        if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
          return resetRequired();
        }
        const decoded = JSON.parse(
          canonicalBase64url(segments[0]).toString("utf8"),
        ) as Partial<StoredSyncCursor>;
        if (
          decoded.version !== SYNC_CURSOR_VERSION
          || decoded.actorId !== scope.actorId
          || decoded.workspaceId !== scope.workspaceId
          || !validRevision(decoded.afterRevision)
          || !validRevision(decoded.highWatermark)
          || BigInt(decoded.afterRevision) > BigInt(decoded.highWatermark)
          || !Number.isSafeInteger(decoded.issuedAt)
          || decoded.issuedAt > now
          || now - decoded.issuedAt >= SYNC_CURSOR_TTL_MS
        ) {
          return resetRequired();
        }
        return {
          actorId: decoded.actorId,
          workspaceId: decoded.workspaceId,
          afterRevision: decoded.afterRevision,
          highWatermark: decoded.highWatermark,
        };
      } catch (error) {
        if (error instanceof SyncCursorError) throw error;
        return resetRequired();
      }
    },
  };
}

export type SyncCursorCodec = ReturnType<typeof createSyncCursorCodec>;
