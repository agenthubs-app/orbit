// R15 招待コード: every server call the App invite screens make (DESIGN §4.2). Answers are read through
// the synced contract schemas (unknown enum values read leniently); a failure keeps its status and
// `error.context.reason` (INVITE_UNAVAILABLE, INVITE_EXPIRED, INVITE_FULL, OWN_CODE, PROFILE_REQUIRED,
// SAMPLE_READ_ONLY …) so a screen can pick the right state. The profile read / save is the existing
// /api/profile (only called here). The client sends keys only — values are read from the profile on the server.
import { useMemo } from "react";
import type { ZodType } from "zod";

import type { OrbitApiClient } from "../../../api/client";
import type {
  InviteCodeContract,
  InviteCodeHistoryResponse,
  InviteCodePreview,
  InviteCodeRedeemResult,
  InviteConnectionView,
  InviteSharedFieldKey,
  InviteUnlinkResult,
} from "../../../api/contract/invite-codes";
import { ORBIT_API_ENDPOINTS } from "../../../api/endpoints";
import {
  inviteCodeHistoryResponseSchema,
  inviteCodePreviewSchema,
  inviteCodeRedeemResultSchema,
  inviteCodeSchema,
  inviteConnectionViewSchema,
  inviteUnlinkResultSchema,
} from "../../../api/schema/invite-codes";
import type { ApiResult } from "../../../api/types";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import type { InviteProfile } from "./invite-model";

export type InviteApiResult<T> = { ok: true; data: T } | { ok: false; status: number; reason: string | null; code: string | null };

export const INVITE_CODES_PATH = "/api/invite-codes";
export const INVITE_CURRENT_PATH = "/api/invite-codes/current";
const INVITE_CONNECTIONS_PATH = "/api/invite-codes/connections";
export function inviteRevokePath(code: string): string { return INVITE_CODES_PATH + "/" + encodeURIComponent(code) + "/revoke"; }
export function invitePreviewPath(code: string): string { return INVITE_CODES_PATH + "/" + encodeURIComponent(code) + "/preview"; }
export function inviteRedeemPath(code: string): string { return INVITE_CODES_PATH + "/" + encodeURIComponent(code) + "/redeem"; }
export function inviteConnectionPath(contactId: string): string { return INVITE_CONNECTIONS_PATH + "/" + encodeURIComponent(contactId); }
export function inviteSharePath(contactId: string): string { return inviteConnectionPath(contactId) + "/share"; }
export function inviteUnlinkPath(contactId: string): string { return inviteConnectionPath(contactId) + "/unlink"; }

export type InviteProfileFields = { displayName: string; organization: string; role: string; offering: string[]; seeking: string[] };

