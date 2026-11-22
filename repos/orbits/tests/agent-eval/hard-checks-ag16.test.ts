import assert from "node:assert/strict";
import { test } from "node:test";

import { buildEvalEnvironment } from "./lib/env-guard";
import { CHECKS, NOT_YET, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";

/**
 * agent-design AG16: the PSH words the runner gains (eval/README.md §3.4, CONVENTIONS §7) — `push_delivery` (one period
 * of one rule: inbox entries, times worked out, reminder attempts, delivered or not), `push_excludes` (nothing of these
 * on any reminder), `push` counting the reminders the simulated push service took, and the eval server's two push
 * channels pointing at this machine's simulator.
 */

const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };
type Run = NonNullable<Observation["ruleRuns"]>[number];
const HEX = "0123456789abcdef0123456789abcdef";
const RUN_ID = `autorun:${HEX}`;
const DELIVERY = `rule-push:${HEX}`;
const run = (extra: Partial<Run> = {}): Run => ({
  account: "A", cardId: null, computeAttempts: 1, computedAt: "2026-11-20T00:10:00.000Z", delivery: "delivered", fixtureRule: "RU1", listed: [], outcome: "delivered",
  push: { attempts: 1, deliveredAt: "2026-11-20T00:10:00.000Z", deliveryId: DELIVERY, reason: null, state: "delivered", targets: [{ attempts: 1, platform: "ios", state: "delivered" }] },
  rule: "rule:1", runId: RUN_ID, scheduledAt: "2026-11-20T00:00:00.000Z", skipped: 0, ...extra,
});
const pushEvent = (seq: number, extra: Record<string, unknown> = {}) => ({ body: "有新结果，请到 Orbit 查看。", channel: "expo", client: "app", data: { deliveryId: DELIVERY }, outcome: "accepted", seq, source: "simulated", title: "Orbit", type: "notify.push", ...extra });
const inboxRecord = (id: string, runId = RUN_ID) => ({ after: { sources: [{ sourceId: runId, sourceKind: "automation_result" }], title: "每周五挑三场周末活动" }, before: null, collection: "inboxNotifications", fields: [], id, kind: "created" as const, owner: "user_a", workspace: "w" });
const obs = (extra: Partial<Observation> = {}): Observation => ({
  account: "A", accounts: { A: "user_a" }, answers: [], businessChanges: [], cards: [], caseId: "AE-PSH-T", clarifications: 0, clicks: [], decisions: [], diff: { records: [inboxRecord("inbox:1")], tables: [] },
  events: [{ runId: RUN_ID, seq: 5, type: "rule.run" }, pushEvent(9)] as never, fake: false, fixtureIdOf: () => null, idMap: { RU1: "rule:1", RU2: "rule:2" }, reads: [], requests: [], ruleRuns: [run()], unsupported: [], ...extra,
});
const AT = "2026-11-20T09:00:00+09:00";

test("push_delivery: the period's inbox entries, computations, reminder attempts and delivery — only the fields written are checked", () => {
  assert.equal(NOT_YET.push_delivery, undefined);
  assert.equal(NOT_YET.push_excludes, undefined);
  assert.equal(CHECKS.push_delivery([{ at: AT, attempts: 1, computed: 1, delivered: true, inbox: 1, rule: "RU1" }], obs(), context).status, "pass");
  assert.equal(CHECKS.push_delivery([{ at: AT, delivered: true, rule: "RU1" }], obs(), context).status, "pass", "fields not written are not checked");
  assert.equal(CHECKS.push_delivery([{ at: AT, attempts: 2, rule: "RU1" }], obs(), context).status, "fail");
  assert.equal(CHECKS.push_delivery([{ at: AT, delivered: false, rule: "RU1" }], obs(), context).status, "fail");
  assert.equal(CHECKS.push_delivery([{ at: AT, inbox: 2, rule: "RU1" }], obs(), context).status, "fail");
  assert.equal(CHECKS.push_delivery([{ at: "2026-11-27T09:00:00+09:00", rule: "RU1" }], obs(), context).status, "fail", "no run of that period");
  assert.equal(CHECKS.push_delivery([{ at: AT, rule: "RU1" }], obs({ ruleRuns: undefined }), context).status, "cannot_judge");
});

