/**
 * R15（DESIGN add-and-invite §2.4、§2.5 第 2 / 7 条、§3.2、§9 #15）：招待コード的字母表、规范化、显示格式、
 * 手输提示与回跳白名单，两端共用。Owner: 甲 (R15). Used by: 服务端发码 / 预览 / 兑换（规范化后查库）、
 * 发出方的码显示、接收方 `/i` 手输框、注册 / 登录回跳白名单（`normalizeOrbitAuthReturnPath` 的 `/i/` 分支）。
 *
 * 码 8 位，字母表去掉易混的 0 / O / 1 / I / L / U，不含姓名（对标 Zoom 会议号、Slack 邀请码）；库里存去掉连字符的
 * 8 位规范形式，界面显示 `XXXX-XXXX`。比契约里 R08 的旧正则 `/^[A-Z0-9]{4}-[A-Z0-9]{4}$/` 更严（旧正则不改）。
 * 纯函数，不碰 IO 与时钟。
 */
import type { InviteSharedFieldKey } from "../contract/invite-codes";

export const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const INVITE_CODE_LENGTH = 8;

/** 共享项目键（名字总是共享，不在里面），按界面开关的顺序。 */
export const INVITE_SHARED_FIELD_KEYS: readonly InviteSharedFieldKey[] = ["organization", "offering", "seeking", "email", "phone"];
/** 默认打开的项目：会社・役職 / 提供できること / 求めていること；連絡先（邮箱、电话）默认关（DESIGN §2.4、§2.5 第 4 条）。 */
export const INVITE_DEFAULT_SHARED_KEYS: readonly InviteSharedFieldKey[] = ["organization", "offering", "seeking"];

const ALPHABET_SET = new Set(INVITE_CODE_ALPHABET);
/** 用户可能打进来的分隔：空白、各种连字符 / 破折号、日文输入法的长音符。NFKC 之后全角连字符已是「-」。 */
const SEPARATORS = /[\s\-‐‑‒–—―−ー]+/gu;

function stripCode(input: string): string {
  return input.normalize("NFKC").replace(SEPARATORS, "").toUpperCase();
}

/** 大写、去掉空白与连字符；正好 8 位且全在字母表里才返回规范形式（不带连字符），否则 null。 */
export function normalizeInviteCode(input: string): string | null {
  const stripped = stripCode(input);
  if (stripped.length !== INVITE_CODE_LENGTH) return null;
  for (const char of stripped) if (!ALPHABET_SET.has(char)) return null;
  return stripped;
}

/** 显示格式 `XXXX-XXXX`；不是有效的码时 null。 */
export function formatInviteCode(code: string): string | null {
  const normalized = normalizeInviteCode(code);
  return normalized === null ? null : `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

/** 手输框边打边整理：大写、去空白、第 5 位前自动补连字符、超出 8 位截掉；字母表外的字符原样保留（由 `inviteCodeInputHint` 提示）。 */
export function formatInviteCodeInput(input: string): string {
  const stripped = stripCode(input).slice(0, INVITE_CODE_LENGTH);
  return stripped.length > 4 ? `${stripped.slice(0, 4)}-${stripped.slice(4)}` : stripped;
}

export type InviteCodeInputHint = "ok" | "too_short" | "too_long" | "invalid_char";

/** 手输框的提示：字母表外的字符优先（「使えない文字が含まれています」），再看长度。 */
export function inviteCodeInputHint(input: string): InviteCodeInputHint {
  const stripped = stripCode(input);
  for (const char of stripped) if (!ALPHABET_SET.has(char)) return "invalid_char";
  if (stripped.length < INVITE_CODE_LENGTH) return "too_short";
  if (stripped.length > INVITE_CODE_LENGTH) return "too_long";
  return "ok";
}

/** 只认 `/i` 或 `/i/<码>`（码是规范的大写形式，可带或不带中间的连字符）；不带查询、片段、结尾斜杠。给回跳白名单用。 */
const INVITE_PATH = /^\/i(?:\/[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-?[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4})?$/u;

export function isInviteCodePath(path: string): boolean {
  return path.length <= 16 && INVITE_PATH.test(path);
}
