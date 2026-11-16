/**
 * The "timeline" read view (设计稿 §4 读取视图「时间线」; agent-design AG05): the existing relationship
 * timeline (features/relationship-timeline/reader.ts, unchanged — at most 50 a source, each item with the
 * ref of its source record), for one contact of the account. Only read when a part asks for the timeline
 * (view.timeline). Sources it could not read are said (`unavailableSources`), never dropped silently.
 */
import { readRelationshipTimelineForContact, type RelationshipTimelineReaderDeps } from "../../relationship-timeline/reader";
import type { DomainScope } from "../domains/types";

export interface TimelineViewItem {
  ref: string;
  source: string;
  occurredAt: string;
  precision: string;
  title: string;
  excerpt: string | null;
}

export interface TimelineView {
  items: TimelineViewItem[];
  total: number;
  unavailableSources: string[];
}

export async function readTimelineView(scope: DomainScope, input: { contactId: string; now: string; limit?: number; language: "zh" | "ja" | "en" }, deps: RelationshipTimelineReaderDeps = {}): Promise<TimelineView> {
  const result = await readRelationshipTimelineForContact({ actorId: scope.accountId, contactId: input.contactId, limit: input.limit ?? 20, now: new Date(input.now) }, deps);
  return {
    items: result.items.map((item) => ({
      excerpt: item.excerpt ?? null,
      occurredAt: item.occurredAt,
      precision: item.occurredAtPrecision,
      ref: `${item.ref.store}:${item.ref.recordId}${item.ref.subId ? `#${item.ref.subId}` : ""}`,
      source: item.source,
      title: input.language === "en" ? item.title.en : item.title.zh,
    })),
    total: result.total,
    unavailableSources: [...result.unavailableSources],
  };
}
