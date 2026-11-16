/**
 * agent-design AG07 (设计稿 §7, AE-UIX-006; PLANNER 缺口 ②): after the App synced its own edit, the card is looked at
 * again without a click. A value the card showed that changed re-freezes it as revision 2 from the current data, with
 * the changed row marked and the new display rows ("现在是 11月19日（周四）→ 改成 11月20日（周五）"); it still
 * waits for a click; nothing is executed or written. Nothing changed, a closed or an expired card: left as it is.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { handleCardRecheck } from "../../features/agent/ledger/card-routes";
import { AGENT_CARD_TTL_MS } from "../../features/agent/runtime/decision";
import { ACTOR, createCardKit, decide, freeze } from "./agent-ledger-card-kit";

test("the shown value changed: revision 2 with the change marked and new display rows; no decision, no write", async () => {
  const kit = createCardKit();
  const todo = await kit.todo("给小林发修订报价", "2026-11-18");
  const card = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: todo.id }]);
  const current = await kit.tasks.get({ actorId: ACTOR, taskId: todo.id });
  await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: current!.updatedAt, idempotencyKey: "app-sync", now: kit.now(), patch: { plannedDate: "2026-11-19" }, taskId: todo.id });
  const tasksBefore = JSON.stringify(await kit.listTasks());
  const result = await handleCardRecheck({ actionId: card.actionId, now: kit.now, runtime: kit.runtime });
  assert.equal(result.status, 200);
  const body = result.body.data as { card: { revision: number; status: string; changes: { field: string; now: unknown }[]; operations: { display: { rows: { before?: string; after: string }[] } }[] }; recheck: { outcome: string } };
  assert.equal(body.recheck.outcome, "revised");
  assert.equal(body.card.revision, 2);
  assert.equal(body.card.status, "awaiting_confirmation");
  assert.deepEqual(body.card.changes.map((change) => [change.field, change.now]), [["plannedDate", "2026-11-19"]]);
  assert.deepEqual(body.card.operations[0].display.rows[0], { after: "11月20日（周五）", before: "11月19日（周四）", field: "plannedDate", label: "计划日期" });
  assert.equal(JSON.stringify(await kit.listTasks()), tasksBefore, "looking again writes nothing");
  assert.equal((await kit.runtime.getRun(card.runId))?.outbox.length, 0, "and is not a decision");
  assert.equal(kit.executorCalls.length, 0);
  const stale = await decide(kit, card, "confirm", "decision:stale");
  assert.equal(stale?.reason, "CARD_REVISION_CHANGED", "the old revision can no longer be confirmed");
});

test("nothing changed: the card stays revision 1; a closed card and an expired card are left as they are", async () => {
  const kit = createCardKit();
  const todo = await kit.todo("约山本吃饭", "2026-11-21");
  const card = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-28" }, targetId: todo.id }]);
  const same = await handleCardRecheck({ actionId: card.actionId, now: kit.now, runtime: kit.runtime });
  assert.equal((same.body.data as { recheck: { outcome: string } }).recheck.outcome, "unchanged");
  assert.equal((await kit.runtime.getAction(card.actionId))?.revision ?? 1, 1);

  const rejected = await freeze(kit, [{ capability: "todo.create", set: { title: "续订域名" } }]);
  await decide(kit, rejected, "reject", "decision:reject");
  const closed = await handleCardRecheck({ actionId: rejected.actionId, now: kit.now, runtime: kit.runtime });
  assert.deepEqual([(closed.body.data as { recheck: { reason: string } }).recheck.reason, (closed.body.data as { card: { status: string } }).card.status], ["CARD_CLOSED", "rejected"]);

  kit.advance(AGENT_CARD_TTL_MS + 60_000);
  const expired = await handleCardRecheck({ actionId: card.actionId, now: kit.now, runtime: kit.runtime });
  assert.deepEqual([(expired.body.data as { recheck: { reason: string } }).recheck.reason, (expired.body.data as { card: { status: string } }).card.status], ["CARD_EXPIRED", "expired"]);
});
