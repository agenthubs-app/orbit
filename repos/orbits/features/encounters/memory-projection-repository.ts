import type { LiveContactDetailState } from "../contacts/live-service";
import type { HumanEncounterProjectionClaim, HumanEncounterProjectionRepository } from "./projection-repository";
import type { HumanEncounterRecord } from "./service";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface MemoryHumanEncounterProjectionRepository extends HumanEncounterProjectionRepository {
  detail(actorId: string, contactId: string): LiveContactDetailState | null;
  encounter(encounterId: string): HumanEncounterRecord | null;
}

export function createMemoryHumanEncounterProjectionRepository(seed: readonly HumanEncounterRecord[]): MemoryHumanEncounterProjectionRepository {
  const encounters = new Map(seed.map((encounter) => [encounter.encounterId, clone(encounter)]));
  const details = new Map<string, LiveContactDetailState>();
  const locks = new Map<string, Promise<void>>();

  async function exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    locks.set(key, queued);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (locks.get(key) === queued) locks.delete(key);
    }
  }

  return {
    async claim(input) {
      const eligible = [...encounters.values()].filter((encounter) => {
        const projection = encounter.projection;
        return (projection.status === "pending" && projection.availableAt <= input.now)
          || (projection.status === "processing" && Boolean(projection.leaseExpiresAt) && projection.leaseExpiresAt! <= input.now);
      }).sort((left, right) => left.projection.availableAt.localeCompare(right.projection.availableAt) || left.createdAt.localeCompare(right.createdAt)).slice(0, input.limit);
      return eligible.map((encounter, index) => {
        const leaseToken = `${input.workerId}:${encounter.encounterId}:${index}`;
        const claimed: HumanEncounterRecord = {
          ...encounter,
          projection: {
            ...encounter.projection,
            attempts: encounter.projection.attempts + 1,
            leaseExpiresAt: new Date(Date.parse(input.now) + input.leaseMilliseconds).toISOString(),
            leaseToken,
            status: "processing",
          },
        };
        encounters.set(encounter.encounterId, clone(claimed));
        return { encounter: clone(claimed), leaseToken };
      });
    },
    async complete(input) {
      const encounter = input.claim.encounter;
      const key = `${encounter.actorId}\u0000${encounter.contactId}`;
      return exclusive(key, async () => {
        const source = encounters.get(encounter.encounterId);
        if (!source || source.projection.status !== "processing" || source.projection.leaseToken !== input.claim.leaseToken) return "lease_lost";
        const before = details.has(key) ? clone(details.get(key)!) : null;
        const notes = [...(before?.notes ?? []).filter((note) => note.noteId !== input.note.noteId), clone(input.note)]
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.noteId.localeCompare(right.noteId));
        const lastInteraction = !before?.lastInteraction || before.lastInteraction.occurredAt <= input.interaction.occurredAt
          ? clone(input.interaction)
          : before.lastInteraction;
        details.set(key, { actorId: encounter.actorId, contactId: encounter.contactId, lastInteraction, notes, status: before?.status ?? "needs_follow_up", tags: before?.tags ?? [], updatedAt: input.now });
        try {
          await input.afterContactWrite?.();
        } catch (error) {
          if (before) details.set(key, before); else details.delete(key);
          throw error;
        }
        encounters.set(encounter.encounterId, clone({ ...source, projection: { ...source.projection, lastError: null, leaseExpiresAt: null, leaseToken: null, status: "completed" } }));
        return "completed";
      });
    },
    async fail(input) {
      const source = encounters.get(input.claim.encounter.encounterId);
      if (!source || source.projection.status !== "processing" || source.projection.leaseToken !== input.claim.leaseToken) return "lease_lost";
      const terminal = source.projection.attempts >= 10;
      encounters.set(source.encounterId, clone({
        ...source,
        projection: {
          ...source.projection,
          availableAt: terminal ? source.projection.availableAt : new Date(Date.parse(input.now) + Math.min(300_000, 1_000 * 2 ** source.projection.attempts)).toISOString(),
          lastError: input.error,
          leaseExpiresAt: null,
          leaseToken: null,
          status: terminal ? "failed" : "pending",
        },
      }));
      return terminal ? "failed" : "retry";
    },
    detail(actorId, contactId) { return clone(details.get(`${actorId}\u0000${contactId}`) ?? null); },
    encounter(encounterId) { return clone(encounters.get(encounterId) ?? null); },
  };
}
