/** Permanent, actor-owned quota for the first profile onboarding introduction. */
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type { ProfileIntroDraftResult } from "./intro-draft-service";

export const PROFILE_INTRO_QUOTA_COLLECTION = "profileOnboardingIntroQuota";
const MAX_SUCCESSFUL_DRAFTS = 3;
const MAX_CAS_ATTEMPTS = 8;
const PENDING_EXPIRES_MS = 5 * 60_000;

type Language = "zh" | "en" | "ja";
type Action = {
  language: Language;
  status: "reserved" | "success" | "failure";
  startedAt: string;
  modelCalls: number;
  result?: ProfileIntroDraftResult;
};

export interface ProfileIntroQuotaPayload extends Record<string, unknown> {
  version: 1;
  actions: Record<string, Action>;
}

export type IntroReservation =
  | { kind: "reserved" }
  | { kind: "busy" }
  | { kind: "limit" }
  | { kind: "success" | "failure"; result: ProfileIntroDraftResult; modelCalls: number };

export class ProfileIntroQuotaError extends Error {
  constructor(readonly code: "MUTATION_CONFLICT" | "ACTION_NOT_RESERVED" | "STORAGE_UNAVAILABLE" | "REVISION_CONFLICT") { super(code); }
}

function nextTimestamp(now: string, previous?: string): string {
  const ms = Date.parse(now);
  const old = previous ? Date.parse(previous) : Number.NaN;
  return Number.isFinite(old) && ms <= old ? new Date(old + 1).toISOString() : now;
}

export function createStorageProfileIntroQuota(input: {
  actorId: string;
  store: LiveRecordStoreLike<ProfileIntroQuotaPayload>;
  workspaceId: string;
  now?: () => string;
}) {
  const actorId = input.actorId.trim();
  if (!actorId) throw new Error("Intro quota requires an actor.");
  const now = input.now ?? (() => new Date().toISOString());
  const key = {
    workspaceId: `${input.workspaceId}:profile-onboarding-actor:${actorId}`,
    collectionName: PROFILE_INTRO_QUOTA_COLLECTION,
    recordId: "first-flow",
  };
  const read = async () => {
    const record = await input.store.getRecord({ ...key, userId: actorId });
    return record?.lifecycleState === "active" ? record : null;
  };

  async function mutate<T>(change: (payload: ProfileIntroQuotaPayload | null) => { payload: ProfileIntroQuotaPayload | null; answer: T }): Promise<T> {
    if (!input.store.insertRecordIfAbsent || !input.store.updateRecordIfCurrent) throw new ProfileIntroQuotaError("STORAGE_UNAVAILABLE");
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const existing = await read();
      const changed = change(existing?.payload ?? null);
      if (!changed.payload) return changed.answer;
      const updatedAt = nextTimestamp(now(), existing?.updatedAt);
      const record: LiveRecord<ProfileIntroQuotaPayload> = {
        ...key,
        userId: actorId,
        createdAt: existing?.createdAt ?? updatedAt,
        updatedAt,
        lifecycleState: "active",
        evidenceIds: [],
        sourceType: "manual",
        sourceId: "profile-onboarding-intro-quota",
        sourceLabel: "Profile onboarding intro quota",
        searchText: "profile onboarding intro quota",
        payload: changed.payload,
      };
      const saved = existing
        ? await input.store.updateRecordIfCurrent(record, { updatedAt: existing.updatedAt, userId: actorId })
        : await input.store.insertRecordIfAbsent(record);
      if (saved) return changed.answer;
    }
    throw new ProfileIntroQuotaError("REVISION_CONFLICT");
  }

  return {
    reserve(idempotencyKey: string, language: Language): Promise<IntroReservation> {
      if (!idempotencyKey.trim() || idempotencyKey.length > 128) throw new ProfileIntroQuotaError("MUTATION_CONFLICT");
      return mutate<IntroReservation>((payload) => {
        // A request that never completed must not hold one of the three slots forever.
        // Persist its failure so a replay of that key cannot run the model again.
        const actions: Record<string, Action> = { ...(payload?.actions ?? {}) };
        let expired = false;
        for (const [key, action] of Object.entries(actions)) {
          if (action.status !== "reserved") continue;
          const age = Date.parse(now()) - Date.parse(action.startedAt);
          if (!Number.isFinite(age) || age <= PENDING_EXPIRES_MS) continue;
          const result: ProfileIntroDraftResult = { success: false, error: { code: "MODEL_REQUEST_FAILED", message: "The previous draft request did not finish. Start a new request." } };
          actions[key] = { ...action, status: "failure", result };
          expired = true;
        }
        const existing = actions[idempotencyKey];
        if (existing) {
          if (existing.language !== language) throw new ProfileIntroQuotaError("MUTATION_CONFLICT");
          if (existing.status === "reserved") {
            return { payload: null, answer: { kind: "busy" as const } };
          }
          return { payload: expired ? { version: 1, actions } : null, answer: { kind: existing.status, result: existing.result!, modelCalls: existing.modelCalls } };
        }
        const occupied = Object.values(actions).filter((action) => action.status === "reserved" || action.status === "success").length;
        if (occupied >= MAX_SUCCESSFUL_DRAFTS) return { payload: expired ? { version: 1, actions } : null, answer: { kind: "limit" as const } };
        return { payload: { version: 1, actions: { ...actions, [idempotencyKey]: { language, status: "reserved", startedAt: now(), modelCalls: 0 } } }, answer: { kind: "reserved" as const } };
      });
    },
    noteModelCall(idempotencyKey: string): Promise<void> {
      return mutate((payload) => {
        const action = payload?.actions[idempotencyKey];
        if (!action || action.status !== "reserved") throw new ProfileIntroQuotaError("ACTION_NOT_RESERVED");
        return { payload: { version: 1, actions: { ...payload!.actions, [idempotencyKey]: { ...action, modelCalls: action.modelCalls + 1 } } }, answer: undefined };
      });
    },
    complete(idempotencyKey: string, result: ProfileIntroDraftResult): Promise<ProfileIntroDraftResult> {
      return mutate((payload) => {
        const action = payload?.actions[idempotencyKey];
        if (!action) throw new ProfileIntroQuotaError("ACTION_NOT_RESERVED");
        if (action.status !== "reserved") return { payload: null, answer: action.result! };
        return { payload: { version: 1, actions: { ...payload!.actions, [idempotencyKey]: { ...action, status: result.success ? "success" : "failure", result } } }, answer: result };
      });
    },
  };
}

export type ProfileIntroQuotaService = ReturnType<typeof createStorageProfileIntroQuota>;
