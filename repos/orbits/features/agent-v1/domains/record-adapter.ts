/**
 * A `ReadAdapter` (features/orbit-ai/data-query/read-contract.ts) over the generic record table, used by
 * the contact, memo, to-do and schedule adapters (agent-design AG05). executeAiRead does the rest: two
 * authorization checks, the HMAC cursor bound to the scope and the filter, the revision fence, the field
 * whitelist and the byte limit.
 *
 * - Withdrawn records (the eval's deny list stands in for a per-record permission the product does not
 *   have yet) are excluded in SQL and only counted, so they are never read.
 * - An eval fault at `<kind>.read` makes the source unavailable (no rows, source_unavailable), which
 *   executeAiRead turns into SOURCE_UNAVAILABLE.
 */
import { createHash } from "node:crypto";

import type { CanonicalRow, ReadAdapter, ReadInput, ReadPage, ReadScope } from "../../orbit-ai/data-query/read-contract";
import { emitTrace, takeEvalFault } from "../observability/trace";
import type { PageAfter, RecordRow, RecordSource, RecordSpec } from "./source";
import type { DomainKind } from "./types";

export interface RecordDomain {
  kind: DomainKind;
  /** The filter for a page (ids, contact, words, status, dates, order), before the deny list. */
  specOf(input: ReadInput): RecordSpec;
  /** The whitelisted fields of a row (only keys the permission registry lists). */
  fieldsOf(row: RecordRow): Record<string, unknown> | null;
  versionOf(row: RecordRow): string;
  updatedAtOf(row: RecordRow): string;
}

export interface RecordAdapterOptions {
  source: RecordSource;
  /** Record ids that may not be read now (checked on every read). */
  denied?: () => ReadonlySet<string>;
}

function canonical(domain: RecordDomain, row: RecordRow): CanonicalRow | null {
  const fields = domain.fieldsOf(row);
  if (!fields) return null;
  const updatedAt = domain.updatedAtOf(row) || row.updatedAt;
  return { evidenceIds: [], fields, id: row.id, position: JSON.stringify([row.sortKey, row.id]), revision: domain.versionOf(row) || updatedAt, updatedAt };
}

const scopeOf = (scope: ReadScope) => ({ accountId: scope.actorId, workspaceId: scope.workspaceId });

export function createRecordAdapter(domain: RecordDomain, options: RecordAdapterOptions): ReadAdapter {
  const denied = () => [...(options.denied?.() ?? [])];
  return {
    async authorize(scope) {
      return Boolean(scope.actorId && scope.workspaceId);
    },
    async authorizeEvidence() {
      return [];
    },
    async page(scope, input, position, snapshot): Promise<ReadPage> {
      const spec = { ...domain.specOf(input), denied: denied() };
      const snap = snapshot ?? createHash("sha256").update(JSON.stringify({ ...spec, denied: undefined })).digest("base64url");
      const fault = takeEvalFault(`${domain.kind}.read`);
      if (fault) {
        emitTrace({ kind: fault.kind, note: "eval fault: the read source is unavailable", type: "read.fault", where: `${domain.kind}.read` });
        return { partialReasons: ["source_unavailable"], rows: [], snapshot: snap };
      }
      const limit = Math.max(1, Math.min(10, input.limit ?? 10));
      try {
        const after: PageAfter | null = position ? (([key, id]) => ({ id: String(id), key: String(key) }))(JSON.parse(position) as [string, string]) : null;
        const rows = await options.source.page(scopeOf(scope), spec, after, limit + 1);
        const counted = position ? null : await options.source.count(scopeOf(scope), spec);
        const page = rows.slice(0, limit).map((row) => canonical(domain, row)).filter((row): row is CanonicalRow => row !== null);
        const withheld = counted?.withheld ?? 0;
        return {
          partialReasons: withheld > 0 ? ["withheld"] : [],
          rows: page,
          snapshot: snap,
          ...(rows.length > limit && page.length ? { nextPosition: page[page.length - 1].position } : {}),
          ...(counted ? { total: counted.total } : {}),
          ...(withheld ? { withheld } : {}),
        };
      } catch (error) {
        emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: `${domain.kind}.read` });
        return { partialReasons: ["source_unavailable"], rows: [], snapshot: snap };
      }
    },
    async readCurrentAtRevision(scope, expected) {
      if (!expected.length) return [];
      const base = domain.specOf({ operation: "list", query: "fence" });
      const rows = await options.source.page(scopeOf(scope), { collection: base.collection, denied: denied(), ids: expected.map((item) => item.id), order: base.order }, null, expected.length);
      const byId = new Map(rows.map((row) => [row.id, canonical(domain, row)]));
      return expected.map((item) => byId.get(item.id)).filter((row): row is CanonicalRow => Boolean(row) && row!.revision === expected.find((wanted) => wanted.id === row!.id)?.revision);
    },
  };
}

/** The payload object at a key (notes keep the note under `note`, tasks under `task`). */
export function objectAt(payload: Record<string, unknown>, key?: string): Record<string, unknown> | null {
  const value = key ? payload[key] : payload;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value : undefined);
export const strs = (value: unknown): string[] | undefined => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined);

/** Drops undefined values (the field schemas are strict about types, not about absence). */
/** agent-design AG13: typed event links as the read fields carry them ("platform:<id>", "private:<id>"); undefined when none. */
export function refsOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.flatMap((ref) => (ref && typeof ref === "object" && ((ref as { kind?: unknown }).kind === "platform" || (ref as { kind?: unknown }).kind === "private") && typeof (ref as { id?: unknown }).id === "string" ? [`${(ref as { kind: string }).kind}:${(ref as { id: string }).id}`] : []));
  return out.length ? out : undefined;
}

export function defined(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}
