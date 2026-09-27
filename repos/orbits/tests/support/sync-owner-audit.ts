import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ownerGuardedCollections, SYNC_OWNER_CHANGE_HANDLERS, type SyncDomainDefinition } from "../../features/sync/domain-registry";

/**
 * Sprint 0113 (offline design step 5, method two; decision 4): static audit of
 * every SQL statement in product code and scripts that sets a visibility input
 * of a sync domain — orbit_records.user_id / collection_name, or a dedicated
 * table's owner and visibility columns as the registry declares them. A device
 * is never told that a row left it, so such a write is only acceptable when it
 * is classified here. The database trigger (features/sync/owner-guard.ts) stops
 * the same writes at runtime; this audit fails the default test suite first, and
 * it covers scripts that no test executes.
 *
 * It also lists every call of the explicit owner-change interface
 * (reassignRecordOwner): each one must be a registered handler.
 */
export type OwnerWritePolicy =
  /** Keeps a stored owner: `user_id = coalesce(excluded.user_id, orbit_records.user_id)` (either order) plus a conflict guard. */
  | { policy: "preserves-owner"; statements: number; how: string }
  /** Only gives an unowned row its first owner: every statement is guarded by `user_id is null` / `user_id is not distinct from` the owner it read. */
  | { policy: "assigns-first-owner"; statements: number; how: string }
  /** Writes only collections outside every sync domain; no registered collection literal may appear in the statement. */
  | { policy: "non-registered"; statements: number; collections: string }
  /** The explicit owner-change interface itself; it must call assertRegisteredOwnerChange. */
  | { policy: "owner-interface"; statements: number; how: string }
  /** A registered handler (SYNC_OWNER_CHANGE_HANDLERS). */
  | { policy: "handler"; statements: number; handler: string };

/**
 * A reassignRecordOwner caller: a registered handler, or a caller that only
 * moves rows outside every sync domain (the store's assertRegisteredOwnerChange
 * refuses a sync-domain collection at runtime either way).
 */
export type ReassignCallPolicy = { calls: number; handler: string } | { calls: number; nonSyncCollections: string };

export const OWNER_AUDIT_ROOTS = ["app", "features", "shared", "scripts", "lib"] as const;
const SOURCE_FILE = /\.(ts|tsx|mjs|cjs|js|sql)$/;

interface Statement { file: string; text: string; target: string }

function sourceFiles(root: string): { file: string; text: string }[] {
  const files: { file: string; text: string }[] = [];
  const visit = (directory: string) => {
    let names: string[];
    try { names = readdirSync(directory); } catch { return; }
    for (const name of names) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) {
        if (name === "node_modules" || name === ".next" || name === "tests") continue;
        visit(path);
        continue;
      }
      if (!SOURCE_FILE.test(name) || /\.test\.[a-z]+$/.test(name)) continue;
      files.push({ file: relative(root, path).split(sep).join("/"), text: readFileSync(path, "utf8") });
    }
  };
  for (const scanned of OWNER_AUDIT_ROOTS) visit(join(root, scanned));
  return files.sort((left, right) => left.file.localeCompare(right.file));
}

/** The SQL string a match sits in: from the nearest preceding ` or " to the next one (bounded). */
function enclosingStatement(text: string, index: number): string {
  let start = -1;
  let delimiter = "";
  for (const candidate of ["`", "\""]) {
    const at = text.lastIndexOf(candidate, index);
    if (at > start) { start = at; delimiter = candidate; }
  }
  const end = start >= 0 ? text.indexOf(delimiter, index) : -1;
  // SQL line comments may contain words like "where"; they are not SQL.
  return text.slice(index, end > index ? end : index + 1500).replace(/--[^\n]*/g, " ");
}

/** Assignment targets in every SET clause of one statement (lower-cased, qualification dropped). */
export function setTargets(statement: string): string[] {
  const sql = statement.toLowerCase();
  const targets: string[] = [];
  for (const match of sql.matchAll(/\bset\b/g)) {
    const rest = sql.slice(match.index + 3);
    const stop = rest.search(/\b(where|from|returning)\b/);
    const clause = stop >= 0 ? rest.slice(0, stop) : rest;
    for (const assignment of clause.matchAll(/(?:^|,)\s*(?:[a-z_]+\.)?([a-z_]+)\s*=(?!=)/g)) targets.push(assignment[1]!);
  }
  return targets;
}

function writeStatements(files: { file: string; text: string }[], table: string): Statement[] {
  const pattern = new RegExp(`\\b(insert\\s+into|update|merge\\s+into)\\s+${table}\\b`, "gi");
  const found: Statement[] = [];
  for (const { file, text } of files) {
    for (const match of text.matchAll(pattern)) found.push({ file, target: table, text: enclosingStatement(text, match.index) });
  }
  return found;
}

export interface OwnerWriteFinding { file: string; statements: Statement[] }

/** Statements that set a visibility input of a declared domain, grouped by file. */
export function scanOwnerWrites(root: string, domains: readonly SyncDomainDefinition[]): OwnerWriteFinding[] {
  const files = sourceFiles(root);
  const statements: Statement[] = [];
  const recordsInputs = new Set(domains.filter((domain) => domain.source.kind === "orbit_records").flatMap((domain) => domain.visibilityInputs));
  if (recordsInputs.size) {
    statements.push(...writeStatements(files, "orbit_records").filter((statement) => setTargets(statement.text).some((target) => recordsInputs.has(target))));
  }
  for (const domain of domains) {
    if (domain.source.kind !== "dedicated_table") continue;
    const inputs = new Set([...domain.visibilityInputs, ...(domain.ownership.rule === "column" ? [domain.ownership.column] : [])]);
    statements.push(...writeStatements(files, domain.source.table).filter((statement) => setTargets(statement.text).some((target) => inputs.has(target))));
  }
  const byFile = new Map<string, Statement[]>();
  for (const statement of statements) byFile.set(statement.file, [...(byFile.get(statement.file) ?? []), statement]);
  return [...byFile.entries()].map(([file, list]) => ({ file, statements: list })).sort((left, right) => left.file.localeCompare(right.file));
}

