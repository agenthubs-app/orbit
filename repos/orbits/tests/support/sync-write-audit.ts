import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SYNC_COLLECTION_NAMES, SYNC_COMMIT_ORDER_LOCK_SQL } from "../../features/sync/commit-order-lock";

/**
 * Sprint 0108: static audit of every SQL statement in product code and scripts
 * that inserts into or updates orbit_records. The strict sync_revision trigger
 * refuses unlocked writes to notes/tasks/personal_schedule_items at runtime;
 * this audit fails at test time when a new writer appears that nobody has
 * classified, so it cannot reach a database before someone decides whether it
 * must take the commit-order lock.
 *
 * Deletes are not audited: the trigger fires on insert/update only.
 */
export type SyncWritePolicy =
  /** The file takes the commit-order lock for its sync-collection writes. */
  | { policy: "locked"; statements: number; how: string }
  /** The file writes caller-supplied records and refuses sync collections at runtime. */
  | { policy: "guarded"; statements: number; how: string }
  /** The file's writes target fixed non-sync collections. */
  | { policy: "non-sync"; statements: number; collections: string };

export const SCANNED_ROOTS = ["app", "features", "shared", "scripts", "lib"] as const;
const WRITE = /\b(insert\s+into|update|merge\s+into)\s+orbit_records\b/gi;
const LOCK_MARKERS = ["SYNC_COMMIT_ORDER_LOCK_CTE", "acquireSyncCommitOrderLock", "orbit_records_acquire_sync_write_lock", SYNC_COMMIT_ORDER_LOCK_SQL];
const SYNC_LITERAL = new RegExp(`'(${SYNC_COLLECTION_NAMES.join("|")})'`);

export interface SyncWriteFinding { file: string; statements: number; snippets: string[] }

function walk(root: string, directory: string, found: SyncWriteFinding[]): void {
  let names: string[];
  try { names = readdirSync(directory); } catch { return; }
  for (const name of names) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === "tests") continue;
      walk(root, path, found);
      continue;
    }
    if (!/\.(ts|tsx|mjs|cjs|js)$/.test(name) || /\.test\.[a-z]+$/.test(name)) continue;
    const text = readFileSync(path, "utf8");
    const snippets: string[] = [];
    for (const match of text.matchAll(WRITE)) snippets.push(text.slice(match.index, match.index + 700));
    if (snippets.length) found.push({ file: relative(root, path).split(sep).join("/"), statements: snippets.length, snippets });
  }
}

export function scanSyncWrites(root: string): SyncWriteFinding[] {
  const found: SyncWriteFinding[] = [];
  for (const scanned of SCANNED_ROOTS) walk(root, join(root, scanned), found);
  return found.sort((left, right) => left.file.localeCompare(right.file));
}

/** Problems, one line each; empty means every writer is classified and consistent. */
export function auditSyncWrites(root: string, manifest: Readonly<Record<string, SyncWritePolicy>>): string[] {
  const problems: string[] = [];
  const findings = scanSyncWrites(root);
  for (const finding of findings) {
    const entry = manifest[finding.file];
    if (!entry) {
      problems.push(`UNCLASSIFIED ${finding.file}: ${finding.statements} orbit_records write(s). Take the sync commit-order lock (features/sync/commit-order-lock.ts) for notes/tasks/personal_schedule_items, or classify the file as non-sync with its collections.`);
      continue;
    }
    if (entry.statements !== finding.statements) {
      problems.push(`CHANGED ${finding.file}: ${finding.statements} orbit_records write(s), manifest says ${entry.statements}. Review the new statement for the sync lock, then update the manifest.`);
    }
    const text = readFileSync(join(root, finding.file), "utf8");
    if (entry.policy === "locked" && !LOCK_MARKERS.some((marker) => text.includes(marker))) {
      problems.push(`UNLOCKED ${finding.file}: classified as locked but takes no commit-order lock.`);
    }
    if (entry.policy === "guarded" && !text.includes("assertNoSyncCollectionRecords(")) {
      problems.push(`UNGUARDED ${finding.file}: classified as guarded but never calls assertNoSyncCollectionRecords.`);
    }
    if (entry.policy === "non-sync") {
      for (const snippet of finding.snippets) {
        const literal = snippet.match(SYNC_LITERAL);
        if (literal) problems.push(`SYNC_LITERAL ${finding.file}: a write names '${literal[1]}' but the file is classified as non-sync.`);
      }
    }
  }
  const scanned = new Set(findings.map((finding) => finding.file));
  for (const file of Object.keys(manifest)) if (!scanned.has(file)) problems.push(`STALE ${file}: in the manifest but has no orbit_records write any more.`);
  return problems;
}

/**
 * Sprint 0109: every row of the three relationship message tables is a sync
 * row (strict trigger, same revision sequence), so every file that inserts
 * into or updates them must take the commit-order lock. There is no non-sync
 * classification for these tables.
 */
const MESSAGE_TABLE_WRITE = /\b(insert\s+into|update|merge\s+into)\s+relationship_(conversations|conversation_members|messages)\b/gi;

export interface MessageTableWritePolicy { statements: number; how: string }

export function scanMessageTableWrites(root: string): SyncWriteFinding[] {
  const found: SyncWriteFinding[] = [];
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
      if (!/\.(ts|tsx|mjs|cjs|js)$/.test(name) || /\.test\.[a-z]+$/.test(name)) continue;
      const text = readFileSync(path, "utf8");
      const snippets = [...text.matchAll(MESSAGE_TABLE_WRITE)].map((match) => text.slice(match.index, match.index + 200));
      if (snippets.length) found.push({ file: relative(root, path).split(sep).join("/"), statements: snippets.length, snippets });
    }
  };
  for (const scanned of SCANNED_ROOTS) visit(join(root, scanned));
  return found.sort((left, right) => left.file.localeCompare(right.file));
}

export function auditMessageTableWrites(root: string, manifest: Readonly<Record<string, MessageTableWritePolicy>>): string[] {
  const problems: string[] = [];
  const findings = scanMessageTableWrites(root);
  for (const finding of findings) {
    const entry = manifest[finding.file];
    if (!entry) {
      problems.push(`UNCLASSIFIED ${finding.file}: ${finding.statements} relationship message table write(s). Take the sync commit-order lock (features/sync/commit-order-lock.ts) and list the file.`);
      continue;
    }
    if (entry.statements !== finding.statements) {
      problems.push(`CHANGED ${finding.file}: ${finding.statements} relationship message table write(s), manifest says ${entry.statements}. Review the new statement for the sync lock, then update the manifest.`);
    }
    const text = readFileSync(join(root, finding.file), "utf8");
    if (!LOCK_MARKERS.some((marker) => text.includes(marker))) problems.push(`UNLOCKED ${finding.file}: writes relationship message tables but takes no commit-order lock.`);
  }
  const scanned = new Set(findings.map((finding) => finding.file));
  for (const file of Object.keys(manifest)) if (!scanned.has(file)) problems.push(`STALE ${file}: in the manifest but has no relationship message table write any more.`);
  return problems;
}
