/**
 * Where the domain adapters read the generic record table (agent-design AG05; 设计稿 §4 "存储与约束建议",
 * 附录 E). Every query is scoped to the account and the workspace in SQL, filtered in SQL (contact, words,
 * status, dates, withdrawn records) and returns one page — a record that does not match is never read.
 *
 * Two implementations with the same meaning: Postgres (the product path) and memory (unit tests).
 * Paths are code constants; values are always bound parameters.
 */
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";

export type PayloadPath = readonly string[];

export interface RecordSpec {
  collection: string;
  ids?: readonly string[];
  /** The JSON array at the path contains the value. */
  contains?: readonly { path: PayloadPath; value: string }[];
  /** One of the paths equals the value. */
  equals?: readonly { paths: readonly PayloadPath[]; value: string }[];
  /** None of the paths has one of the values. */
  excludes?: readonly { path: PayloadPath; values: readonly string[] }[];
  /** Words in search_text or one of the paths (case-insensitive); `within`: the field's value is inside the words. */
  text?: { paths: readonly PayloadPath[] | "search_text"; value: string; within?: boolean };
  /**
   * The first present path is in [from, to) (ISO strings, compared as text). With `seriesPath`, a record
   * holding that path (a repeating series) only has to start before `to`.
   */
  range?: { paths: readonly PayloadPath[]; from?: string; to?: string; seriesPath?: PayloadPath };
  /** Paths that must hold a value. */
  present?: readonly PayloadPath[];
  order: { paths: readonly PayloadPath[]; direction: "asc" | "desc" };
  /** Record ids that may not be read now. */
  denied?: readonly string[];
}

export interface RecordRow {
  id: string;
  collection: string;
  userId: string;
  payload: Record<string, unknown>;
  updatedAt: string;
  sortKey: string;
}

export interface PageAfter {
  key: string;
  id: string;
}

export interface RecordSource {
  page(scope: { accountId: string; workspaceId: string }, spec: RecordSpec, after: PageAfter | null, limit: number): Promise<RecordRow[]>;
  /** How many match: readable, and withheld (denied). Returns no record. */
  count(scope: { accountId: string; workspaceId: string }, spec: RecordSpec): Promise<{ total: number; withheld: number }>;
  /** Which of these ("<collection>:<id>") exist for the account and are not deleted. Returns ids only, no content. */
  existing(scope: { accountId: string; workspaceId: string }, refs: readonly { collection: string; id: string }[]): Promise<Set<string>>;
}

const SAFE_SEGMENT = /^[A-Za-z0-9_]+$/u;
/** Rows without the sort field come last either way (dates start with a digit; letters sort after digits). */
const sentinelFor = (direction: "asc" | "desc") => (direction === "asc" ? "zzzz" : "");

function pathSql(path: PayloadPath): string {
  if (!path.length || path.some((segment) => !SAFE_SEGMENT.test(segment))) throw new Error(`unsafe payload path ${path.join(".")}`);
  return `(payload #>> '{${path.join(",")}}')`;
}

function coalesceSql(paths: readonly PayloadPath[], fallback: string | null): string {
  const parts = paths.map(pathSql);
  return `coalesce(${[...parts, fallback === null ? "null" : `'${fallback}'`].join(", ")})`;
}

const ACTIVE = "lifecycle_state <> 'deleted' and deleted_at is null";

/**
 * agent-design AG20b (TRIAGE R2): the characters a word search ignores on both sides — spaces, the particles 的 and の, and
 * punctuation — after full-width forms are folded (NFKC) and letters lower-cased. The user's words reach the search with
 * them taken out ("回复 Dana 那条" → "回复dana"); the stored text is compared in the same form, so 「回复 Dana 的档期」 holds it.
 */
