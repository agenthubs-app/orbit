/**
 * agent-design AG18-3 — the reconcile list of a rollback (设计稿 §8 第 5 步「未执行动作可暂停并按批准账本对账」).
 *
 * Card by card, from the ledger only: what is waiting for a click, what was approved and not run yet (with its approval:
 * when and by whom), what ran with an unknown outcome (in review, AG02), what is done (with its receipts), and what is
 * closed. Read-only: nothing here changes a card, the queue or a record.
 */
import type { AgentActionRecord, AgentExecutionReceipt, AgentOutboxEvent } from "../../agent/runtime/contract";
import { effectiveCardStatus } from "../../agent/runtime/decision";
import type { AgentRuntimeService } from "../../agent/runtime/service";

export type ReconcileGroup = "waiting" | "approved_not_run" | "in_review" | "done" | "closed";

export interface ReconcileItem {
  actionId: string;
  origin: string;
  title: string;
  status: string;
  group: ReconcileGroup;
  revision: number;
  approval: { approvedAt: string | null; approvedBy: string | null };
  operations: {
    operationId: string;
    capability: string;
    /** The operation key the queue uses; restoring goes on with it (no second effect). */
    idempotencyKeys: string[];
    outbox: { status: string; attempts: number }[];
    receipts: { status: AgentExecutionReceipt["status"]; at: string; summary: string }[];
  }[];
}

const GROUP: Record<string, ReconcileGroup> = {
  approved: "approved_not_run",
  awaiting_confirmation: "waiting",
  canceled: "closed",
  completed: "done",
  deferred: "waiting",
  executing: "in_review",
  expired: "closed",
  failed: "done",
  partially_failed: "done",
  rejected: "closed",
  undone: "done",
};

function originOf(action: AgentActionRecord): string {
  const origin = action.origin as { kind?: string } | undefined;
  return origin?.kind ?? "legacy";
}

export function reconcileItemOf(action: AgentActionRecord, outbox: readonly AgentOutboxEvent[], receipts: readonly AgentExecutionReceipt[], now: string): ReconcileItem {
  const status = effectiveCardStatus(action, now);
  const mine = (operationId: string) => ({
    outbox: outbox.filter((event) => event.actionId === action.actionId && event.operationId === operationId),
    receipts: receipts.filter((receipt) => receipt.actionId === action.actionId && receipt.operationId === operationId),
  });
  const operations = action.operations.map((operation) => {
    const { outbox: events, receipts: done } = mine(operation.operationId);
    return {
      capability: String((operation as { capability?: string }).capability ?? (operation as { operationType?: string }).operationType ?? "action"),
      idempotencyKeys: [...new Set(events.map((event) => event.idempotencyKey))],
      operationId: operation.operationId,
      outbox: events.map((event) => ({ attempts: Number(event.attempt ?? 0), status: String(event.status) })),
      receipts: done.map((receipt) => ({ at: receipt.updatedAt, status: receipt.status, summary: receipt.resultSummary })),
    };
  });
  const inReview = operations.some((operation) => operation.receipts.some((receipt) => receipt.status === "needs_review"));
  return {
    actionId: action.actionId,
    approval: { approvedAt: (action as { approvedAt?: string }).approvedAt ?? null, approvedBy: (action as { approvedBy?: string }).approvedBy ?? null },
    group: inReview && status !== "completed" ? "in_review" : GROUP[status] ?? "closed",
    operations,
    origin: originOf(action),
    revision: action.revision ?? 1,
    status,
    title: action.title,
  };
}

/** One account's ledger as a reconcile list (oldest first). */
export async function reconcileList(runtime: Pick<AgentRuntimeService, "listActions" | "getRun">, now: string): Promise<ReconcileItem[]> {
  const actions = [...(await runtime.listActions({}))].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const items: ReconcileItem[] = [];
  const runs = new Map<string, Awaited<ReturnType<AgentRuntimeService["getRun"]>>>();
  for (const action of actions) {
    if (!runs.has(action.runId)) runs.set(action.runId, await runtime.getRun(action.runId));
    const detail = runs.get(action.runId);
    items.push(reconcileItemOf(action, detail?.outbox ?? [], detail?.receipts ?? [], now));
  }
  return items;
}

const GROUP_LABEL: Record<ReconcileGroup, string> = { approved_not_run: "已批准、还没执行", closed: "已关闭", done: "已完成（有回执）", in_review: "执行中结果未知，待核对", waiting: "等确认" };

export function reconcileMarkdown(account: string, items: readonly ReconcileItem[]): string[] {
  const lines = [`### 账号 ${account}：${items.length} 张卡`, ""];
  for (const group of ["waiting", "approved_not_run", "in_review", "done", "closed"] as ReconcileGroup[]) {
    const ofGroup = items.filter((item) => item.group === group);
    if (!ofGroup.length) continue;
    lines.push(`- ${GROUP_LABEL[group]}（${ofGroup.length}）`);
    for (const item of ofGroup) {
      lines.push(`  - ${item.actionId}「${item.title}」状态 ${item.status}，第 ${item.revision} 版，出处 ${item.origin}${item.approval.approvedAt ? `，批准于 ${item.approval.approvedAt}（${item.approval.approvedBy ?? "?"}）` : ""}`);
      for (const operation of item.operations) {
        lines.push(`    - ${operation.operationId} ${operation.capability}：队列 ${operation.outbox.map((event) => `${event.status}×${event.attempts}`).join("、") || "无"}；回执 ${operation.receipts.map((receipt) => `${receipt.status}（${receipt.summary}）`).join("、") || "无"}；操作键 ${operation.idempotencyKeys.join("、") || "无"}`);
      }
    }
  }
  return [...lines, ""];
}
