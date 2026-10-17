/**
 * R17-11：名簿取り込みの招待リンク `…/e/<slug>?inv=<code>`（b12 #476「このイベント専用」）的招待码。
 * 每场活动一个、可重复算出的 4 位码（不混淆 0/O、1/I），只用来标明「从招待链接来」；不是凭证，不做鉴权。
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** FNV-1a（32 位）→ 4 位码。 */
export function hostInviteCode(eventId: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < eventId.length; index += 1) {
    hash ^= eventId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += ALPHABET[hash % 32];
    hash = Math.floor(hash / 32);
  }
  return code;
}

/** 招待码的格式（`/e/<slug>?inv=` 透传时校验，不合格就丢掉）。 */
export const HOST_INVITE_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{4}$/u;

/** 名簿照合前邮箱的规范化（与账号邮箱 `normalizeAuthEmail` 同：trim + 小写）。 */
export function normalizeRosterEmail(email: string): string {
  return email.trim().toLowerCase();
}
