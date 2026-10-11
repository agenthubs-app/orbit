/**
 * R16（DESIGN add-and-invite §2.8、§3.3、§3.4、§9 #24）：「あとで補完 · 每天一问」的规则（纯函数部分）。读库在服务端
 * （`features/contacts/completion/service.ts`）。Owner: 甲 (R16). Used by: 服务端出题 / 判答；两端卡片可用题型与固定选项的常量。
 *
 * - 日期口径：东京日（Asia/Tokyo，UTC+9，无夏令时）。「今天」由调用方传入。
 * - 挑人：浓度 ●○○（D-10，`contact-density.ts`）、最近 30 个东京日内加入（导入或新加）、还有题可问、没有被连续跳过 3 次；
 *   最新加入的优先，同时加入按 id。
 * - 题型（两种起步）：缺公司 → 「〇〇さんの会社は？」；否则缺相遇场合 → 「〇〇さんとは、どこで？」。同一个人同一题型
 *   答过（含「覚えていない」）就不再问。
 * - 选项只来自真实数据或固定项：
 *   - どこで：我参加过、且与这个人加入时间相差 ±14 个东京日内的活动（最近的在前，最多 2 个）＋「前職の同僚」（我的人脈里
 *     另有人与对方同一公司时才出）＋「紹介」「覚えていない」；
 *   - 会社は：我的人脈里与对方同一（非免费）邮箱域名的人所在的公司（最多的那个，有才出）＋「自分で入力」「覚えていない」。
 * - 答案写到哪里（服务端执行）：活动 → `metEventId`；紹介 / 前職の同僚 → 备注一行「出会い：…」；公司 → `organization`；
 *   覚えていない → 只记在问题上。
 * - 纯函数，不碰 IO 与时钟。
 */
import { compareText, isoTimestamp, lowerText } from "./compute-text";
import { contactDensity, type ContactDensity } from "./contact-density";
import { parseStrictTokyoInstant, tokyoCalendarDaysUntil } from "./tokyo-calendar-days";
import { emailDomain, isFreeMailDomain } from "./work-contact-likelihood";
import type { ContactCompletionQuestionKind } from "../contract/contact-completion";

export const COMPLETION_RECENT_DAYS = 30;
export const COMPLETION_EVENT_WINDOW_DAYS = 14;
export const COMPLETION_MAX_EVENT_OPTIONS = 2;
/** 同一个人连续跳过这么多次后不再问他。 */
export const COMPLETION_SKIP_LIMIT = 3;
/** 契约里选项的长度上限（shared/api-schema/contact-completion.ts）。 */
export const COMPLETION_OPTION_MAX_LENGTH = 60;
/** 手输公司名的长度上限。 */
export const COMPLETION_ORGANIZATION_MAX_LENGTH = 120;

/** 固定选项（日文，写进问题记录与备注；界面按 `kind` 与这些值显示）。 */
export const COMPLETION_OPTION_LABELS = {
  forgot: "覚えていない",
  formerColleague: "前職の同僚",
  intro: "紹介",
  typeIn: "自分で入力",
} as const;

/** 备注里的相遇行前缀（与 R12 手入力同一写法）。 */
export const MEETING_NOTE_PREFIX = "出会い：";

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO 时间所在的东京日（YYYY-MM-DD）；非法返回 null。 */
export function tokyoDayOf(instant: string): string | null {
  const time = parseStrictTokyoInstant(instant);
  if (time === null) return null;
  return isoTimestamp(time + TOKYO_OFFSET_MS)?.slice(0, 10) ?? null;
}

/** 备注里有一行「出会い：…」（全角或半角冒号）。 */
export function hasMeetingNote(notes: string | null | undefined): boolean {
  return typeof notes === "string" && notes.split(/\r?\n/u).some((line) => /^出会い\s*[：:]/u.test(line.trim()));
}

/** 出题需要的联系人事实（服务端从联系人记录与往来记录整理）。 */
export interface CompletionContactFacts {
  contactId: string;
  displayName: string;
  organization: string;
  emails: readonly string[];
  /** 有邮箱或电话。 */
  hasContactPoint: boolean;
  /** 有 metEventId 或「出会い」备注。 */
  hasMetContext: boolean;
  /** 计划已关联 / 有往来 / 本人入力（任一即 ●●●）。 */
  hasStrongSignal: boolean;
  /** 加入人脈的时间（ISO）。 */
  addedAt: string;
}