const MATCH_IGNORED = "[[:space:]的の、。・,.!?「」『』\"“”'’()【】:;]";
const MATCH_IGNORED_JS = /[\s的の、。・,.!?「」『』"“”'’()【】:;]/gu;

export function matchText(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase().replace(MATCH_IGNORED_JS, "");
}

/** The where clause and its parameters (after $1 workspace, $2 account, $3 collection). */
function whereOf(spec: RecordSpec, values: unknown[], options: { withDenied: boolean }): string {
  const clauses = ["workspace_id = $1", "user_id = $2", "collection_name = $3", ACTIVE];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (spec.ids) clauses.push(`record_id = any(${bind([...spec.ids])}::text[])`);
  for (const item of spec.contains ?? []) {
    const path = item.path;
    if (path.some((segment) => !SAFE_SEGMENT.test(segment))) throw new Error("unsafe path");
    clauses.push(`coalesce(payload #> '{${path.join(",")}}', '[]'::jsonb) ? ${bind(item.value)}`);
  }
  for (const item of spec.equals ?? []) clauses.push(`(${item.paths.map((path) => `${pathSql(path)} = ${bind(item.value)}`).join(" or ")})`);
  for (const item of spec.excludes ?? []) clauses.push(`coalesce(${pathSql(item.path)}, '') <> all(${bind([...item.values])}::text[])`);
  for (const path of spec.present ?? []) clauses.push(`${pathSql(path)} is not null`);
  if (spec.text) {
    const value = bind(spec.text.value.toLocaleLowerCase());
    const fields = spec.text.paths === "search_text" ? ["coalesce(search_text, '')"] : spec.text.paths.map((path) => `coalesce(${pathSql(path)}, '')`);
    // AG20b (R2): a search also matches in the folded form of both sides (matchText); never with nothing left to match.
    const folded = spec.text.within ? "" : matchText(spec.text.value);
    const loose = folded ? { ignored: bind(MATCH_IGNORED), value: bind(folded) } : null;
    clauses.push(`(${fields.map((field) => (spec.text!.within ? `(length(${field}) >= 2 and strpos(${value}, lower(${field})) > 0)` : `strpos(lower(${field}), ${value}) > 0${loose ? ` or strpos(regexp_replace(lower(normalize(${field}, NFKC)), ${loose.ignored}, '', 'g'), ${loose.value}) > 0` : ""}`)).join(" or ")})`);
  }
  if (spec.range) {
    const field = coalesceSql(spec.range.paths, null);
    const lower = spec.range.from ? `${field} >= ${bind(spec.range.from)}` : "true";
    const upper = spec.range.to ? `${field} < ${bind(spec.range.to)}` : `${field} is not null`;
    clauses.push(spec.range.seriesPath ? `((${lower} and ${upper}) or (${pathSql(spec.range.seriesPath)} is not null and ${upper}))` : `(${lower} and ${upper})`);
  }
  if (options.withDenied && spec.denied?.length) clauses.push(`record_id <> all(${bind([...spec.denied])}::text[])`);
  return clauses.join("\n  and ");
}

function rowOf(row: Record<string, unknown>): RecordRow {
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>);
  const updated = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? "");
  return { collection: String(row.collection_name), id: String(row.record_id), payload, sortKey: String(row.sort_key ?? ""), updatedAt: updated, userId: String(row.user_id ?? "") };
}

export function createPostgresRecordSource(client: LiveRecordSqlClient): RecordSource {
  return {
    async page(scope, spec, after, limit) {
      const values: unknown[] = [scope.workspaceId, scope.accountId, spec.collection];
      const where = whereOf(spec, values, { withDenied: true });
      const key = coalesceSql(spec.order.paths, sentinelFor(spec.order.direction));
      let keyset = "";
      if (after) {
        values.push(after.key, after.id);
        const k = `$${values.length - 1}`;
        const i = `$${values.length}`;
        keyset = `\n  and (${key} ${spec.order.direction === "desc" ? "<" : ">"} ${k} or (${key} = ${k} and record_id > ${i}))`;
      }
      values.push(limit);
      const text = `select record_id, collection_name, user_id, workspace_id, payload, updated_at, ${key} as sort_key
from orbit_records
where ${where}${keyset}
order by sort_key ${spec.order.direction}, record_id asc
limit $${values.length}`;
      const result = await client.query<Record<string, unknown>>(text, values);
      return result.rows.map(rowOf);
    },
    async count(scope, spec) {
      const values: unknown[] = [scope.workspaceId, scope.accountId, spec.collection];
      const where = whereOf(spec, values, { withDenied: false });
      values.push([...(spec.denied ?? [])]);
      const result = await client.query<{ total: number; withheld: number }>(
        `select count(*)::int as total, count(*) filter (where record_id = any($${values.length}::text[]))::int as withheld
from orbit_records
where ${where}`,
        values,
      );
      const row = result.rows[0] ?? { total: 0, withheld: 0 };
      return { total: Number(row.total) - Number(row.withheld), withheld: Number(row.withheld) };
    },
    async existing(scope, refs) {
      if (!refs.length) return new Set();
      // Only the keys come back, never the record: an authorization check, not a read of its content.
      const result = await client.query<{ visible_collection: string; visible_id: string }>(
        `select collection_name as visible_collection, record_id as visible_id
from orbit_records
where workspace_id = $1 and user_id = $2 and ${ACTIVE}
  and collection_name = any($3::text[]) and record_id = any($4::text[])`,
        [scope.workspaceId, scope.accountId, [...new Set(refs.map((ref) => ref.collection))], [...new Set(refs.map((ref) => ref.id))]],
      );
      const wanted = new Set(refs.map((ref) => `${ref.collection}:${ref.id}`));
      return new Set(result.rows.map((row) => `${row.visible_collection}:${row.visible_id}`).filter((key) => wanted.has(key)));
    },
  };
}

