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
  /**
   * The public catalogue's narrow read: published events with a public code that end after
   * `endsAfter` and start before `startsBefore`, earliest first, at most `limit`. Optional: a
   * repository without it leaves the catalogue on `listEvents`.
   */
  listPublishedEventsInWindow?(window: { endsAfter: string; startsBefore: string; limit: number }): Promise<readonly CanonicalEventRecord[]>;
  resolveAlias(alias: string): Promise<EventAliasResolution | null>;
}
