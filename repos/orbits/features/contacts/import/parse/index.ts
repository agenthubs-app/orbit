/**
 * W0053：上传文件 → 解析结果（服务端，纯函数）。整份文件不合格时抛 `ContactImportFileRejected`（原因码给 UI 显示）；
 * 单行的问题记在行上，不阻塞其余行。
 */
import { CONTACT_IMPORT_MAX_BYTES, CONTACT_IMPORT_MAX_ROWS } from "../limits";
import type { ContactImportFormat, ContactImportMapping, ParsedImportRow } from "../types";
import { CsvTooManyRecordsError, parseCsv } from "./csv";
import { decodeImportText, type ImportTextEncoding } from "./decode";
import { detectCsvLayout, normalizeCsvRow } from "./mapping";
import { parseVcards, VcardTooManyCardsError } from "./vcard";

export type ContactImportRejectReason = "too_large" | "too_many_rows" | "empty" | "undecodable" | "not_vcard" | "unsupported_type";

export class ContactImportFileRejected extends Error {
  constructor(readonly reason: ContactImportRejectReason, message: string) {
    super(message);
  }
}

export interface ParsedImportFile {
  kind: "csv" | "vcard";
  format: Exclude<ContactImportFormat, "event">;
  encoding: ImportTextEncoding;
  headers: string[];
  mapping: ContactImportMapping | null;
  rows: ParsedImportRow[];
}

/** 说明段与表头的余量：超过「上限 + 余量」条记录时不再往下读。 */
const RECORD_SLACK = 50;

export function parseImportFile(input: { kind: "csv" | "vcard"; bytes: Uint8Array }): ParsedImportFile {
  if (input.bytes.byteLength > CONTACT_IMPORT_MAX_BYTES) {
    throw new ContactImportFileRejected("too_large", `File exceeds ${CONTACT_IMPORT_MAX_BYTES} bytes.`);
  }
  const decoded = decodeImportText(input.bytes);
  if (!decoded) throw new ContactImportFileRejected("undecodable", "File is not UTF-8, UTF-16 or Shift_JIS text.");
  if (!decoded.text.trim()) throw new ContactImportFileRejected("empty", "File is empty.");

  if (input.kind === "vcard") {
    if (!/BEGIN:VCARD/i.test(decoded.text)) throw new ContactImportFileRejected("not_vcard", "File has no vCard entries.");
    let rows: ParsedImportRow[];
    try {
      rows = parseVcards(decoded.text, { maxCards: CONTACT_IMPORT_MAX_ROWS });
    } catch (error) {
      if (error instanceof VcardTooManyCardsError) throw new ContactImportFileRejected("too_many_rows", error.message);
      throw error;
    }
    if (!rows.length) throw new ContactImportFileRejected("empty", "File has no vCard entries.");
    return { encoding: decoded.encoding, format: "vcard", headers: [], kind: "vcard", mapping: null, rows };
  }

  let records: string[][];
  try {
    records = parseCsv(decoded.text, { maxRecords: CONTACT_IMPORT_MAX_ROWS + RECORD_SLACK });
  } catch (error) {
    if (error instanceof CsvTooManyRecordsError) throw new ContactImportFileRejected("too_many_rows", `File has more than ${CONTACT_IMPORT_MAX_ROWS} rows.`);
    throw error;
  }
  const layout = detectCsvLayout(records);
  if (layout.dataRows.length > CONTACT_IMPORT_MAX_ROWS) {
    throw new ContactImportFileRejected("too_many_rows", `File has more than ${CONTACT_IMPORT_MAX_ROWS} rows.`);
  }
  if (!layout.dataRows.length) throw new ContactImportFileRejected("empty", "File has no data rows.");
  return {
    encoding: decoded.encoding,
    format: layout.format,
    headers: layout.headers,
    kind: "csv",
    mapping: layout.mapping,
    rows: layout.dataRows.map((cells) => normalizeCsvRow(cells, layout.mapping)),
  };
}
