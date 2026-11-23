/**
 * agent-design AG02: cards in the runner (SPRINTS.md「AG02 用预置的卡」, BND.yaml).
 *
 * `--seed-cards` puts the card a case's `card_ops` describe into the action ledger as the card of
 * the conversation request that would have produced it (origin: conversation, that requestId),
 * through the product's own ledger service (freezeCard), before the message is sent. Clicks,
 * resends, typed "确认", expiry and review then go through the normal endpoints:
 *
 *   GET  /api/agent/ledger/[id]             the current revision and hash the client shows
 *   POST /api/agent/ledger/[id]/transition  { transition, revision, payloadHash, clientDecisionId, operationId? }
 *   POST /api/agent/ledger/[id]/regenerate
 *
 * Fixture cards (`cards:` in a patch, e.g. card-canceled K1) are written the same way and then
 * brought to their fixture status through the ledger service.
 */
import type { AgentActionPreviewContract } from "../../../shared/contract/agent-v1";
import { conversationCardId } from "../../../features/agent-v1/entry/confirm-boundary";
import { agentCardPreview } from "../../../features/agent/runtime/card-view";
import { createOrbitAgentRuntimeService } from "../../../features/agent/runtime/service-factory";
import type { AgentActionRecord } from "../../../features/agent/runtime/contract";
import type { TodoOperationIntent } from "../../../features/agent/runtime/todo-operations";
import type { EvalCase } from "./cases";

export interface CardOpSpec {
  op: string;
  target?: string;
  set?: Record<string, unknown>;
}

/** The card a case describes: its last-card `card_ops` check. */
export function cardOpsOf(testCase: Pick<EvalCase, "hard">): CardOpSpec[] | null {
  const entry = testCase.hard.find((check) => "card_ops" in check);
  return entry && Array.isArray(entry.card_ops) ? (entry.card_ops as CardOpSpec[]) : null;
}

/**
 * A case with no `card_ops` whose first message is word for word that of another case in the same
 * area that has them describes the same card (AE-BND-001 and AE-BND-005). Reported in the trace.
 */
export function seedSpecFor(testCase: EvalCase, areaCases: readonly EvalCase[]): { ops: CardOpSpec[]; from: string } | null {
  const own = cardOpsOf(testCase);
  if (own) return { from: testCase.id, ops: own };
  const first = testCase.steps.find((step) => typeof step.user === "string")?.user;
  if (!first) return null;
  for (const other of areaCases) {
    if (other.id === testCase.id) continue;
    const otherFirst = other.steps.find((step) => typeof step.user === "string")?.user;
    const ops = cardOpsOf(other);
    if (otherFirst === first && ops) return { from: other.id, ops };
  }
  return null;
}

export function intentsFor(ops: readonly CardOpSpec[], idOf: (fixtureId: string) => string | undefined): TodoOperationIntent[] {
  return ops.map((spec) => {
    const set = Object.fromEntries(Object.entries(spec.set ?? {}).map(([key, value]) => [key, value === null ? null : String(value)]));
    if (spec.op === "todo.create") return { capability: "todo.create", set } as TodoOperationIntent;
    if (spec.op === "todo.update" && spec.target) {
      const targetId = idOf(spec.target);
      if (!targetId) throw new Error(`card target ${spec.target} has no product record`);
      return { capability: "todo.update", set, targetId } as TodoOperationIntent;
    }
    throw new Error(`card operation ${spec.op} cannot be seeded in AG02 (only todo.create and todo.update)`);
  });
}

/** Writes a card through the product's ledger service in the runner process; returns its preview. */
export async function seedCard(input: {
  actorId: string;
  actionId?: string;
  requestId: string;
  sessionId: string;
  locale: string;
  intents: readonly TodoOperationIntent[];
  createdAt: string;
  status?: string;
}): Promise<{ preview: AgentActionPreviewContract; action: AgentActionRecord }> {
  // The runner logs the seeded card itself (case clock, `seeded`); the product events this process
  // would append to the server trace (real clock, no case) would only duplicate it.
  const traceDir = process.env.ORBIT_AGENT_TRACE_DIR;
  delete process.env.ORBIT_AGENT_TRACE_DIR;
  try {
    return await seedCardQuietly(input);
  } finally {
    if (traceDir !== undefined) process.env.ORBIT_AGENT_TRACE_DIR = traceDir;
  }
}

async function seedCardQuietly(input: Parameters<typeof seedCard>[0]): Promise<{ preview: AgentActionPreviewContract; action: AgentActionRecord }> {
  const runtime = createOrbitAgentRuntimeService("live", { actorId: input.actorId });
  if (!runtime.freezeCard) throw new Error("the ledger service cannot freeze cards");
  const frozen = await runtime.freezeCard({
    actionId: input.actionId ?? conversationCardId(input.requestId),
    createdAt: input.createdAt,
    intents: input.intents,
    locale: input.locale,
    origin: { conversationId: input.sessionId, kind: "conversation", requestId: input.requestId },
  });
  if (!frozen.action) throw new Error(`no card could be frozen (missing targets: ${frozen.missingTargets.join(", ") || "none"})`);
  let action = frozen.action;
  if (input.status === "canceled") action = await runtime.cancelAction(action.actionId);
  else if (input.status && input.status !== "awaiting_confirmation") throw new Error(`fixture card status ${input.status} is not supported`);
  return { action, preview: agentCardPreview(action, await runtime.getRun(action.runId), input.createdAt) };
}

