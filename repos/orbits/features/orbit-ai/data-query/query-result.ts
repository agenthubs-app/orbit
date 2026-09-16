import { createHash } from "node:crypto";
import { assertAiReadAllowed, projectReadFields, validateAiReadFields } from "./permission-registry";
import { createAiReadInputSchema } from "./query-schema";
import { openReadCursor, sealReadCursor, type CursorBinding } from "./query-cursor";
import type { AiReadResult, AiReadTool, CanonicalRow, ReadDependencies, ReadInput, ReadScope } from "./read-contract";

const REGISTRY_VERSION = 1 as const;
const CURSOR_TTL_MS = 15 * 60 * 1_000;
const MAX_RESULT_BYTES = 32_000;

function sameScope(left: ReadScope, right: ReadScope): boolean {
  return left.actorId === right.actorId &&
    left.workspaceId === right.workspaceId &&
    left.authorizationEpoch === right.authorizationEpoch;
}

function canonicalFilter(input: ReadInput): string {
  return JSON.stringify({
    operation: input.operation,
    query: input.query,
    id: input.id ?? null,
    limit: input.limit ?? null,
    contactId: input.contactId ?? null,
    eventId: input.eventId ?? null,
    status: input.status ?? null,
    from: input.from ?? null,
    to: input.to ?? null,
  });
}

function filterHash(input: ReadInput): string {
  return createHash("sha256").update(canonicalFilter(input)).digest("base64url");
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function assertCanonicalRow(row: CanonicalRow): void {
  if (!row.revision) throw new Error("REVISION_UNAVAILABLE");
  if (!row.id || !row.updatedAt || !row.position || !Number.isFinite(Date.parse(row.updatedAt))) {
    throw new Error("FRESHNESS_UNAVAILABLE");
  }
}

function truncateText(value: unknown, maxTextLength: number): unknown {
  if (typeof value === "string") return value.slice(0, maxTextLength);
  if (Array.isArray(value)) return value.map((item) => truncateText(item, maxTextLength));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, truncateText(item, maxTextLength)]));
  }
  return value;
}

function boundedFirstFields(fields: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  for (const maxTextLength of [8_000, 4_000, 2_000, 1_000, 500, 200, 100]) {
    const candidate = truncateText(fields, maxTextLength) as Readonly<Record<string, unknown>>;
    if (byteLength(candidate) < MAX_RESULT_BYTES / 2) return candidate;
  }
  throw new Error("RESULT_TOO_LARGE");
}

function resultShape(
  tool: AiReadTool,
  input: ReadInput,
  readAt: string,
  rows: readonly CanonicalRow[],
  items: readonly Readonly<Record<string, unknown>>[],
  partialReasons: readonly string[],
): AiReadResult {
  return {
    domain: tool.slice(0, -".query".length) as AiReadResult["domain"],
    operation: input.operation,
    items,
    authority: "cloud_canonical",
    readAt,
    records: rows.map((row) => ({
      id: row.id,
      revision: row.revision,
      updatedAt: row.updatedAt,
      evidenceIds: row.evidenceIds,
    })),
    truncated: partialReasons.length > 0,
    partialReasons,
    evidenceIds: [...new Set(rows.flatMap((row) => row.evidenceIds))],
  };
}

