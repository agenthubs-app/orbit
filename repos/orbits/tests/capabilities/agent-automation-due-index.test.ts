import assert from "node:assert/strict";
import test from "node:test";

import {
  latestDueAgentRulePeriod,
  nextAgentAutomationRunAt,
  nextAgentRulePeriod,
  validateAgentRuleSpec,
} from "../../features/agent/automations/contract";
import { createMemoryAutomationStorage } from "../../features/agent/automations/due-index";
import { automationRunId, createAutomationRunStore, type AgentAutomationRunRecord } from "../../features/agent/automations/runs";
import { createDispatchKit, createRule, FRIDAY_9, picked, ruleSpec, serviceFor, WORKSPACE } from "./agent-automation-kit";

/**
 * agent-design AG15-2 (设计稿 §5.3; PLANNER 易错边界 2/3): one due index across accounts, read by time; a rule and its
 * row are written together; a period is claimed once and computed once; the next period follows the IANA time zone.
 */

const at = (value: string) => new Date(value).toISOString();

test("a rule and its row of the due index are written together; pausing, changing and removing keep them in step", async () => {
  const storage = createMemoryAutomationStorage(WORKSPACE);
  let now = "2026-11-15T01:00:00.000Z";
  const rule = await createRule(storage, "user:a", () => now);
  const ref = { key: rule.automationId, kind: "rule" as const, ownerId: "user:a" };
  let row = await storage.direct.due.get(ref);
  assert.equal(row?.nextRunAt, at("2026-11-20T09:00:00+09:00"), "the first period is the next Friday 9:00 Tokyo time");
  assert.equal(row?.status, "active");
  assert.equal(row?.version, 1);
  assert.equal((row?.definition as { rule?: { maxItems?: number } }).rule?.maxItems, 3, "the row carries the rule the dispatcher runs");

  const service = serviceFor(storage, "user:a", () => now);
  now = "2026-11-16T01:00:00.000Z";
  await service.update(rule.automationId, { status: "paused" });
  row = await storage.direct.due.get(ref);
  assert.equal(row?.status, "paused");
  assert.equal(row?.nextRunAt, null, "a paused rule has nothing due");
  assert.equal((await service.get(rule.automationId))?.nextRunAt, null);

  // Re-confirming with another schedule: a new version, counted from now; nothing of the old version is left due.
  now = "2026-11-21T01:00:00.000Z";
  const changed = await service.update(rule.automationId, { status: "active", trigger: { kind: "schedule", schedule: { ...FRIDAY_9, daysOfWeek: [1] } } });
  row = await storage.direct.due.get(ref);
  assert.equal(changed.version, 2);
  assert.equal(row?.version, 2);
  assert.equal(row?.nextRunAt, at("2026-11-23T09:00:00+09:00"), "the Friday the old version missed is not run; the new version starts at its next Monday");

  await service.remove(rule.automationId);
  assert.equal(await storage.direct.due.get(ref), null, "a removed rule leaves no row behind");
});

test("an active rule written again with nothing changed keeps the period it is waiting for", async () => {
  const storage = createMemoryAutomationStorage(WORKSPACE);
  let now = "2026-11-15T01:00:00.000Z";
  const rule = await createRule(storage, "user:a", () => now);
  // Friday 9:05, before the dispatcher's pass: an unchanged write must not move the 9:00 period away.
  now = at("2026-11-20T09:05:00+09:00");
  await serviceFor(storage, "user:a", () => now).update(rule.automationId, { title: rule.title });
  assert.equal((await storage.direct.due.get({ key: rule.automationId, kind: "rule", ownerId: "user:a" }))?.nextRunAt, at("2026-11-20T09:00:00+09:00"));
});

test("two accounts with a rule at the same time are claimed in one pass, each under its own owner, each computed once", async () => {
  const kit = createDispatchKit();
  const a = await createRule(kit.storage, "user:a", kit.now);
  const b = await createRule(kit.storage, "user:b", kit.now, { title: "每周五看看有什么活动" });
  const summary = await kit.dispatch("2026-11-20T09:10:00+09:00");
  assert.equal(summary.periods, 2);
  assert.deepEqual(kit.computed.map((item) => [item.ownerId, item.automationId, item.scheduledAt]).sort(), [["user:a", a.automationId, at("2026-11-20T09:00:00+09:00")], ["user:b", b.automationId, at("2026-11-20T09:00:00+09:00")]]);
  assert.deepEqual(kit.inbox.map((entry) => entry.actorId).sort(), ["user:a", "user:b"], "one result each, in the owner's own inbox");
  // The next pass finds nothing due: the same period is not run again.
  const again = await kit.dispatch("2026-11-20T09:20:00+09:00");
  assert.equal(again.periods, 0);
  assert.equal(kit.computed.length, 2);
  assert.equal(kit.inbox.length, 2);
});