/** One stored record of the memory source (tests). */
export interface MemoryRecord {
  collection: string;
  id: string;
  userId: string;
  workspaceId: string;
  payload: Record<string, unknown>;
  updatedAt?: string;
  searchText?: string;
  deleted?: boolean;
}

function at(payload: Record<string, unknown>, path: PayloadPath): unknown {
  let value: unknown = payload;
  for (const segment of path) value = value && typeof value === "object" ? (value as Record<string, unknown>)[segment] : undefined;
  return value;
}

const textAt = (payload: Record<string, unknown>, path: PayloadPath): string | null => {
  const value = at(payload, path);
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
};

function matches(record: MemoryRecord, scope: { accountId: string; workspaceId: string }, spec: RecordSpec, withDenied: boolean): boolean {
  if (record.workspaceId !== scope.workspaceId || record.userId !== scope.accountId || record.collection !== spec.collection || record.deleted) return false;
  if (spec.ids && !spec.ids.includes(record.id)) return false;
  for (const item of spec.contains ?? []) {
    const list = at(record.payload, item.path);
    if (!Array.isArray(list) || !list.includes(item.value)) return false;
  }
  for (const item of spec.equals ?? []) if (!item.paths.some((path) => textAt(record.payload, path) === item.value)) return false;
  for (const item of spec.excludes ?? []) if (item.values.includes(textAt(record.payload, item.path) ?? "")) return false;
  for (const path of spec.present ?? []) if (textAt(record.payload, path) === null) return false;
  if (spec.text) {
    const value = spec.text.value.toLocaleLowerCase();
    const fields = spec.text.paths === "search_text" ? [record.searchText ?? ""] : spec.text.paths.map((path) => textAt(record.payload, path) ?? "");
    const folded = spec.text.within ? "" : matchText(spec.text.value);
    const hit = fields.some((field) => (spec.text!.within ? field.length >= 2 && value.includes(field.toLocaleLowerCase()) : field.toLocaleLowerCase().includes(value) || (Boolean(folded) && matchText(field).includes(folded))));
    if (!hit) return false;
  }
  if (spec.range) {
    const field = spec.range.paths.map((path) => textAt(record.payload, path)).find((value) => value !== null) ?? null;
    if (field === null) return false;
    const series = spec.range.seriesPath ? textAt(record.payload, spec.range.seriesPath) !== null : false;
    if (!series && spec.range.from && field < spec.range.from) return false;
    if (spec.range.to && field >= spec.range.to) return false;
  }
  if (withDenied && spec.denied?.includes(record.id)) return false;
  return true;
}

function sortKeyOf(record: MemoryRecord, spec: RecordSpec): string {
  return spec.order.paths.map((path) => textAt(record.payload, path)).find((value) => value !== null) ?? sentinelFor(spec.order.direction);
}

export function createMemoryRecordSource(records: MemoryRecord[]): RecordSource & { records: MemoryRecord[]; reads: string[] } {
  const reads: string[] = [];
  const compare = (direction: "asc" | "desc") => (left: RecordRow, right: RecordRow) => {
    const byKey = left.sortKey < right.sortKey ? -1 : left.sortKey > right.sortKey ? 1 : 0;
    return (direction === "asc" ? byKey : -byKey) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  };
  return {
    async count(scope, spec) {
      const all = records.filter((record) => matches(record, scope, spec, false));
      const withheld = all.filter((record) => spec.denied?.includes(record.id)).length;
      return { total: all.length - withheld, withheld };
    },
    async existing(scope, refs) {
      return new Set(refs.filter((ref) => records.some((record) => record.collection === ref.collection && record.id === ref.id && record.userId === scope.accountId && record.workspaceId === scope.workspaceId && !record.deleted)).map((ref) => `${ref.collection}:${ref.id}`));
    },
    async page(scope, spec, after, limit) {
      const rows = records
        .filter((record) => matches(record, scope, spec, true))
        .map((record): RecordRow => ({ collection: record.collection, id: record.id, payload: structuredClone(record.payload), sortKey: sortKeyOf(record, spec), updatedAt: record.updatedAt ?? "2026-01-01T00:00:00.000Z", userId: record.userId }))
        .sort(compare(spec.order.direction))
        .filter((row) => {
          if (!after) return true;
          if (row.sortKey === after.key) return row.id > after.id;
          return spec.order.direction === "desc" ? row.sortKey < after.key : row.sortKey > after.key;
        })
        .slice(0, limit);
      reads.push(...rows.map((row) => row.id));
      return rows;
    },
    reads,
    records,
  };
}
