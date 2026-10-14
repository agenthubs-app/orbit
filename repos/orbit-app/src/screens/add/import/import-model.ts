/**
 * R16 import (DESIGN §2.7, b9 A2 ④ / A3 ③ ④; same as the Web orbit-2026/add/import/import-model.ts): pure helpers over the rows `/api/contacts/import/[id]/rows`
 * returns — how a batch splits into まとめて確認 (自動で統合 / 重複 / 要確認 / そのまま追加), what the
 * 列の対応 table shows per column, and which decisions 「N人を人脈に追加」 sends. No I/O.
 *
 * Duplicates: checked = 統合 (merge). A candidate whose company differs while the name is the same is
 * probably a job change (転職？): unchecked by default and never merged automatically (DESIGN §2.7).
 */
import type {
  ContactImportBatchView,
  ContactImportDecision,
  ContactImportFormat,
  ContactImportMappableField,
  ContactImportMapping,
  ContactImportMergeConfirmation,
  ContactImportParseIssue,
  ContactImportRowView,
} from "../../../api/contract/contact-import";

export type ImportSource = "linkedin" | "csv" | "vcard" | "event";

export function importSourceOf(format: ContactImportFormat): ImportSource {
  return format === "linkedin" ? "linkedin" : format === "vcard" ? "vcard" : format === "event" ? "event" : "csv";
}

const BLOCKING: readonly ContactImportParseIssue[] = ["missing_name", "decode_failed", "malformed_row"];

export function isBlocked(row: Pick<ContactImportRowView, "issues">): boolean {
  return row.issues.some((issue) => BLOCKING.includes(issue));
}

/** 要確認 groups, in the order they are listed. */
export type ImportIssueGroup = "email" | "truncated" | "country" | "inFile" | "blocked";
export const IMPORT_ISSUE_GROUPS: readonly ImportIssueGroup[] = ["email", "truncated", "country", "inFile", "blocked"];

export function issueGroupOf(row: ContactImportRowView): ImportIssueGroup | null {
  if (isBlocked(row)) return "blocked";
  if (row.inFileDuplicateOf !== null) return "inFile";
  if (row.issues.includes("invalid_email")) return "email";
  if (row.issues.includes("field_truncated")) return "truncated";
  if (row.issues.includes("unknown_country")) return "country";
  return null;
}

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/** Same name, different company: probably moved (転職？). */
export function isProbablyMoved(row: ContactImportRowView): boolean {
  const candidate = row.candidate;
  if (!candidate) return false;
  const a = candidate.organization.trim();
  const b = row.fields.organization.trim();
  return Boolean(a && b && normalized(a) !== normalized(b) && normalized(candidate.displayName) === normalized(row.fields.displayName));
}

/** Which fields read differently from the person already in 人脈 (違い column). */
export function differingFields(row: ContactImportRowView): ("displayName" | "organization" | "role")[] {
  const candidate = row.candidate;
  if (!candidate) return [];
  return (["displayName", "organization", "role"] as const).filter((field) => {
    const a = candidate[field].trim();
    const b = row.fields[field].trim();
    return a && b && normalized(a) !== normalized(b);
  });
}

export interface ImportReviewSplit {
  total: number;
  /** Identical to someone in 人脈 — merged without asking (the server pre-selects merge). */
  autoMerged: ContactImportRowView[];
  /** A candidate that is not identical: 統合 or 別人 is the person's call. */
  duplicates: ContactImportRowView[];
  groups: { group: ImportIssueGroup; rows: ContactImportRowView[] }[];
  /** Everything else that goes in as it is. */
  asIs: ContactImportRowView[];
}

/**
 * Already in 人脈 without a candidate card: an イベントから batch marks the people you swapped cards with
 * as `decision: "merge"` with `mergeIntoContactId` (service importEvent) — they merge, they never get created again.
 */
export function mergesIntoExisting(row: ContactImportRowView): boolean {
  return Boolean(row.candidate?.identical) || (!row.candidate && row.decision === "merge" && Boolean(row.mergeIntoContactId));
}

/** What the server already left out (skip) at upload or on the previous step (イベントから: not ticked). */
export function serverSkipped(rows: readonly ContactImportRowView[]): Set<number> {
  return new Set(rows.filter((row) => row.status === "pending" && row.decision === "skip").map((row) => row.seq));
}

/** Rows that are already committed (status ≠ pending) are left out: the page is about what is still to add. */
export function splitImportRows(rows: readonly ContactImportRowView[]): ImportReviewSplit {
  const pending = rows.filter((row) => row.status === "pending");
  const autoMerged: ContactImportRowView[] = [];
  const duplicates: ContactImportRowView[] = [];
  const asIs: ContactImportRowView[] = [];
  const byGroup = new Map<ImportIssueGroup, ContactImportRowView[]>();
  for (const row of pending) {
    const group = issueGroupOf(row);
    if (group === "blocked" || group === "inFile") { byGroup.set(group, [...(byGroup.get(group) ?? []), row]); continue; }
    if (mergesIntoExisting(row)) { autoMerged.push(row); continue; }
    if (row.candidate) { duplicates.push(row); continue; }
    if (group) { byGroup.set(group, [...(byGroup.get(group) ?? []), row]); continue; }
    asIs.push(row);
  }
  const groups = IMPORT_ISSUE_GROUPS.flatMap((group) => (byGroup.get(group)?.length ? [{ group, rows: byGroup.get(group)! }] : []));
  return { total: pending.length, autoMerged, duplicates, groups, asIs };
}

