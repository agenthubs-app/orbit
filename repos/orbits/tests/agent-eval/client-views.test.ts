import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentActionPreviewContract } from "../../shared/contract/agent-v1";
import { ClientViews } from "./lib/client-views";
import { CHECKS, NOT_YET, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";

/**
 * agent-design AG07 (PLANNER gap ④): the runner's client views. Each client keeps the cards it received and shows
 * them through the clients' own card rule; client_view reads one client after step n, same_card_on compares what the
 * clients show at the end (content, state and the preview it came from; not buttons or sync notices).
 */
const preview = (overrides: Partial<AgentActionPreviewContract> = {}): AgentActionPreviewContract => ({
  actionId: "card1",
  locale: "zh",
  operations: [{ after: { plannedDate: "2026-11-17" }, capability: "todo.update", display: { change: "update", record: "待办「给李薇寄样片」", rows: [{ after: "11月17日（周二）", before: "11月20日（周五）", field: "plannedDate", label: "计划日期" }] }, operationId: "card1:op1", status: "pending", target: { collection: "tasks", id: "task:t45" }, text: "t" }],
  payloadHash: "h1",
  revision: 1,
  revisions: [],
  status: "awaiting_confirmation",
  summary: "s",
  title: "修改1项",
  updatedAt: "2026-11-15T01:00:00.000Z",
  ...overrides,
});
const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };
const obsOf = (views: ClientViews): Observation => ({ clientViews: views.records, events: [] } as unknown as Observation);

test("offline keeps the old card but shows only the count; reconnecting with a newer state shows it", () => {
  const views = new ClientViews("zh");
  views.note("web", preview());
  views.note("app", preview());
  views.record(1, ["web", "app"], "card1");
  views.setOnline("app", false);
  views.note("web", preview({ status: "rejected", updatedAt: "2026-11-15T01:05:00.000Z" }));
  views.record(2, ["web", "app"], "card1");
  views.setOnline("app", true);
  views.note("app", preview({ status: "rejected", updatedAt: "2026-11-15T01:05:00.000Z" }));
  views.note("app", preview({ updatedAt: "2026-11-15T01:00:00.000Z" }));
  views.record(3, ["web", "app"], "card1");
  const check = CHECKS.client_view([
    { after_step: 1, card_content: "shown", client: "app", confirm: "enabled", pending_count: 1 },
    { after_step: 2, card_content: "hidden", client: "app", confirm: "disabled", pending_count: 1 },
    { after_step: 2, card_content: "shown", client: "web", confirm: "disabled", pending_count: 0 },
    { after_step: 3, card_content: "shown", client: "app", confirm: "disabled", pending_count: 0 },
  ], obsOf(views), context);
  assert.equal(check.status, "pass", check.detail);
  assert.equal(CHECKS.same_card_on(["web", "app"], obsOf(views), context).status, "pass", "an older version received later does not replace the newer one");
  const wrong = CHECKS.client_view([{ after_step: 2, card_content: "shown", client: "app", confirm: "enabled", pending_count: 1 }], obsOf(views), context);
  assert.equal(wrong.status, "fail");
  assert.match(wrong.detail, /card_content hidden, expected shown; .*confirm disabled, expected enabled/u);
});

test("an unsynced edit of the card's record disables confirm on that client only; same_card_on still compares content", () => {
  const views = new ClientViews("zh");
  views.note("web", preview());
  views.note("app", preview());
  views.addPending("app", { collection: "tasks", fixture: "T45", productId: "task:t45", set: { plannedDate: "2026-11-19" } });
  views.record(2, ["web", "app"], "card1");
  assert.equal(CHECKS.client_view([{ after_step: 2, card_content: "shown", client: "app", confirm: "disabled", pending_count: 1 }, { after_step: 2, client: "web", confirm: "enabled" }], obsOf(views), context).status, "pass");
  assert.equal(CHECKS.same_card_on(["web", "app"], obsOf(views), context).status, "pass");
  assert.equal(views.takePending("app").length, 1);
  assert.equal(views.takePending("app").length, 0);
});

test("card_ops: an instant written with another offset is the same time (AE-UIX-002); a different time is not", () => {
  const card = (dueAt: string) => ({ cards: [{ cardId: "c", frozenSeq: 1, kind: "ledger_action", observedBy: [], ops: [{ op: "todo.update", raw: {}, set: { dueAt }, target: "T44" }], revisions: 1, state: "awaiting_confirmation" }], fixtureIdOf: () => null, idMap: {} } as unknown as Observation);
  const expected = [{ op: "todo.update", set: { dueAt: "2026-11-18T18:00:00+09:00" }, target: "T44" }];
  assert.equal(CHECKS.card_ops(expected, card("2026-11-18T09:00:00.000Z"), context).status, "pass");
  assert.equal(CHECKS.card_ops(expected, card("2026-11-18T10:00:00.000Z"), context).status, "fail");
});

test("same_card_on fails on a different revision, and when a client shows no card content", () => {
  const views = new ClientViews("zh");
  views.note("web", preview({ payloadHash: "h2", revision: 2 }));
  views.note("app", preview());
  views.record(1, ["web", "app"], "card1");
  assert.equal(CHECKS.same_card_on(["web", "app"], obsOf(views), context).status, "fail");
  const offline = new ClientViews("zh");
  offline.note("web", preview());
  offline.note("app", preview());
  offline.setOnline("app", false);
  offline.record(1, ["web", "app"], "card1");
  assert.match(CHECKS.same_card_on(["web", "app"], obsOf(offline), context).detail, /app showed no card content/u);
  assert.equal(NOT_YET.client_view, undefined);
  assert.equal(NOT_YET.same_card_on, undefined);
});