test("push_delivery: a task without the switch — no attempt in the record and nothing handed to the push service", () => {
  const off = run({ fixtureRule: "RU2", push: { attempts: 0, deliveredAt: null, deliveryId: null, reason: null, state: "not_requested", targets: [] }, rule: "rule:2", runId: `autorun:${"f".repeat(32)}` });
  const both = obs({ diff: { records: [inboxRecord("inbox:1"), inboxRecord("inbox:2", off.runId)], tables: [] }, ruleRuns: [run(), off] });
  const expected = [{ at: AT, attempts: 1, computed: 1, delivered: true, inbox: 1, rule: "RU1" }, { at: AT, attempts: 0, computed: 1, delivered: false, inbox: 1, rule: "RU2" }];
  assert.equal(CHECKS.push_delivery(expected, both, context).status, "pass");
  // The record says "never tried", but the push service was handed a reminder for that period: the record is not believed.
  const leaked = obs({ diff: both.diff, events: [...both.events, pushEvent(12, { data: { deliveryId: `rule-push:${"f".repeat(32)}` } })] as never, ruleRuns: [run(), off] });
  const result = CHECKS.push_delivery(expected, leaked, context);
  assert.equal(result.status, "fail");
  assert.match(result.detail, /RU2: the record says no attempt, but 1 reminder/u);
});

test("push_delivery: a retry is two attempts, one computation, one inbox entry; the reminder's time is its own", () => {
  const retried = obs({
    events: [{ runId: RUN_ID, seq: 5, type: "rule.run" }, pushEvent(9, { outcome: "rejected" }), pushEvent(20)] as never,
    ruleRuns: [run({ push: { attempts: 2, deliveredAt: "2026-11-20T00:20:00.000Z", deliveryId: DELIVERY, reason: null, state: "delivered", targets: [{ attempts: 2, platform: "ios", state: "delivered" }] } })],
  });
  const expected = [{ at: AT, attempts: 2, computed: 1, delivered: true, inbox: 1, rule: "RU1" }];
  const result = CHECKS.push_delivery(expected, retried, context);
  assert.equal(result.status, "pass", result.detail);
  assert.match(result.detail, /result worked out at 2026-11-20T00:10:00.000Z, reminder delivered at 2026-11-20T00:20:00.000Z/u);
  // Worked out again for the retry: a second rule.run of the same period.
  const recomputed = obs({ ...retried, events: [...retried.events, { runId: RUN_ID, seq: 15, type: "rule.run" }] as never });
  assert.match(CHECKS.push_delivery(expected, recomputed, context).detail, /worked out 2 time\(s\), expected 1/u);
  // A model call for this period after its first reminder attempt.
  const asked = obs({ ...retried, events: [...retried.events, { requestId: `rule-run:${RUN_ID}`, seq: 14, type: "model.request" }] as never });
  assert.match(CHECKS.push_delivery(expected, asked, context).detail, /1 model or judgment request\(s\) for this period after its first reminder attempt/u);
  // The record claims delivery but the push service took nothing.
  const claimed = obs({ ...retried, events: [{ runId: RUN_ID, seq: 5, type: "rule.run" }, pushEvent(9, { outcome: "rejected" }), pushEvent(20, { outcome: "rejected" })] as never });
  assert.match(CHECKS.push_delivery(expected, claimed, context).detail, /the record says delivered, the push service took 0/u);
  // A delivery with no time of its own.
  const untimed = obs({ ...retried, ruleRuns: [run({ push: { attempts: 2, deliveredAt: null, deliveryId: DELIVERY, reason: null, state: "delivered", targets: [] } })] });
  assert.match(CHECKS.push_delivery(expected, untimed, context).detail, /not kept as two separate times/u);
});

