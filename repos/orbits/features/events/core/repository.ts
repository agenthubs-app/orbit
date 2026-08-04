import type {
  CanonicalEventRecord,
  EventAliasResolution,
} from "./contract";

export interface EventCoreRepository {
  getEvent(eventId: string): Promise<CanonicalEventRecord | null>;
  listEvents(): Promise<readonly CanonicalEventRecord[]>;
  resolveAlias(alias: string): Promise<EventAliasResolution | null>;
}
