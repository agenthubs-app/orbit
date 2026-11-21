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
import { autoMapping } from "../../../contacts/import/parse/mapping";
import type { LiveRecord } from "../../../../shared/storage/live-record-store";
import type { ImportRowOverride } from "./types";
import { duplicateCandidates } from "./duplicates";

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

const EMAIL_CELL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE_CELL = /^\+?[\d\s()-]{7,}$/u;
/** The columns of a pasted list with no header row, in the order a person is usually written: name, company, title. */
const POSITIONAL = ["Name", "Company", "Title"];

/**
 * agent-design AG20b (TRIAGE R12; 设计稿 §3.3 批量导入由代码解析): a pasted list whose first line is not a header (none of its
 * cells is a known column name) is one person per line — name, company, title in that order, a column of e-mail addresses
 * or of phone numbers wherever it stands. The header is written by code; nothing is guessed beyond that. More unnamed
 * columns than that is a format this version cannot read: refused (code's plain sentence), never a card of rows with no name.
 */
export function withHeader(text: string): string {
  const lines = text.split("\n").filter((line) => line.trim());
  const cells = (line: string) => line.split(/[,\t]/u).map((cell) => cell.trim().replace(/^"|"$/gu, ""));
  if (!lines.length || Object.values(autoMapping(cells(lines[0]))).some((value) => value !== null)) return text;
  // AG21b (R27): each line is read on its own — its list marker ("1.", "2)", "・", "-") taken off, each cell typed by its own
  // shape (an e-mail, a phone number), the other cells name, company, title in that order. A placeholder or a bracketed
  // remark where the name stands ("（名字忘了）", "?") is no name: the row is left out as missing_name, never created.
  const rows = lines.map((line) => {
    const out = { Company: "", Email: "", Name: "", Phone: "", Title: "" } as Record<string, string>;
    const rest: string[] = [];
    for (const cell of cells(withoutListMarker(line))) {
      if (EMAIL_CELL.test(cell) && !out.Email) out.Email = cell;
      else if (PHONE_CELL.test(cell) && !out.Phone) out.Phone = cell;
      else rest.push(cell);
    }
    while (rest.length && !rest[rest.length - 1]) rest.pop();
    if (rest.length > POSITIONAL.length) throw new ImportTableRejected("unknown_columns");
    rest.forEach((cell, index) => { out[POSITIONAL[index]] = cell; });
    if (isPlaceholderName(out.Name)) out.Name = "";
    return out;
  });
  const header = ["Name", "Company", "Title", "Email", "Phone"];
  const quoted = (cell: string) => (/[",\n]/u.test(cell) ? `"${cell.replace(/"/gu, '""')}"` : cell);
  return [header.join(","), ...rows.map((row) => header.map((column) => quoted(row[column])).join(","))].join("\n");
}

/** AG21b (R27): a list marker at the start of a pasted line ("1.", "2)", "3、", "①", "・", "-", "*", "•"). */
const LIST_MARKER = /^\s*(?:\d{1,3}\s*[.)、．）:：]|[（(]\s*\d{1,3}\s*[)）]|[①-⑳]|[・•*·\-–—])\s*/u;
export function withoutListMarker(line: string): string {
  return line.replace(LIST_MARKER, "");
}

/** AG21b (R27): words that stand where a name would but are none — a bracketed remark, a question mark, "unknown". */
const PLACEHOLDER = /^(?:[?？]+|[-–—_.…]+|无|不详|未知|不知道|忘了|名字忘了|待定|待补|某某|xx+|n\/?a|unknown|tbd|不明|未定|名前不明)$/iu;
export function isPlaceholderName(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^[（(［\[【〔<＜].*[）)］\]】〕>＞]$/u.test(text)) return true;
  return PLACEHOLDER.test(text);
}

export function previewImport(text: string, existing: readonly LiveRecord<Record<string, unknown>>[], actorId: string, overrides: Readonly<Record<string, ImportRowOverride>> = {}): ImportPreview {
  let parsed;
  try {
    parsed = parseImportFile({ bytes: importBytesOf(withHeader(text)), kind: "csv" });
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
    // AG21c (decision D7): a name one character off at the same company (季朗 / 季明 at 柏舟设计, Lena / Lina at Harbor) is
    // a possible duplicate the user decides on — never merged on its own, never created silently beside it.
    const near = row.fields.displayName && row.fields.organization ? duplicateCandidates(existing, actorId, { displayName: row.fields.displayName, organization: row.fields.organization, ...(row.fields.role ? { role: row.fields.role } : {}) }).find((item) => item.basis === "near") : undefined;
    if (near) return { ...base, decision: "duplicate", match: { id: near.id, name: near.name, organization: near.organization ?? "", role: near.role ?? "" }, outcome: "skip" };
    return { ...base, decision: "create", outcome: "create" };
  });
  // AG20b (R12): a table none of whose rows can be read (every one without a name) is not a card.
  if (rows.length && rows.every((row) => row.reason === "missing_name" || row.reason === "unreadable_row")) throw new ImportTableRejected("no_readable_rows");
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
