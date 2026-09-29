import type { ContactPipelineStageCode, ContactPipelineItemContract } from "../api/contract/contact-pipeline-page";
import type { ContactSyncPayload } from "../api/contract/contact-local-directory";
import { contactPipelineStageFor } from "../api/compute/contact-pipeline";

export interface ContactPipelineLocalProjection {
  counts: Record<ContactPipelineStageCode, number>;
  items: Record<ContactPipelineStageCode, ContactPipelineItemContract[]>;
}

const stages: readonly ContactPipelineStageCode[] = ["to_contact", "in_progress", "nurture", "archived"];

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Stage grouping runs on the contact sync cards; SQL still owns filtering and canonical-connection selection. */
export function contactPipelineLocalProjection(rows: readonly ContactSyncPayload[]): ContactPipelineLocalProjection {
  const items: ContactPipelineLocalProjection["items"] = { to_contact: [], in_progress: [], nurture: [], archived: [] };
  const ordered: Record<ContactPipelineStageCode, { item: ContactPipelineItemContract; occurredAt: string; updatedAt: string }[]> = {
    to_contact: [], in_progress: [], nurture: [], archived: [],
  };

  for (const row of rows) {
    const card = row.card;
    if (!card || card.pendingInitialization || row.search.error !== null) continue;
    const stage = contactPipelineStageFor(card.status);
    if (!stage) continue;
    ordered[stage].push({
      item: { id: card.id, displayName: card.displayName, organization: card.organization, role: card.role },
      occurredAt: row.search.occurredAt,
      updatedAt: row.search.updatedAt,
    });
  }

  const counts = { to_contact: 0, in_progress: 0, nurture: 0, archived: 0 };
  for (const stage of stages) {
    ordered[stage].sort((left, right) =>
      compareText(right.occurredAt, left.occurredAt) ||
      compareText(right.updatedAt, left.updatedAt) ||
      compareText(left.item.id, right.item.id));
    items[stage] = ordered[stage].map(({ item }) => item);
    counts[stage] = items[stage].length;
  }
  return { counts, items };
}
