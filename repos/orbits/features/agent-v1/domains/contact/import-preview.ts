/**
 * agent-design AG12-4 (设计稿 §4「导入时列出新增、疑似重复与跳过的行」, §5.2; PLANNER 易错边界 7): the import card's rows,
 * worked out in memory by the import's own code — `parseImportFile` and `reviewImportRows` over the account's contacts —
 * so preparing the card writes nothing (the import service's `upload` writes a batch; it runs only after the click).
 * Parsing is code: the number of model calls does not grow with the rows.
 *
 * A row is new, a possible duplicate, or left out with its reason. A possible duplicate is never merged and, unless the
 * user says to create it anyway, left out when the card is confirmed. The user's word on a row ("第一行也新建") is an
 * override; the card is frozen again with it.
 */
import { ContactImportFileRejected, parseImportFile } from "../../../contacts/import/parse";
import { reviewImportRows } from "../../../contacts/import/dedupe";
import { isBlockingRow } from "../../../contacts/import/types";
import type { LiveRecord } from "../../../../shared/storage/live-record-store";
import type { ImportRowOverride } from "./types";

export type ImportRowClass = "create" | "duplicate" | "skip";
export type ImportSkipReason = "missing_name" | "unreadable_row" | "in_file_duplicate" | "user_skip";

export interface ImportPreviewRow {
  /** 1-based, header not counted (the import batch's seq). */
  row: number;
  name: string;
  organization: string;
  role: string;
  decision: ImportRowClass;
  reason?: ImportSkipReason;
  /** The earlier row this one repeats (in_file_duplicate). */
  repeats?: number;
  /** The existing contact a possible duplicate may be (no contact methods). */
  match?: { id: string; name: string; organization: string; role: string };
  /** What confirming does with the row: a duplicate the user did not decide on is left out. */
  outcome: "create" | "skip";
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  counts: { create: number; duplicate: number; skip: number };
}

/** The pasted table in a message: the lines from the first line with a separator on, while they keep one. */
export function importTableOf(message: string): string | null {
  const lines = message.split(/\r?\n/u);
  const start = lines.findIndex((line) => /[,\t，]/u.test(line) && line.split(/[,\t，]/u).length >= 2);
  if (start < 0) return null;
  const table: string[] = [];
  for (const line of lines.slice(start)) {
    if (!line.trim()) break;
    if (!/[,\t，]/u.test(line)) break;
    table.push(line.replace(/，/gu, ","));
  }
  return table.length >= 2 ? table.join("\n") : null;
}

export function importBytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export class ImportTableRejected extends Error {}

export function previewImport(text: string, existing: readonly LiveRecord<Record<string, unknown>>[], actorId: string, overrides: Readonly<Record<string, ImportRowOverride>> = {}): ImportPreview {
  let parsed;
  try {
    parsed = parseImportFile({ bytes: importBytesOf(text), kind: "csv" });
  } catch (error) {
    if (error instanceof ContactImportFileRejected) throw new ImportTableRejected(error.reason);
    throw error;
  }
  const reviewed = reviewImportRows(parsed.rows.map((row, index) => ({ fields: row.fields, issues: row.issues, seq: index + 1 })), existing, actorId);
  const rows = reviewed.map((row): ImportPreviewRow => {
    const base = { name: row.fields.displayName, organization: row.fields.organization, role: row.fields.role, row: row.seq };
    const blocking = isBlockingRow(row.issues);
    if (blocking) return { ...base, decision: "skip", outcome: "skip", reason: row.issues.includes("missing_name") ? "missing_name" : "unreadable_row" };
    const override = overrides[String(row.seq)];
    if (override === "skip") return { ...base, decision: "skip", outcome: "skip", reason: "user_skip" };
    if (override === "create") return { ...base, decision: "create", outcome: "create" };
    if (row.inFileDuplicateOf !== null) return { ...base, decision: "skip", outcome: "skip", reason: "in_file_duplicate", repeats: row.inFileDuplicateOf };
    if (row.candidate) return { ...base, decision: "duplicate", match: { id: row.candidate.contactId, name: row.candidate.displayName, organization: row.candidate.organization, role: row.candidate.role }, outcome: "skip" };
    return { ...base, decision: "create", outcome: "create" };
  });
  return { counts: { create: rows.filter((row) => row.decision === "create").length, duplicate: rows.filter((row) => row.decision === "duplicate").length, skip: rows.filter((row) => row.decision === "skip").length }, rows };
}

const ORDINALS: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5 };
const ROW = /(?:第\s*([一二两三四五六七八九十\d]+)\s*(?:行|条|个)|([一二三四五六七八九十\d]+)\s*行目|\brow\s*(\d+)\b|\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+row\b|\bline\s*(\d+)\b)/giu;
const CREATE_WORDS = /(新建|新增|也建|也加|另建|创建|不是同一个人|不是同一人|别的人|新規|追加|作成|別人|別の人|\bcreate\b|\badd\b|\bnew contact\b|different person|not the same)/iu;
const SKIP_WORDS = /(跳过|不要导入|不导入|别导入|不用加|スキップ|除外|取り込まない|\bskip\b|leave (?:it|that|them) out|don'?t import)/iu;

/**
 * The user's word on rows of the import card ("第一行的王强不是同一个人，也新建", "Create row 1 too", "1行目も新規で"):
 * the row numbers it names and the decision, by code. Null when the words name no row or no decision.
 */
export function rowOverridesIn(message: string): Record<string, ImportRowOverride> | null {
  const rows = new Set<number>();
  for (const match of message.matchAll(ROW)) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "").toLowerCase();
    const value = /^\d+$/u.test(raw) ? Number(raw) : ORDINALS[raw] ?? null;
    if (value && value >= 1) rows.add(value);
  }
  if (!rows.size) return null;
  const decision: ImportRowOverride | null = SKIP_WORDS.test(message) ? "skip" : CREATE_WORDS.test(message) ? "create" : null;
  if (!decision) return null;
  return Object.fromEntries([...rows].map((row) => [String(row), decision]));
}