export interface CompletionContactHistory {
  /** 最近连续跳过的次数（答过一次就归零）。 */
  skipStreak: number;
  /** 已经答过（含「覚えていない」）的题型。 */
  answeredKinds: readonly ContactCompletionQuestionKind[];
}

/**
 * 复核 m4：「计划已关联」（hasGoalRelation）这里不算——出题时只读近 30 天加入的人，再读计划要多一次查询；
 * 已关联计划的人多数也有往来记录（●●●）。已知取舍：极少数「刚加入、只关联了计划」的人可能被问一题。
 */
export function completionDensityFacts(contact: CompletionContactFacts): ContactDensity {
  return contactDensity({
    hasContactPoint: contact.hasContactPoint,
    hasGoalRelation: false,
    hasIdentity: contact.displayName.trim().length > 0,
    hasInteraction: contact.hasStrongSignal,
    hasMetContext: contact.hasMetContext,
    selfReported: false,
  });
}

/** 这个人还能问哪一题（缺公司优先）；没有可问的返回 null。 */
export function completionKindFor(contact: CompletionContactFacts, answeredKinds: readonly ContactCompletionQuestionKind[]): ContactCompletionQuestionKind | null {
  if (!contact.organization.trim() && !answeredKinds.includes("organization")) return "organization";
  if (!contact.hasMetContext && !answeredKinds.includes("met_where")) return "met_where";
  return null;
}

/** 今天问谁、问什么；没有合适的人返回 null。 */
export function pickCompletionTarget(input: {
  contacts: readonly CompletionContactFacts[];
  history: Readonly<Record<string, CompletionContactHistory | undefined>>;
  now: string;
}): { contactId: string; kind: ContactCompletionQuestionKind } | null {
  const nowTime = parseStrictTokyoInstant(input.now);
  if (nowTime === null) return null;
  const eligible = input.contacts.flatMap((contact) => {
    const addedTime = parseStrictTokyoInstant(contact.addedAt);
    const age = tokyoCalendarDaysUntil(input.now, contact.addedAt);
    if (addedTime === null || age === null || addedTime > nowTime || age > COMPLETION_RECENT_DAYS) return [];
    if (completionDensityFacts(contact).level !== 1) return [];
    const history = input.history[contact.contactId];
    if ((history?.skipStreak ?? 0) >= COMPLETION_SKIP_LIMIT) return [];
    const kind = completionKindFor(contact, history?.answeredKinds ?? []);
    return kind ? [{ addedTime, contactId: contact.contactId, kind }] : [];
  });
  eligible.sort((left, right) => right.addedTime - left.addedTime || compareText(left.contactId, right.contactId));
  const first = eligible[0];
  return first ? { contactId: first.contactId, kind: first.kind } : null;
}

export function completionQuestionText(kind: ContactCompletionQuestionKind, name: string): string {
  return kind === "organization" ? `${name}さんの会社は？` : `${name}さんとは、どこで？`;
}

/** 一个选项写到哪里。 */
export type CompletionOptionTarget =
  | { kind: "event"; eventId: string; title: string }
  | { kind: "intro" }
  | { kind: "former_colleague" }
  | { kind: "organization"; value: string }
  | { kind: "type_in" }
  | { kind: "forgot" };

export interface CompletionOption {
  /** 显示与回答用的文字（≤60 字）。 */
  label: string;
  target: CompletionOptionTarget;
}

/** 我参加过的活动（服务端从真实记录读出）。 */
export interface CompletionEventFact {
  eventId: string;
  title: string;
  /** 活动的时间（ISO）。 */
  at: string;
}

/** 我人脈里的其他人（只用公司与邮箱推选项）。 */
export interface CompletionPeerFacts {
  organization: string;
  emails: readonly string[];
}

/** 公司名的比较键（NFKC、小写、空白合并）。服务端按它查「同公司」的人（SQL 预筛后再用它精确比）。 */
export function completionOrganizationKey(value: string): string {
  return lowerText(value.normalize("NFKC")).replace(/\s+/gu, " ").trim();
}

function clipLabel(value: string): string {
  return [...value].slice(0, COMPLETION_OPTION_MAX_LENGTH).join("");
}

const FIXED_LABELS = new Set<string>(Object.values(COMPLETION_OPTION_LABELS));

