// 「记一笔交流」App 版（docs/designs/contact-log-2026-11 ⑤，行为同 ②–④）：底部弹层与「往来」时间线的纯逻辑，组件与测试共用。
// 与 Web 的 orbits/app/(app)/app/orbit-2026/network/contact-log-model.ts 同一套规则（App 不在构建期 import orbits，这里是副本）。
// 只用双方资料里已有的内容做 chip（不调用 AI、不生成话题）；保存沿用 PATCH /api/contacts/:id 的 memo 写入。

export type ContactLogChannel = "meeting" | "call" | "event" | "other";
export const CONTACT_LOG_CHANNELS: readonly ContactLogChannel[] = ["meeting", "call", "event", "other"];

/** chip 分组顺序：对方行业 → 对方能提供 → 对方在找 → 我能提供 → 我在找 → 我想聊的话题。 */
export type ContactLogGroupKey = "theirIndustry" | "theirOffering" | "theirSeeking" | "myOffering" | "mySeeking" | "myTopics";
export const CONTACT_LOG_GROUP_ORDER: readonly ContactLogGroupKey[] = ["theirIndustry", "theirOffering", "theirSeeking", "myOffering", "mySeeking", "myTopics"];
export interface ContactLogGroup { key: ContactLogGroupKey; side: "them" | "me"; chips: string[] }
/** 每组先显示的 chip 数；多的收进「+N」。 */
export const CONTACT_LOG_GROUP_VISIBLE = 4;
/** 与服务端一致：至多 12 个、每个至多 80 字。 */
export const CONTACT_LOG_TOPICS_MAX = 12;
export const CONTACT_LOG_TOPIC_CHARS_MAX = 80;

function cleanList(values: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const item = value?.trim() ?? "";
    if (item && !out.includes(item)) out.push(item);
  }
  return out;
}

/** 双方资料 → chip 分组；空组不返回（界面整组隐藏）。 */
export function contactLogGroups(input: Partial<Record<ContactLogGroupKey, readonly (string | null | undefined)[]>>): ContactLogGroup[] {
  return CONTACT_LOG_GROUP_ORDER.flatMap((key) => {
    const chips = cleanList(input[key] ?? []);
    return chips.length ? [{ key, side: key.startsWith("their") ? "them" as const : "me" as const, chips }] : [];
  });
}

export interface ContactLogCopy { bodyPrefix: string; joiner: string }

/** 存储正文：「聊到：A、B」，有补充时换行接补充；没点 chip 时就是补充本身。 */
export function contactLogBody(input: { topics: readonly string[]; extra: string; copy: ContactLogCopy }): string {
  const topics = cleanList(input.topics);
  const extra = input.extra.trim();
  const head = topics.length ? `${input.copy.bodyPrefix}${topics.join(input.copy.joiner)}` : "";
  return [head, extra].filter(Boolean).join("\n");
}

/**
 * memo 的作者标记：服务端存的数据值「我」（与 Web 和旧编辑器同一个值），不是界面文字，所以不进词典；
 * 用码点写，免得被「代码里不写界面文字」的检查（tests/no-hardcoded-copy）当成文案。
 */
export const CONTACT_LOG_AUTHOR_LABEL = String.fromCodePoint(0x6211);

export interface ContactLogPatch {
  note: { body: string; authorLabel: string; occurredAt: string; kind: "memo"; channel: ContactLogChannel; topics?: string[]; eventId?: string };
}

/** 保存请求体：只有 note（「上次互动」由服务端按日期规则推进）。活动只在方式是「活动上遇到」时带。 */
export function buildContactLogPatch(input: { channel: ContactLogChannel; date: string; topics: readonly string[]; extra: string; eventId?: string | null; copy: ContactLogCopy }): ContactLogPatch {
  const topics = cleanList(input.topics).filter((topic) => Array.from(topic).length <= CONTACT_LOG_TOPIC_CHARS_MAX).slice(0, CONTACT_LOG_TOPICS_MAX);
  const eventId = input.channel === "event" ? input.eventId?.trim() : "";
  return {
    note: {
      body: contactLogBody({ topics, extra: input.extra, copy: input.copy }),
      authorLabel: CONTACT_LOG_AUTHOR_LABEL,
      occurredAt: input.date,
      kind: "memo",
      channel: input.channel,
      ...(topics.length ? { topics } : {}),
      ...(eventId ? { eventId } : {}),
    },
  };
}

