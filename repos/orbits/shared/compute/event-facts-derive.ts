/**
 * R26 活动事实的规则推导（events DESIGN §3.5 映射表）：议程 → 交流时间、交流形式；报名者 / 登壇者 ∩ 我的联系人 → 既存のつながり。
 * 库内活动与外部活动同一套规则；AI 只提供读到的议程 / 登壇者，不参与这里的判断。
 */
import type { EventAssessmentAgendaItem, EventAssessmentFormat } from "../contract/event-assessment";
import { lowerText } from "./compute-text";

/** 交流类条目的关键词（交流 / テーブルトーク / 名刺交換 / 懇親会 …）。 */
const NETWORKING_WORDS = ["交流", "テーブルトーク", "名刺交換", "懇親会", "ネットワーキング", "networking", "mixer", "reception", "drinks", "懇親", "交流会", "社交"];
const TABLE_TALK_WORDS = ["テーブルトーク", "ラウンドテーブル", "round table", "roundtable", "table talk", "圆桌"];
const EXCHANGE_WORDS = ["名刺交換", "展示", "ブース", "exhibit", "booth", "expo", "展区"];

const contains = (text: string, words: readonly string[]) => {
  const lowered = lowerText(text);
  return words.some((word) => lowered.includes(lowerText(word)));
};

/** "10:00" / "10:00:00" / ISO → 一天中的分钟数；认不出为 null。 */
export function agendaMinuteOfDay(at: string): number | null {
  const iso = /T(\d{2}):(\d{2})/.exec(at);
  const plain = iso ?? /^(\d{1,2})[:：](\d{2})/.exec(at.trim());
  if (!plain) return null;
  const hours = Number(plain[1]);
  const minutes = Number(plain[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * 议程里交流类条目的时长合计（分钟）。条目自带 `minutes` 就用；否则用到下一条的间隔；最后一条没有终点时按 30 分。
 * 没有议程 → null（评分标「推定」）；有议程但没有交流类条目 → 0。
 */
export function networkingMinutesFromAgenda(agenda: readonly EventAssessmentAgendaItem[] | null | undefined, endMinuteOfDay?: number | null): number | null {
  if (!agenda || agenda.length === 0) return null;
  const sorted = agenda
    .map((item) => ({ ...item, start: agendaMinuteOfDay(item.at) }))
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  let total = 0;
  sorted.forEach((item, index) => {
    if (!contains(item.title, NETWORKING_WORDS)) return;
    if (typeof item.minutes === "number") { total += item.minutes; return; }
    const next = sorted[index + 1]?.start ?? endMinuteOfDay ?? null;
    total += item.start !== null && next !== null && next > item.start ? next - item.start : 30;
  });
  return total;
}

/** 交流形式的三个布尔：读到的 `format` 优先；没有就从议程关键词推；都没有为 null（未知）。 */
export function formatFlags(input: { format?: EventAssessmentFormat | null | undefined; agenda?: readonly EventAssessmentAgendaItem[] | null | undefined; matchingEnabled?: boolean | null | undefined; nameTags?: boolean | null | undefined }): { nameTags: boolean | null; matching: boolean | null; exchangeCorner: boolean | null } {
  const agendaText = (input.agenda ?? []).map((item) => item.title).join(" ");
  const exchange = agendaText ? contains(agendaText, EXCHANGE_WORDS) : null;
  return {
    exchangeCorner: exchange === null ? (input.format?.tableTalk ? true : null) : exchange || Boolean(input.format?.tableTalk),
    matching: input.matchingEnabled ?? input.format?.matching ?? null,
    nameTags: input.nameTags ?? null,
  };
}

/** 有没有桌谈 / 圆桌（会えそうな人与気をつける点的说明用）。 */
export function hasTableTalk(agenda: readonly EventAssessmentAgendaItem[] | null | undefined): boolean {
  return (agenda ?? []).some((item) => contains(item.title, TABLE_TALK_WORDS));
}

const normalizeName = (name: string) => lowerText(name.replace(/[\s　・·]/g, ""));

/**
 * 既存のつながり：
 * - 库内活动：报名者里是我联系人的人数（一度）；二度 = 我的联系人里认识报名者的人数（调用方给关系边）。
 * - 外部活动：登壇者姓名 ∩ 我的联系人姓名（只一度）。
 * 没有任何参加者信息时返回 null（评分标「推定」）。
 */
export function connectionCounts(input: {
  attendeeContactIds?: readonly string[] | null;
  speakerNames?: readonly string[] | null;
  myContacts: readonly { id: string; name: string }[];
  secondDegreeContactIds?: readonly string[] | null;
}): { firstDegree: number | null; secondDegree: number | null; known: { contactId: string; name: string }[] } {
  if (!input.attendeeContactIds && !input.speakerNames) return { firstDegree: null, known: [], secondDegree: null };
  const known = new Map<string, string>();
  const byId = new Map(input.myContacts.map((contact) => [contact.id, contact.name]));
  for (const id of input.attendeeContactIds ?? []) {
    const name = byId.get(id);
    if (name !== undefined) known.set(id, name);
  }
  if (input.speakerNames?.length) {
    const wanted = new Set(input.speakerNames.map(normalizeName).filter(Boolean));
    for (const contact of input.myContacts) if (wanted.has(normalizeName(contact.name))) known.set(contact.id, contact.name);
  }
  const second = input.secondDegreeContactIds ? new Set(input.secondDegreeContactIds.filter((id) => !known.has(id))).size : null;
  return { firstDegree: known.size, known: [...known].map(([contactId, name]) => ({ contactId, name })), secondDegree: input.attendeeContactIds ? second : null };
}
