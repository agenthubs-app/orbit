"use client";

// R15 招待コード: the browser calls (DESIGN §4.2). Responses are read leniently through the contract
// schemas; a failure carries the status and `error.context.reason` (INVITE_UNAVAILABLE, INVITE_EXPIRED,
// INVITE_FULL, OWN_CODE, PROFILE_REQUIRED, SAMPLE_READ_ONLY …) so the screen can pick the right state.
// The profile read / save is the existing /api/profile (only called here, never changed).
import type { ZodType } from "zod";

import {
  inviteCodeHistoryResponseSchema,
  inviteCodeRedeemResultSchema,
  inviteCodeSchema,
} from "../../../../../../shared/api-schema/invite-codes";
import type {
  InviteCodeContract,
  InviteCodeHistoryResponse,
  InviteCodeRedeemResult,
  InviteSharedFieldKey,
} from "../../../../../../shared/contract/invite-codes";
import type { ManualProfileContract } from "../../../../../../shared/contract/profile";

export type InviteApiResult<T> = { ok: true; data: T } | { ok: false; status: number; reason: string | null; code: string | null };

type Envelope = { success?: boolean; data?: unknown; error?: { code?: string; context?: { reason?: string } } } | null;

async function call<T>(url: string, init: RequestInit, schema: ZodType<T> | null): Promise<InviteApiResult<T>> {
  try {
    const response = await fetch(url, { ...init, cache: "no-store", headers: init.body ? { "Content-Type": "application/json", accept: "application/json" } : { accept: "application/json" } });
    const body = (await response.json().catch(() => null)) as Envelope;
    if (!response.ok || !body?.success) return { ok: false, status: response.status, reason: body?.error?.context?.reason ?? null, code: body?.error?.code ?? null };
    if (!schema) return { ok: true, data: body.data as T };
    const parsed = schema.safeParse(body.data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, status: 500, reason: "UNREADABLE", code: null };
  } catch {
    return { ok: false, status: 0, reason: null, code: null };
  }
}

const enc = encodeURIComponent;

export function readCurrentInviteCode(): Promise<InviteApiResult<InviteCodeContract | null>> {
  return call("/api/invite-codes/current", { method: "GET" }, inviteCodeSchema.nullable() as ZodType<InviteCodeContract | null>);
}

export function createInviteCode(input: { displayName: string; sharedKeys: InviteSharedFieldKey[]; idempotencyKey: string }): Promise<InviteApiResult<InviteCodeContract>> {
  // The server only reads the keys; `shared` is required by the R08 body shape and its values are ignored.
  const body = { idempotencyKey: input.idempotencyKey, maxUses: 10, shared: { displayName: input.displayName.trim().slice(0, 80) || "Orbit" }, sharedKeys: input.sharedKeys };
  return call("/api/invite-codes", { method: "POST", body: JSON.stringify(body) }, inviteCodeSchema);
}

export function revokeInviteCode(code: string): Promise<InviteApiResult<InviteCodeContract>> {
  return call(`/api/invite-codes/${enc(code)}/revoke`, { method: "POST", body: "{}" }, inviteCodeSchema);
}

export function readInviteHistory(): Promise<InviteApiResult<InviteCodeHistoryResponse>> {
  return call("/api/invite-codes", { method: "GET" }, inviteCodeHistoryResponseSchema);
}

export function redeemInviteCode(code: string, input: { idempotencyKey: string; sharedKeys: InviteSharedFieldKey[] }): Promise<InviteApiResult<InviteCodeRedeemResult>> {
  return call(`/api/invite-codes/${enc(code)}/redeem`, { method: "POST", body: JSON.stringify(input) }, inviteCodeRedeemResultSchema);
}

/** GET /api/profile → `profile` (null when there is none yet). */
export type InviteProfileRead = { profile: Pick<ManualProfileContract, "displayName" | "organization" | "role" | "offering" | "seeking" | "handles" | "updatedAt"> | null };

export function readMyProfile(): Promise<InviteApiResult<InviteProfileRead>> {
  return call("/api/profile", { method: "GET" }, null);
}

export type InviteProfileFields = { displayName: string; organization: string; role: string; offering: string[]; seeking: string[] };

/**
 * PUT /api/profile with only the short-profile fields (same save the profile editor uses: version check by
 * `expectedUpdatedAt`, receipt by `mutationId`). A version conflict (another tab saved) reads the latest version
 * and sends once more — these are the values the person just confirmed on this screen.
 */
export async function saveShortProfile(fields: InviteProfileFields, expectedUpdatedAt: string | null): Promise<InviteApiResult<unknown>> {
  const put = (expected: string | null) => call("/api/profile", {
    method: "PUT",
    body: JSON.stringify({ ...fields, expectedUpdatedAt: expected, mutationId: `invite-profile-${globalThis.crypto?.randomUUID?.() ?? Date.now()}` }),
  }, null);
  const first = await put(expectedUpdatedAt);
  if (first.ok === true) return first;
  if (first.status !== 409 && first.code !== "PROFILE_VERSION_CONFLICT") return first;
  const latest = await readMyProfile();
  return put(latest.ok ? latest.data.profile?.updatedAt ?? null : null);
}

/** POST /api/contacts/manual/duplicates (R12): is the inviter already in my network? Fails quietly (no hint). */
export async function inviterAlreadyInNetwork(input: { displayName: string; organization?: string }): Promise<boolean> {
  const body = { displayName: input.displayName, ...(input.organization ? { organization: input.organization } : {}) };
  const result = await call<{ candidates?: { matchedOn?: string[] }[] }>("/api/contacts/manual/duplicates", { method: "POST", body: JSON.stringify(body) }, null);
  if (!result.ok || !Array.isArray(result.data?.candidates)) return false;
  // Only the matches the connection would merge into (e-mail / phone / name + company); 「同名」 alone is a hint only.
  return result.data.candidates.some((candidate) => Array.isArray(candidate.matchedOn) && candidate.matchedOn.some((reason) => reason !== "name"));
}
