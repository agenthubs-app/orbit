import { EventCoreDataError, type EventAliasResolution } from "./contract";
import type { EventCoreRepository } from "./repository";

export function normalizeEventAlias(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export async function resolveCanonicalEventAlias(
  repository: EventCoreRepository,
  value: string,
): Promise<EventAliasResolution | null> {
  const normalized = normalizeEventAlias(value);
  if (!normalized) return null;

  const resolution = await repository.resolveAlias(normalized);
  if (!resolution) return null;

  if (!resolution.eventId.trim()) {
    throw new EventCoreDataError(
      "EVENT_CORE_ROW_INVALID",
      `Alias ${JSON.stringify(value)} resolved to an empty event id.`,
    );
  }

  return resolution;
}