/** A moment as the user's local time (the eval clock zone, Asia/Tokyo). */
function localTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { day: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "numeric", timeZone: process.env.ORBIT_DEFAULT_TIME_ZONE ?? "Asia/Tokyo", weekday: "short" })
    .formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  const weekday: Record<string, string> = { Fri: "周五", Mon: "周一", Sat: "周六", Sun: "周日", Thu: "周四", Tue: "周二", Wed: "周三" };
  return `${parts.month}月${parts.day}日（${weekday[String(parts.weekday)] ?? parts.weekday}）${parts.hour}:${parts.minute}`;
}

/**
 * The runner's `card.decision` record of one button decision, taken from the server's answer as is:
 * a resent decision the server answers as a replay is `accepted: true, replayed: true` (AG03; in AG02
 * the runner wrote accepted:false for it, BND-003 seq 331 vs 332). Counting it once is the checks' job.
 */
export function decisionRecord(input: { body: Record<string, unknown>; cardId: string; client: string; result: { status: number; body: any } }) {
  const data = (input.result.body?.data ?? {}) as { decision?: Record<string, any>; card?: AgentActionPreviewContract };
  const decision = data.decision ?? {};
  return {
    accepted: decision.accepted === true,
    cardId: input.cardId,
    client: input.client,
    clientDecisionId: input.body.clientDecisionId,
    decision: String(input.body.transition),
    operationId: input.body.operationId ?? null,
    outcome: decision.outcome ?? null,
    reason: decision.reason ?? input.result.body?.error?.reason ?? (input.result.status >= 400 ? `HTTP_${input.result.status}` : null),
    replayed: decision.replayed === true,
    revision: data.card?.revision ?? null,
    status: input.result.status,
    type: "card.decision" as const,
    via: "click" as const,
  };
}

/** Card states in plain words for the transcript. */
export const CARD_STATUS_LABEL: Record<string, string> = {
  abandoned: "已放弃（用户放弃）",
  approved: "已批准，待执行",
  awaiting_confirmation: "等待确认",
  canceled: "已取消",
  completed: "已完成",
  deferred: "稍后处理",
  executing: "执行中",
  expired: "已过期",
  failed: "失败",
  needs_review: "需要核对",
  partially_failed: "部分失败",
  pending: "待执行",
  rejected: "已否决",
  skipped: "已跳过",
  succeeded: "已成功（执行器回执）",
  undone: "已撤销",
  user_confirmed: "用户标为已完成（不是执行器回执）",
};

export function cardText(card: AgentActionPreviewContract | null | undefined): string[] {
  if (!card) return ["  - （读不到这张卡）"];
  return [
    `  - 卡片 ${card.actionId} · 第 ${card.revision} 版 · ${CARD_STATUS_LABEL[card.status] ?? card.status}${card.expiresAt ? ` · ${localTime(card.expiresAt)} 前有效` : ""}`,
    `  - ${card.title}`,
    ...card.operations.map((op, index) => `    ${index + 1}. ${op.text}（${CARD_STATUS_LABEL[op.status] ?? op.status}）`),
    ...(card.changes?.length ? [`  - 变化的行：${card.changes.map((change) => `${changeLabel(card, change)}：卡上原来是「${shownValue(change.shownBefore)}」，现在是「${shownValue(change.now)}」${change.to !== undefined ? `，要改成「${shownValue(change.to)}」` : ""}`).join("；")}`] : []),
  ];
}

/** AG21c (R54): a changed row named by the card's own label, never by its field name. */
const FIELD_LABELS: Record<string, string> = { displayName: "姓名", dueAt: "截止时间", email: "邮箱", endsAt: "结束时间", organization: "公司", phone: "电话", plannedDate: "计划日", role: "职位", startsAt: "时间", status: "状态", title: "标题", venue: "地点" };
function changeLabel(card: AgentActionPreviewContract, change: { operationId: string; field: string }): string {
  const op = card.operations.find((item) => item.operationId === change.operationId) as { display?: { rows?: readonly { field: string; label: string }[] } } | undefined;
  return op?.display?.rows?.find((row) => row.field === change.field)?.label ?? FIELD_LABELS[change.field] ?? change.field;
}
/** AG21c (R54): a value as the card shows it — a day as 「11月18日」, an instant in local time; never an ISO string. */
function shownValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "（空）";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) return `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value)) return localTime(value);
  return typeof value === "string" ? value : JSON.stringify(value);
}