test("push_delivery: a revoked device — tried, refused, not delivered, the inbox entry still there", () => {
  const revoked = obs({
    events: [{ runId: RUN_ID, seq: 5, type: "rule.run" }, pushEvent(9, { error: "DeviceNotRegistered", outcome: "rejected" })] as never,
    ruleRuns: [run({ push: { attempts: 1, deliveredAt: null, deliveryId: DELIVERY, reason: "permission_revoked", state: "failed", targets: [{ attempts: 1, platform: "ios", state: "revoked" }] } })],
  });
  const result = CHECKS.push_delivery([{ at: AT, computed: 1, delivered: false, inbox: 1, rule: "RU1" }], revoked, context);
  assert.equal(result.status, "pass", result.detail);
  assert.match(result.detail, /reminder failed\/permission_revoked/u);
  assert.equal(CHECKS.push({ count: 0 }, revoked, context).status, "pass", "a refused reminder did not go out");
  assert.equal(CHECKS.push({ count: 1 }, obs(), context).status, "pass");
  assert.equal(CHECKS.push({ count: 1 }, revoked, context).status, "fail");
});

test("push_excludes: none of the words on any reminder — title, body or data — taken or refused", () => {
  const words = ["东京街头摄影展", "涩谷"];
  assert.equal(CHECKS.push_excludes(words, obs(), context).status, "pass");
  assert.equal(CHECKS.push_excludes(words, obs({ events: [pushEvent(9, { body: "周末活动：东京街头摄影展" })] as never }), context).status, "fail");
  assert.equal(CHECKS.push_excludes(words, obs({ events: [pushEvent(9, { title: "涩谷有新活动" })] as never }), context).status, "fail");
  assert.equal(CHECKS.push_excludes(words, obs({ events: [pushEvent(9, { data: { deliveryId: DELIVERY, place: "涩谷" } })] as never }), context).status, "fail");
  assert.equal(CHECKS.push_excludes(words, obs({ events: [pushEvent(9, { body: "东京街头摄影展", outcome: "rejected" })] as never }), context).status, "fail", "a refused reminder was still handed over");
  const none = CHECKS.push_excludes(words, obs({ events: [] }), context);
  assert.equal(none.status, "pass");
  assert.match(none.detail, /no reminder was handed to the push service/u);
});

test("the eval server's two push channels point at this machine's simulator; its VAPID pair is derived here, not stored", () => {
  const file = { AUTH_SECRET: "eval-secret", ORBIT_AGENT_EVAL: "1", ORBIT_AGENT_EVAL_PORT: "3230", ORBIT_DATABASE_TARGET: "local", ORBIT_LOCAL_DATABASE_URL: "postgresql://x@127.0.0.1:5432/orbit_agent_eval", ORBIT_LOCAL_WORKSPACE_ID: "workspace:agent-eval", ORBIT_WORKSPACE_ID: "workspace:agent-eval" };
  const { env } = buildEvalEnvironment({}, file);
  assert.equal(env.ORBIT_EXPO_PUSH_ENDPOINT, "http://127.0.0.1:3230/__agent-eval/push/expo/send");
  assert.equal(env.ORBIT_EXPO_PUSH_ACCESS_TOKEN, "agent-eval-simulated");
  assert.equal(Buffer.from(env.ORBIT_WEB_PUSH_VAPID_PUBLIC_KEY, "base64url").length, 65);
  assert.equal(Buffer.from(env.ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY, "base64url").length, 32);
  assert.equal(env.ORBIT_WEB_PUSH_SUBJECT, "mailto:agent-eval@orbit.test");
  assert.notEqual(buildEvalEnvironment({}, { ...file, AUTH_SECRET: "another" }).env.ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY, env.ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY);
});
