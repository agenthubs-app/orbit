import assert from "node:assert/strict";
import test from "node:test";

import { createMockPlanPrepAi } from "../../features/plans/prep/ai";
import { createPlanPrepService } from "../../features/plans/prep/service";
import { PLAN_HOME_LIMITS, type PlanPrepAi, type PlanPrepCardOutput, type PlanPrepContext, type PlanPrepFact } from "../../features/plans/prep/types";
import { planHomeAwaitsMatch, planHomeNeedsWork, storedHomeOf } from "../../features/plans/prep/view";
import type { PlanAiOutcome } from "../../features/plans/v2/ai/types";
import { createMemoryPlanV2Repository } from "../../features/plans/v2/repository";
import type { PlanV2MatchJob } from "../../features/plans/v2/types";
import { serviceFor, SCOPE, draftInput } from "./v2-fixture";
import { flowWorld, JA, key, premiseReady } from "./flow-fixture";

type Calls = { pick: Array<{ trigger: string; key: string }>; card: Array<{ trigger: string; key: string }> };

function spyAi(base: PlanPrepAi = createMockPlanPrepAi(), overrides: { card?: () => PlanAiOutcome<PlanPrepCardOutput> | null } = {}): PlanPrepAi & { calls: Calls } {
  const calls: Calls = { card: [], pick: [] };
  return {
    calls,
    async card(input, context) {
      calls.card.push({ key: context.ledgerKey, trigger: context.trigger });
      return overrides.card?.() ?? base.card(input, context);
    },
    id: "mock",
    async pick(input, context) {
      calls.pick.push({ key: context.ledgerKey, trigger: context.trigger });
      return base.pick(input, context);
    },
  };
}

const FACTS: Record<string, PlanPrepFact[]> = {
  "contact:sato": [{ date: "2025-09-18", id: "fact-1", memoId: "memo-1", text: "上海で3年働いていた" }],
};

function contextOf(lastInteraction: Record<string, string | null> = {}): PlanPrepContext {
  return {
    async contacts(_actor, ids) {
      return ids.map((id) => ({ createdAt: "2025-09-18T03:00:00Z", id, industry: null, lastInteractionAt: lastInteraction[id] ?? null, lastInteractionLabel: null, name: id === "contact:sato" ? "佐藤 健" : "山本 彩", organization: "ミライ会計", role: "元 CFO", sourceEventTitle: "JETRO 交流会", sourceLabel: "card" }));
    },
    async facts(_actor, contactId) { return FACTS[contactId] ?? []; },
    async profile() { return { homeMarket: "CN", industry: null, name: "李", organization: "星橋テック", role: "CEO", spokenLanguages: [] }; },
  };
}

/** 走生成流程确定一份 v3 计划，再给第一类挂两位已关联联系人。 */
async function v3Plan() {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const confirmed = await world.flow.confirm(draft.draftId, key(), JA);
  const state = world.repository.dump(SCOPE);
  const plan = state.plans.find((row) => row.id === confirmed.planId)!;
  assert.equal(plan.analysis.schemaVersion, 3, "mock flow confirms a v3 plan");
  const first = state.typeItems.find((item) => item.planId === plan.id)!;
  first.contactLinks = [
    { contactId: "contact:sato", establishedAt: null, linkedAt: "2026-11-01T00:00:00Z", state: "linked" },
    { contactId: "contact:yamamoto", establishedAt: null, linkedAt: "2026-11-01T00:00:00Z", state: "linked" },
  ];
  state.contacts = [
    { id: "contact:sato", isOrbitUser: false, lastInteractionAt: null, name: "佐藤 健", organization: "ミライ会計", role: "元 CFO" },
    { id: "contact:yamamoto", isOrbitUser: false, lastInteractionAt: null, name: "山本 彩", organization: "ワークリンク", role: "Co-founder" },
  ];
  world.repository.seed(SCOPE, state);
  return { planId: plan.id, world };
}

const clock = () => { let t = Date.parse("2026-11-03T01:00:00Z"); return () => new Date((t += 1000)); };

