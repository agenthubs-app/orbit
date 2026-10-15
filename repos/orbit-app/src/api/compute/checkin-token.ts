/**
 * R17（host/DESIGN.md §2.6「QR v2」、§3.3）：受付 QR 的编码 / 解析。Owner: 甲 (R17).
 * 形式：`orbit-checkin:v2:<eventId b64url>:<participantId b64url>:<exp 秒>:<sig>`。签名（HMAC-SHA256 截断 32 字符的
 * base64url）只在服务端算和验；这里只拼字符串、拆字符串。旧明文 `orbit-checkin:<eventId>:<participantId>` 不再接受。
 */
const PREFIX = "orbit-checkin:v2:";
const B64URL = /^[A-Za-z0-9_-]+$/u;
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function utf8(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    let code = char.codePointAt(0) ?? 0;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else { out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63)); }
  }
  return out;
}

function fromUtf8(bytes: readonly number[]): string | null {
  let out = "";
  for (let index = 0; index < bytes.length;) {
    const byte = bytes[index]!;
    let code: number; let size: number;
    if (byte < 0x80) { code = byte; size = 1; } else if ((byte & 0xe0) === 0xc0) { code = byte & 31; size = 2; } else if ((byte & 0xf0) === 0xe0) { code = byte & 15; size = 3; } else if ((byte & 0xf8) === 0xf0) { code = byte & 7; size = 4; } else return null;
    for (let k = 1; k < size; k += 1) { const next = bytes[index + k]; if (next === undefined || (next & 0xc0) !== 0x80) return null; code = (code << 6) | (next & 63); }
    out += String.fromCodePoint(code);
    index += size;
  }
  return out;
}

export function base64UrlEncode(text: string): string {
  const bytes = utf8(text);
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const n = (bytes[index]! << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    out += CHARS[(n >> 18) & 63]! + CHARS[(n >> 12) & 63]!;
    if (index + 1 < bytes.length) out += CHARS[(n >> 6) & 63]!;
    if (index + 2 < bytes.length) out += CHARS[n & 63]!;
  }
  return out;
}

export function base64UrlDecode(text: string): string | null {
  if (!B64URL.test(text) || text.length % 4 === 1) return null;
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 4) {
    const chunk = text.slice(index, index + 4);
    const values = [...chunk].map((char) => CHARS.indexOf(char));
    const n = ((values[0] ?? 0) << 18) | ((values[1] ?? 0) << 12) | ((values[2] ?? 0) << 6) | (values[3] ?? 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return fromUtf8(bytes);
}

export interface CheckInTokenParts {
  eventId: string;
  participantId: string;
  /** 过期时刻（Unix 秒）。 */
  exp: number;
}

/** 签名要覆盖的原文（服务端拿它算 HMAC）。 */
export function checkInTokenSigningInput(parts: CheckInTokenParts): string {
  return `v2|${parts.eventId}|${parts.participantId}|${parts.exp}`;
}

export function encodeCheckInToken(parts: CheckInTokenParts, signature: string): string {
  return `${PREFIX}${base64UrlEncode(parts.eventId)}:${base64UrlEncode(parts.participantId)}:${parts.exp}:${signature}`;
}

/** 只拆结构，不验签、不看时钟；格式不对（含旧明文）返回 null。 */
export function parseCheckInToken(payload: string): (CheckInTokenParts & { signature: string }) | null {
  const text = payload.trim();
  if (!text.startsWith(PREFIX)) return null;
  const segments = text.slice(PREFIX.length).split(":");
  if (segments.length !== 4) return null;
  const [eventPart, participantPart, expPart, signature] = segments as [string, string, string, string];
  if (!/^\d{1,12}$/u.test(expPart) || !B64URL.test(signature) || signature.length < 16 || signature.length > 64) return null;
  const eventId = base64UrlDecode(eventPart);
  const participantId = base64UrlDecode(participantPart);
  if (!eventId || !participantId) return null;
  return { eventId, exp: Number(expPart), participantId, signature };
}
