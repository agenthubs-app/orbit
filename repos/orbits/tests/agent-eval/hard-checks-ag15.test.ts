import assert from "node:assert/strict";
import { test } from "node:test";

import { buildEvalEnvironment } from "./lib/env-guard";
import { CHECKS, NOT_YET, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";

/**
 * agent-design AG15: the SCH words the runner gains (eval/README.md §3.4, CONVENTIONS §7) — `rule_runs` (the run history of
 * the whole case is exactly these), `rule_state`, and `listed` for a case with no conversation (the list delivered last is
 * the last scheduled run that reached the inbox). `scheduler_tick` calls the product's dispatch entry with a secret the
 * eval environment derives for itself.
 */

const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };
type Run = NonNullable<Observation["ruleRuns"]>[number];
const run = (extra: Partial<Run>): Run => ({ account: "A", cardId: null, delivery: "delivered", fixtureRule: "RU1", listed: [], outcome: "delivered", rule: "rule:1", scheduledAt: "2026-11-20T00:00:00.000Z", skipped: 0, ...extra });
const obs = (extra: Partial<Observation> = {}): Observation => ({
  account: "A", accounts: { A: "user_a" }, answers: [], businessChanges: [], cards: [], caseId: "AE-SCH-T", clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events: [], fake: false,
  fixtureIdOf: () => null, idMap: { RU1: "rule:1", RUB1: "rule:2" }, reads: [], requests: [], unsupported: [], ...extra,
});

test("rule_runs: the history must be exactly the runs listed — rule, planned time (any offset), outcome, skipped", () => {
  assert.equal(NOT_YET.rule_runs, undefined);
  assert.equal(NOT_YET.rule_state, undefined);
  const both = obs({ ruleRuns: [run({}), run({ account: "B", fixtureRule: "RUB1", rule: "rule:2" })] });
  const expected = [{ outcome: "delivered", rule: "RU1", scheduledAt: "2026-11-20T09:00:00+09:00" }, { outcome: "delivered", rule: "RUB1", scheduledAt: "2026-11-20T09:00:00+09:00" }];
  assert.equal(CHECKS.rule_runs(expected, both, context).status, "pass");
  assert.equal(CHECKS.rule_runs(expected.slice(0, 1), both, context).status, "fail", "a run the case does not list");
  assert.equal(CHECKS.rule_runs(expected, obs({ ruleRuns: [run({})] }), context).status, "fail", "a listed run that did not happen");
  assert.equal(CHECKS.rule_runs([{ ...expected[0], outcome: "no_match" }], obs({ ruleRuns: [run({})] }), context).status, "fail");
  // skipped: not written means 0.
  const caughtUp = obs({ ruleRuns: [run({ scheduledAt: "2026-11-27T00:00:00.000Z", skipped: 1 })] });
  assert.equal(CHECKS.rule_runs([{ outcome: "delivered", rule: "RU1", scheduledAt: "2026-11-27T09:00:00+09:00", skipped: 1 }], caughtUp, context).status, "pass");
  assert.equal(CHECKS.rule_runs([{ outcome: "delivered", rule: "RU1", scheduledAt: "2026-11-27T09:00:00+09:00" }], caughtUp, context).status, "fail");
  // An empty history is what a card nobody confirmed must leave.
  assert.equal(CHECKS.rule_runs([], obs({ ruleRuns: [] }), context).status, "pass");
  assert.equal(CHECKS.rule_runs([], both, context).status, "fail");
  // `rule: new` is the rule the case's own conversation made (no fixture id).
  const made = obs({ ruleRuns: [run({ fixtureRule: null, rule: "rule:made-here" })] });
  assert.equal(CHECKS.rule_runs([{ outcome: "delivered", rule: "new", scheduledAt: "2026-11-20T09:00:00+09:00" }], made, context).status, "pass");
  assert.equal(CHECKS.rule_runs([], obs(), context).status, "cannot_judge", "without the runner's reading it cannot be judged");
});

