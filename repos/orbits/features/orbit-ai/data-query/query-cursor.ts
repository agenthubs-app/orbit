import { createHmac, timingSafeEqual } from "node:crypto";
import type { AiReadTool, ReadScope } from "./read-contract";

export interface CursorBinding {
  scope: ReadScope;
  tool: AiReadTool;
  schemaVersion: 1;
  registryVersion: 1;
  filterHash: string;
}

export interface CursorClaims extends CursorBinding {
  snapshot: string;
  position: string;
  expiresAt: string;
}

function invalidCursor(): never {
  throw new Error("INVALID_CURSOR");
}

function assertKey(key: Uint8Array): void {
  if (key.byteLength < 32) invalidCursor();
}

function sameBinding(actual: CursorClaims, expected: CursorBinding): boolean {
  return actual.scope.actorId === expected.scope.actorId &&
    actual.scope.workspaceId === expected.scope.workspaceId &&
    actual.scope.authorizationEpoch === expected.scope.authorizationEpoch &&
    actual.tool === expected.tool &&
    actual.schemaVersion === expected.schemaVersion &&
    actual.registryVersion === expected.registryVersion &&
    actual.filterHash === expected.filterHash;
}

export function sealReadCursor(claims: CursorClaims, key: Uint8Array): string {
  assertKey(key);
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function openReadCursor(
  token: string,
  key: Uint8Array,
  expected: CursorBinding,
  now: string,
): CursorClaims {
  try {
    assertKey(key);
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) invalidCursor();
    const expectedSignature = createHmac("sha256", key).update(parts[0]).digest();
    const actualSignature = Buffer.from(parts[1], "base64url");
    if (actualSignature.byteLength !== expectedSignature.byteLength || !timingSafeEqual(actualSignature, expectedSignature)) {
      invalidCursor();
    }
    const claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as CursorClaims;
    if (
      !claims || typeof claims !== "object" || !sameBinding(claims, expected) ||
      !claims.snapshot || !claims.position || !claims.expiresAt ||
      !Number.isFinite(Date.parse(claims.expiresAt)) || !Number.isFinite(Date.parse(now)) ||
      Date.parse(now) >= Date.parse(claims.expiresAt)
    ) {
      invalidCursor();
    }
    return claims;
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CURSOR") throw error;
    return invalidCursor();
  }
}
