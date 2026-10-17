/**
 * R11a（PLANNER 契约 1，代定 1 / 11 / 12）：人脈的「出どころ」标签与「出会った場所」分类，两端共用。
 * Owner: 乙 (R11a). Used by: 人脈列表 SQL 的同口径（`features/contacts/storage/contact-list-postgres-reader.ts`）、
 * 每天一问（`features/contacts/completion/service.ts`）、App 本机旧镜像兜底（`src/view-models/contacts-local.ts`）。
 *
 * 出どころ（`contactSourceChip`）：
 *   - 招待で本人が入力（生效的招待连接）→ `self`（不落库，读时合并）；
 *   - 名刺スキャン / QR → `meishi`；
 *   - 导入：按导入写下的 `format` 判断——`linkedin` → `linkedin`、`vcard` → `phone`、`event` → `event`、
 *     汎用 CSV（`generic`）→ `manual`（§B-1-3：汎用 CSV 算手入力）；
 *   - 活动名单导入（`event_import`）→ `event`；
 *   - 没有 `format` 的旧导入（`external_contacts`）：保留旧推断——标签含 vCard → `phone`，备注有「LinkedIn:」行 → `linkedin`；
 *   - 其余 → `manual`。
 *
 * 出会った場所（`contactMetKind`），按顺序取第一个命中的：
 *   1. 活动导入或有 `metEventId` → `event`（イベント）；
 *   2. 招待连接、来源 `referral`、或「出会い：紹介…」 → `referral`（紹介）；
 *   3. 「出会い：…」里写着商談 / 訪問一类 → `visit`（訪問・商談）；
 *   4. 其余 → `other`（その他）。
 * SQL 侧（列表 / 汇总 / 同步）用同一组规则，`tests/services/contact-network-list-postgres.test.ts` 对照两边结果。
 */

export const CONTACT_SOURCE_CHIPS = ["meishi", "linkedin", "phone", "manual", "self", "event"] as const;
export type ContactSourceChip = (typeof CONTACT_SOURCE_CHIPS)[number];

export const CONTACT_IMPORT_FORMATS = ["linkedin", "generic", "vcard", "event"] as const;
export type ContactImportFormatValue = (typeof CONTACT_IMPORT_FORMATS)[number];

export const CONTACT_MET_KINDS = ["event", "referral", "visit", "other"] as const;
export type ContactMetKind = (typeof CONTACT_MET_KINDS)[number];

export interface ContactSourceChipInput {
  sourceType: string;
  /** 导入写下的格式（新导入才有）。 */
  format?: string | null;
  sourceLabel?: string | null;
  /** 备注里有「LinkedIn: …」一行（旧导入兜底用）。 */
  hasLinkedinNote?: boolean;
  /** 生效的招待连接（读时合并）。 */
  inviteLinked?: boolean;
}

export function contactSourceChip(input: ContactSourceChipInput): ContactSourceChip {
  if (input.inviteLinked) return "self";
  if (input.sourceType === "business_card_ocr" || input.sourceType === "qr_scan") return "meishi";
  switch (input.format) {
    case "linkedin": return "linkedin";
    case "vcard": return "phone";
    case "event": return "event";
    case "generic": return "manual";
    default: break;
  }
  if (input.sourceType === "event_import") return "event";
  if (input.sourceType === "external_contacts") {
    if (/vcard/iu.test(input.sourceLabel ?? "")) return "phone";
    if (input.hasLinkedinNote) return "linkedin";
  }
  return "manual";
}

/** 「出会い：…」一行（全角或半角冒号）后面的文字；没有这一行返回 null。 */
export function meetingNoteValue(notes: string | null | undefined): string | null {
  if (typeof notes !== "string") return null;
  for (const line of notes.split(/\r?\n/u)) {
    const match = /^[\s　]*出会い[\s　]*[：:](.*)$/u.exec(line);
    if (match) return match[1]!.trim();
  }
  return null;
}

/** 「出会い：紹介…」。SQL：`~ '^[[:space:]　]*紹介'`。 */
export const MET_REFERRAL_PATTERN = /^[\s　]*紹介/u;
/** 「出会い」里表示訪問 / 商談的词（日中英）。SQL 用同一组词（`~*`）。 */
export const MET_VISIT_WORDS = ["商談", "訪問", "打ち合わせ", "打合せ", "面談", "商谈", "拜访", "visit", "meeting"] as const;

export interface ContactMetKindInput {
  sourceType: string;
  metEventId?: string | null;
  inviteLinked?: boolean;
  /** 「出会い：…」后面的文字（`meetingNoteValue`）。 */
  meetingNote?: string | null;
}

export function contactMetKind(input: ContactMetKindInput): ContactMetKind {
  if (input.sourceType === "event_import" || (typeof input.metEventId === "string" && input.metEventId.trim() !== "")) return "event";
  const note = input.meetingNote ?? null;
  if (input.inviteLinked || input.sourceType === "referral" || (note !== null && MET_REFERRAL_PATTERN.test(note))) return "referral";
  if (note !== null) {
    const lowered = note.toLowerCase();
    if (MET_VISIT_WORDS.some((word) => lowered.includes(word))) return "visit";
  }
  return "other";
}
