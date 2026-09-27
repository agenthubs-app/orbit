import { useMemo, useState } from "react";

import { mirrorFreshness } from "../../data/sync/mirror-freshness";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { readTaskListItems } from "../../view-models/task-list-scope";

/**
 * Tasks created from a note (sprint 0108, native): the device task mirror
 * filtered by sourceNoteId, newest first, 20 per local page. The browser build
 * resolves note-source-tasks-source.web.ts (GET /api/tasks/note-page).
 */
export interface NoteSourceTasks {
  items: { id: string; title: string }[] | null;
  total: number | null;
  failure: string | null;
  hasNext: boolean;
  onFirstPage: boolean;
  next(): void;
  first(): void;
  refresh(): void;
}

const PAGE = 20;

export function useNoteSourceTasks(input: { actorId: string; noteId: string; scopeKey: string }): NoteSourceTasks {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const freshness = mirrorFreshness(state, Boolean(input.actorId && input.noteId));
  const matching = useMemo(() => {
    if (!freshness.readable) return null;
    const tasks = readTaskListItems({ tasks: state.records.map((record) => record.payload) }, input.actorId);
    return tasks?.filter((task) => task.sourceNoteId === input.noteId)
      .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : left.id < right.id ? -1 : 1)) ?? null;
  }, [freshness.readable, input.actorId, input.noteId, state.records]);
  const scope = JSON.stringify([input.scopeKey, input.noteId]);
  const [position, setPosition] = useState({ scope, offset: 0 });
  const offset = position.scope === scope ? position.offset : 0;
  return {
    items: matching ? matching.slice(offset, offset + PAGE).map((task) => ({ id: task.id, title: task.title })) : null,
    total: matching ? matching.length : null,
    failure: freshness.failure ?? (freshness.readable && !matching ? "sync.failure" : null),
    hasNext: Boolean(matching && offset + PAGE < matching.length),
    onFirstPage: offset === 0,
    next: () => setPosition({ scope, offset: offset + PAGE }),
    first: () => setPosition({ scope, offset: 0 }),
    refresh: state.refresh,
  };
}
