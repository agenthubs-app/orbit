import {
  createConfiguredLifecycleTaskPagesReader,
  lifecycleGroups,
  type LifecycleCursors,
  type LifecycleTaskCard,
  type LifecycleTaskPagesReader,
} from "../../../../features/followups/storage/lifecycle-task-pages";
import type { RelationshipLifecycleTaskReadModel, RelationshipLifecycleTaskView } from "./relationship-lifecycle-tasks";

export type LifecyclePageSearchParams = { view?: string; current?: string; history?: string; orphan?: string };

function cardView(card: LifecycleTaskCard): RelationshipLifecycleTaskView {
  return {
    id: card.id, title: card.titlePreview, status: card.status,
    ...(card.dueAt ? { dueAt: card.dueAt } : {}),
    contactId: card.contactId, connectionId: card.connectionId,
    contactName: card.contactNamePreview, organization: card.organizationPreview,
    relationshipStage: card.relationshipStage,
    operationHref: card.contactId && !card.issue ? `/app/contacts/${encodeURIComponent(card.contactId)}` : null,
    ...(card.issue ? { issue: card.issue } : {}), updatedAt: card.updatedAt,
  };
}

export async function loadLifecycleTaskPages(input: {
  actorId: string;
  params?: LifecyclePageSearchParams;
  reader?: LifecycleTaskPagesReader | null;
}): Promise<RelationshipLifecycleTaskReadModel> {
  const sourceLabel = "Relationship lifecycle pages";
  try {
    if (!input.actorId.trim()) throw new Error("ACTOR_REQUIRED");
    const reader = input.reader === undefined ? createConfiguredLifecycleTaskPagesReader() : input.reader;
    if (!reader) throw new Error("STORAGE_UNAVAILABLE");
    const cursors: LifecycleCursors = {};
    for (const group of lifecycleGroups) {
      const value = input.params?.[group];
      if (value !== undefined && (typeof value !== "string" || value.length > 18000)) throw new Error("LIFECYCLE_CURSOR_INVALID");
      if (value) cursors[group] = value;
    }
    const result = await reader.read(input.actorId, cursors);
    const pagination = {} as NonNullable<RelationshipLifecycleTaskReadModel["pagination"]>;
    for (const group of lifecycleGroups) {
      const href = (cursor: string | null) => {
        const params = new URLSearchParams(cursors);
        if (input.params?.view === "completed") params.set("view", "completed");
        if (cursor) params.set(group, cursor); else params.delete(group);
        return `/app/tasks${params.size ? `?${params}` : ""}`;
      };
      pagination[group] = {
        nextHref: result.pages[group].nextCursor ? href(result.pages[group].nextCursor) : null,
        firstHref: cursors[group] ? href(null) : null,
      };
    }
    return {
      state: Object.values(result.counts).some(count => count > 0) ? "success" : "empty", sourceLabel,
      currentTasks: result.pages.current.items.map(cardView), historyTasks: result.pages.history.items.map(cardView), orphanTasks: result.pages.orphan.items.map(cardView),
      currentCount: result.counts.current, historyCount: result.counts.history, orphanCount: result.counts.orphan, pagination,
    };
  } catch {
    // A bad cursor/unsupported runtime/failed query must not trigger an unlimited read.
    return { state: "unavailable", sourceLabel, currentTasks: [], historyTasks: [], orphanTasks: [], currentCount: 0, historyCount: 0, orphanCount: 0 };
  }
}