test("two claims at the same moment never take the same row", async () => {
  const storage = createMemoryAutomationStorage(WORKSPACE);
  const now = () => "2026-11-15T01:00:00.000Z";
  for (const owner of ["user:a", "user:b", "user:c", "user:d"]) await createRule(storage, owner, now);
  const due = at("2026-11-20T09:10:00+09:00");
  const [first, second] = await Promise.all([
    storage.claimDue({ leaseId: "one", leaseMs: 300_000, limit: 10, now: due }),
    storage.claimDue({ leaseId: "two", leaseMs: 300_000, limit: 10, now: due }),
  ]);
  const owners = [...first, ...second].map((item) => item.ownerId).sort();
  assert.deepEqual(owners, ["user:a", "user:b", "user:c", "user:d"], "every due row is claimed exactly once across the two claims");
  // A row whose claim was lost (the lease is not this claim's) cannot be moved on by the loser.
  const taken = first[0] ?? second[0];
  assert.equal(await storage.direct.due.settle(taken, "someone-else", { nextRunAt: null, updatedAt: due }), false);
  assert.equal(await storage.direct.due.settle(taken, taken.leaseId!, { nextRunAt: null, updatedAt: due }), true);
  // A claim left by a crashed dispatcher is taken over once its lease has run out.
  const [lost] = second.length ? second : first;
  if (lost && lost !== taken) {
    assert.equal((await storage.claimDue({ leaseId: "three", leaseMs: 300_000, limit: 10, now: due })).length, 0, "still leased");
    assert.ok((await storage.claimDue({ leaseId: "three", leaseMs: 300_000, limit: 10, now: at("2026-11-20T09:20:00+09:00") })).some((item) => item.ownerId === lost.ownerId));
  }
});

test("a period's history record has one id per workspace, owner, rule, version and planned time; a retry with the same key inserts nothing", async () => {
  const storage = createMemoryAutomationStorage(WORKSPACE);
  const runs = createAutomationRunStore(storage.direct.store, WORKSPACE);
  const key = { automationId: "rule:1", ownerId: "user:a", scheduledAt: "2026-11-20T09:00:00+09:00", version: 1, workspaceId: WORKSPACE };
  const runId = automationRunId(key);
  assert.equal(automationRunId({ ...key, scheduledAt: "2026-11-20T00:00:00.000Z" }), runId, "the same instant written another way is the same period");
  for (const other of [{ ownerId: "user:b" }, { version: 2 }, { automationId: "rule:2" }, { scheduledAt: "2026-11-27T09:00:00+09:00" }, { workspaceId: "workspace:other" }]) {
    assert.notEqual(automationRunId({ ...key, ...other }), runId);
  }
  const record: AgentAutomationRunRecord = { automationId: "rule:1", computedAt: "2026-11-20T00:10:00.000Z", delivery: { inbox: { attempts: 0, state: "none" }, push: { attempts: 0, state: "not_requested" } }, items: [], locale: "zh", notify: { inApp: true, push: false }, outcome: "no_match", ownerId: "user:a", runId, scheduledAt: at(key.scheduledAt), skipped: 0, text: "", title: "t", version: 1 };
  assert.ok(await runs.insert(record));
  assert.equal(await runs.insert({ ...record, outcome: "failed" }), null, "the second insert of the same period is refused");
  assert.equal((await runs.get("user:a", runId))?.outcome, "no_match");
  assert.equal(await runs.get("user:b", runId), null, "another account does not find it");
});

test("a period that was computed before a crash is not computed again: the retry goes straight on", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now);
  // First attempt: computed and stored, then the dispatcher dies before the index moves on (the row stays due).
  await kit.dispatch("2026-11-20T09:10:00+09:00");
  assert.equal(kit.computed.length, 1);
  await kit.storage.direct.due.put({ definition: (await kit.storage.direct.due.get({ key: rule.automationId, kind: "rule", ownerId: "user:a" }))!.definition, key: rule.automationId, kind: "rule", nextRunAt: at("2026-11-20T09:00:00+09:00"), ownerId: "user:a", status: "active", updatedAt: kit.now(), version: 1 });
  const summary = await kit.dispatch("2026-11-20T09:20:00+09:00");
  assert.equal(kit.computed.length, 1, "the same key finds the stored run; nothing is read or judged again");
  assert.equal(summary.periods, 0);
  assert.equal(kit.inbox.length, 1);
  assert.equal((await kit.storage.direct.due.get({ key: rule.automationId, kind: "rule", ownerId: "user:a" }))?.nextRunAt, at("2026-11-27T09:00:00+09:00"));
});

