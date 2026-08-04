import type { EventOperationsCatalogueSummary } from "./repository";
import { createConfiguredEventOperationsRepository } from "./repository";

/**
 * Read-only bridge from the public catalogue to canonical event operations.
 *
 * Events absent from this result are not enrolled in event operations and must
 * keep their public source-backed roster aggregate. Enrolled events use the
 * canonical active-membership count as the single source of truth.
 */
export async function readEventOperationsCatalogueSummaries(
  eventIds: readonly string[],
): Promise<readonly EventOperationsCatalogueSummary[]> {
  const repository = createConfiguredEventOperationsRepository();
  if (!repository) return [];

  return repository.listCatalogueSummaries(eventIds);
}

export async function readEventOperationsCatalogueSummary(
  eventId: string,
): Promise<EventOperationsCatalogueSummary | null> {
  const [summary] = await readEventOperationsCatalogueSummaries([eventId]);
  return summary ?? null;
}