function eventOptions(contact: CompletionContactFacts, events: readonly CompletionEventFact[]): CompletionOption[] {
  const near = events.flatMap((event) => {
    const title = event.title.trim();
    const distance = tokyoCalendarDaysUntil(event.at, contact.addedAt);
    if (!event.eventId.trim() || !title || distance === null || Math.abs(distance) > COMPLETION_EVENT_WINDOW_DAYS) return [];
    return [{ distance: Math.abs(distance), event: { ...event, title } }];
  });
  near.sort((left, right) => left.distance - right.distance || compareText(left.event.title, right.event.title) || compareText(left.event.eventId, right.event.eventId));
  const options: CompletionOption[] = [];
  const seenEvents = new Set<string>();
  const seenLabels = new Set<string>();
  for (const { event } of near) {
    if (options.length >= COMPLETION_MAX_EVENT_OPTIONS) break;
    const label = clipLabel(event.title);
    if (seenEvents.has(event.eventId) || seenLabels.has(label) || FIXED_LABELS.has(label)) continue;
    seenEvents.add(event.eventId);
    seenLabels.add(label);
    options.push({ label, target: { eventId: event.eventId, kind: "event", title: event.title } });
  }
  return options;
}

function domainCompany(contact: CompletionContactFacts, others: readonly CompletionPeerFacts[]): string | null {
  const domains = new Set(contact.emails.map(emailDomain).filter((domain): domain is string => domain !== null && !isFreeMailDomain(domain)));
  if (!domains.size) return null;
  const counts = new Map<string, { name: string; count: number }>();
  for (const other of others) {
    const name = other.organization.trim();
    if (!name || !other.emails.some((email) => {
      const domain = emailDomain(email);
      return domain !== null && domains.has(domain);
    })) continue;
    const key = completionOrganizationKey(name);
    const entry = counts.get(key) ?? { count: 0, name };
    entry.count += 1;
    counts.set(key, entry);
  }
  const ranked = [...counts.values()].sort((left, right) => right.count - left.count || compareText(left.name, right.name));
  const top = ranked[0];
  return top && !FIXED_LABELS.has(clipLabel(top.name)) ? top.name : null;
}

export function buildCompletionOptions(input: {
  kind: ContactCompletionQuestionKind;
  contact: CompletionContactFacts;
  events: readonly CompletionEventFact[];
  others: readonly CompletionPeerFacts[];
}): CompletionOption[] {
  if (input.kind === "organization") {
    const company = domainCompany(input.contact, input.others);
    return [
      ...(company ? [{ label: clipLabel(company), target: { kind: "organization", value: company } as const }] : []),
      { label: COMPLETION_OPTION_LABELS.typeIn, target: { kind: "type_in" } },
      { label: COMPLETION_OPTION_LABELS.forgot, target: { kind: "forgot" } },
    ];
  }
  const organization = completionOrganizationKey(input.contact.organization);
  const colleague = organization.length > 0 && input.others.some((other) => completionOrganizationKey(other.organization) === organization);
  return [
    ...eventOptions(input.contact, input.events),
    ...(colleague ? [{ label: COMPLETION_OPTION_LABELS.formerColleague, target: { kind: "former_colleague" } as const }] : []),
    { label: COMPLETION_OPTION_LABELS.intro, target: { kind: "intro" } },
    { label: COMPLETION_OPTION_LABELS.forgot, target: { kind: "forgot" } },
  ];
}

/** 答案要做的写入。 */
export type CompletionAnswerEffect =
  | { kind: "event"; eventId: string; title: string }
  | { kind: "note"; line: string }
  | { kind: "organization"; value: string }
  | { kind: "forgot" };

/**
 * 答案 → 写入。どこで：必须是选项之一；会社は：选项之一，或手输的公司名（「自分で入力」本身不算）。不合法返回 null。
 */
export function resolveCompletionAnswer(input: { kind: ContactCompletionQuestionKind; options: readonly CompletionOption[]; answer: string }): CompletionAnswerEffect | null {
  const answer = input.answer.trim();
  if (!answer) return null;
  const option = input.options.find((item) => item.label === answer);
  if (option) {
    switch (option.target.kind) {
      case "event":
        return { eventId: option.target.eventId, kind: "event", title: option.target.title };
      case "intro":
        return { kind: "note", line: `${MEETING_NOTE_PREFIX}${COMPLETION_OPTION_LABELS.intro}` };
      case "former_colleague":
        return { kind: "note", line: `${MEETING_NOTE_PREFIX}${COMPLETION_OPTION_LABELS.formerColleague}` };
      case "organization":
        return { kind: "organization", value: option.target.value };
      case "forgot":
        return { kind: "forgot" };
      case "type_in":
        return null;
    }
  }
  if (input.kind !== "organization" || FIXED_LABELS.has(answer) || [...answer].length > COMPLETION_ORGANIZATION_MAX_LENGTH) return null;
  return { kind: "organization", value: answer };
}