test("ensure: rule candidates → AI picks by number → one card each; ≤4 initial calls, all trigger plan; written once", async () => {
  const { planId, world } = await v3Plan();
  const ai = spyAi();
  const prep = createPlanPrepService({ ai, context: contextOf({ "contact:yamamoto": "2026-04-10T00:00:00Z" }), now: clock(), repository: world.repository, scope: SCOPE });
  const view = await prep.ensure(planId, "ja");
  assert.equal(view!.state, "ready");
  assert.equal(view!.actions.length, 2, "two linked people → two picks");
  assert.equal(ai.calls.pick.length + ai.calls.card.length, 3);
  assert.ok([...ai.calls.pick, ...ai.calls.card].every((call) => call.trigger === "plan"), "initial generation never counts against the daily limit");
  const sato = view!.actions.find((action) => action.contactId === "contact:sato")!;
  assert.equal(sato.actionKey, "c:contact:sato");
  assert.equal(sato.stepNumber, 1);
  assert.equal(sato.avatar, "佐");
  assert.deepEqual(sato.prep!.usedFacts.map((fact) => fact.id), ["fact-1"]);
  assert.deepEqual(sato.prep!.rows.map((row) => row.key), ["who", "met", "common"], "no last contact → no row; from CN × 上海 in a fact → common ground");
  assert.match(sato.prep!.rows.find((row) => row.key === "common")!.value, /中国.*上海/u);
  assert.deepEqual(sato.prep!.gaps, ["interaction"]);
  const yamamoto = view!.actions.find((action) => action.contactId === "contact:yamamoto")!;
  assert.deepEqual(yamamoto.prep!.rows.map((row) => row.key), ["who", "met", "last_contact"], "no facts → no common ground row");
  assert.deepEqual(yamamoto.prep!.gaps, ["memo"], "no facts → memo gap, no fact rows");
  assert.deepEqual(yamamoto.prep!.usedFacts, []);
  // 再来一次：已就绪、候选没变 → 不再调 AI。
  await prep.ensure(planId, "ja");
  assert.equal(ai.calls.pick.length, 1);
  const detail = await world.planService.detail(planId);
  assert.equal(detail!.home!.actions.length, 2, "detail reads the stored home");
});

test("ensure: never more than PLAN_PREP_INITIAL_CARDS_LIMIT calls even with 3 picks + pick call", async () => {
  const { planId, world } = await v3Plan();
  const state = world.repository.dump(SCOPE);
  const types = state.typeItems.filter((item) => item.planId === planId);
  types[1]!.contactLinks = [{ contactId: "contact:x", establishedAt: null, linkedAt: "2026-11-01T00:00:00Z", state: "linked" }, { contactId: "contact:y", establishedAt: null, linkedAt: "2026-11-01T00:00:00Z", state: "linked" }];
  state.contacts.push({ id: "contact:x", isOrbitUser: false, lastInteractionAt: null, name: "X", organization: null, role: null }, { id: "contact:y", isOrbitUser: false, lastInteractionAt: null, name: "Y", organization: null, role: null });
  world.repository.seed(SCOPE, state);
  const ai = spyAi();
  const prep = createPlanPrepService({ ai, context: contextOf(), now: clock(), repository: world.repository, scope: SCOPE });
  const view = await prep.ensure(planId, "ja");
  assert.equal(view!.actions.length, 3);
  assert.equal(ai.calls.pick.length + ai.calls.card.length, 4);
  assert.equal(storedHomeOf(world.repository.dump(SCOPE).plans.find((plan) => plan.id === planId)!)!.initialCalls, 4);
});

