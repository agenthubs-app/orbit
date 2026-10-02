/**
 * W0053：RFC 4180 CSV 解析（引号、转义引号 ""、字段内换行、CRLF／LF／CR）。完全空白的记录跳过。
 * 超过 `maxRecords` 条记录立即停止并抛错（不读完整份文件）。
 */
export class CsvTooManyRecordsError extends Error {
  constructor(readonly limit: number) {
    super(`CSV has more than ${limit} records.`);
  }
}

export function parseCsv(text: string, options: { maxRecords: number }): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const pushRecord = () => {
    record.push(field);
    field = "";
    fieldStarted = false;
    if (record.some((cell) => cell.trim() !== "")) {
      records.push(record);
      if (records.length > options.maxRecords) throw new CsvTooManyRecordsError(options.maxRecords);
    }
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      continue;
    }
    if (char === ",") {
      record.push(field);
      field = "";
      fieldStarted = false;
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      pushRecord();
      continue;
    }
    field += char;
    fieldStarted = true;
  }
  if (field !== "" || record.length > 0) pushRecord();
  return records;
}
