/**
 * W0010 SC-02（纯函数 + mock provider）：规则打分、AI 配对的越界过滤、DeepSeek 匹配器的
 * 请求形状（复用名片识别文本模型配置、json_object）、超时与错误输出。不发真实请求。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlanAiMatchInput,
  createConfiguredPlanAiMatcher,
  createDeepseekPlanAiMatcher,
  parsePlanAiMatchContent,
  PlanAiMatcherError,
} from "../../features/plans/ai-matcher";
import {
  acceptedAiPairs,
  eventLinked,
  ruleStrength,
  scoreRuleMatches,
  type PlanMatchContact,
  type PlanMatchNeed,
} from "../../features/plans/matching";

function contact(id: string, primary: string | null, secondary: string | null = null, extra: Partial<PlanMatchContact> = {}): PlanMatchContact {
  return {
    displayName: id,
    id,
    organization: null,
    primaryIndustryId: primary as PlanMatchContact["primaryIndustryId"],
    role: null,
    secondaryIndustryId: secondary as PlanMatchContact["secondaryIndustryId"],
    ...extra,
  };
}

function need(id: string, primary: string | null, secondary: string | null = null, linked: string[] = []): PlanMatchNeed {
  return {
    criteria: {
      description: null,
      primaryIndustryId: primary as never,
      secondaryIndustryId: secondary as never,
      titleKeywords: [],
    },
    id,
    linkedContactIds: linked,
    planId: "plan:1",
    title: `need ${id}`,
  };
}

test("rule strength: same secondary is strong, same primary is a candidate, missing industry never matches", () => {
  const saasNeed = need("n1", "technology_internet", "technology_internet.enterprise_software");
  assert.equal(ruleStrength(contact("a", "technology_internet", "technology_internet.enterprise_software"), saasNeed), "strong");
  assert.equal(ruleStrength(contact("b", "technology_internet", "technology_internet.ai_data"), saasNeed), "candidate");
  assert.equal(ruleStrength(contact("c", "technology_internet"), saasNeed), "candidate");
  assert.equal(ruleStrength(contact("d", "finance_investment", "finance_investment.fintech"), saasNeed), null);
  assert.equal(ruleStrength(contact("e", null), saasNeed), null);
  // 需求只有一级：同一级即候选，没有强候选。
  const financeNeed = need("n2", "finance_investment");
  assert.equal(ruleStrength(contact("f", "finance_investment", "finance_investment.venture_capital"), financeNeed), "candidate");
  // 需求没写行业：不参与。
  assert.equal(ruleStrength(contact("g", "finance_investment"), need("n3", null)), null);
  assert.equal(ruleStrength(contact("g", "finance_investment"), { ...financeNeed, criteria: null }), null);
});

test("catch-all industries and invalid pairs are not treated as evidence", () => {
  assert.equal(ruleStrength(contact("a", "other", "other.other"), need("n", "other", "other.other")), null);
  // `*.other` 二级只按一级比较。
  assert.equal(
    ruleStrength(contact("b", "technology_internet", "technology_internet.other"), need("n", "technology_internet", "technology_internet.other")),
    "candidate",
  );
  // 二级不属于一级：视为没有行业。
  assert.equal(ruleStrength(contact("c", "finance_investment", "technology_internet.ai_data"), need("n", "finance_investment")), null);
});

test("scoreRuleMatches covers every active need, skips contacts already linked to that need, strong first", () => {
  const needs = [
    need("n-saas", "technology_internet", "technology_internet.enterprise_software", ["c-linked"]),
    need("n-tech", "technology_internet"),
  ];
  const pairs = scoreRuleMatches(
    [contact("c-ai", "technology_internet", "technology_internet.ai_data"), contact("c-linked", "technology_internet", "technology_internet.enterprise_software")],
    needs,
  );
  assert.deepEqual(
    pairs.map((pair) => [pair.contactId, pair.needId, pair.strength, pair.tier]),
    [
      ["c-ai", "n-saas", "candidate", "rule"],
      ["c-ai", "n-tech", "candidate", "rule"],
      ["c-linked", "n-tech", "candidate", "rule"],
    ],
  );
  const strongFirst = scoreRuleMatches(
    [contact("x", "technology_internet"), contact("y", "technology_internet", "technology_internet.enterprise_software")],
    [need("n", "technology_internet", "technology_internet.enterprise_software")],
  );
  assert.deepEqual(strongFirst.map((pair) => [pair.contactId, pair.strength]), [["y", "strong"], ["x", "candidate"]]);
});

test("AI pairs outside this batch or this plan, duplicates, linked people and rule pairs are dropped", () => {
  const contacts = [contact("c1", null), contact("c2", null)];
  const needs = [need("n1", null, null, ["c2"]), need("n2", null)];
  const pairs = acceptedAiPairs({
    contacts,
    existing: [{ contactId: "c1", needId: "n2" }],
    needs,
    proposals: [
      { contactId: "c1", needId: "n1", reason: "  采购负责人  " },
      { contactId: "c1", needId: "n1", reason: "重复" },
      { contactId: "c1", needId: "n2", reason: "规则层已有" },
      { contactId: "c2", needId: "n1", reason: "已关联" },
      { contactId: "c9", needId: "n1", reason: "不在本批" },
      { contactId: "c2", needId: "n9", reason: "不在本计划" },
      { contactId: 1, needId: "n2" },
      { contactId: "c2", needId: "n2", reason: "x".repeat(400) },
    ],
  });
  assert.deepEqual(pairs.map((pair) => [pair.contactId, pair.needId, pair.tier, pair.strength]), [
    ["c1", "n1", "ai", "candidate"],
    ["c2", "n2", "ai", "candidate"],
  ]);
  assert.equal(pairs[0]!.reason, "采购负责人");
  assert.equal(pairs[1]!.reason!.length, 200);
});

test("the matcher input carries only id, name, company, title and need text", () => {
  const input = buildPlanAiMatchInput(
    [contact("c1", "technology_internet", null, { displayName: "佐藤", organization: "Cloudline", role: "CTO" })],
    [{ ...need("n1", "finance_investment"), criteria: { description: "早期", primaryIndustryId: "finance_investment", secondaryIndustryId: null, titleKeywords: ["投资"] } }],
  );
  assert.deepEqual(input, {
    contacts: [{ company: "Cloudline", id: "c1", name: "佐藤", title: "CTO" }],
    needs: [{ description: "早期", id: "n1", industry: "Finance & Investment", keywords: ["投资"], title: "need n1" }],
  });
  // 紧凑编码：空字段不出现。
  assert.deepEqual(buildPlanAiMatchInput([contact("c2", null)], [need("n2", null)]), {
    contacts: [{ id: "c2", name: "c2" }],
    needs: [{ id: "n2", title: "need n2" }],
  });
});

test("one AI call covers every active need: no 40-need cap, only a documented 200 safety bound", () => {
  const many = Array.from({ length: 45 }, (_, index) => need(`n${index}`, null));
  assert.equal(buildPlanAiMatchInput([contact("c1", null)], many).needs.length, 45);
  const huge = Array.from({ length: 230 }, (_, index) => need(`n${index}`, null));
  assert.equal(buildPlanAiMatchInput([contact("c1", null)], huge).needs.length, 200);
  // 联系人不另设上限（只受任务本身约束）。
  const people = Array.from({ length: 120 }, (_, index) => contact(`c${index}`, null));
  assert.equal(buildPlanAiMatchInput(people, many).contacts.length, 120);
});

test("the DeepSeek matcher reuses the card-recognition text model with json_object output and reports usage", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown>; auth: string | null }> = [];
  const fetchImplementation = (async (url: string, init: RequestInit) => {
    requests.push({ auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)), url });
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ matches: [{ contactId: "c1", needId: "n1", reason: "CTO" }, "junk"] }) } }],
      usage: { completion_tokens: 21, prompt_tokens: 380 },
    });
  }) as unknown as typeof fetch;
  const matcher = createConfiguredPlanAiMatcher({
    env: { DEEPSEEK_API_KEY: "test-key", ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL: "card-text-model" },
    fetchImplementation,
  });
  assert.ok(matcher);
  assert.equal(matcher.model, "card-text-model");
  const result = await matcher.match({ contacts: [contact("c1", null)], needs: [need("n1", null)] });
  assert.deepEqual(result.proposals, [{ contactId: "c1", needId: "n1", reason: "CTO" }]);
  assert.equal(result.usage.inputTokens, 380);
  assert.equal(result.usage.outputTokens, 21);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.url, "https://api.deepseek.com/chat/completions");
  assert.equal(requests[0]!.auth, "Bearer test-key");
  assert.equal(requests[0]!.body.model, "card-text-model");
  assert.deepEqual(requests[0]!.body.response_format, { type: "json_object" });
  assert.equal(createConfiguredPlanAiMatcher({ env: {} }), null, "no key → no provider (fail closed, no fallback)");
  assert.equal(createConfiguredPlanAiMatcher({ env: { DEEPSEEK_API_KEY: "k" } })!.model, "deepseek-v4-flash");
});

test("the DeepSeek matcher maps timeouts, HTTP failures and malformed output to typed errors", async () => {
  const hanging = createDeepseekPlanAiMatcher({
    apiKey: "k",
    fetchImplementation: ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch,
    timeoutMs: 20,
  });
  await assert.rejects(hanging.match({ contacts: [], needs: [] }), (error: unknown) => error instanceof PlanAiMatcherError && error.code === "PROVIDER_TIMEOUT");

  const failing = createDeepseekPlanAiMatcher({
    apiKey: "k",
    fetchImplementation: (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
  });
  await assert.rejects(failing.match({ contacts: [], needs: [] }), (error: unknown) => error instanceof PlanAiMatcherError && error.code === "PROVIDER_REQUEST_FAILED");

  const malformed = createDeepseekPlanAiMatcher({
    apiKey: "k",
    fetchImplementation: (async () =>
      Response.json({ choices: [{ message: { content: "not json" } }], usage: { completion_tokens: 3, prompt_tokens: 100 } })) as unknown as typeof fetch,
  });
  await assert.rejects(malformed.match({ contacts: [], needs: [] }), (error: unknown) => {
    assert.ok(error instanceof PlanAiMatcherError);
    assert.equal(error.code, "INVALID_OUTPUT");
    assert.equal(error.usage?.inputTokens, 100, "billed usage is kept even when the output is unusable");
    return true;
  });
  assert.throws(() => parsePlanAiMatchContent('{"pairs":[]}'), PlanAiMatcherError);
  assert.deepEqual(parsePlanAiMatchContent('{"matches":[]}'), []);
});

test("W0015: needs linked to the event where the contact was met rank first, then strength", () => {
  const saas = { ...need("n-saas", "technology_internet", "technology_internet.enterprise_software"), eventIds: [] };
  const eventNeed = { ...need("n-event", "technology_internet"), eventIds: ["event:mixer"] };
  const met = contact("met", "technology_internet", "technology_internet.enterprise_software", { metEventId: "event:mixer" });
  const other = contact("other", "technology_internet", "technology_internet.enterprise_software");
  const pairs = scoreRuleMatches([other, met], [saas, eventNeed]);
  // met × n-event 只是一级候选，但因为在该活动认识排第一；其余按强候选在前、输入顺序。
  assert.deepEqual(pairs.map((pair) => [pair.contactId, pair.needId, pair.strength]), [
    ["met", "n-event", "candidate"],
    ["other", "n-saas", "strong"],
    ["met", "n-saas", "strong"],
    ["other", "n-event", "candidate"],
  ]);
  assert.equal(eventLinked(met, eventNeed), true);
  assert.equal(eventLinked(other, eventNeed), false);
  assert.equal(eventLinked(met, saas), false);
  // 没有 W0015 字段的旧数据：行为与之前一致。
  assert.deepEqual(
    scoreRuleMatches([contact("x", "technology_internet", "technology_internet.enterprise_software")], [need("n1", "technology_internet"), need("n2", "technology_internet", "technology_internet.enterprise_software")])
      .map((pair) => pair.needId),
    ["n2", "n1"],
  );
});
