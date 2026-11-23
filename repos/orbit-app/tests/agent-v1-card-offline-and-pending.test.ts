import assert from "node:assert/strict";
import test from "node:test";

import { agentCardView } from "../src/api/compute/agent-card-view";
import type { AgentActionPreviewContract } from "../src/api/contract/agent-v1";
import { zh } from "../src/api/copy/zh";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createLocalSyncRepository } from "../src/data/sync/local-sync-repository";
import { pendingTargetsOf } from "../src/hooks/card-pending-targets";
import { requestIdOfAssistantMessage } from "../src/api/agent-v1-client";
import { NodeTestDatabase } from "./helpers/node-sync-database";

/**
 * agent-design AG07-3 / AG07-4 on the App: offline a waiting card shows only how many changes wait and nothing can be
 * pressed (so nothing can be queued and replayed after reconnecting); an edit of a record on the card still in this
 * device's outbox — found by record, not by a count per kind — disables confirm ("先同步你的修改"); once the outbox no
 * longer holds it, confirm comes back (the server's re-check then shows the new revision).
 */
const card: AgentActionPreviewContract = {
  actionId: "card1",
  locale: "zh",
  operations: [{ after: { plannedDate: "2026-11-20" }, before: { plannedDate: "2026-11-18" }, capability: "todo.update", display: { change: "update", record: "待办「给小林发修订报价」", rows: [{ after: "11月20日（周五）", before: "11月18日（周三）", field: "plannedDate", label: "计划日期" }] }, operationId: "card1:op1", status: "pending", target: { collection: "tasks", id: "task:t42" }, text: "t" }],
  payloadHash: "h1",
  revision: 1,
  revisions: [],
  status: "awaiting_confirmation",
  summary: "s",
  title: "修改1项",
  updatedAt: "2026-11-15T01:00:00.000Z",
};

test("offline: only the count and 联网后才能确认; no record name, no date, nothing to press", () => {
  const view = agentCardView(card, { online: false, pendingTargets: [] }, zh.aiCard);
  assert.equal(view.kind, "offline");
  assert.equal(view.confirmEnabled, false);
  assert.equal(view.cardContent, "hidden");
  assert.deepEqual(view.kind === "offline" ? [view.summary, view.hint] : [], ["有1份待确认的修改", "联网后才能确认"]);
  assert.doesNotMatch(JSON.stringify(view), /给小林|11月/u);
  // Reconnected: the card read again is shown; nothing was kept from the offline press (there was no button).
  const back = agentCardView(card, { online: true, pendingTargets: [] }, zh.aiCard);
  assert.ok(back.kind === "card" && back.confirmEnabled && back.status === "awaiting_confirmation");
});

test("an unsynced edit in the device outbox of the card's to-do disables confirm; another record does not", async (t) => {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const repo = createLocalSyncRepository({ actorId: "actor-a", database });
  const queued = (id: string, kind: "task" | "note", mutationId: string) => repo.enqueueOutboxMutation({
    actorId: "actor-a", baseRevision: "r1", createdAt: "2026-11-15T01:10:00.000Z", domainId: "test-offline-write", id, kind, lastErrorCode: null,
    mutationId, nextRetryAt: null, operation: "update", patch: { plannedDate: "2026-11-19" }, requestJson: null, retryCount: 0, workspaceId: "workspace-a",
  });
  await queued("task:t99", "task", "other-task");
  await queued("note:n1", "note", "a-note");
  const other = pendingTargetsOf(await repo.listQueuedMutations({ workspaceId: "workspace-a" }));
  assert.deepEqual(other, ["notes:note:n1", "tasks:task:t99"]);
  const free = agentCardView(card, { online: true, pendingTargets: other }, zh.aiCard);
  assert.ok(free.kind === "card" && free.confirmEnabled, "edits of other records do not hold this card back");

  await queued("task:t42", "task", "this-task");
  const targets = pendingTargetsOf(await repo.listQueuedMutations({ workspaceId: "workspace-a" }));
  const held = agentCardView(card, { online: true, pendingTargets: targets }, zh.aiCard);
  assert.ok(held.kind === "card");
  assert.deepEqual([held.confirmEnabled, held.blocked, held.items[0]?.pendingEdit, held.buttons?.dismissEnabled], [false, "先同步你的修改", "这条待办你在手机上改过，还没同步", true]);
});

test("a stored assistant message names its protocol-3 request", () => {
  assert.equal(requestIdOfAssistantMessage("assistant:agreq_0a1b"), "agreq_0a1b");
  assert.equal(requestIdOfAssistantMessage("assistant:agreq_0a1b:selection:x"), "agreq_0a1b");
  assert.equal(requestIdOfAssistantMessage("message:1"), null);
});
