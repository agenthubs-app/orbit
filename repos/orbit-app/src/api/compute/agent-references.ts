/**
 * agent-design AG11（设计稿 §3.6、§10「@ 选择器」；获批视觉稿 D1–D8）：两端 @ 选择器共用的纯函数。
 *
 * - 类型的叫法（D4：参会那一类叫「我去过」）、分类按钮的顺序（D3）；
 * - 同名时用来区分的一行（联系人写公司和职位，笔记写相关的人和日期，待办写截止日，日程和活动写时间，我去过写日期）；
 * - 输入框里的绑定：选中一条就在句子里插入「@名字 」并记下它的位置；改动文字时，改到标记里面的那一条就不再绑定（D2 之外的
 *   「删改标记文字」），其余跟着移动；点掉标签时句子里的字留下、去掉 @（D2）；发送时按去掉首尾空白之后的句子给出位置。
 *   自己打的「@名字」没在选择器里点过，就不是绑定，只是普通文字。
 *
 * 时间按产品默认时区 Asia/Tokyo（UTC+9，无夏令时）换算，不依赖运行环境的 Intl。
 */
import type { AgentReferenceCandidateContract, AgentReferenceSearchKind } from "../contract/agent-v1";
import { parseTimestamp } from "./compute-text";

export type ReferenceLanguage = "zh" | "ja" | "en";

/** D3：分类按钮的顺序（「全部」在最前，由客户端自己加）。 */
export const REFERENCE_KINDS: readonly AgentReferenceSearchKind[] = ["contact", "memo", "todo", "schedule", "event", "attendance"];

const KIND_LABEL: Record<ReferenceLanguage, Record<AgentReferenceSearchKind, string>> = {
  en: { attendance: "I went", contact: "Contact", event: "Event", memo: "Note", schedule: "Schedule", todo: "To-do" },
  ja: { attendance: "行った", contact: "連絡先", event: "イベント", memo: "メモ", schedule: "予定", todo: "タスク" },
  zh: { attendance: "我去过", contact: "联系人", event: "活动", memo: "笔记", schedule: "日程", todo: "待办" },
};

export function referenceKindLabel(kind: AgentReferenceSearchKind, language: ReferenceLanguage): string {
  return KIND_LABEL[language][kind];
}

export function referenceAllLabel(language: ReferenceLanguage): string {
  return language === "zh" ? "全部" : language === "ja" ? "すべて" : "All";
}

/* ── 日期（Asia/Tokyo 墙上时间） ───────────────────────────────────────── */