test("bad card outputs: a missing factId / an underline not in the fact drop the sentence; all removed → fallback template; bad hook → fallback", async () => {
  const { planId, world } = await v3Plan();
  const outputs: PlanPrepCardOutput[] = [
    {
      hook: { label: "前回の話から", reason: "前に話した話題から入ると思い出してもらいやすい。" },
      planFit: null,
      sentences: [
        { text: "上海で3年働いていたとうかがいました。", underlines: [{ ref: { factId: "fact-1", kind: "fact" }, text: "上海で3年働いていた" }] },
        { text: "スキーがお好きだとか。", underlines: [{ ref: { factId: "fact-404", kind: "fact" }, text: "スキーがお好き" }] },
        { text: "北京に10年いらしたそうですね。", underlines: [{ ref: { factId: "fact-1", kind: "fact" }, text: "北京に10年いらした" }] },
      ],
      usedAnswers: [],
      usedFacts: ["fact-1", "fact-404"],
    },
    { hook: { label: "前回の話から", reason: "理由" }, planFit: null, sentences: [{ text: "スキーがお好きだとか。", underlines: [{ ref: { factId: "fact-404", kind: "fact" }, text: "スキーがお好き" }] }], usedAnswers: [], usedFacts: [] },
  ];
  let n = 0;
  const ai = spyAi(createMockPlanPrepAi(), { card: () => ({ ok: true, operationId: null, value: outputs[n++]! }) });
  const prep = createPlanPrepService({ ai, context: contextOf(), now: clock(), repository: world.repository, scope: SCOPE });
  const view = await prep.ensure(planId, "ja");
  const [first, second] = view!.actions;
  assert.equal(first!.prep!.fallback, false);
  assert.equal(first!.prep!.draft.text, "上海で3年働いていたとうかがいました。");
  assert.deepEqual(first!.prep!.usedFacts.map((fact) => fact.id), ["fact-1"], "unknown fact ids never reach the card");
  assert.equal(second!.prep!.fallback, true, "every sentence removed → the generic template");
  assert.equal(second!.prep!.draft.refs.length, 0);
  assert.match(second!.prep!.draft.text, /星橋テック/);
  assert.match(second!.prep!.hook.label, /自己紹介/);
});

test("AI out-of-range numbers are dropped; nothing valid → empty list (go-meet hint); no candidates → no AI call", async () => {
  const { planId, world } = await v3Plan();
  const base = createMockPlanPrepAi();
  const ai: PlanPrepAi = { ...base, async pick() { return { ok: true, operationId: null, value: { lead: null, picks: [{ bold: null, no: 42, reason: "x", title: "x" }] } }; } };
  const prep = createPlanPrepService({ ai, context: contextOf(), now: clock(), repository: world.repository, scope: SCOPE });
  const view = await prep.ensure(planId, "ja");
  assert.equal(view!.state, "ready");
  assert.deepEqual(view!.actions, []);

  const empty = await v3Plan();
  const state = empty.world.repository.dump(SCOPE);
  for (const item of state.typeItems) item.contactLinks = [];
  empty.world.repository.seed(SCOPE, state);
  const spy = spyAi();
  const quiet = createPlanPrepService({ ai: spy, context: contextOf(), now: clock(), repository: empty.world.repository, scope: SCOPE });
  const none = await quiet.ensure(empty.planId, "ja");
  assert.equal(none!.state, "ready");
  assert.equal(spy.calls.pick.length, 0, "no candidates → AI is not called");
});

test("concurrent ensure: the second caller sees pending and does not call AI again", async () => {
  const { planId, world } = await v3Plan();
  const ai = spyAi();
  const prep = createPlanPrepService({ ai, context: contextOf(), now: clock(), repository: world.repository, scope: SCOPE });
  const [a, b] = await Promise.all([prep.ensure(planId, "ja"), prep.ensure(planId, "ja")]);
  assert.equal(ai.calls.pick.length, 1);
  assert.ok([a!.state, b!.state].includes("ready"));
});

