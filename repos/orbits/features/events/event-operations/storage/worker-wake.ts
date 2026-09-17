import type {
  EventOperationsRepository,
} from "../repository";
import type { EventOperationsWorkerWakeNotifier } from "../queue";

interface EventOperationsOutboxWakeOptions {
  notifyWorker?: EventOperationsWorkerWakeNotifier;
  workspaceId: string;
}

/**
 * Add a post-commit queue wake to every event-operations API that can create
 * an outbox row. The wrapped repository methods resolve only after their
 * database transaction commits, so a wake can never make an uncommitted row
 * visible to the cloud worker. A failed publish is logged and left for the
 * maintenance heartbeat to repair; it must not turn a committed user action
 * into a false transaction failure.
 */
export function withEventOperationsOutboxWake(
  repository: EventOperationsRepository,
  { notifyWorker, workspaceId }: EventOperationsOutboxWakeOptions,
): EventOperationsRepository {
  if (!notifyWorker) return repository;

  async function wakeAfterCommit(): Promise<void> {
    try {
      await notifyWorker({ reason: "outbox", workspaceId });
    } catch {
      console.error(JSON.stringify({
        event: "event_operations_outbox_wake_failed",
        workspaceId,
      }));
    }
  }

  return {
    ...repository,
    async activateCanonicalRegistrations(...args) {
      const result = await repository.activateCanonicalRegistrations(...args);
      await wakeAfterCommit();
      return result;
    },
    async cancelCanonicalRegistration(...args) {
      const result = await repository.cancelCanonicalRegistration(...args);
      await wakeAfterCommit();
      return result;
    },
    async checkInAtomically(...args) {
      const result = await repository.checkInAtomically(...args);
      await wakeAfterCommit();
      return result;
    },
    async createContactRequestAtomically(...args) {
      const result = await repository.createContactRequestAtomically(...args);
      await wakeAfterCommit();
      return result;
    },
    async registerCanonicalParticipant(...args) {
      const result = await repository.registerCanonicalParticipant(...args);
      await wakeAfterCommit();
      return result;
    },
    async respondToContactRequestAtomically(...args) {
      const result = await repository.respondToContactRequestAtomically(...args);
      await wakeAfterCommit();
      return result;
    },
    async seedCanonicalRegistration(...args) {
      const result = await repository.seedCanonicalRegistration(...args);
      await wakeAfterCommit();
      return result;
    },
    async withdrawContactRequestAtomically(...args) {
      const result = await repository.withdrawContactRequestAtomically(...args);
      await wakeAfterCommit();
      return result;
    },
  };
}
