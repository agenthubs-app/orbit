import type {
  CanonicalEventRecord,
  EventAliasResolution,
} from "./contract";

export interface EventCoreRepository {
  getEvent(eventId: string): Promise<CanonicalEventRecord | null>;
  listEvents(): Promise<readonly CanonicalEventRecord[]>;
  /**
   * W0041: the same rows, mapping and order as `listEvents`, limited to the given
   * event ids. Optional: a repository without it has no narrow read.
   */
  listEventsByIds?(eventIds: readonly string[]): Promise<readonly CanonicalEventRecord[]>;
  resolveAlias(alias: string): Promise<EventAliasResolution | null>;
}
