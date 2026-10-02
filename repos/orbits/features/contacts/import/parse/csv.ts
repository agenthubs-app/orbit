/**
 * W0053：RFC 4180 CSV 解析（引号、转义引号 ""、字段内换行、CRLF／LF／CR）。完全空白的记录跳过。
 * 超过 `maxRecords` 条记录立即停止并抛错（不读完整份文件）。
 *
 * 结构错误恢复（review P2-2）：引号字段跨过 `MAX_LINES_PER_RECORD` 个物理换行仍未闭合、或到文件末尾仍未闭合时，
 * 这条记录按「只取它的第一物理行、按逗号直接切」记下并标 `malformed`，然后从下一物理行重新开始解析——
 * 坏行不会吞掉后面的正常行。
 */
export class CsvTooManyRecordsError extends Error {
  constructor(readonly limit: number) {
    super(`CSV has more than ${limit} records.`);
  }
}

export type CsvRecord = string[] & { malformed?: true };

/** 一个引号字段里允许的物理换行数（备注里的多行地址、说明足够用）。 */
export const MAX_LINES_PER_RECORD = 20;

function lineEnd(text: string, from: number): { end: number; next: number } {
  let index = from;
  while (index < text.length && text[index] !== "\n" && text[index] !== "\r") index += 1;
  const next = text[index] === "\r" && text[index + 1] === "\n" ? index + 2 : index + 1;
  return { end: index, next };
}

export function parseCsv(text: string, options: { maxRecords: number }): CsvRecord[] {
  const records: CsvRecord[] = [];
  const push = (record: CsvRecord) => {
    if (!record.some((cell) => cell.trim() !== "")) return;
    records.push(record);
    if (records.length > options.maxRecords) throw new CsvTooManyRecordsError(options.maxRecords);
  };

  let index = 0;
  while (index < text.length) {
    const start = index;
    const record: CsvRecord = [];
    let field = "";
    let inQuotes = false;
    let fieldStarted = false;
    let quotedLines = 0;
    let malformed = false;
    let next = text.length;
    let cursor = index;
    for (;;) {
      if (cursor >= text.length) {
        if (inQuotes) malformed = true;
        break;
      }
      const char = text[cursor]!;
      if (inQuotes) {
        if (char === '"') {
          if (text[cursor + 1] === '"') {
            field += '"';
            cursor += 2;
          } else {
            inQuotes = false;
            cursor += 1;
          }
          continue;
        }
        if (char === "\n" || (char === "\r" && text[cursor + 1] !== "\n")) {
          quotedLines += 1;
          if (quotedLines > MAX_LINES_PER_RECORD) {
            malformed = true;
            break;
          }
        }
        field += char;
        cursor += 1;
        continue;
      }
      if (char === '"' && !fieldStarted) {
        inQuotes = true;
        fieldStarted = true;
        cursor += 1;
        continue;
      }
      if (char === ",") {
        record.push(field);
        field = "";
        fieldStarted = false;
        cursor += 1;
        continue;
      }
      if (char === "\r" || char === "\n") {
        next = char === "\r" && text[cursor + 1] === "\n" ? cursor + 2 : cursor + 1;
        break;
      }
      field += char;
      fieldStarted = true;
      cursor += 1;
    }
    if (malformed) {
      const line = lineEnd(text, start);
      const raw = text.slice(start, line.end).split(",").map((cell) => cell.replace(/^\s*"|"\s*$/g, "")) as CsvRecord;
      raw.malformed = true;
      push(raw);
      index = line.next;
      continue;
    }
    record.push(field);
    push(record);
    index = next;
  }
  return records;
}
