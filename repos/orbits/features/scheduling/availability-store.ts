import { schedulingAvailabilitySchema } from "../../shared/api-schema/scheduling-availability";
import { DEFAULT_SCHEDULING_AVAILABILITY } from "../../shared/compute/meeting-slots";
import type { SchedulingAvailabilityContract, SchedulingAvailabilityUpdateInput } from "../../shared/contract/scheduling-availability";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../shared/storage/live-record-store";

// contact-reach R40 (DESIGN D4): one 可约时间 record per account, in its own
// LiveRecordStore collection (not agentPreferences). Record id = owner = actor id,
// and every read names the owner, so one account never reads another's settings.
export const SCHEDULING_AVAILABILITY_COLLECTION = "schedulingAvailability";

interface AvailabilityPayload extends Record<string, unknown> {
  actorId: string;
  availability: SchedulingAvailabilityContract;
}

export interface SchedulingAvailabilityStore {
  get(actorId: string): Promise<SchedulingAvailabilityContract>;
  /** Whole replacement (last write wins). `input` is already validated by the PUT schema. */
  put(actorId: string, input: SchedulingAvailabilityUpdateInput): Promise<SchedulingAvailabilityContract>;
}

export const DEFAULT_SCHEDULING_AVAILABILITY_CONTRACT: SchedulingAvailabilityContract = { ...DEFAULT_SCHEDULING_AVAILABILITY, updatedAt: null };

export function createSchedulingAvailabilityStore(input: {
  store: LiveRecordStoreLike<AvailabilityPayload>;
  workspaceId: string;
  now?: () => string;
}): SchedulingAvailabilityStore {
  const now = input.now ?? (() => new Date().toISOString());
  const read = async (actorId: string) => {
    const record = await input.store.getRecord({
      workspaceId: input.workspaceId, collectionName: SCHEDULING_AVAILABILITY_COLLECTION, recordId: actorId, userId: actorId,
    });
    if (!record || record.lifecycleState !== "active") return null;
    if (record.userId !== actorId || record.payload.actorId !== actorId) throw new Error("Scheduling availability record is invalid.");
    const parsed = schedulingAvailabilitySchema.safeParse(record.payload.availability);
    if (!parsed.success) throw new Error("Scheduling availability record is invalid.");
    return { record, availability: parsed.data };
  };
  return {
    async get(actorId) {
      return (await read(actorId))?.availability ?? DEFAULT_SCHEDULING_AVAILABILITY_CONTRACT;
    },
    async put(actorId, settings) {
      const existing = await read(actorId).catch(() => null);
      const updatedAt = now();
      const availability: SchedulingAvailabilityContract = {
        weekdays: [...settings.weekdays],
        start: settings.start,
        end: settings.end,
        lunch: settings.lunch ? { start: settings.lunch.start, end: settings.lunch.end } : null,
        durationMinutes: settings.durationMinutes,
        minimumNotice: settings.minimumNotice,
        bufferMinutes: settings.bufferMinutes,
        timeZoneMode: settings.timeZoneMode,
        timeZone: settings.timeZone,
        updatedAt,
      };
      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: SCHEDULING_AVAILABILITY_COLLECTION,
        recordId: actorId,
        userId: actorId,
        sourceType: "manual",
        sourceId: `scheduling-availability:${actorId}`,
        sourceLabel: "Scheduling availability",
        evidenceIds: [],
        lifecycleState: "active",
        searchText: "",
        payload: { actorId, availability },
        createdAt: existing?.record.createdAt ?? updatedAt,
        updatedAt,
      });
      return availability;
    },
  };
}

interface SchedulingAvailabilityGlobal {
  __orbitSchedulingAvailabilityMemory?: SchedulingAvailabilityStore;
}

/**
 * The configured PostgreSQL store; without a database (local mock mode, tests) a
 * process-local memory store, never in production (null → the route answers 503).
 */
export function createConfiguredSchedulingAvailabilityStore(): SchedulingAvailabilityStore | null {
  const configured = createConfiguredPostgresLiveRecordStore<AvailabilityPayload>();
  if (configured) return createSchedulingAvailabilityStore({ store: configured.store, workspaceId: configured.workspaceId });
  if (process.env.NODE_ENV === "production") return null;
  const memory = globalThis as typeof globalThis & SchedulingAvailabilityGlobal;
  memory.__orbitSchedulingAvailabilityMemory ??= createSchedulingAvailabilityStore({
    store: createMemoryLiveRecordStore<AvailabilityPayload>(), workspaceId: "orbit-local:scheduling-availability",
  });
  return memory.__orbitSchedulingAvailabilityMemory;
}