export async function executeAiRead(
  tool: AiReadTool,
  input: ReadInput,
  deps: ReadDependencies,
): Promise<AiReadResult> {
  const parsed = createAiReadInputSchema(tool).parse(input);
  if (!parsed.success || !parsed.data) throw new Error("INVALID_READ_INPUT");
  const normalized = parsed.data;
  const scope = await deps.currentScope();
  const permission = deps.permission(tool);
  const adapter = deps.adapter(tool);
  await assertAiReadAllowed(scope, permission, adapter);

  const binding: CursorBinding = {
    scope,
    tool,
    schemaVersion: permission.schemaVersion,
    registryVersion: REGISTRY_VERSION,
    filterHash: filterHash(normalized),
  };
  let position: string | undefined;
  let snapshot: string | undefined;
  if (input.cursor) {
    const claims = openReadCursor(input.cursor, deps.cursorKey, binding, deps.now());
    position = claims.position;
    snapshot = claims.snapshot;
  }
  const { cursor: _cursor, ...adapterInput } = normalized;
  const limit = Math.min(adapterInput.limit ?? permission.maxItems, permission.maxItems);
  const page = await adapter.page(scope, { ...adapterInput, limit }, position, snapshot);

  const currentScope = await deps.currentScope();
  if (!sameScope(currentScope, scope)) throw new Error("AUTHORIZATION_CHANGED");
  await assertAiReadAllowed(currentScope, permission, adapter);
  if (page.partialReasons.includes("source_unavailable") && page.rows.length === 0) throw new Error("SOURCE_UNAVAILABLE");
  if (normalized.operation === "get" && page.rows.length === 0) throw new Error("READ_NOT_FOUND");

  const snapshotRows = page.rows.slice(0, limit);
  for (const row of snapshotRows) assertCanonicalRow(row);

  const authorityExpiresAt = await deps.readAuthorityExpiresAt(currentScope);
  const nowMs = Date.parse(deps.now());
  const authorityMs = Date.parse(authorityExpiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(authorityMs) || authorityMs <= nowMs) throw new Error("AI_NOT_AUTHORIZED");
  const cursorExpiresAt = new Date(Math.min(nowMs + CURSOR_TTL_MS, authorityMs)).toISOString();

  const currentRows = await adapter.readCurrentAtRevision(
    currentScope,
    snapshotRows.map((row) => ({ id: row.id, revision: row.revision })),
  );
  if (currentRows.length !== snapshotRows.length) throw new Error("CANONICAL_RECORD_UNAVAILABLE");
  const currentById = new Map(currentRows.map((row) => [row.id, row]));
  const candidateRows = snapshotRows.map((snapshotRow) => {
    const current = currentById.get(snapshotRow.id);
    if (!current || current.revision !== snapshotRow.revision) throw new Error("CANONICAL_RECORD_UNAVAILABLE");
    assertCanonicalRow(current);
    return { ...current, position: snapshotRow.position };
  });

  const returnedRows: CanonicalRow[] = [];
  const items: Readonly<Record<string, unknown>>[] = [];
  const partialReasons = [...page.partialReasons];
  let byteLimited = false;
  for (const row of candidateRows) {
    let fields = validateAiReadFields(tool, projectReadFields(row.fields, permission.fields));
    let candidate = resultShape(tool, normalized, deps.now(), [...returnedRows, row], [...items, fields], partialReasons);
    if (byteLength(candidate) > MAX_RESULT_BYTES && returnedRows.length === 0) {
      fields = validateAiReadFields(tool, boundedFirstFields(fields));
      if (!partialReasons.includes("text_limit")) partialReasons.push("text_limit");
      candidate = resultShape(tool, normalized, deps.now(), [row], [fields], partialReasons);
    }
    if (byteLength(candidate) > MAX_RESULT_BYTES) {
      if (!partialReasons.includes("byte_limit")) partialReasons.push("byte_limit");
      byteLimited = true;
      break;
    }
    returnedRows.push(row);
    items.push(fields);
  }

  const omittedRows = returnedRows.length < page.rows.length;
  let nextPosition: string | undefined;
  if (omittedRows) nextPosition = returnedRows.at(-1)?.position;
  else nextPosition = page.nextPosition;

  if (byteLimited && !nextPosition) throw new Error("RESULT_TOO_LARGE");

  const buildResult = (continuation: string | undefined): AiReadResult => {
    const value = resultShape(tool, normalized, deps.now(), returnedRows, items, partialReasons);
    if (continuation) {
      value.nextCursor = sealReadCursor({
        ...binding,
        snapshot: page.snapshot,
        position: continuation,
        expiresAt: cursorExpiresAt,
      }, deps.cursorKey);
      value.truncated = true;
    }
    return value;
  };

  let result = buildResult(nextPosition);
  if (byteLength(result) > MAX_RESULT_BYTES) {
    if (!partialReasons.includes("byte_limit")) partialReasons.push("byte_limit");
    while (byteLength(result) > MAX_RESULT_BYTES && returnedRows.length > 1) {
      returnedRows.pop();
      items.pop();
      nextPosition = returnedRows.at(-1)?.position;
      result = buildResult(nextPosition);
    }
    if (byteLength(result) > MAX_RESULT_BYTES && returnedRows.length === 1) {
      items[0] = validateAiReadFields(tool, boundedFirstFields(items[0]));
      if (!partialReasons.includes("text_limit")) partialReasons.push("text_limit");
      nextPosition = returnedRows[0].position;
      result = buildResult(nextPosition);
    }
    if (byteLength(result) > MAX_RESULT_BYTES) throw new Error("RESULT_TOO_LARGE");
  }

  return result;
}