/** Where the owner-change interface is declared, implemented and forwarded; every other call is audited. */
const OWNER_INTERFACE_FILES = new Set([
  "shared/storage/live-record-store.ts",
  "shared/storage/postgres-live-record-store.ts",
  "shared/storage/configured-live-record-store.ts",
]);

const KEEPS_OWNER = /\buser_id\s*=\s*coalesce\s*\(\s*(excluded\.user_id\s*,\s*orbit_records\.user_id|orbit_records\.user_id\s*,\s*excluded\.user_id)\s*\)/i;
const OWNER_CONFLICT_GUARD = /orbit_records\.user_id\s*=\s*excluded\.user_id/i;

/** Problems, one line each; empty means every owner/identity writer is classified and consistent. */
export function auditOwnerWrites(
  root: string,
  domains: readonly SyncDomainDefinition[],
  manifest: Readonly<Record<string, OwnerWritePolicy>>,
  reassignCalls: Readonly<Record<string, ReassignCallPolicy>> = {},
): string[] {
  const problems: string[] = [];
  const findings = scanOwnerWrites(root, domains);
  const registeredLiterals = [
    ...ownerGuardedCollections(domains),
    ...domains.flatMap((domain) => domain.source.kind === "dedicated_table" ? [domain.source.table] : []),
  ];
  for (const finding of findings) {
    const entry = manifest[finding.file];
    if (!entry) {
      problems.push(`UNCLASSIFIED ${finding.file}: ${finding.statements.length} statement(s) set a sync owner/visibility column. A row that changes owner silently stays on the old owner's device: keep the owner (coalesce), or register an owner-change handler (features/sync/domain-registry.ts).`);
      continue;
    }
    if (entry.statements !== finding.statements.length) {
      problems.push(`CHANGED ${finding.file}: ${finding.statements.length} owner/visibility write(s), manifest says ${entry.statements}. Review the new statement, then update the manifest.`);
    }
    for (const statement of finding.statements) {
      if (entry.policy === "preserves-owner") {
        if (statement.target !== "orbit_records" || !KEEPS_OWNER.test(statement.text) || !OWNER_CONFLICT_GUARD.test(statement.text) || setTargets(statement.text).includes("collection_name")) {
          problems.push(`OWNER_OVERWRITE ${finding.file}: classified as preserves-owner but a statement does not keep the stored owner (coalesce + conflict guard).`);
        }
      } else if (entry.policy === "assigns-first-owner") {
        if (!/\buser_id\s+is\s+(null|not\s+distinct\s+from)\b/i.test(statement.text)) {
          problems.push(`OWNER_OVERWRITE ${finding.file}: classified as assigns-first-owner but a statement is not guarded by the owner it expects.`);
        }
      } else if (entry.policy === "non-registered") {
        const literal = registeredLiterals.find((name) => statement.text.includes(`'${name}'`) || (statement.target === name));
        if (literal) problems.push(`SYNC_DOMAIN ${finding.file}: classified as non-registered but a statement touches ${literal}.`);
      } else if (entry.policy === "owner-interface") {
        const text = readFileSync(join(root, finding.file), "utf8");
        if (!text.includes("assertRegisteredOwnerChange(")) problems.push(`UNCHECKED ${finding.file}: an owner-change interface must call assertRegisteredOwnerChange.`);
      } else if (!SYNC_OWNER_CHANGE_HANDLERS.includes(entry.handler)) {
        problems.push(`UNREGISTERED ${finding.file}: handler ${entry.handler} is not in SYNC_OWNER_CHANGE_HANDLERS.`);
      }
    }
  }
  const scanned = new Set(findings.map((finding) => finding.file));
  for (const file of Object.keys(manifest)) if (!scanned.has(file)) problems.push(`STALE ${file}: in the owner manifest but sets no sync owner/visibility column any more.`);

  const calls = new Map<string, number>();
  for (const { file, text } of sourceFiles(root)) {
    if (OWNER_INTERFACE_FILES.has(file)) continue;
    const count = [...text.matchAll(/\breassignRecordOwner\s*(?:!|\?\.)?\s*\(/g)].length;
    if (count > 0) calls.set(file, count);
  }
  for (const [file, count] of calls) {
    const entry = reassignCalls[file];
    if (!entry) problems.push(`UNREGISTERED_REASSIGN ${file}: ${count} reassignRecordOwner call(s); each owner change must be a registered handler.`);
    else if ("handler" in entry && !SYNC_OWNER_CHANGE_HANDLERS.includes(entry.handler)) problems.push(`UNREGISTERED ${file}: reassign handler ${entry.handler} is not in SYNC_OWNER_CHANGE_HANDLERS.`);
    else if ("nonSyncCollections" in entry && ownerGuardedCollections(domains).some((name) => entry.nonSyncCollections.split(/[^a-z_]+/).includes(name))) problems.push(`SYNC_DOMAIN ${file}: a non-sync reassign lists a sync collection.`);
    else if (entry.calls !== count) problems.push(`CHANGED ${file}: ${count} reassignRecordOwner call(s), manifest says ${entry.calls}.`);
  }
  for (const file of Object.keys(reassignCalls)) if (!calls.has(file)) problems.push(`STALE ${file}: in the reassign manifest but has no reassignRecordOwner call any more.`);
  return problems;
}
