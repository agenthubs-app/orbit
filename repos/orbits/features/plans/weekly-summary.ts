/**
 * 每周一的「上周小结」（RW-12 / Q36A，Sprint W0012）。纯函数，不读时钟、不碰存储，不调 AI。
 *
 * - 时区一律 Asia/Tokyo；一周从周一 00:00 开始。只有东京时间的周一才出小结，其他日子
 *   iOrbit 导语保持今日导语（`isTokyoMonday`）。
 * - 「上周」= 上一个东京周一 00:00（含）到本周一 00:00（不含），换成 UTC 瞬间给仓储按
 *   `plan_log.created_at` 取数（`previousTokyoWeek`）。
 * - 小结只由 `plan_log` 的结构化字段按规则数出来（`summarizePlanWeek`）：同一条目在一周里来回变化
 *   只看最后一次（打勾又撤销不算完成），联系人按 id 去重；文字由 `weeklySummaryText` 拼。
 */
import type { PlanLogEntry } from "./contract";
import { planTokyoDate } from "./week";

const DAY_MS = 86_400_000;
const TOKYO_OFFSET = "+09:00";

export interface PlanWeekWindow {
  /** 上周一（东京日历日 YYYY-MM-DD）。 */
  start: string;
  /** 上周日（东京日历日 YYYY-MM-DD）。 */
  end: string;
  /** 取数区间（UTC ISO）：[fromIso, toIso)。 */
  fromIso: string;
  toIso: string;
}

export interface PlanWeeklyCounts {
  actionsCompleted: number;
  eventsRegistered: number;
  eventsAttended: number;
  contactsLinked: number;
  contactsEstablished: number;
  notes: number;
  /** 上周进入的新阶段名（按进入顺序）。 */
  phasesEntered: string[];
}

export interface PlanWeeklySummary {
  window: PlanWeekWindow;
  counts: PlanWeeklyCounts;
}

function dayNumber(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`) / DAY_MS;
}

function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 东京日历日的星期（0 = 周日 … 6 = 周六）。 */
export function tokyoWeekday(at: Date): number {
  return new Date(dayNumber(planTokyoDate(at)) * DAY_MS).getUTCDay();
}

export function isTokyoMonday(at: Date): boolean {
  return tokyoWeekday(at) === 1;
}

/** `at` 所在东京周（周一开始）的上一周。 */
export function previousTokyoWeek(at: Date): PlanWeekWindow {
  const today = dayNumber(planTokyoDate(at));
  const thisMonday = today - ((tokyoWeekday(at) + 6) % 7);
  const start = isoDay(thisMonday - 7);
  const nextStart = isoDay(thisMonday);
  return {
    end: isoDay(thisMonday - 1),
    fromIso: new Date(`${start}T00:00:00.000${TOKYO_OFFSET}`).toISOString(),
    start,
    toIso: new Date(`${nextStart}T00:00:00.000${TOKYO_OFFSET}`).toISOString(),
  };
}

const ACTION_STATUSES = new Set(["not_started", "in_progress", "done"]);

/** 从一周的进展记录数出小结（记录顺序无关，按 createdAt 排序后判定）。 */
export function summarizePlanWeek(entries: readonly PlanLogEntry[], window: PlanWeekWindow): PlanWeeklySummary {
  const from = Date.parse(window.fromIso);
  const to = Date.parse(window.toIso);
  const inWindow = entries
    .filter((entry) => {
      const at = Date.parse(entry.createdAt);
      return at >= from && at < to;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const lastActionStatus = new Map<string, string>();
  const eventStatuses = new Map<string, string[]>();
  const linked = new Set<string>();
  const established = new Set<string>();
  const phasesEntered: string[] = [];
  let notes = 0;

  for (const entry of inWindow) {
    if (entry.kind === "manual") {
      notes += 1;
      continue;
    }
    switch (entry.event) {
      case "item_status_changed": {
        if (!entry.itemId || !entry.toStatus) break;
        if (ACTION_STATUSES.has(entry.toStatus)) lastActionStatus.set(entry.itemId, entry.toStatus);
        else eventStatuses.set(entry.itemId, [...(eventStatuses.get(entry.itemId) ?? []), entry.toStatus]);
        break;
      }
      case "contact_linked":
        for (const id of entry.linkedContactIds) linked.add(id);
        break;
      case "contact_unlinked":
        for (const id of entry.linkedContactIds) linked.delete(id);
        break;
      case "contact_established":
        for (const id of entry.linkedContactIds) established.add(id);
        break;
      case "phase_entered": {
        const title = typeof entry.payload.phaseTitle === "string" ? entry.payload.phaseTitle : null;
        if (title) phasesEntered.push(title);
        break;
      }
      default:
        break;
    }
  }

  let eventsRegistered = 0;
  let eventsAttended = 0;
  for (const statuses of eventStatuses.values()) {
    const last = statuses[statuses.length - 1];
    if (statuses.includes("registered") && last !== "recommended") eventsRegistered += 1;
    if (last === "attended") eventsAttended += 1;
  }

  return {
    counts: {
      actionsCompleted: [...lastActionStatus.values()].filter((status) => status === "done").length,
      contactsEstablished: established.size,
      contactsLinked: linked.size,
      eventsAttended,
      eventsRegistered,
      notes,
      phasesEntered,
    },
    window,
  };
}

function monthDay(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/** 规则拼出的一句话小结（导语用）。 */
export function weeklySummaryText(summary: PlanWeeklySummary, lang: "en" | "zh"): string {
  const { counts, window } = summary;
  const range = `${monthDay(window.start)}–${monthDay(window.end)}`;
  const zh = lang === "zh";
  const parts: string[] = [];
  const push = (value: number, zhText: string, enText: string) => {
    if (value > 0) parts.push(zh ? zhText : enText);
  };
  push(counts.actionsCompleted, `完成 ${counts.actionsCompleted} 件行动`, `completed ${counts.actionsCompleted} action(s)`);
  push(counts.contactsEstablished, `新建立联系 ${counts.contactsEstablished} 位`, `connected with ${counts.contactsEstablished} people`);
  push(counts.contactsLinked, `关联 ${counts.contactsLinked} 位联系人到人脉需求`, `linked ${counts.contactsLinked} contact(s) to your needs`);
  push(counts.eventsRegistered, `报名 ${counts.eventsRegistered} 场活动`, `registered for ${counts.eventsRegistered} event(s)`);
  push(counts.eventsAttended, `参加 ${counts.eventsAttended} 场活动`, `attended ${counts.eventsAttended} event(s)`);
  for (const title of counts.phasesEntered) parts.push(zh ? `进入新阶段「${title}」` : `moved into “${title}”`);
  push(counts.notes, `记了 ${counts.notes} 笔进展`, `noted ${counts.notes} update(s)`);
  if (parts.length === 0) {
    return zh ? `上周（${range}）计划上没有记录到进展。` : `No plan progress was recorded last week (${range}).`;
  }
  return zh ? `上周（${range}）你${parts.join("、")}。` : `Last week (${range}) you ${parts.join(", ")}.`;
}