const TOKYO_OFFSET_MS = 9 * 3_600_000;
const WEEKDAY: Record<ReferenceLanguage, readonly string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
};
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Days since 1970-01-01 → civil date (H. Hinnant's algorithm). */
function civil(days: number): { year: number; month: number; day: number } {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { day, month, year: yoe + era * 400 + (month <= 2 ? 1 : 0) };
}

interface LocalTime { month: number; day: number; weekday: number; time: string | null }

function localTimeOf(value: string): LocalTime | null {
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  const ms = dayOnly ? parseTimestamp(`${value}T00:00:00Z`) : parseTimestamp(value) + TOKYO_OFFSET_MS;
  if (!Number.isFinite(ms)) return null;
  const days = Math.floor(ms / 86_400_000);
  const minutes = Math.floor((ms - days * 86_400_000) / 60_000);
  const { day, month } = civil(days);
  const weekday = ((days % 7) + 11) % 7; // 1970-01-01 was a Thursday (4).
  const time = dayOnly ? null : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { day, month, time, weekday };
}

/** 「11月13日（周五）」「11月13日（金）」「Fri, Nov 13」，withTime 时加上「14:00」。 */
export function referenceDayText(value: string, language: ReferenceLanguage, options: { withTime?: boolean; weekday?: boolean } = {}): string | null {
  const local = localTimeOf(value);
  if (!local) return null;
  const weekday = options.weekday !== false;
  const time = options.withTime && local.time ? local.time : null;
  if (language === "en") {
    const day = `${weekday ? `${WEEKDAY.en[local.weekday]}, ` : ""}${MONTH_EN[local.month - 1]} ${local.day}`;
    return time ? `${day}, ${time}` : day;
  }
  const day = `${local.month}月${local.day}日${weekday ? `（${WEEKDAY[language][local.weekday]}）` : ""}`;
  return time ? `${day}${time}` : day;
}

/** 同名时用来区分的一行（视觉稿第 1、3 组）。没有可写的就返回空串。 */
export function referenceDetailLine(candidate: Pick<AgentReferenceCandidateContract, "type" | "detail">, language: ReferenceLanguage): string {
  const { detail } = candidate;
  const dot = " · ";
  switch (candidate.type) {
    case "contact":
      return [detail.company, detail.role].filter(Boolean).join(dot);
    case "memo": {
      const day = detail.date ? referenceDayText(detail.date, language) : null;
      return [(detail.people ?? []).join(language === "en" ? ", " : "、"), day].filter(Boolean).join(dot);
    }
    case "todo": {
      const day = detail.date ? referenceDayText(detail.date, language) : null;
      if (!day) return "";
      return language === "zh" ? `截止 ${day}` : language === "ja" ? `期限 ${day}` : `Due ${day}`;
    }
    case "schedule":
    case "event": {
      const day = detail.date ? referenceDayText(detail.date, language, { withTime: true }) : null;
      return [day, candidate.type === "event" ? detail.place : null].filter(Boolean).join(dot);
    }
    case "attendance":
      return detail.date ? referenceDayText(detail.date, language, { weekday: false }) ?? "" : "";
    default:
      return "";
  }
}

/** 标签上的一小段区分信息（D1：同名的标签才带）：日程和我去过带日期，其他带区分行的第一段。 */
export function referenceChipHint(candidate: Pick<AgentReferenceCandidateContract, "type" | "detail">, language: ReferenceLanguage): string {
  if (candidate.type === "schedule" || candidate.type === "attendance") return candidate.detail.date ? referenceDayText(candidate.detail.date, language, { weekday: false }) ?? "" : "";
  if (candidate.type === "memo") return (candidate.detail.people ?? [])[0] ?? (candidate.detail.date ? referenceDayText(candidate.detail.date, language, { weekday: false }) ?? "" : "");
  return referenceDetailLine(candidate, language).split(" · ")[0] ?? "";
}

/* ── 输入框里的绑定 ─────────────────────────────────────────────────────── */

export interface ReferenceBinding {
  type: AgentReferenceSearchKind;
  id: string;
  name: string;
  eventKind?: "platform" | "private" | undefined;
  /** 区分信息（标签上显示，同名时用），选中时写好。 */
  hint?: string | undefined;
  /** 草稿里标记「@名字」的位置，左闭右开。 */
  start: number;
  end: number;
  /** D7：这条现在打不开了（草稿恢复或发送前核对）。照样可以发。 */
  gone?: boolean | undefined;
}

export const markerOf = (name: string) => `@${name}`;

/** 绑定还对得上吗：草稿在它的位置上正好是「@名字」。 */
export function bindingHolds(text: string, binding: Pick<ReferenceBinding, "start" | "end" | "name">): boolean {
  return text.slice(binding.start, binding.end) === markerOf(binding.name);
}

/**
 * 文字改了以后，绑定跟着走：只改了标记前面或后面的，绑定移到新位置；改到了标记里面的（删了一个字、插进字），那一条
 * 不再绑定。按一次连续的改动算（前缀与后缀相同的部分之外就是改动），粘贴、输入法上屏、删除都是这样。
 */
export function reconcileBindings<T extends ReferenceBinding>(previous: string, next: string, bindings: readonly T[]): T[] {
  if (previous === next) return [...bindings];
  let prefix = 0;
  const shortest = Math.min(previous.length, next.length);
  while (prefix < shortest && previous[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < shortest - prefix && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1;
  const editedEnd = previous.length - suffix;
  const delta = next.length - previous.length;
  const out: T[] = [];
  for (const binding of bindings) {
    if (binding.end <= prefix) out.push(binding);
    else if (binding.start >= editedEnd && binding.start >= prefix) out.push({ ...binding, end: binding.end + delta, start: binding.start + delta });
    // 改到了标记里面：不再绑定。
  }
  return out.filter((binding) => bindingHolds(next, binding));
}

/**
 * 打 @ 打开选择器（D5、D6）：光标前最近的 @ 到光标之间没有空白，这个 @ 在句首或空白、标点之后，也不在已有的标记里。
 * 返回 @ 的位置和它后面打的字（就是搜索词）。
 */
export function atTriggerOf(text: string, caret: number, bindings: readonly Pick<ReferenceBinding, "start" | "end">[]): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const query = before.slice(at + 1);
  if (/\s/u.test(query) || query.length > 40) return null;
  if (at > 0 && !/[\s\p{P}\p{S}]/u.test(before[at - 1] ?? "")) return null;
  if (bindings.some((binding) => at >= binding.start && at < binding.end)) return null;
  return { query, start: at };
}

/**
 * 把一条记录放进句子：把 [from, to) 换成「@名字 」（打 @ 时 from 是 @ 的位置、to 是光标；点「＋」时两者都是光标），
 * 其余绑定跟着移动。返回新文字、新光标和新绑定。
 */
export function insertReference<T extends ReferenceBinding>(text: string, from: number, to: number, bindings: readonly T[], picked: Omit<T, "start" | "end">): { text: string; caret: number; bindings: T[] } {
  const marker = markerOf(picked.name);
  const after = text.slice(to);
  const spacer = after.startsWith(" ") ? "" : " ";
  const next = `${text.slice(0, from)}${marker}${spacer}${after}`;
  const delta = next.length - text.length;
  const moved = bindings.filter((binding) => binding.end <= from || binding.start >= to).map((binding) => (binding.start >= to ? { ...binding, end: binding.end + delta, start: binding.start + delta } : binding));
  const added = { ...picked, end: from + marker.length, start: from } as T;
  return { bindings: [...moved, added].sort((left, right) => left.start - right.start), caret: from + marker.length + 1, text: next };
}

/** D2：点掉标签，句子里的字留下，只去掉 @；后面的绑定前移一格。 */
export function removeBinding<T extends ReferenceBinding>(text: string, bindings: readonly T[], removed: Pick<ReferenceBinding, "id" | "type" | "start">): { text: string; bindings: T[] } {
  const target = bindings.find((binding) => binding.id === removed.id && binding.type === removed.type && binding.start === removed.start);
  if (!target) return { bindings: [...bindings], text };
  const holds = bindingHolds(text, target);
  const next = holds ? `${text.slice(0, target.start)}${text.slice(target.start + 1)}` : text;
  return {
    bindings: bindings.filter((binding) => binding !== target).map((binding) => (holds && binding.start > target.start ? { ...binding, end: binding.end - 1, start: binding.start - 1 } : binding)),
    text: next,
  };
}

/** 发送：去掉首尾空白之后的句子，和每个还对得上的标记在其中的位置（服务端按这个位置核对）。 */
export function referencesForSend(text: string, bindings: readonly ReferenceBinding[]): { message: string; references: { type: AgentReferenceSearchKind; id: string; start: number; end: number; eventKind?: "platform" | "private" }[] } {
  const lead = text.length - text.trimStart().length;
  const message = text.trim();
  const references = bindings
    .filter((binding) => bindingHolds(text, binding))
    .sort((left, right) => left.start - right.start)
    .map((binding) => ({ end: binding.end - lead, id: binding.id, start: binding.start - lead, type: binding.type, ...(binding.type === "event" && binding.eventKind ? { eventKind: binding.eventKind } : {}) }));
  return { message, references };
}

/** 着色用：句子按标记切开（D1：句子里的「@名字」着色；打不开的划掉）。 */
export function markedSegments(text: string, bindings: readonly ReferenceBinding[]): { text: string; binding: ReferenceBinding | null }[] {
  const out: { text: string; binding: ReferenceBinding | null }[] = [];
  let at = 0;
  for (const binding of [...bindings].filter((item) => bindingHolds(text, item)).sort((left, right) => left.start - right.start)) {
    if (binding.start < at) continue;
    if (binding.start > at) out.push({ binding: null, text: text.slice(at, binding.start) });
    out.push({ binding, text: text.slice(binding.start, binding.end) });
    at = binding.end;
  }
  if (at < text.length) out.push({ binding: null, text: text.slice(at) });
  return out;
}

/** 同名的标签才带区分信息（D1）：同一类、同一个名字出现不止一次。 */
export function sameNamedKeys(bindings: readonly Pick<ReferenceBinding, "type" | "name" | "id">[]): Set<string> {
  const ids = new Map<string, Set<string>>();
  for (const binding of bindings) {
    const key = `${binding.type}:${binding.name}`;
    ids.set(key, new Set([...(ids.get(key) ?? []), binding.id]));
  }
  return new Set([...ids].filter(([, set]) => set.size > 1).map(([key]) => key));
}
