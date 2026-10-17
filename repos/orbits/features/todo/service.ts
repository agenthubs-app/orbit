import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { TODO_SECTION_SOURCES, todoDecisionItemObject, todoFollowupItemObject, todoNextMoveItemObject, todoPageQueryObject } from "../../shared/api-schema/todo-page";
import type { TodoDecisionItem, TodoFollowupItem, TodoNextMoveItem, TodoPageContract, TodoSectionKey, TodoSourceKey } from "../../shared/contract/todo-page";

export interface TodoReadInput { actorId: string; date: string; timeZone: string; section?: TodoSectionKey; source?: TodoSourceKey; cursor?: string; limit?: number }
export type TodoItem = TodoDecisionItem | TodoNextMoveItem | TodoFollowupItem;
export type TodoSourceReader = (input: Omit<TodoReadInput, "cursor"> & { limit: number; cursor: string | null }) => Promise<{ entries: readonly { item: TodoItem; cursor: string }[]; total: number; hasMore: boolean; capped?: boolean; overdue?: number; notImplemented?: boolean }>;
export const TODO_FIRST_PAGE_LIMITS = { decisions: 5, nextMoves: 3, followups: 20 } as const;
const cursorPosition = z.object({ position: z.string().min(1).max(8000).nullable() }).strict();
const sections = ["decisions", "nextMoves", "followups"] as const;
const diagnostics = new Set(["TODO_PLAN_READ_LIMIT", "TODO_PLAN_READ_SHAPE_UNSUPPORTED", "TODO_SOURCE_READ_LIMIT", "TODO_SOURCE_WRITE_FORBIDDEN", "TODO_SOURCE_READ_SCOPE_INVALID", "TODO_CONTACT_DRAFT_UNAVAILABLE", "TODO_SOURCE_INVALID", "TODO_FOLLOWUP_INTEGRITY", "TODO_SUGGESTION_METADATA_UNAVAILABLE", "READ_CURSOR_SECRET_MISSING"]);
const databaseCodes = new Set(["08000", "08001", "08006", "40001", "40P01", "42501", "42601", "42703", "42883", "42P01", "53200", "53300", "53400", "57014", "57P01", "57P02", "57P03", "XX000"]);
function diagnosticCode(error: unknown): string {
  if (!(error instanceof Error)) return "SOURCE_READ_FAILED";
  if (diagnostics.has(error.message)) return error.message;
  if (error.name === "ReadBudgetExceededError") return "READ_BUDGET_EXCEEDED";
  if (error.name === "ZodError") return "SOURCE_DATA_INVALID";
  if ("code" in error && typeof error.code === "string" && databaseCodes.has(error.code)) return error.code;
  return "SOURCE_READ_FAILED";
}

