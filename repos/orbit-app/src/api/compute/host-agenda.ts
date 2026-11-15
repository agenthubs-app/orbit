import type { HostAgendaItem } from "../contract/host-events";

// 议程（2026-11-15 用户：议程必填，主办方在新建活动 / 申込設定里填）：存 / 读 / 界面检查，服务端与界面共用。
// 存在 source_payload.agenda：[{ at: "HH:MM", title, detail? }]，顺序按主办方排的（不自动按时间重排）。

export const AGENDA_MAX_ROWS = 40;
export const AGENDA_TITLE_MAX = 60;
export const AGENDA_DETAIL_MAX = 120;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;

const clean = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? [...text].slice(0, max).join("") : null;
};

/** 写入 / 读出的议程 → 规范形（去空白、截断、丢掉缺时间或标题的行，最多 40 行）。读坏数据也不抛错；不是数组 = null。 */
export function normalizeHostAgenda(raw: unknown): HostAgendaItem[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((item): HostAgendaItem[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const at = clean(record.at, 5);
    const title = clean(record.title, AGENDA_TITLE_MAX);
    if (!at || !TIME.test(at) || !title) return [];
    const detail = clean(record.detail, AGENDA_DETAIL_MAX);
    return [{ at, title, ...(detail ? { detail } : {}) }];
  }).slice(0, AGENDA_MAX_ROWS);
}

/** 「HH:MM」→ 当天第几分钟；不是 HH:MM → null。 */
export function agendaMinute(at: string): number | null {
  const match = TIME.exec(at.trim());
  return match ? Number(at.trim().slice(0, 2)) * 60 + Number(at.trim().slice(3, 5)) : null;
}

/** 编辑中的一行（时间 / 标题可能还没填）。 */
export interface AgendaDraftRow {
  at: string;
  title: string;
  detail: string;
}

export type AgendaRowProblem = "time" | "title" | "titleLong" | "detailLong";
export type AgendaRowRange = "beforeStart" | "afterEnd";

/**
 * 每行的问题：缺时间 / 缺标题（挡公开与「保存议程」）、太长；以及超出活动时间（只提示，不挡）。
 * `start` / `end` = 活动的东京时间 "HH:MM"（结束早于开始 = 跨日，结束按 +24h 算）。
 */
export function agendaRowChecks(rows: readonly AgendaDraftRow[], start: string | null, end: string | null): Array<{ problem: AgendaRowProblem | null; range: AgendaRowRange | null }> {
  const startMin = start ? agendaMinute(start) : null;
  let endMin = end ? agendaMinute(end) : null;
  if (startMin !== null && endMin !== null && endMin <= startMin) endMin += 24 * 60;
  return rows.map((row) => {
    const at = row.at.trim();
    const title = row.title.trim();
    const problem: AgendaRowProblem | null = !at || agendaMinute(at) === null ? "time" : !title ? "title" : [...title].length > AGENDA_TITLE_MAX ? "titleLong" : [...row.detail.trim()].length > AGENDA_DETAIL_MAX ? "detailLong" : null;
    let minute = agendaMinute(at);
    // 跨日活动：开始之前的时刻算第二天（23:00–01:00 的 00:30）。
    if (minute !== null && startMin !== null && endMin !== null && endMin > 24 * 60 && minute < startMin) minute += 24 * 60;
    const range: AgendaRowRange | null = minute === null ? null : startMin !== null && minute < startMin ? "beforeStart" : endMin !== null && minute > endMin ? "afterEnd" : null;
    return { problem, range };
  });
}

/** 完整的行（时间、标题都有）。 */
export function completeAgendaRows(rows: readonly AgendaDraftRow[]): number {
  return agendaRowChecks(rows, null, null).filter((check) => check.problem === null).length;
}

/** 编辑中的行 → 契约（空行——时间、标题、说明全空——不算）。有问题的行原样交给调用方判断，这里只去空白。 */
export function agendaDraftToItems(rows: readonly AgendaDraftRow[]): HostAgendaItem[] {
  return rows
    .filter((row) => row.at.trim() || row.title.trim() || row.detail.trim())
    .map((row) => ({ at: row.at.trim(), title: row.title.trim(), ...(row.detail.trim() ? { detail: row.detail.trim() } : {}) }));
}

/** 契约 → 编辑中的行。 */
export function agendaItemsToDraft(items: readonly HostAgendaItem[] | null | undefined): AgendaDraftRow[] {
  return (items ?? []).map((item) => ({ at: item.at, detail: item.detail ?? "", title: item.title }));
}

export const blankAgendaRow = (): AgendaDraftRow => ({ at: "", detail: "", title: "" });
