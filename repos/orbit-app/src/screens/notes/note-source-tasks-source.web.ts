import { useState } from "react";

import { noteTaskPageSchema } from "../../api/schema/note-task-page";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { NoteSourceTasks } from "./note-source-tasks-source";

/** Browser: the bounded server page, as before sprint 0108. */
export function useNoteSourceTasks(input: { actorId: string; noteId: string; scopeKey: string }): NoteSourceTasks {
  const locale = useOrbitLocale();
  const { actorId, noteId } = input;
  const scope = JSON.stringify([input.scopeKey, actorId, noteId]);
  const [position, setPosition] = useState<{ scope: string; cursor: string | null }>({ scope, cursor: null });
  const cursor = position.scope === scope ? position.cursor : null;
  const params = new URLSearchParams({ noteId, limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const state = useApiResource<unknown>(`/api/tasks/note-page?${params}`, () => false, {
    scopeKey: JSON.stringify([scope, cursor]), cachePolicy: "network-only", enabled: Boolean(actorId && noteId),
  });
  const loaded = state.kind === "success" || state.kind === "empty";
  const parsed = loaded ? noteTaskPageSchema.safeParse(state.data) : null;
  const page = parsed?.success && parsed.data.actorId === actorId && parsed.data.noteId === noteId && parsed.data.items.length <= 20
    && (!parsed.data.hasMore || parsed.data.items.length === 20) ? parsed.data : null;
  const failure = state.kind === "failure" || state.kind === "offline" ? state.error.message : loaded && !page
    ? locale.language === "zh" ? "未能确认关联待办，请重试。" : locale.language === "ja" ? "関連タスクを確認できません。再試行してください。" : "Could not verify linked tasks. Please retry." : null;
  return {
    items: page ? page.items.map((task) => ({ id: task.id, title: task.titlePreview })) : null,
    total: page ? page.total : null,
    failure,
    hasNext: Boolean(page?.nextCursor),
    onFirstPage: !cursor,
    next: () => { if (page?.nextCursor) setPosition({ scope, cursor: page.nextCursor }); },
    first: () => setPosition({ scope, cursor: null }),
    refresh: () => { setPosition({ scope, cursor: null }); state.refresh(); },
  };
}
