/**
 * R26 重算任务（events DESIGN §6.5，SC-R26-16）。Owner: 甲 (R26).
 *
 * - 范围有界：未来 30 天内开始、`ready` 的库内活动评估，每轮 ≤100 条；外部活动不重算（没有名单来源）。
 * - 只用规则（`judgeEvent`），不调 AI。报名者名单有变化（签名 = 报名人数）才重算。
 * - 分数变化 ≥10，或参加者名单首次公开（签名从 0 / 空变成有人）→ 写一条 `event_pick` 收件箱通知，深链到評価結果；
 *   `semanticKey` 带签名，同一次变化只写一条（b8 #4「参加者リストが公開されたら再計算し、お知らせします」由这里兑现）。
 * - 由维护任务每轮调用，进程内节流为每小时一次。
 */
import type { InboxNotificationUpsert } from "../../notifications/inbox-record-service";
import type { MaintenanceTask } from "../../operations/maintenance/pass";
import { judgeEvent } from "./judge";
import type { EventAssessmentRepository } from "./repository";
import type { AssessmentPlanPort, OrbitEventPort } from "./service";

export const EVENT_ASSESSMENT_RECOMPUTE_TASK = "event_assessment_recompute";
export const RECOMPUTE_WINDOW_DAYS = 30;
export const RECOMPUTE_LIMIT = 100;
export const RECOMPUTE_NOTIFY_DELTA = 10;
const HOUR = 3_600_000;

export interface RecomputeNotice {
  actorId: string;
  assessmentId: string;
  eventId: string;
  title: string;
  from: number;
  to: number;
  firstPublic: boolean;
  signature: string;
  at: string;
}

export function eventPickNotification(notice: RecomputeNotice): InboxNotificationUpsert {
  const copy = {
    en: { reason: notice.firstPublic ? "The attendee list was published, so the score was recomputed." : "The attendees changed, so the score was recomputed.", title: `${notice.title}: ${notice.from} → ${notice.to}` },
    ja: { reason: notice.firstPublic ? "参加者リストが公開されたので、スコアを再計算しました。" : "参加者が変わったので、スコアを再計算しました。", title: notice.firstPublic ? `参加者リストが公開されました · ${notice.from} → ${notice.to}` : `${notice.title} · ${notice.from} → ${notice.to}` },
    zh: { reason: notice.firstPublic ? "参会名单公开了，已重新计算分数。" : "参会者有变化，已重新计算分数。", title: notice.firstPublic ? `参会名单已公开 · ${notice.from} → ${notice.to}` : `${notice.title} · ${notice.from} → ${notice.to}` },
  };
  return {
    actions: ["read", "dismiss", "handle"],
    actorId: notice.actorId,
    copy,
    kind: "suggestion",
    object: { id: notice.eventId, name: notice.title },
    occurredAt: notice.at,
    origin: "automation",
    reason: copy.ja.reason,
    semanticKey: `event-pick:${notice.assessmentId}:${notice.signature}`,
    sources: [{ occurredAt: notice.at, readAt: notice.at, sourceId: notice.assessmentId, sourceKind: "event_pick", sourceRevision: notice.signature }],
    target: { href: `/app/events/assessments/${encodeURIComponent(notice.assessmentId)}`, id: notice.eventId, kind: "event", status: "available" },
    title: copy.ja.title,
  } as InboxNotificationUpsert;
}

export async function recomputeAssessments(deps: {
  repository: EventAssessmentRepository;
  plan: AssessmentPlanPort;
  orbitEvents: OrbitEventPort;
  notify(notice: RecomputeNotice): Promise<void>;
  now: () => Date;
}, input: { limit?: number } = {}): Promise<{ examined: number; recomputed: number; notified: number }> {
  const now = deps.now();
  const rows = await deps.repository.listRecomputeCandidates({ from: now.toISOString(), limit: input.limit ?? RECOMPUTE_LIMIT, until: new Date(now.getTime() + RECOMPUTE_WINDOW_DAYS * 86_400_000).toISOString() });
  const summary = { examined: 0, notified: 0, recomputed: 0 };
  for (const row of rows) {
    if (!row.eventId) continue;
    summary.examined += 1;
    const context = await deps.plan.context(row.actorId, "ja");
    const orbit = await deps.orbitEvents.facts(row.actorId, row.eventId, context).catch(() => null);
    if (!orbit) continue;
    if (orbit.attendeeSignature === row.attendeeSignature) {
      // 复核 M5：没变化也记下检查时间，候选按检查时间轮转，第 101 条以后也轮得到。
      await deps.repository.update(row.actorId, row.id, { factsRefreshedAt: now.toISOString() });
      continue;
    }
    const judged = judgeEvent({ context, eventId: row.eventId, facts: orbit.facts, orbit: orbit.extras });
    const at = now.toISOString();
    await deps.repository.update(row.actorId, row.id, {
      attendeeSignature: orbit.attendeeSignature, facts: orbit.facts, factsRefreshedAt: at, scoreBreakdown: judged.scoreBreakdown,
      total: judged.total, totalMax: judged.range?.max ?? null, totalMin: judged.range?.min ?? null, verdict: judged.verdict,
    });
    summary.recomputed += 1;
    const firstPublic = (row.attendeeSignature === null || row.attendeeSignature === "0") && orbit.attendeeSignature !== null && orbit.attendeeSignature !== "0";
    if (firstPublic || Math.abs(judged.total - row.total) >= RECOMPUTE_NOTIFY_DELTA) {
      await deps.notify({ actorId: row.actorId, assessmentId: row.id, at, eventId: row.eventId, firstPublic, from: row.total, signature: orbit.attendeeSignature ?? "0", title: orbit.facts.title ?? row.facts.title ?? "", to: judged.total });
      summary.notified += 1;
    }
  }
  return summary;
}

const throttle = globalThis as typeof globalThis & { __orbitR26RecomputeAt?: number };

export function createEventAssessmentRecomputeMaintenanceTask(input: { resolve: () => Omit<Parameters<typeof recomputeAssessments>[0], "now"> | null }): MaintenanceTask {
  return {
    name: EVENT_ASSESSMENT_RECOMPUTE_TASK,
    async run({ now }) {
      const deps = input.resolve();
      if (!deps) return { skipped: "database_unconfigured" };
      const at = now().getTime();
      if (throttle.__orbitR26RecomputeAt && at - throttle.__orbitR26RecomputeAt < HOUR) return { skipped: "hourly" };
      throttle.__orbitR26RecomputeAt = at;
      try {
        return await recomputeAssessments({ ...deps, now });
      } catch (error) {
        if ((error as { code?: unknown })?.code === "42P01") return { skipped: "schema_missing" };
        throw error;
      }
    },
  };
}
