/**
 * The domain registry (设计稿附录 B; agent-design AG05): capability kind → its read adapter, each read
 * going out through executeAiRead (features/orbit-ai/data-query/query-result.ts) — two authorization
 * checks, the HMAC cursor bound to the scope and the filter, the revision fence, the field whitelist
 * (permission-registry.ts) and the byte limit. The old registry stays disabled; agent-v1 enables its own
 * five tools through ReadDependencies.permission.
 *
 * A read failure is an exception with executeAiRead's code; gapOfReadError() maps it to a gap reason.
 */
import { executeAiRead } from "../../orbit-ai/data-query/query-result";
import { AI_READ_PERMISSIONS } from "../../orbit-ai/data-query/permission-registry";
import type { AiReadPermission, AiReadTool, ReadAdapter, ReadDependencies, ReadInput, ReadScope } from "../../orbit-ai/data-query/read-contract";
import { CONTACT_DOMAIN } from "./contact/read";
import { createEventAdapter, type EventSource } from "./event/read";
import { MEMO_DOMAIN } from "./memo/read";
import { createRecordAdapter } from "./record-adapter";
import { SCHEDULE_DOMAIN } from "./schedule/read";
import type { RecordSource } from "./source";
import { TODO_DOMAIN } from "./todo/read";
import { refOf, type DomainKind, type DomainQuery, type DomainReader, type DomainReadResult, type DomainScope, type ReadGapReason, type RecordView } from "./types";

export const TOOL_OF: Record<DomainKind, AiReadTool> = {
  contact: "contacts.query",
  event: "events.query",
  memo: "notes.query",
  schedule: "schedule.query",
  todo: "tasks.query",
};

/** At most this many pages per read of one subgoal (PLANNER 易错边界 3); ORBIT_AGENT_READ_MAX_PAGES lowers or raises it. */
export const DEFAULT_MAX_PAGES = 5;

export function readMaxPages(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.ORBIT_AGENT_READ_MAX_PAGES);
  return Number.isInteger(value) && value >= 1 && value <= 20 ? value : DEFAULT_MAX_PAGES;
}

export interface DomainRegistryOptions {
  source: RecordSource;
  events: EventSource;
  /** At least 32 bytes (query-cursor.ts). */
  cursorKey: Uint8Array;
  now(): string;
  /** Record ids that may not be read now (the eval's deny list; empty in production). */
  denied?: () => ReadonlySet<string>;
}

export function createDomainRegistry(options: DomainRegistryOptions): DomainReader & { adapter(kind: DomainKind): ReadAdapter } {
  const adapters: Record<DomainKind, ReadAdapter> = {
    contact: createRecordAdapter(CONTACT_DOMAIN, options),
    event: createEventAdapter({ source: options.events, ...(options.denied ? { denied: options.denied } : {}) }),
    memo: createRecordAdapter(MEMO_DOMAIN, options),
    schedule: createRecordAdapter(SCHEDULE_DOMAIN, options),
    todo: createRecordAdapter(TODO_DOMAIN, options),
  };
  const kindOfTool = Object.fromEntries(Object.entries(TOOL_OF).map(([kind, tool]) => [tool, kind])) as Record<AiReadTool, DomainKind>;
  const permissions = new Map<AiReadTool, AiReadPermission>(AI_READ_PERMISSIONS.filter((entry) => entry.tool in kindOfTool).map((entry) => [entry.tool, { ...entry, enabled: async (scope: ReadScope) => Boolean(scope.actorId) }]));
  const depsFor = (scope: DomainScope): ReadDependencies => {
    const readScope: ReadScope = { actorId: scope.accountId, authorizationEpoch: scope.authorizationEpoch, workspaceId: scope.workspaceId };
    return {
      adapter: (tool) => adapters[kindOfTool[tool]],
      assertCurrentAuthorization: (current) => {
        if (current.actorId !== readScope.actorId || current.workspaceId !== readScope.workspaceId) throw new Error("AUTHORIZATION_CHANGED");
      },
      currentScope: async () => readScope,
      cursorKey: options.cursorKey,
      now: options.now,
      permission: (tool) => {
        const permission = permissions.get(tool);
        if (!permission) throw new Error("UNKNOWN_AI_READ_TOOL");
        return permission;
      },
      readAuthorityExpiresAt: async () => new Date(Date.parse(options.now()) + 3_600_000).toISOString(),
    };
  };
  return {
    adapter: (kind) => adapters[kind],
    async read(kind, scope, query): Promise<DomainReadResult> {
      const input: ReadInput = {
        operation: query.id ? "get" : query.text ? "search" : "list",
        query: (query.text ?? "list").slice(0, 2000),
        ...(query.id ? { id: query.id } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        limit: Math.min(10, query.limit ?? 10),
        ...(query.order ? { order: query.order } : {}),
        ...(query.contactId && kind !== "contact" ? { contactId: query.contactId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from && kind !== "contact" && kind !== "event" ? { from: query.from } : {}),
        ...(query.to && kind !== "contact" && kind !== "event" ? { to: query.to } : {}),
      };
      const result = await executeAiRead(TOOL_OF[kind], input, depsFor(scope));
      const items: RecordView[] = result.items.map((fields, index) => {
        const record = result.records[index];
        return { fields, id: record.id, kind, ref: refOf(kind, record.id), updatedAt: record.updatedAt, version: record.revision };
      });
      return {
        items,
        partialReasons: result.partialReasons,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        ...(result.total !== undefined ? { total: result.total } : {}),
        ...(result.withheld ? { withheld: result.withheld } : {}),
      };
    },
  };
}

/** Reads page after page (at most `maxPages`) and says how far it got. */
export async function readPages(reader: DomainReader, kind: DomainKind, scope: DomainScope, query: DomainQuery, maxPages: number): Promise<{ items: RecordView[]; pagesRead: number; total: number | null; withheld: number; complete: boolean; partialReasons: string[] }> {
  const items: RecordView[] = [];
  const partialReasons = new Set<string>();
  let cursor: string | undefined;
  let pagesRead = 0;
  let total: number | null = null;
  let withheld = 0;
  do {
    const page = await reader.read(kind, scope, { ...query, ...(cursor ? { cursor } : {}) });
    pagesRead += 1;
    items.push(...page.items);
    for (const reason of page.partialReasons) partialReasons.add(reason);
    if (total === null && page.total !== undefined) total = page.total;
    withheld = Math.max(withheld, page.withheld ?? 0);
    cursor = page.nextCursor;
  } while (cursor && pagesRead < maxPages);
  return { complete: !cursor, items, pagesRead, partialReasons: [...partialReasons], total, withheld };
}

/** What a failed read means for the user (PLANNER 易错边界 5): never "no record" for a failure. */
export function gapOfReadError(error: unknown, options: { byId: boolean }): ReadGapReason {
  const code = error instanceof Error ? error.message : String(error);
  switch (code) {
    case "READ_NOT_FOUND":
      return options.byId ? "unreadable" : "no_record";
    case "AI_NOT_AUTHORIZED":
    case "AUTHORIZATION_CHANGED":
      return "unreadable";
    case "CANONICAL_RECORD_UNAVAILABLE":
      return "partial";
    case "SOURCE_UNAVAILABLE":
    default:
      return "service_error";
  }
}