test("rule_state: the rule's state as its owner's list shows it; a rule that is gone is removed", () => {
  const rules = obs({ rulesAfter: [{ account: "A", fixtureId: "RU1", id: "rule:1", state: "paused", version: 1 }] });
  assert.equal(CHECKS.rule_state({ rule: "RU1", state: "paused" }, rules, context).status, "pass");
  assert.equal(CHECKS.rule_state({ rule: "RU1", state: "active" }, rules, context).status, "fail");
  assert.equal(CHECKS.rule_state({ rule: "RUB1", state: "removed" }, rules, context).status, "pass");
  assert.equal(CHECKS.rule_state({ rule: "RU1", state: "active" }, obs(), context).status, "cannot_judge");
});

test("listed: with no conversation, the list delivered last is the last scheduled run that reached the inbox", () => {
  const delivered = obs({ ruleRuns: [run({ listed: ["RE03", "RE05", "RE04"] }), run({ delivery: "none", listed: [], outcome: "no_match", scheduledAt: "2026-11-23T00:00:00.000Z" })] });
  assert.equal(CHECKS.listed({ count: 3, within: ["RE03", "RE04", "RE05"] }, delivered, context).status, "pass");
  assert.equal(CHECKS.listed({ count: 3, within: ["RE03", "RE04"] }, delivered, context).status, "fail");
  assert.equal(CHECKS.listed({ count: 3 }, obs({ ruleRuns: [run({ delivery: "pending", listed: ["RE03"] })] }), context).status, "fail", "a run not yet in the inbox delivered no list");
  // A conversation's answer still comes first when there is one.
  const answered = obs({ answers: [{ citations: ["E101"], seq: 9, text: "…" }], ruleRuns: [run({ listed: ["RE03"] })] });
  assert.equal(CHECKS.listed({ exact: ["E101"] }, answered, context).status, "pass");
});

test("the eval environment gives the dispatch entry its own secret: derived, at least 32 characters, shared by runner and server", () => {
  const file = { AUTH_SECRET: "a".repeat(40), ORBIT_AGENT_EVAL: "1", ORBIT_DATABASE_TARGET: "local", ORBIT_LOCAL_DATABASE_URL: "postgresql://localhost:5432/orbit_agent_eval", ORBIT_LOCAL_WORKSPACE_ID: "workspace:agent-eval" };
  const environment = buildEvalEnvironment({ CRON_SECRET: "the-developer-shell-secret-is-never-used-here-000" }, file);
  assert.match(environment.env.CRON_SECRET, /^[0-9a-f]{64}$/u);
  assert.notEqual(environment.env.CRON_SECRET, "the-developer-shell-secret-is-never-used-here-000");
  assert.equal(buildEvalEnvironment({}, file, { worker: 2 }).env.CRON_SECRET, environment.env.CRON_SECRET, "every worker's server takes the same one");
  assert.equal(buildEvalEnvironment({}, { ...file, CRON_SECRET: "x".repeat(40) }).env.CRON_SECRET, "x".repeat(40), "the eval env file may set its own");
});

test("AE-SCH-008: a waiting delivery taken up and cancelled is never told as sent in the transcript", async () => {
  const { dispatchNarration } = await import("./lib/runner");
  const paused = dispatchNarration("2026-11-20T09:20:00+09:00", 200, { deliveriesCancelled: 1, deliveriesRetried: 1, deliveriesSent: 0, periods: 0, timersFired: 0, undelivered: 0 });
  assert.doesNotMatch(paused, /补送|送进收件箱/u);
  assert.match(paused, /取出 1 条待送通知（取消 1 条，没有送出）/u);
  assert.match(dispatchNarration("x", 200, { deliveriesRetried: 2, deliveriesSent: 1, periods: 0, timersFired: 0 }), /取出 2 条待送通知（送进收件箱 1 条，仍没送出、继续待送 1 条）/u);
  assert.match(dispatchNarration("x", 200, { deliveriesRetried: 0, periods: 1, timersFired: 0 }), /处理了 1 期规则、没有待送通知、/u);
});
