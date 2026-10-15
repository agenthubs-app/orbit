/**
 * R17（host/DESIGN.md §2.2 第 3 条、§3.3）：主办方新建活动的参加コード与共同運営の招待コード。Owner: 甲 (R17).
 * 字母表与 R15 招待コード同一套（`INVITE_CODE_ALPHABET`），显示 `XXXX-XXXX`；招待コード前缀 `H-` 与参加コード区分。
 * 规范化只用在**新码**上：旧码与 R27 mock 码（`CFO18NGT` 等）不经过这里，照原样走 alias 查询。
 * 纯函数：随机数由调用方传入（服务端用 crypto）。
 */
import { INVITE_CODE_ALPHABET, normalizeInviteCode } from "./invite-code-format";

export const PARTICIPATION_CODE_LENGTH = 8;
export const COHOST_CODE_PREFIX = "H-";

/** 从 8 个随机字节造一个码（取模偏差在 30 个字符上可以忽略；唯一性由 alias 主键兜底，冲突重试）。 */
export function participationCodeFromBytes(bytes: ArrayLike<number>): string {
  if (bytes.length < PARTICIPATION_CODE_LENGTH) throw new Error("participation code needs 8 random bytes");
  let code = "";
  for (let index = 0; index < PARTICIPATION_CODE_LENGTH; index += 1) code += INVITE_CODE_ALPHABET[(bytes[index] ?? 0) % INVITE_CODE_ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** 用户输入的新码 → `XXXX-XXXX`；不是 8 位字母表码时 null（旧码不走这里）。 */
export function normalizeParticipationCode(input: string): string | null {
  const normalized = normalizeInviteCode(input);
  return normalized === null ? null : `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function cohostCodeFromBytes(bytes: ArrayLike<number>): string {
  return `${COHOST_CODE_PREFIX}${participationCodeFromBytes(bytes)}`;
}

/** `H-XXXX-XXXX`（大小写、空白、少打连字符都接受）→ 规范形式；否则 null。 */
export function normalizeCohostCode(input: string): string | null {
  const trimmed = input.normalize("NFKC").trim().toUpperCase();
  if (!trimmed.startsWith("H")) return null;
  const rest = normalizeParticipationCode(trimmed.replace(/^H[\s\-‐‑‒–—―−ー]*/u, ""));
  return rest === null ? null : `${COHOST_CODE_PREFIX}${rest}`;
}
