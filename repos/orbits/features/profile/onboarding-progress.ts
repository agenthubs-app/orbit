/** Actor-owned, monotone progress through the five profile onboarding screens. */
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";

export const PROFILE_ONBOARDING_PROGRESS_COLLECTION = "profileOnboardingFlow";
const RECORD_ID = "current";
const MAX_CAS_ATTEMPTS = 4;

export type ProfileScreen = 1 | 2 | 3 | 4 | 5;
export type ProfileOnboardingProgressCommand =
  | { action: "initialize" | "defer" | "finish"; expectedRevision: string | null; mutationId: string }
  | { action: "confirm"; screen: ProfileScreen; expectedRevision: string | null; mutationId: string };

export interface ProfileOnboardingProgress {
  version: 1;
  currentScreen: ProfileScreen | null;
  lastConfirmedScreen: 0 | ProfileScreen;
  finishedAt: string | null;
  deferred: boolean;
  revision: string;
}

export interface ProfileOnboardingProgressPayload extends Record<string, unknown> {
  version: 1;
  lastConfirmedScreen: 0 | ProfileScreen;
  finishedAt: string | null;
  deferred: boolean;
  /** Bounded by the number of user actions in this first, permanent flow. */
  mutations: Record<string, string>;
}

export class ProfileOnboardingProgressError extends Error {
  constructor(readonly code: "REVISION_CONFLICT" | "MUTATION_CONFLICT" | "SCREEN_ORDER" | "FLOW_FINISHED" | "FLOW_NOT_INITIALIZED" | "STORAGE_UNAVAILABLE") {
    super(code);
  }
}

function state(record: LiveRecord<ProfileOnboardingProgressPayload>): ProfileOnboardingProgress {
  const payload = record.payload;
  const last = Number.isInteger(payload.lastConfirmedScreen) && payload.lastConfirmedScreen >= 0 && payload.lastConfirmedScreen <= 5
    ? payload.lastConfirmedScreen as 0 | ProfileScreen : 0;
  return {
    version: 1,
    currentScreen: last >= 5 ? null : (last + 1) as ProfileScreen,
    lastConfirmedScreen: last,
    finishedAt: typeof payload.finishedAt === "string" ? payload.finishedAt : null,
    deferred: payload.deferred === true,
    revision: record.updatedAt,
  };
}

function fingerprint(command: ProfileOnboardingProgressCommand): string {
  return `${command.action}:${command.action === "confirm" ? command.screen : ""}`;
}

function nextTimestamp(now: string, previous?: string): string {
  const ms = Date.parse(now);
  const old = previous ? Date.parse(previous) : Number.NaN;
  return Number.isFinite(old) && ms <= old ? new Date(old + 1).toISOString() : now;
}

export function createStorageProfileOnboardingProgressService(input: {
  actorId: string;
  store: LiveRecordStoreLike<ProfileOnboardingProgressPayload>;
  workspaceId: string;
  now?: () => string;
}) {
  const actorId = input.actorId.trim();
  if (!actorId) throw new Error("Profile onboarding progress requires an actor.");
  const key = {
    workspaceId: `${input.workspaceId}:profile-onboarding-actor:${actorId}`,
    collectionName: PROFILE_ONBOARDING_PROGRESS_COLLECTION,
    recordId: RECORD_ID,
  };
  const now = input.now ?? (() => new Date().toISOString());
  const read = async () => {
    const record = await input.store.getRecord({ ...key, userId: actorId });
    return record?.lifecycleState === "active" ? record : null;
  };

  return {
    async get(): Promise<ProfileOnboardingProgress | null> {
      const record = await read();
      return record ? state(record) : null;
    },
    async apply(command: ProfileOnboardingProgressCommand): Promise<ProfileOnboardingProgress> {
      if (!command.mutationId.trim()) throw new ProfileOnboardingProgressError("MUTATION_CONFLICT");
      if (!input.store.insertRecordIfAbsent || !input.store.updateRecordIfCurrent) {
        throw new ProfileOnboardingProgressError("STORAGE_UNAVAILABLE");
      }
      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
        const existing = await read();
        const prior = existing?.payload.mutations?.[command.mutationId];
        if (prior) {
          if (prior !== fingerprint(command)) throw new ProfileOnboardingProgressError("MUTATION_CONFLICT");
          return state(existing!);
        }
        // Re-entry never starts a second first flow, even with a different mutation id.
        if (command.action === "initialize" && existing) return state(existing);
        if (!existing && command.action !== "initialize") throw new ProfileOnboardingProgressError("FLOW_NOT_INITIALIZED");
        if (command.expectedRevision !== (existing?.updatedAt ?? null)) throw new ProfileOnboardingProgressError("REVISION_CONFLICT");
        if (existing?.payload.finishedAt) throw new ProfileOnboardingProgressError("FLOW_FINISHED");

        const previous = existing?.payload;
        if (command.action === "confirm" && command.screen !== (previous?.lastConfirmedScreen ?? 0) + 1) {
          throw new ProfileOnboardingProgressError("SCREEN_ORDER");
        }
        if (command.action === "finish" && previous?.lastConfirmedScreen !== 5) {
          throw new ProfileOnboardingProgressError("SCREEN_ORDER");
        }
        const updatedAt = nextTimestamp(now(), existing?.updatedAt);
        const payload: ProfileOnboardingProgressPayload = {
          version: 1,
          lastConfirmedScreen: command.action === "confirm" ? command.screen : previous?.lastConfirmedScreen ?? 0,
          finishedAt: command.action === "finish" ? updatedAt : previous?.finishedAt ?? null,
          deferred: command.action === "defer" ? true : command.action === "finish" ? false : previous?.deferred ?? false,
          mutations: { ...previous?.mutations, [command.mutationId]: fingerprint(command) },
        };
        const record: LiveRecord<ProfileOnboardingProgressPayload> = {
          ...key,
          createdAt: existing?.createdAt ?? updatedAt,
          updatedAt,
          userId: actorId,
          lifecycleState: "active",
          evidenceIds: [],
          sourceType: "manual",
          sourceId: "profile-onboarding-flow",
          sourceLabel: "Profile onboarding flow",
          searchText: "profile onboarding flow",
          payload,
        };
        const saved = existing
          ? await input.store.updateRecordIfCurrent(record, { updatedAt: existing.updatedAt, userId: actorId })
          : await input.store.insertRecordIfAbsent(record);
        if (saved) return state(saved);
      }
      throw new ProfileOnboardingProgressError("REVISION_CONFLICT");
    },
  };
}

export type ProfileOnboardingProgressService = ReturnType<typeof createStorageProfileOnboardingProgressService>;
