/**
 * R26 参加者 → 计划人物类型（events DESIGN §3.5 映射表第一行）：全部规则，不调 AI。
 *
 * - 登壇者 / 报名者的职位、公司按关键词表对到计划人物类型（模板槽位的固定表 + 类型短名本身）。
 * - 展示社数：标题 / 议程里出现某类型的关键词时，按「每社 1 人」算到这一类（「製造業 DX 責任者（展示 12社）」）。
 * - 外部活动（登壇 / 展示推定）一律 `attendeeSource: 'speakers'`（有登壇者）或 `'organizer'`（只有说明）；没有任何信息为 `'none'`。
 * - 预计到场人数只来自事实：登壇者按人数、展示社按社数、报名者按人数；没有就不加（不编数字）。
 */
import type { EventAttendeeSource } from "./event-score";
import { lowerText } from "./compute-text";

export interface AttendeeTypingType {
  key: string;
  shortLabel: string;
  /** 「シリーズA のリードを取れる VC のパートナー」之类；用于补充关键词。 */
  roleSituation?: string | null;
}

export interface AttendeePerson {
  name?: string | null;
  org?: string | null;
  role?: string | null;
}

export interface AttendeeTypingResult {
  expected: Record<string, number>;
  attendeeSource: EventAttendeeSource;
  /** 每类的来源人数（「登壇 3名」「展示 12社」「申込 5名」），说明用。 */
  breakdown: Record<string, { speakers: number; exhibitors: number; registrants: number; sampleOrgs: string[] }>;
}

/** 模板槽位 → 关键词（职位 / 公司名里出现即算）。 */
export const ATTENDEE_TYPE_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  vc_partner: ["vc", "ベンチャーキャピタル", "venture capital", "ventures", "ベンチャーズ", "capital", "キャピタル", "パートナーズ", "投資家", "investor", "投资人", "风投"],
  cvc: ["cvc", "コーポレートベンチャー", "corporate venture", "事業投資", "新規事業", "オープンイノベーション", "企业风投"],
  angel: ["エンジェル", "angel", "个人投资"],
  cfo: ["cfo", "財務", "経理", "最高財務", "finance director", "财务"],
  funded_founder: ["ceo", "founder", "co-founder", "創業", "代表取締役", "代表", "ファウンダー", "起業家", "创始人", "创业者"],
  lawyer: ["弁護士", "法律事務所", "law", "legal", "attorney", "律师"],
  first_payer: ["購買", "調達部", "procurement", "情報システム", "dx", "デジタル"],
  brand_pr: ["pr", "広報", "ブランド", "marketing", "マーケティング", "品牌"],
};

const tokens = (text: string) => lowerText(text).split(/[\s　・·/／,、()（）「」]+/).filter((token) => token.length >= 2);

function keywordsFor(type: AttendeeTypingType): string[] {
  const fixed = ATTENDEE_TYPE_KEYWORDS[type.key] ?? [];
  // 类型短名（「VC」「CFO」「弁護士」）本身也是关键词；太泛的单字不算。
  return [...fixed, ...tokens(type.shortLabel)].map(lowerText);
}

function matches(text: string, keywords: readonly string[]): boolean {
  const lowered = lowerText(text);
  return keywords.some((keyword) => {
    if (/^[a-z]{2,4}$/.test(keyword)) return new RegExp(`(^|[^a-z])${keyword}([^a-z]|$)`).test(lowered);
    return lowered.includes(keyword);
  });
}

/** 一个人属于哪一类（先职位后公司，按类型顺序取第一个命中）。 */
export function typeOfPerson(person: AttendeePerson, types: readonly AttendeeTypingType[]): string | null {
  for (const field of [person.role, person.org]) {
    if (!field) continue;
    for (const type of types) if (matches(field, keywordsFor(type))) return type.key;
  }
  return null;
}

export function typeAttendees(input: {
  types: readonly AttendeeTypingType[];
  speakers?: readonly AttendeePerson[] | null;
  registrants?: readonly AttendeePerson[] | null;
  exhibitorCount?: number | null;
  /** 标题 + 议程 + 说明（展示社归类用）。 */
  text?: string | null;
}): AttendeeTypingResult {
  const expected: Record<string, number> = {};
  const breakdown: AttendeeTypingResult["breakdown"] = {};
  const bump = (key: string, field: "speakers" | "exhibitors" | "registrants", count: number, org?: string | null) => {
    expected[key] = (expected[key] ?? 0) + count;
    const entry = (breakdown[key] ??= { exhibitors: 0, registrants: 0, sampleOrgs: [], speakers: 0 });
    entry[field] += count;
    if (org && entry.sampleOrgs.length < 3 && !entry.sampleOrgs.includes(org)) entry.sampleOrgs.push(org);
  };
  for (const person of input.registrants ?? []) {
    const key = typeOfPerson(person, input.types);
    if (key) bump(key, "registrants", 1, person.org);
  }
  for (const person of input.speakers ?? []) {
    const key = typeOfPerson(person, input.types);
    if (key) bump(key, "speakers", 1, person.org);
  }
  const exhibitors = Math.max(0, Math.floor(input.exhibitorCount ?? 0));
  if (exhibitors > 0 && input.text) {
    const target = input.types.find((type) => matches(input.text!, keywordsFor(type).filter((keyword) => keyword.length >= 2 && !["代表", "ceo", "capital"].includes(keyword))));
    if (target) bump(target.key, "exhibitors", exhibitors);
  }
  const attendeeSource: EventAttendeeSource = (input.registrants?.length ?? 0) > 0
    ? "registrants"
    : (input.speakers?.length ?? 0) > 0
      ? "speakers"
      : exhibitors > 0 || Boolean(input.text?.trim())
        ? "organizer"
        : "none";
  return { attendeeSource, breakdown, expected };
}