export interface InviteApi {
  current(): Promise<InviteApiResult<InviteCodeContract | null>>;
  create(input: { displayName: string; sharedKeys: InviteSharedFieldKey[]; idempotencyKey: string }): Promise<InviteApiResult<InviteCodeContract>>;
  revoke(code: string): Promise<InviteApiResult<InviteCodeContract>>;
  history(): Promise<InviteApiResult<InviteCodeHistoryResponse>>;
  preview(code: string): Promise<InviteApiResult<InviteCodePreview>>;
  redeem(code: string, input: { idempotencyKey: string; sharedKeys: InviteSharedFieldKey[] }): Promise<InviteApiResult<InviteCodeRedeemResult>>;
  profile(): Promise<InviteApiResult<{ profile: InviteProfile | null }>>;
  saveShortProfile(fields: InviteProfileFields, expectedUpdatedAt: string | null): Promise<InviteApiResult<unknown>>;
  inviterInNetwork(input: { displayName: string; organization?: string }): Promise<boolean>;
  connection(contactId: string): Promise<InviteApiResult<InviteConnectionView>>;
  updateShare(contactId: string, input: { sharedKeys: InviteSharedFieldKey[]; idempotencyKey: string }): Promise<InviteApiResult<InviteConnectionView>>;
  unlink(contactId: string, input: { keepAsContact: boolean; idempotencyKey: string }): Promise<InviteApiResult<InviteUnlinkResult>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function failureOf<T>(result: ApiResult<unknown>): InviteApiResult<T> {
  if (result.success) return { ok: false, status: result.status, reason: null, code: null };
  return { ok: false, status: result.status, reason: result.error.context?.reason ?? null, code: result.error.code ?? null };
}

export function createInviteApi(client: OrbitApiClient): InviteApi {
  async function read<T>(promise: Promise<ApiResult<unknown>>, schema: ZodType<T> | null): Promise<InviteApiResult<T>> {
    const result = await promise;
    if (!result.success || result.status < 200 || result.status >= 300) return failureOf<T>(result);
    if (!schema) return { data: result.data as T, ok: true };
    const parsed = schema.safeParse(result.data);
    return parsed.success ? { data: parsed.data, ok: true } : { code: null, ok: false, reason: "UNREADABLE", status: result.status };
  }
  const profileRead = () => read<{ profile: InviteProfile | null }>(client.get<unknown>(ORBIT_API_ENDPOINTS.profile), null).then((result) => (
    result.ok ? { data: { profile: isRecord(result.data) && isRecord(result.data.profile) ? (result.data.profile as InviteProfile) : null }, ok: true as const } : result
  ));
  return {
    current: () => read(client.get<unknown>(INVITE_CURRENT_PATH), inviteCodeSchema.nullable() as ZodType<InviteCodeContract | null>),
    // The server only reads the keys; `shared` is required by the R08 body shape and its values are ignored.
    create: (input) => read(client.post<unknown>(INVITE_CODES_PATH, {
      body: { idempotencyKey: input.idempotencyKey, maxUses: 10, shared: { displayName: input.displayName.trim().slice(0, 80) || "Orbit" }, sharedKeys: input.sharedKeys },
    }), inviteCodeSchema),
    revoke: (code) => read(client.post<unknown>(inviteRevokePath(code), { body: {} }), inviteCodeSchema),
    history: () => read(client.get<unknown>(INVITE_CODES_PATH), inviteCodeHistoryResponseSchema),
    preview: (code) => read(client.get<unknown>(invitePreviewPath(code)), inviteCodePreviewSchema),
    redeem: (code, input) => read(client.post<unknown>(inviteRedeemPath(code), { body: input }), inviteCodeRedeemResultSchema),
    profile: profileRead,
    /**
     * PUT /api/profile with only the short-profile fields (the same save the profile editor uses: version
     * check by `expectedUpdatedAt`, receipt by `mutationId`). A version conflict reads the latest version and
     * sends once more — these are the values the person just confirmed on this screen.
     */
    async saveShortProfile(fields, expectedUpdatedAt) {
      const put = (expected: string | null) => read<unknown>(client.put<unknown>(ORBIT_API_ENDPOINTS.profile, {
        body: { ...fields, expectedUpdatedAt: expected, mutationId: newMutationId() },
      }), null);
      const first = await put(expectedUpdatedAt);
      if (first.ok || (first.status !== 409 && first.code !== "PROFILE_VERSION_CONFLICT")) return first;
      const latest = await profileRead();
      return put(latest.ok ? latest.data.profile?.updatedAt ?? null : null);
    },
    /** POST /api/contacts/manual/duplicates (R12): is the inviter already in my network? Fails quietly (no hint). */
    async inviterInNetwork(input) {
      const body = { displayName: input.displayName, ...(input.organization ? { organization: input.organization } : {}) };
      const result = await read<unknown>(client.post<unknown>("/api/contacts/manual/duplicates", { body }), null);
      const candidates = result.ok && isRecord(result.data) ? result.data.candidates : null;
      if (!Array.isArray(candidates)) return false;
      // Only matches a connection would merge into (e-mail / phone / name + company); 「同名」 alone is a hint only.
      return candidates.some((candidate) => isRecord(candidate) && Array.isArray(candidate.matchedOn) && candidate.matchedOn.some((reason) => reason !== "name"));
    },
    connection: (contactId) => read(client.get<unknown>(inviteConnectionPath(contactId)), inviteConnectionViewSchema),
    updateShare: (contactId, input) => read(client.put<unknown>(inviteSharePath(contactId), { body: input }), inviteConnectionViewSchema),
    unlink: (contactId, input) => read(client.post<unknown>(inviteUnlinkPath(contactId), { body: input }), inviteUnlinkResultSchema),
  };
}

function newMutationId(): string {
  return `invite-profile-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function useInviteApi(): InviteApi {
  const client = useOrbitApiClient();
  return useMemo(() => createInviteApi(client), [client]);
}