/** The default tick per duplicate: 統合 unless it looks like a job change. */
export function defaultMergeChoice(rows: readonly ContactImportRowView[]): Record<number, boolean> {
  return Object.fromEntries(rows.map((row) => [row.seq, row.decision === "merge" ? true : row.decision === "create" ? false : !isProbablyMoved(row)]));
}

/** Rows that cannot or will not go in (読み取れない行 / 同じファイル内 / 取り込まない). */
function leftOut(row: ContactImportRowView, skipped: ReadonlySet<number>): boolean {
  return isBlocked(row) || row.inFileDuplicateOf !== null || skipped.has(row.seq);
}

/** 「N人を人脈に追加」: every pending row except the auto-merged and the left out. */
export function addCount(split: ImportReviewSplit, skipped: ReadonlySet<number> = new Set()): number {
  const rows = [...split.duplicates, ...split.asIs, ...split.groups.flatMap((entry) => entry.rows)];
  return rows.filter((row) => !leftOut(row, skipped)).length;
}

/** 例外 = what まとめて確認 counts: every 重複 (auto-merged included, as its tile) plus every 要確認 row. */
export function exceptionCount(split: ImportReviewSplit): number {
  return split.autoMerged.length + split.duplicates.length + split.groups.reduce((sum, entry) => sum + entry.rows.length, 0);
}

export interface ImportCommitPlan {
  decisions: { seq: number; decision: ContactImportDecision }[];
  /** Every merge, confirmed one by one (the server refuses a commit without them: MERGE_NOT_CONFIRMED). */
  mergeConfirmations: ContactImportMergeConfirmation[];
}

/**
 * 「N人を人脈に追加」: duplicates follow the tick (merge / create), auto-merged stay merged, left-out
 * rows are skipped, the rest are created. Only decisions that differ from the row's current one are sent.
 * `skipped` must start from `serverSkipped(rows)` so a person left out earlier is not created again.
 */
export function commitPlan(rows: readonly ContactImportRowView[], mergeChoice: Readonly<Record<number, boolean>>, skipped: ReadonlySet<number> = new Set()): ImportCommitPlan {
  const decisions: ImportCommitPlan["decisions"] = [];
  const mergeConfirmations: ContactImportMergeConfirmation[] = [];
  for (const row of rows) {
    if (row.status !== "pending") continue;
    let decision: ContactImportDecision;
    if (leftOut(row, skipped)) decision = "skip";
    else if (mergesIntoExisting(row)) decision = "merge";
    else if (row.candidate) decision = mergeChoice[row.seq] ? "merge" : "create";
    else decision = "create";
    if (decision !== row.decision) decisions.push({ seq: row.seq, decision });
    const target = row.candidate?.contactId ?? row.mergeIntoContactId;
    if (decision === "merge" && target) mergeConfirmations.push({ seq: row.seq, contactId: target });
  }
  return { decisions, mergeConfirmations };
}

/** The order of 列の対応 rows follows the file's own columns. */
export interface MappingColumn {
  index: number;
  header: string;
  field: ContactImportMappableField | null;
}

export function mappingColumns(batch: Pick<ContactImportBatchView, "headers" | "mapping">): MappingColumn[] {
  const mapping = batch.mapping;
  return batch.headers.map((header, index) => {
    const field = mapping ? (Object.entries(mapping).find(([, column]) => column === index)?.[0] as ContactImportMappableField | undefined) ?? null : null;
    return { index, header, field };
  });
}

/** Points `field` at `column` (null = 使わない); a column maps to at most one field. */
export function remap(mapping: ContactImportMapping, column: number, field: ContactImportMappableField | null): ContactImportMapping {
  const next = { ...mapping };
  for (const key of Object.keys(next) as ContactImportMappableField[]) if (next[key] === column) next[key] = null;
  if (field) next[field] = column;
  return next;
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

/**
 * 名 / 姓 back out of the display name the server joined (features/contacts/import/parse/mapping.ts
 * joinName: CJK = 姓 名, otherwise First Last) — the 1行目の例 of the two columns.
 */
export function splitDisplayName(displayName: string): { first: string; last: string } {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return { first: displayName.trim(), last: "" };
  const [head, ...rest] = parts;
  return CJK.test(displayName) ? { last: head!, first: rest.join(" ") } : { first: head!, last: rest.join(" ") };
}

/** Which row-view field carries a mapped column (名 / 姓 land in the display name). */
const FIELD_VALUE: Record<ContactImportMappableField, (row: ContactImportRowView) => string> = {
  name: (row) => row.fields.displayName,
  firstName: (row) => splitDisplayName(row.fields.displayName).first,
  lastName: (row) => splitDisplayName(row.fields.displayName).last,
  organization: (row) => row.fields.organization,
  role: (row) => row.fields.role,
  email: (row) => row.fields.email,
  phone: (row) => row.fields.phone,
  location: (row) => row.fields.location,
  country: (row) => row.fields.countryCode ?? "",
  linkedinUrl: (row) => row.fields.linkedinUrl,
  connectedOn: (row) => row.fields.connectedOn,
  notes: (row) => row.fields.notes,
};

/** How many rows have this field filled; under a fifth is ほぼ空 (LinkedIn email). */
export function fieldFill(rows: readonly ContactImportRowView[], field: ContactImportMappableField): { filled: number; total: number; sparse: boolean } {
  const total = rows.length;
  const filled = rows.filter((row) => FIELD_VALUE[field](row).trim()).length;
  return { filled, total, sparse: total > 0 && filled / total < 0.2 };
}

export function fieldExample(row: ContactImportRowView | undefined, field: ContactImportMappableField): string {
  return row ? FIELD_VALUE[field](row) : "";
}

/** File size the way the board writes it (48 KB). */
export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
