/**
 * W0053 review P2-1：上传流上的记录计数。请求体边读边数，完整记录数超过上限就让调用方立即取消读取，
 * 不等整份正文读完（5 MB 字节上限之外的第二道早停）。
 *
 * - CSV：在引号外遇到换行即一条记录结束；只有空白／逗号的行不计（与 parseCsv 跳过空记录一致）。
 *   UTF-8 与 Shift_JIS 里引号 0x22 与换行 0x0A／0x0D 不会出现在多字节字符内部，可以直接按字节数；
 *   带 BOM 的 UTF-16 用流式解码后按字符数。上限 = 数据行上限 + 表头 + LinkedIn 说明段 2 条。
 * - vCard：数 `END:VCARD`（不分大小写）。
 * 结构损坏（引号未闭合）时计数会偏少，只会更晚停止；解析阶段仍按 2,000 行拒绝。
 */
import { CONTACT_IMPORT_MAX_ROWS } from "../limits";

export const CSV_STREAM_RECORD_LIMIT = CONTACT_IMPORT_MAX_ROWS + 3;
export const VCARD_STREAM_RECORD_LIMIT = CONTACT_IMPORT_MAX_ROWS;

export interface StreamingRecordCounter {
  /** 喂入一块原始字节，返回目前已完整的记录数。 */
  feed(chunk: Uint8Array): number;
  readonly limit: number;
}

const END_VCARD = "END:VCARD";

export function createStreamingRecordCounter(kind: "csv" | "vcard"): StreamingRecordCounter {
  let started = false;
  let utf16: TextDecoder | null = null;
  let count = 0;
  // CSV 状态
  let inQuotes = false;
  let lineHasContent = false;
  // vCard 状态：最近 9 个字符（大写）
  let tail = "";

  const consumeCode = (code: number) => {
    if (kind === "vcard") {
      tail = (tail + String.fromCharCode(code).toUpperCase()).slice(-END_VCARD.length);
      if (tail === END_VCARD) count += 1;
      return;
    }
    if (code === 0x22) {
      inQuotes = !inQuotes;
      lineHasContent = true;
      return;
    }
    if (!inQuotes && (code === 0x0a || code === 0x0d)) {
      if (lineHasContent) count += 1;
      lineHasContent = false;
      return;
    }
    if (code !== 0x20 && code !== 0x09 && code !== 0x2c && code !== 0xfeff) lineHasContent = true;
  };

  return {
    feed(chunk) {
      let bytes = chunk;
      if (!started && bytes.length >= 2) {
        started = true;
        if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
          utf16 = new TextDecoder(bytes[0] === 0xff ? "utf-16le" : "utf-16be");
          bytes = bytes.subarray(2);
        }
      }
      if (utf16) {
        const text = utf16.decode(bytes, { stream: true });
        for (let index = 0; index < text.length; index += 1) consumeCode(text.charCodeAt(index));
      } else {
        for (const byte of bytes) consumeCode(byte);
      }
      return count;
    },
    limit: kind === "csv" ? CSV_STREAM_RECORD_LIMIT : VCARD_STREAM_RECORD_LIMIT,
  };
}