test("the next period follows the rule's time zone: a local time that occurs twice runs once, one that does not exist moves on", () => {
  const daily = { kind: "daily" as const, time: "01:30", timeZone: "America/New_York" };
  // 2026-11-01: clocks go back at 02:00 EDT → 01:00 EST; 01:30 happens twice (05:30Z and 06:30Z).
  const first = nextAgentAutomationRunAt(daily, "2026-11-01T04:00:00.000Z");
  assert.equal(first, "2026-11-01T05:30:00.000Z", "the first 01:30");
  assert.equal(nextAgentAutomationRunAt(daily, first!), "2026-11-02T06:30:00.000Z", "the second 01:30 of the same day is not another period");
  // 2026-03-08: clocks go forward at 02:00 EST → 03:00 EDT; 02:30 does not exist.
  const spring = { kind: "daily" as const, time: "02:30", timeZone: "America/New_York" };
  // AG21c (decision D5): the first valid minute after the gap (02:30 → 03:00 EDT), not the same width later (03:30).
  assert.equal(nextAgentAutomationRunAt(spring, "2026-03-08T05:00:00.000Z"), "2026-03-08T07:00:00.000Z", "02:30 in the gap runs at 03:00 local time, not skipped");
  assert.equal(nextAgentAutomationRunAt(spring, "2026-03-08T07:30:00.000Z"), "2026-03-09T06:30:00.000Z");
  // Tokyo has no daylight saving time; weekly rules land on the local weekday.
  assert.equal(nextAgentAutomationRunAt(FRIDAY_9, "2026-11-15T01:00:00.000Z"), at("2026-11-20T09:00:00+09:00"));
});

test("a rule's last valid day ends its periods; after an interruption only the latest due period is found, with the count passed over", () => {
  assert.equal(nextAgentRulePeriod(FRIDAY_9, "2026-11-30", at("2026-11-20T09:00:00+09:00")), at("2026-11-27T09:00:00+09:00"));
  assert.equal(nextAgentRulePeriod(FRIDAY_9, "2026-11-30", at("2026-11-27T09:00:00+09:00")), null, "December 4 is past the last day");
  assert.deepEqual(latestDueAgentRulePeriod(FRIDAY_9, null, at("2026-11-20T09:00:00+09:00"), at("2026-11-28T08:00:00+09:00")), { scheduledAt: at("2026-11-27T09:00:00+09:00"), skipped: 1, skippedAt: [at("2026-11-20T09:00:00+09:00")] });
  assert.deepEqual(latestDueAgentRulePeriod(FRIDAY_9, null, at("2026-11-20T09:00:00+09:00"), at("2026-11-20T09:10:00+09:00")), { scheduledAt: at("2026-11-20T09:00:00+09:00"), skipped: 0, skippedAt: [] });
  assert.equal(latestDueAgentRulePeriod(FRIDAY_9, null, at("2026-11-20T09:00:00+09:00"), at("2026-11-20T08:59:00+09:00")), null, "not due yet");
  assert.deepEqual(latestDueAgentRulePeriod(FRIDAY_9, "2026-11-30", at("2026-11-20T09:00:00+09:00"), at("2026-12-20T09:00:00+09:00")), { scheduledAt: at("2026-11-27T09:00:00+09:00"), skipped: 1, skippedAt: [at("2026-11-20T09:00:00+09:00")] }, "periods after the last day are neither run nor counted");
});

test("a rule must say what it picks from and by, and always uses the in-app inbox", () => {
  assert.doesNotThrow(() => validateAgentRuleSpec(ruleSpec()));
  assert.throws(() => validateAgentRuleSpec(ruleSpec({ ranking: {} })), /ranking basis/u, "no field, no topic and no note: no rule");
  assert.doesNotThrow(() => validateAgentRuleSpec(ruleSpec({ ranking: {}, references: [{ id: "note:m36", type: "memo" }] })));
  assert.throws(() => validateAgentRuleSpec(ruleSpec({ maxItems: 0 })), /1 to 20/u);
  assert.throws(() => validateAgentRuleSpec(ruleSpec({ notify: { inApp: false, push: true } })), /in-app inbox/u);
  assert.throws(() => validateAgentRuleSpec(ruleSpec({ validUntil: "11月底" })), /YYYY-MM-DD/u);
  assert.throws(() => validateAgentRuleSpec(ruleSpec({ action: "replan" })), /to-dos/u);
});

test("a rule's period is claimed by the dispatcher only; an older playbook without the rule fields keeps the per-account claim and is not indexed", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now);
  const service = serviceFor(kit.storage, "user:a", kit.now);
  const playbook = await service.create({ capabilityId: "events.recommend", delivery: "in_app", instruction: "看看有什么活动", title: "旧的 Playbook", trigger: { kind: "schedule", schedule: FRIDAY_9 } });
  assert.equal(await kit.storage.direct.due.get({ key: playbook.automationId, kind: "rule", ownerId: "user:a" }), null, "no index row for it");
  const claimed = await service.claimDue({ limit: 10, now: at("2026-11-20T09:10:00+09:00"), workerId: "old-worker" });
  assert.deepEqual(claimed.map((automation) => automation.automationId), [playbook.automationId], "the old claim never takes a rule's period");
  kit.result.value = () => picked(["E101"]);
  const summary = await kit.dispatch("2026-11-20T09:10:00+09:00");
  assert.equal(summary.periods, 1, "the rule's period is the dispatcher's");
  assert.deepEqual(kit.computed.map((item) => item.automationId), [rule.automationId], "and the dispatcher never runs the playbook");
});