test("stale → regenerate (trigger manual, clears staleSince, idempotent) and LIMIT leaves the card unchanged; done persists", async () => {
  const { planId, world } = await v3Plan();
  const ai = spyAi();
  const prep = createPlanPrepService({ ai, context: contextOf(), now: clock(), repository: world.repository, scope: SCOPE });
  await prep.ensure(planId, "ja");
  assert.equal(await prep.markStale("contact:nobody"), 0, "an unrelated contact touches nothing");
  assert.equal(await prep.markStale("contact:sato"), 1);
  assert.equal(await prep.markStale("contact:sato"), 0, "already stale → kept, not re-stamped");
  let detail = await world.planService.detail(planId);
  const sato = () => detail!.home!.actions.find((action) => action.contactId === "contact:sato")!;
  const other = () => detail!.home!.actions.find((action) => action.contactId === "contact:yamamoto")!;
  assert.ok(sato().prep!.staleSince);
  assert.equal(other().prep!.staleSince, null);

  const regenerated = await prep.regenerate({ actionKey: "c:contact:sato", idempotencyKey: "r1", language: "ja", planId });
  assert.equal(ai.calls.card.at(-1)!.trigger, "manual", "regeneration counts against the daily limit");
  assert.equal(regenerated.actions.find((action) => action.contactId === "contact:sato")!.prep!.staleSince, null);
  const before = ai.calls.card.length;
  await prep.regenerate({ actionKey: "c:contact:sato", idempotencyKey: "r1", language: "ja", planId });
  assert.equal(ai.calls.card.length, before, "same key → replay, no AI call");

  const limited = createPlanPrepService({ ai: spyAi(createMockPlanPrepAi(), { card: () => ({ limit: "daily", ok: false, reason: "limit", retryOn: null }) }), context: contextOf(), now: clock(), repository: world.repository, scope: SCOPE });
  await prep.markStale("contact:sato");
  await assert.rejects(limited.regenerate({ actionKey: "c:contact:sato", idempotencyKey: "r2", language: "ja", planId }), (error: unknown) => (error as { reason?: string }).reason === "LIMIT");
  detail = await world.planService.detail(planId);
  assert.ok(sato().prep!.staleSince, "LIMIT → card unchanged (still stale)");

  await prep.setDone({ actionKey: "c:contact:sato", done: true, planId });
  await prep.setDone({ actionKey: "c:contact:sato", done: true, planId });
  detail = await world.planService.detail(planId);
  assert.equal(sato().done, true);
  assert.equal(other().done, false);
  await assert.rejects(prep.setDone({ actionKey: "c:nope", done: true, planId }), (error: unknown) => (error as { reason?: string }).reason === "ACTION_NOT_FOUND");
});

test("v2 plans have no home and never need prep work; a v3 plan without home reads as pending", async () => {
  const repository = createMemoryPlanV2Repository();
  const service = serviceFor(repository, SCOPE, clock());
  const { plan } = await service.createPlanFromDraft(draftInput());
  const detail = await service.detail(plan.planId);
  assert.equal("home" in detail!, false, "v2 detail has no home key");
  const row = repository.dump(SCOPE).plans[0]!;
  assert.equal(planHomeNeedsWork(row, new Date()), false);
  const prep = createPlanPrepService({ ai: spyAi(), context: contextOf(), repository, scope: SCOPE });
  assert.equal(await prep.ensure(plan.planId, "ja"), null);
  const { planId, world } = await v3Plan();
  assert.deepEqual((await world.planService.detail(planId))!.home, { actions: [], lead: null, state: "pending" });
});

test("R38-01: the card input says whether the user has met the person; for someone met, a first-meeting greeting is dropped from the opener", async () => {
  const { planId, world } = await v3Plan();
  const seen: Array<{ name: string | undefined; relationship: string }> = [];
  const base = createMockPlanPrepAi();
  const ai: PlanPrepAi = {
    async card(input, context) {
      seen.push({ name: input.fields.find((field) => field.key === "name")?.value, relationship: input.relationship });
      return {
        ok: true,
        value: { hook: { label: "交流会の続き", reason: "会ったときの話から入れるため" }, planFit: null, sentences: [
          { text: "佐藤さん、はじめまして。", underlines: [] },
          { text: "上海で3年働いていたとおっしゃっていましたね。", underlines: [{ ref: { factId: "fact-1", kind: "fact" }, text: "上海で3年働いていた" }] },
        ], usedAnswers: [], usedFacts: ["fact-1"] },
      } as PlanAiOutcome<PlanPrepCardOutput>;
      void context;
    },
    id: "mock",
    pick: (input, context) => base.pick(input, context),
  };
  const context = contextOf();
  const contacts = context.contacts;
  // 山本：只是加进了人脉（没扫名片、没关联活动、没联系记录、没有事实）→ unknown。佐藤：有事实 → met（即使不看名片）。
  context.contacts = async (actor, ids) => (await contacts(actor, ids)).map((contact) => ({ ...contact, sourceEventTitle: null, sourceLabel: "manual" }));
  const prep = createPlanPrepService({ ai, context, now: clock(), repository: world.repository, scope: SCOPE });
  const view = await prep.ensure(planId, "ja");
  assert.deepEqual(seen.map((entry) => entry.relationship).sort(), ["met", "unknown"]);
  const sato = view!.actions.find((action) => action.contactId === "contact:sato")!;
  assert.equal(sato.prep!.draft.text, "上海で3年働いていたとおっしゃっていましたね。");
  const yamamoto = view!.actions.find((action) => action.contactId === "contact:yamamoto")!;
  assert.match(yamamoto.prep!.draft.text, /はじめまして/u, "not known to have met → the greeting stays (prompt rule only)");
});

