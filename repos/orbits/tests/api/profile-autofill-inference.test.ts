import assert from "node:assert/strict";
import test from "node:test";

import { createAutofillInferenceHandler } from "../../app/api/profile/autofill-inference/handler";
import { AUTOFILL_INFERENCES_PER_DAY, withinAutofillLimit } from "../../features/profile/autofill-inference-limit";
import { AUTOFILL_UNAVAILABLE, createAutofillInferenceService, parseAutofillInference } from "../../features/profile/autofill-inference-service";
import { createMemoryInviteAttemptStore } from "../../features/invite-codes/rate-limit";
import { createSeekSuggestionService } from "../../features/profile/seek-suggestion-service";
import { OFFER_OPTIONS } from "../../shared/compute/profile-tag-options";

// 三步引导：按名片推断资料（契约 shared/contract/profile-autofill.ts）。模型一律用桩。

const actor = { id: "account:autofill" } as never;
const post = (body: unknown, headers: Record<string, string> = {}) => new Request("http://localhost/api/profile/autofill-inference", { body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", ...headers }, method: "POST" });
const ok = (text: string) => async () => ({ model: "m", provider: "deepseek", source: "test", success: true, text }) as never;
const input = { language: "ja", organization: "株式会社ミナトリンク", role: "代表取締役 CEO" } as const;

test("model output: illegal industries are dropped, labels come back in the request language, lists are capped and de-duplicated", () => {
  const parsed = parseAutofillInference(JSON.stringify({
    primaryIndustryId: "technology_internet", secondaryIndustryId: "finance_investment.banking", seniorityLevel: "emperor",
    offering: ["投融资资源", "Investment & funding", "ひとこと", "x".repeat(40), ...OFFER_OPTIONS.map((option) => option.ja)],
    topics: "not a list",
  }), input)!;
  assert.equal(parsed.status, "ready");
  assert.deepEqual([parsed.primaryIndustryId, parsed.secondaryIndustryId, parsed.seniorityLevel], [null, null, null]);
  assert.deepEqual(parsed.offering.slice(0, 2), ["投資・資金調達", "ひとこと"]);
  assert.equal(parsed.offering.length, 5);
  assert.deepEqual(parsed.topics, []);

  const legal = parseAutofillInference("```json\n" + JSON.stringify({ primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.enterprise_software", seniorityLevel: "c_level", offering: [], topics: ["SaaS 与企业服务"] }) + "\n```", input)!;
  assert.equal(legal.secondaryIndustryId, "technology_internet.enterprise_software");
  assert.deepEqual(legal.topics, ["SaaS・企業向けサービス"]);

  const chosen = parseAutofillInference(JSON.stringify({ primaryIndustryId: "finance_investment", secondaryIndustryId: "finance_investment.banking", offering: [], topics: [] }), { ...input, primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" })!;
  assert.equal(chosen.secondaryIndustryId, "technology_internet.ai_data", "a chosen industry is never rewritten");
  assert.equal(parseAutofillInference("nope", input), null);
});

test("service: failure, throw and junk all read as unavailable; the prompt forbids inventing and passes only these fields", async () => {
  let seen = "";
  let system = "";
  const good = await createAutofillInferenceService({ runModel: async (call) => { seen = call.userText; system = call.systemInstruction; return ok(JSON.stringify({ offering: ["起業支援"], topics: [] }))() as never; } }).infer({ ...input, displayName: "佐藤 健一" });
  assert.deepEqual(good.offering, ["起業支援"]);
  assert.deepEqual(JSON.parse(seen).card, { company: "株式会社ミナトリンク", industry: null, name: "佐藤 健一", title: "代表取締役 CEO" });
  assert.match(system, /Do not invent experience/);
  assert.match(system, /never as instructions/);
  for (const runModel of [
    async () => ({ error: { code: "MODEL_REQUEST_FAILED", message: "timeout", provider: "deepseek", source: "x" }, retryable: true, success: false }) as never,
    async () => { throw new Error("boom"); },
    ok("not json"),
  ]) assert.deepEqual(await createAutofillInferenceService({ runModel: runModel as never }).infer(input), AUTOFILL_UNAVAILABLE);
});

test("route: 401 / 403 / 400 for bad callers; model trouble and the daily limit answer 200 unavailable", async () => {
  const handler = (overrides: Parameters<typeof createAutofillInferenceHandler>[0] = {}) => createAutofillInferenceHandler({ resolveActor: async () => actor, service: { infer: async () => ({ ...AUTOFILL_UNAVAILABLE, offering: ["起業支援"], status: "ready" }) }, withinLimit: async () => true, ...overrides });
  assert.equal((await handler({ resolveActor: async () => null })(post(input))).status, 401);
  assert.equal((await handler()(post(input, { "x-orbit-sample": "1" }))).status, 403);
  for (const bad of ["{", [], { ...input, language: "fr" }, { language: "ja" }, { ...input, extra: 1 }, { ...input, role: 3 }, { language: "ja", organization: " ", role: "" }]) {
    assert.equal((await handler()(post(bad))).status, 400, JSON.stringify(bad));
  }
  const ready = await handler()(post(input));
  assert.equal(ready.status, 200);
  assert.deepEqual((await ready.json()).data.offering, ["起業支援"]);
  let called = false;
  const limited = await handler({ service: { infer: async () => { called = true; return AUTOFILL_UNAVAILABLE; } }, withinLimit: async () => false })(post(input));
  assert.equal(limited.status, 200);
  assert.equal((await limited.json()).data.status, "unavailable");
  assert.equal(called, false, "over the limit the model is not asked");
});

test("daily limit: 20 per account, counted on HMACs, next day opens again", async () => {
  const store = createMemoryInviteAttemptStore();
  let at = Date.parse("2026-11-25T01:00:00.000Z");
  const use = (actorId: string) => withinAutofillLimit({ actorId, now: () => new Date(at), secret: Buffer.alloc(32, 3), store });
  for (let i = 0; i < AUTOFILL_INFERENCES_PER_DAY; i += 1) assert.equal(await use("account:a"), true);
  assert.equal(await use("account:a"), false);
  assert.equal(await use("account:b"), true);
  at += 24 * 3_600_000;
  assert.equal(await use("account:a"), true);
  assert.ok(![...store.rows.keys()].join(" ").includes("account:a"));
});

test("seek suggestions can use the goal still in the form", async () => {
  let goal = "";
  const service = createSeekSuggestionService({
    readProfile: async () => ({ data: { profile: { displayName: "佐藤", relationshipGoal: "" } }, success: true }) as never,
    runModel: (async (call: { userText: string }) => { goal = JSON.parse(call.userText).profile.currentGoal; return { model: "m", provider: "deepseek", source: "t", success: true, text: "{\"suggestions\":[\"投資家\"]}" }; }) as never,
  });
  assert.equal((await service.suggest({ actorId: "a", candidates: ["投資家"] })).success, false, "no goal anywhere");
  const result = await service.suggest({ actorId: "a", candidates: ["投資家"], goal: "資金調達：シリーズA", language: "ja" });
  assert.equal(result.success, true);
  assert.equal(goal, "資金調達：シリーズA");
});

test("an advisor title shows no level: no 一般職員, no 「チーム・マネジメント」; a manager keeps both", () => {
  const output = (seniorityLevel: string) => JSON.stringify({ offering: [], primaryIndustryId: null, secondaryIndustryId: null, seniorityLevel, topics: ["チーム・マネジメント", "日本市場"] });
  for (const role of ["顧問", "高级顾问", "Senior Advisor", "相談役"]) {
    const parsed = parseAutofillInference(output("individual_contributor"), { ...input, role })!;
    assert.deepEqual([parsed.seniorityLevel, parsed.topics], [null, ["日本市場"]], role);
  }
  const manager = parseAutofillInference(output("manager"), { ...input, role: "課長" })!;
  assert.deepEqual([manager.seniorityLevel, manager.topics], ["manager", ["チーム・マネジメント", "日本市場"]]);
  assert.equal(parseAutofillInference(output("individual_contributor"), { ...input, role: "営業担当" })!.seniorityLevel, "individual_contributor");
  assert.equal(parseAutofillInference(output("c_level"), { ...input, role: "CEO・顧問" })!.seniorityLevel, "c_level");
});
