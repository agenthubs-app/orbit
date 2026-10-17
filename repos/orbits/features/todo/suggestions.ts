import { z } from "zod";
import type { TaskSuggestionPageQuery } from "../tasks/suggestion-page";
import type { TaskSuggestionPageContract } from "../../shared/contract/task-suggestion-page";
import type { TodoSourceReader } from "./service";

/** Existing source reader returns exact SQL total and at most thirty previews. */
export const TODO_SUGGESTION_NATIVE_PAGE_SIZE = 30;
const position = z.object({ before: z.string().max(8000).nullable(), skip: z.number().int().min(0).max(TODO_SUGGESTION_NATIVE_PAGE_SIZE) }).strict();

export function createTodoSuggestionReader(reader: { read(actorId: string, query: TaskSuggestionPageQuery): Promise<TaskSuggestionPageContract>; createdAt(actorId: string, ids: readonly string[]): Promise<Record<string, string>> }): TodoSourceReader {
  return async query => {
    const after = query.cursor ? position.parse(JSON.parse(query.cursor)) : { before: null, skip: 0 };
    const page = await reader.read(query.actorId, { scope: "all", limit: TODO_SUGGESTION_NATIVE_PAGE_SIZE, cursor: after.before });
    const selected = page.items.slice(after.skip, after.skip + query.limit);
    const created = await reader.createdAt(query.actorId, selected.map(item => item.id));
    if (selected.some(item => !created[item.id])) throw Error("TODO_SUGGESTION_METADATA_UNAVAILABLE");
    return { total: page.total, hasMore: after.skip + selected.length < page.items.length || page.hasMore,
      entries: selected.map((item, index) => {
        const skip = after.skip + index + 1;
        const next = skip === page.items.length && page.nextCursor ? { before: page.nextCursor, skip: 0 } : { before: after.before, skip };
        return { item: { key: `task_suggestion:${item.id}`, source: "task_suggestion", sourceId: item.id,
          titlePreview: item.titlePreview, reasonPreview: item.reasonPreview, createdAt: created[item.id]!, actions: ["accept", "dismiss", "snooze", "open"] }, cursor: JSON.stringify(next) };
      }) };
  };
}