const HOME_STARTED = "2026-11-03T01:00:00.000Z";
const job = (over: Partial<PlanV2MatchJob>): PlanV2MatchJob => ({ completedAt: null, createdAt: HOME_STARTED, ruleHits: 0, status: "pending", ...over });
const after = (ms: number) => new Date(Date.parse(HOME_STARTED) + ms);

/** 确定一份 v3 计划，主页已生成为 `ready`（默认 0 件）；作业由各用例种子。 */
async function emptyHomePlan(actions: unknown[] = []) {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const { planId } = await world.flow.confirm(draft.draftId, key(), JA);
  const state = world.repository.dump(SCOPE);
  const plan = state.plans.find((row) => row.id === planId)!;
  plan.analysis = { ...plan.analysis, home: { actions, candidateSignature: "", initialCalls: 0, lead: null, startedAt: HOME_STARTED, state: "ready", updatedAt: HOME_STARTED, version: 1 } } as typeof plan.analysis;
  world.repository.seed(SCOPE, state);
  return { plan, planId, state, world };
}

test("R38-03: an empty ready home waits for a queued or just-finished match job, not for a stale, failed or empty one", async () => {
  const { plan } = await emptyHomePlan();
  assert.equal(planHomeAwaitsMatch(plan, null, after(1000)), false, "no job: go-meet");
  assert.equal(planHomeAwaitsMatch(plan, job({}), after(1000)), true, "queued");
  assert.equal(planHomeAwaitsMatch(plan, job({ status: "running" }), after(1000)), true, "running");
  assert.equal(planHomeAwaitsMatch(plan, job({ status: "failed" }), after(1000)), false, "failed");
  assert.equal(planHomeAwaitsMatch(plan, job({}), after(PLAN_HOME_LIMITS.pendingStaleMs + 1)), false, "a stuck job stops counting after the pending window");
  const finished = (ruleHits: number, completedAt: string) => job({ completedAt, ruleHits, status: "completed" });
  const later = after(5000).toISOString();
  assert.equal(planHomeAwaitsMatch(plan, finished(2, later), after(6000)), true, "finished after this home started, with candidates");
  assert.equal(planHomeAwaitsMatch(plan, finished(0, later), after(6000)), false, "finished with nothing: go-meet");
  assert.equal(planHomeAwaitsMatch(plan, finished(2, new Date(Date.parse(HOME_STARTED) - 1000).toISOString()), after(6000)), false, "this home already saw the candidates");
  assert.equal(planHomeAwaitsMatch(plan, finished(2, later), after(5000 + PLAN_HOME_LIMITS.pendingStaleMs + 1)), false, "regeneration that changed nothing does not hold it forever");
});

test("R38-03: only an empty ready home is affected; the overview reads pending, keeps seats, and goes back to ready when the job has nothing", async () => {
  const { plan, planId, state, world } = await emptyHomePlan();
  assert.equal(planHomeAwaitsMatch({ ...plan, status: "archived" }, job({}), after(1000)), false, "not active");
  const { plan: full } = await emptyHomePlan([{ actionKey: "c:a" }]);
  assert.equal(planHomeAwaitsMatch(full, job({}), after(1000)), false, "has actions");

  const createdAt = new Date().toISOString();
  world.repository.seed(SCOPE, { ...state, matchJobs: { [planId]: job({ createdAt }) } });
  const queued = await world.planService.overview(planId, { language: "ja" });
  assert.equal(queued!.home?.state, "pending");
  assert.deepEqual(queued!.home?.actions, []);
  assert.ok(queued!.home?.seats, "seats are still computed");

  world.repository.seed(SCOPE, { ...state, matchJobs: { [planId]: job({ completedAt: createdAt, createdAt, status: "completed" }) } });
  const finished = await world.planService.overview(planId, { language: "ja" });
  assert.equal(finished!.home?.state, "ready", "0 hits: 「去认识」");

  const detail = await world.planService.detail(planId);
  assert.equal(detail!.home?.state, "ready", "the stored state itself is untouched");
});
