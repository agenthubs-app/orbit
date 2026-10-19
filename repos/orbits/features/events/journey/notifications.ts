/**
 * R27 SC-R27-13 活动通知（DESIGN §6.4 R13 行）的规则：Owner: 甲 (R27)；收件箱 / 推送本体归 R13。
 * - `event_deadline`：申込締切 48 小时前起（直到締切），对「加进了参加予定、还没报名」的人；
 * - `event_prep`：活动当天东京 8:00 起（到开场前），对已报名的人；
 * - 幂等：semanticKey = 类型 + 活动（同人同活动同类只一次；收件箱写入方按 semanticKey 去重，重放不重置已读）；
 * - 站内通知写入不受推送配额限制；推送频控由投递 worker 在发送前执行。
 */
import { tokyoParts } from "../../../shared/compute/event-score-input";

const HOUR = 3_600_000;

export interface EventNotificationCandidate {
  actorId: string;
  eventId: string;
  title: string;
  startsAt: string;
  registrationClosesAt: string | null;
  /** `planned` = in 参加予定 but not registered; `registered` covers registered / pending review. */
  status: "planned" | "registered";
}

export interface PlannedEventNotification {
  actorId: string;
  eventId: string;
  sourceKind: "event_deadline" | "event_prep";
  semanticKey: string;
  at: string;
}

function tokyoEight(startsAt: number): number {
  const DAY = 86_400_000;
  return tokyoParts(startsAt).dayIndex * DAY - 9 * HOUR + 8 * HOUR;
}

/** Which inbox notifications are due now. */
export function dueEventNotifications(candidates: readonly EventNotificationCandidate[], now: Date): PlannedEventNotification[] {
  const time = now.getTime();
  const out: PlannedEventNotification[] = [];
  for (const item of candidates) {
    const starts = Date.parse(item.startsAt);
    if (!Number.isFinite(starts)) continue;
    if (item.status === "planned" && item.registrationClosesAt) {
      const closes = Date.parse(item.registrationClosesAt);
      if (Number.isFinite(closes) && time >= closes - 48 * HOUR && time < closes) out.push({ actorId: item.actorId, at: new Date(closes).toISOString(), eventId: item.eventId, semanticKey: `event_deadline:${item.eventId}`, sourceKind: "event_deadline" });
    }
    if (item.status === "registered" && time >= tokyoEight(starts) && time < starts) {
      out.push({ actorId: item.actorId, at: new Date(starts).toISOString(), eventId: item.eventId, semanticKey: `event_prep:${item.eventId}`, sourceKind: "event_prep" });
    }
  }
  return out;
}

export function eventNotificationCopy(kind: "event_deadline" | "event_prep", title: string, language: "ja" | "zh" | "en" = "ja"): { title: string; body: string } {
  if (kind === "event_deadline") {
    return language === "zh" ? { body: "报名截止前 48 小时。要参加的话现在报名。", title: `${title} 即将截止报名` } : language === "en" ? { body: "Registration closes within 48 hours.", title: `${title}: registration closes soon` } : { body: "申込締切まで 48時間を切りました。参加するなら今のうちに申し込みましょう。", title: `${title} の申込締切が近づいています` };
  }
  return language === "zh" ? { body: "看看今天想见的人和准备清单。", title: `今天是 ${title}` } : language === "en" ? { body: "Check who to meet and your prep list.", title: `${title} is today` } : { body: "会いたい人と準備リストを確認しましょう。", title: `今日は ${title}` };
}

/** One run: plan → write every due inbox record (the writer is idempotent by semantic key). */
export async function runEventNotifications(deps: {
  candidates: () => Promise<EventNotificationCandidate[]>;
  write: (notification: PlannedEventNotification & { title: string; body: string; href: string }) => Promise<boolean>;
  now: Date;
}): Promise<{ planned: number; written: number }> {
  const candidates = await deps.candidates();
  const due = dueEventNotifications(candidates, deps.now);
  if (!due.length) return { planned: 0, written: 0 };
  let written = 0;
  for (const item of due) {
    const event = candidates.find((candidate) => candidate.eventId === item.eventId && candidate.actorId === item.actorId);
    if (!event) continue;
    const copy = eventNotificationCopy(item.sourceKind, event.title);
    const href = item.sourceKind === "event_prep" ? `/events/${item.eventId}/prep` : `/events/${item.eventId}/register`;
    if (await deps.write({ ...item, ...copy, href })) written += 1;
  }
  return { planned: due.length, written };
}
