/**
 * W0053：上传文件的文字解码。依次试：UTF-8（带或不带 BOM，严格模式）→ UTF-16LE／BE（必须有 BOM）→ Shift_JIS。
 * 都失败时返回 null（整份文件按无法读取拒绝）。
 */
export type ImportTextEncoding = "utf-8" | "utf-16le" | "utf-16be" | "shift_jis";

export interface DecodedImportText {
  encoding: ImportTextEncoding;
  text: string;
}

function tryDecode(label: string, bytes: Uint8Array): string | null {
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function decodeImportText(bytes: Uint8Array): DecodedImportText | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = tryDecode("utf-16le", bytes.subarray(2));
    return text === null ? null : { encoding: "utf-16le", text };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = tryDecode("utf-16be", bytes.subarray(2));
    return text === null ? null : { encoding: "utf-16be", text };
  }
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const utf8 = tryDecode("utf-8", hasUtf8Bom ? bytes.subarray(3) : bytes);
  if (utf8 !== null) return { encoding: "utf-8", text: utf8 };
  const sjis = tryDecode("shift_jis", bytes);
  if (sjis !== null) return { encoding: "shift_jis", text: sjis };
  return null;
}

/** vCard 2.1 的 CHARSET 参数：只认常见标签，不认识的按 UTF-8。 */
export function decodeWithCharset(bytes: Uint8Array, charset: string | undefined): string | null {
  const label = (charset ?? "utf-8").trim().toLowerCase();
  const normalized = label === "sjis" || label === "shift-jis" || label === "x-sjis" || label === "ms932" || label === "windows-31j" ? "shift_jis" : label;
  try {
    return new TextDecoder(normalized, { fatal: true }).decode(bytes);
  } catch {
    return tryDecode("utf-8", bytes);
  }
}