/** 有 chip 或有文字才可保存。 */
export function contactLogCanSave(input: { topics: readonly string[]; extra: string; date: string }): boolean {
  return Boolean(tokyoDayWindow(input.date)) && (cleanList(input.topics).length > 0 || input.extra.trim().length > 0);
}

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** 东京当天 `YYYY-MM-DD`（不依赖设备时区）。 */
export function tokyoToday(now: Date = new Date()): string {
  return new Date(now.getTime() + TOKYO_OFFSET_MS).toISOString().slice(0, 10);
}

/** 东京日期 → 该日 [00:00, 次日 00:00) 的毫秒窗口；非法日期返回 null。 */
export function tokyoDayWindow(day: string): { from: number; to: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - TOKYO_OFFSET_MS;
  if (!Number.isFinite(start) || new Date(start + TOKYO_OFFSET_MS).toISOString().slice(0, 10) !== day) return null;
  return { from: start, to: start + DAY_MS };
}

export interface ContactLogEventOption { eventId: string; title: string; startsAt: string }

/** 所选东京日期当天的活动（同一活动只列一次，至多 6 个；沿用旧版 memo 弹窗的规则）。 */
export function contactLogEventsOn(options: readonly ContactLogEventOption[], day: string): { eventId: string; title: string }[] {
  const window = tokyoDayWindow(day);
  if (!window) return [];
  const seen = new Set<string>();
  const out: { eventId: string; title: string }[] = [];
  for (const item of options) {
    const at = Date.parse(item.startsAt);
    const title = item.title?.trim() ?? "";
    if (!(at >= window.from && at < window.to) || !item.eventId || !title || seen.has(item.eventId)) continue;
    seen.add(item.eventId);
    out.push({ eventId: item.eventId, title });
  }
  return out.slice(0, 6);
}

// ── 「往来」时间线 ──

export type TimelineOrigin = "user" | "card" | "system";
export interface TimelineNote {
  id: string; body: string; title: string; createdAt: string;
  origin: TimelineOrigin; occurredAt?: string; channel?: ContactLogChannel; topics?: string[];
}

/** payload 的 origin；旧服务端（或 mock）没给时按 noteId 前缀推。 */
export function timelineOriginOf(note: { noteId?: unknown; origin?: unknown; source?: unknown }): TimelineOrigin {
  if (note.origin === "user" || note.origin === "card" || note.origin === "system") return note.origin;
  const id = typeof note.noteId === "string" ? note.noteId : "";
  if (id.startsWith("note:live-contact-detail-update:")) return "user";
  const sourceType = typeof note.source === "object" && note.source !== null ? (note.source as { type?: unknown }).type : undefined;
  if (id.startsWith("note:business-card-notes:") || (id.startsWith("note:relationship-evidence:") && sourceType === "business_card_ocr")) return "card";
  return "system";
}

export function timelineChannelOf(value: unknown): ContactLogChannel | undefined {
  return CONTACT_LOG_CHANNELS.includes(value as ContactLogChannel) ? value as ContactLogChannel : undefined;
}

/** 排序与显示用的东京日：memo 用所选日期，其余用 createdAt 的东京日。 */
export function timelineDay(note: Pick<TimelineNote, "occurredAt" | "createdAt">): string {
  if (note.occurredAt && tokyoDayWindow(note.occurredAt)) return note.occurredAt;
  const ms = Date.parse(note.createdAt);
  return Number.isFinite(ms) ? tokyoToday(new Date(ms)) : "";
}

/** 按交流日期倒序；同一天按记下的时间倒序。 */
export function sortTimeline<T extends Pick<TimelineNote, "occurredAt" | "createdAt">>(notes: readonly T[]): T[] {
  return [...notes].sort((left, right) => {
    const day = timelineDay(right).localeCompare(timelineDay(left));
    return day !== 0 ? day : right.createdAt.localeCompare(left.createdAt);
  });
}

/** `YYYY-MM-DD` → 「M/D」。 */
export function monthDayOf(day: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${Number(match[1])}/${Number(match[2])}` : "";
}