export function createTodoPageService(input: { workspaceId: string; secret: string; readers: Partial<Record<TodoSourceKey, TodoSourceReader>>; now?: () => string; onError?: (error: { event: "todo_source_read_failed"; source: TodoSourceKey; code: string }) => void }) {
  return { async read(query: TodoReadInput): Promise<TodoPageContract> {
    const { actorId, ...raw } = query;
    if (!actorId.trim() || !input.workspaceId.trim() || !todoPageQueryObject.safeParse(raw).success) throw Error("TODO_PAGE_INPUT_INVALID");
    if (Buffer.byteLength(input.secret) < 32) throw Error("READ_CURSOR_SECRET_MISSING");
    const sign = (section: TodoSectionKey, source: TodoSourceKey, body: string) => createHmac("sha256", input.secret)
      .update(JSON.stringify(["todo-page:v1", input.workspaceId, actorId, query.date, query.timeZone, section, source])).update(body).digest();
    const encode = (section: TodoSectionKey, source: TodoSourceKey, position: string | null) => {
      const body = Buffer.from(JSON.stringify({ position })).toString("base64url");
      return `${body}.${sign(section, source, body).toString("base64url")}`;
    };
    let position: string | null = null;
    if (query.cursor) try {
      const [body, signature, ...extra] = query.cursor.split(".");
      if (!body || !signature || extra.length) throw Error();
      const provided = Buffer.from(signature, "base64url"), expected = sign(query.section!, query.source!, body);
      if (provided.toString("base64url") !== signature || provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw Error();
      position = cursorPosition.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8"))).position;
    } catch { throw Error("TODO_CURSOR_INVALID"); }
    const result: TodoPageContract = {
      date: query.date, timeZone: query.timeZone, asOf: input.now?.() ?? new Date().toISOString(),
      counts: { decisions: 0, nextMoves: 0, followups: 0, overdue: 0 }, countsCapped: { decisions: false, nextMoves: false },
      decisions: { items: [], next: {} }, nextMoves: { items: [], next: {} }, followups: { items: [], next: {} }, sources: {},
    };
    for (const section of sections) {
      const limit = query.section === section ? query.limit ?? TODO_FIRST_PAGE_LIMITS[section] : TODO_FIRST_PAGE_LIMITS[section];
      const answers = await Promise.all(TODO_SECTION_SOURCES[section].map(async source => {
        const reader = input.readers[source];
        if (!reader) { result.sources[source] = "not_implemented"; return null; }
        try {
          const answer = await reader({ ...query, cursor: source === query.source ? position : null, limit });
          if (answer.notImplemented) { result.sources[source] = "not_implemented"; return null; }
          const itemSchema = section === "decisions" ? todoDecisionItemObject : section === "nextMoves" ? todoNextMoveItemObject : todoFollowupItemObject;
          if (!Number.isSafeInteger(answer.total) || answer.total < 0 || answer.entries.length > limit
            || answer.entries.some(entry => entry.item.source !== source || entry.item.key !== `${source}:${entry.item.sourceId}` || !entry.cursor || entry.cursor.length > 8000 || !itemSchema.safeParse(entry.item).success)) throw Error("TODO_SOURCE_INVALID");
          if (section === "followups" && (!Number.isSafeInteger(answer.overdue) || answer.overdue! < 0 || answer.overdue! > answer.total || answer.capped)) throw Error("TODO_SOURCE_INVALID");
          result.sources[source] = "ok";
          result.counts[section] += answer.total;
          if (section === "followups") result.counts.overdue += answer.overdue!;
          else result.countsCapped[section] ||= answer.capped ?? false;
          return { source, ...answer };
        } catch (error) {
          result.sources[source] = "unavailable";
          // Never log arbitrary source exception messages, identifiers, or rows.
          try { (input.onError ?? (event => console.error(JSON.stringify(event))))({ event: "todo_source_read_failed", source, code: diagnosticCode(error) }); } catch { /* Observability must not hide healthy sources. */ }
          return null;
        }
      }));
      const available = answers.filter(answer => answer !== null);
      const candidates = available.flatMap(answer => (!query.source || query.source === answer.source) ? answer.entries : []);
      if (section === "followups") candidates.sort((left, right) => {
        const a = left.item as TodoFollowupItem, b = right.item as TodoFollowupItem;
        const due = (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity);
        // Stable within each source: native cursor positions follow its order.
        return Number(b.overdue) - Number(a.overdue) || (Number.isNaN(due) ? 0 : due) || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0);
      });
      // Each reader returns native positions per row. Wrapping its batch-end
      // cursor here would skip rows trimmed by the cross-source first page.
      const selected = candidates.slice(0, limit);
      if (!query.section || query.section === section) {
        (result[section].items as TodoItem[]).push(...selected.map(entry => entry.item));
        for (const answer of available) {
          if (query.source && query.source !== answer.source) continue;
          const consumed = selected.filter(entry => entry.item.source === answer.source);
          if (answer.hasMore || consumed.length < answer.entries.length) result[section].next[answer.source] = encode(section, answer.source, consumed.at(-1)?.cursor ?? (answer.source === query.source ? position : null));
        }
      }
    }
    return result;
  } };
}
