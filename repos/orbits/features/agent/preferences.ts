import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";

export interface AgentPreferences {
  autoPrepareMeetingNotes: boolean;
  postEventReminderPushEnabled: boolean;
  preEventBriefPushEnabled: boolean;
  quietHours: {
    start: string;
    end: string;
  };
  timeZone: string;
  updatedAt: string;
}

export interface AgentPreferencesService {
  get: () => Promise<AgentPreferences>;
  update: (
    patch: Partial<
      Pick<
        AgentPreferences,
        | "autoPrepareMeetingNotes"
        | "postEventReminderPushEnabled"
        | "preEventBriefPushEnabled"
        | "quietHours"
        | "timeZone"
      >
    >,
  ) => Promise<AgentPreferences>;
}

const DEFAULT_PREFERENCES: AgentPreferences = {
  autoPrepareMeetingNotes: true,
  postEventReminderPushEnabled: true,
  preEventBriefPushEnabled: true,
  quietHours: { start: "22:00", end: "08:00" },
  timeZone: "Asia/Tokyo",
  updatedAt: "2026-07-25T00:00:00.000Z",
};

interface PreferencesPayload extends Record<string, unknown> {
  preferences: AgentPreferences;
}

function validTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function createStorageAgentPreferencesService(input: {
  store: LiveRecordStoreLike<PreferencesPayload>;
  workspaceId: string;
  now?: () => string;
}): AgentPreferencesService {
  const now = input.now ?? (() => new Date().toISOString());

  async function current(): Promise<AgentPreferences> {
    const record = await input.store.getRecord({
      workspaceId: input.workspaceId,
      collectionName: "agentPreferences",
      recordId: "current",
    });
    return record
      ? {
          ...DEFAULT_PREFERENCES,
          ...record.payload.preferences,
          quietHours:
            record.payload.preferences.quietHours ??
            DEFAULT_PREFERENCES.quietHours,
          timeZone:
            record.payload.preferences.timeZone ??
            DEFAULT_PREFERENCES.timeZone,
        }
      : DEFAULT_PREFERENCES;
  }

  return {
    get: current,
    async update(patch) {
      if (
        patch.quietHours &&
        (!validTime(patch.quietHours.start) ||
          !validTime(patch.quietHours.end))
      ) {
        throw new Error("Quiet hours must use HH:mm.");
      }
      if (patch.timeZone !== undefined && !validTimeZone(patch.timeZone)) {
        throw new Error("Time zone must be a valid IANA time zone.");
      }
      const existing = await current();
      const updatedAt = now();
      const preferences: AgentPreferences = {
        autoPrepareMeetingNotes:
          patch.autoPrepareMeetingNotes ??
          existing.autoPrepareMeetingNotes,
        postEventReminderPushEnabled:
          patch.postEventReminderPushEnabled ??
          existing.postEventReminderPushEnabled,
        preEventBriefPushEnabled:
          patch.preEventBriefPushEnabled ??
          existing.preEventBriefPushEnabled,
        quietHours: patch.quietHours ?? existing.quietHours,
        timeZone: patch.timeZone ?? existing.timeZone,
        updatedAt,
      };
      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: "agentPreferences",
        recordId: "current",
        sourceType: "manual",
        sourceId: "agent-preferences",
        sourceLabel: "Orbit Agent user preferences",
        evidenceIds: [],
        lifecycleState: "active",
        searchText: "agent preferences notifications quiet hours",
        payload: { preferences },
        createdAt: existing.updatedAt,
        updatedAt,
      });
      return preferences;
    },
  };
}

interface OrbitAgentPreferencesGlobal {
  __orbitAgentPreferencesService?: AgentPreferencesService;
}

const preferencesGlobal = globalThis as typeof globalThis &
  OrbitAgentPreferencesGlobal;

export function createAgentPreferencesService(): AgentPreferencesService {
  if (preferencesGlobal.__orbitAgentPreferencesService) {
    return preferencesGlobal.__orbitAgentPreferencesService;
  }
  const configured =
    createConfiguredPostgresLiveRecordStore<PreferencesPayload>();
  preferencesGlobal.__orbitAgentPreferencesService =
    createStorageAgentPreferencesService(
      configured
        ? {
            store: configured.store,
            workspaceId: configured.workspaceId,
          }
        : {
            store: createMemoryLiveRecordStore<PreferencesPayload>(),
            workspaceId: "orbit-agent-local",
          },
    );
  return preferencesGlobal.__orbitAgentPreferencesService;
}

export function resetAgentPreferencesServiceForTests(): void {
  delete preferencesGlobal.__orbitAgentPreferencesService;
}
