/**
 * W0051 SC-W0051-02：洞察生成器（请求体、别名、输出校验）、规则相关度（表驱动）、输入指纹（不含强度档，R-10）。
 * 供应商一律是 fetch 桩（不出网）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInsightPromptInput,
  createConfiguredContactInsightGenerator,
  createDeepseekContactInsightGenerator,
  createMockContactInsightGenerator,
  InsightGeneratorError,
  parseInsightOutput,
  type InsightGenerationInput,
} from "../../features/contacts/insights/generator";
import { CONTACT_INSIGHT_RELEVANCE_WEIGHTS, contactInsightRelevance, type ContactInsightRelevanceInput } from "../../features/contacts/insights/relevance";
import { contactInsightSourceVersion, type ContactInsightVersionInput } from "../../features/contacts/insights/source-version";
import { contactInsightPreview, contactInsightView } from "../../features/contacts/insights/view";
import { contactInsightGoalHash, type ContactInsightRow } from "../../features/contacts/insights/repository";

const INPUT: InsightGenerationInput = {
  contacts: [
    {
      dormant: false, id: "contact:tanaka", industry: "Trade & Logistics", name: "田中", needLinks: [{ needId: "item:need-1", state: "linked" }],
      organization: "Acme", records: [{ id: "memo:note:live-contact-detail-update:aaa", occurredAt: "2026-09-28T00:00:00.000Z", source: "memo", title: "Wrote a memo" }],
      region: "Japan · Tokyo", role: "BD", seniorityGroup: "manager", tier: "active",
    },
    {
      dormant: true, id: "contact:sato", industry: null, name: "佐藤", needLinks: [], organization: null,
      records: [{ id: "encounter:enc-1", occurredAt: "2026-08-01T00:00:00.000Z", source: "encounter", title: "Met in person" }],
      region: null, role: null, seniorityGroup: "other", tier: null,
    },
  ],
  goal: "三个月内找到日本市场的渠道伙伴",
  needs: [{ id: "item:need-1", industry: "Trade & Logistics", title: "日本市场的渠道伙伴" }],
};

function okResponse(content: unknown, usage = { completion_tokens: 40, prompt_tokens: 120 }) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage }), { status: 200 });
}

test("the prompt carries only whitelisted fields under short aliases; no email, phone, memo body or real ids", () => {
  const { payload, aliases } = buildInsightPromptInput(INPUT);
  const raw = JSON.stringify(payload);
  assert.doesNotMatch(raw, /contact:tanaka|contact:sato|item:need-1|memo:note|encounter:enc-1/);
  assert.doesNotMatch(raw, /@|\+81|email|phone/i);
  assert.equal(aliases.toId.get("C1"), "contact:tanaka");
  assert.equal(aliases.toId.get("N1"), "item:need-1");
  assert.equal(aliases.toId.get("R1"), "memo:note:live-contact-detail-update:aaa");
  const contacts = (payload as { contacts: Record<string, unknown>[] }).contacts;
  assert.deepEqual(Object.keys(contacts[0]!).sort(), ["company", "id", "industry", "name", "needs", "records", "region", "seniority", "tier", "title"]);
  // 「other」职级与空字段不出现。
  assert.equal("seniority" in contacts[1]!, false);
});

test("DeepSeek generator: one HTTP per batch, json_object, aliases restored, usage returned; non-2xx keeps usage for billing", async () => {
  const bodies: Record<string, unknown>[] = [];
  const generator = createDeepseekContactInsightGenerator({
    apiKey: "k",
    fetchImplementation: (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return okResponse({ insights: [{ contactId: "C1", evidence: ["R1", "N1"], goalRelation: { en: "Tanaka runs BD.", zh: "田中负责 BD。" }, nextStep: { en: "Ask for an intro.", zh: "请他引荐。" } }] });
    }) as typeof fetch,
  });
  const result = await generator.generate(INPUT);
  assert.equal(bodies.length, 1);
  assert.deepEqual((bodies[0] as { response_format: unknown }).response_format, { type: "json_object" });
  assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 40 });
  const parsed = JSON.parse(result.content) as { insights: { contactId: string; evidence: string[] }[] };
  assert.equal(parsed.insights[0]?.contactId, "contact:tanaka");
  assert.deepEqual(parsed.insights[0]?.evidence, ["memo:note:live-contact-detail-update:aaa", "item:need-1"]);
  const failing = createDeepseekContactInsightGenerator({ apiKey: "k", fetchImplementation: (async () => new Response(JSON.stringify({ usage: { completion_tokens: 0, prompt_tokens: 10 } }), { status: 500 })) as typeof fetch });
  await assert.rejects(failing.generate(INPUT), (error: unknown) => error instanceof InsightGeneratorError && error.usage !== null);
});

test("output validation: foreign contacts and evidence not belonging to that contact are dropped; text with ids is dropped; bilingual pairs required", () => {
  const content = JSON.stringify({
    insights: [
      // 依据里夹带佐藤的记录、未知 id：丢弃；本人记录与已关联需求保留。
      { contactId: "contact:tanaka", evidence: ["memo:note:live-contact-detail-update:aaa", "encounter:enc-1", "item:need-1", "R9"], goalRelation: { en: "Tanaka can open channels.", zh: "田中能打开渠道。" }, nextStep: { en: "Coffee next week.", zh: "下周喝咖啡。" } },
      // 佐藤引用需求（他没关联）：丢弃该依据；文字带别名：整条丢弃。
      { contactId: "contact:sato", evidence: ["item:need-1"], goalRelation: { en: "See C1 for details.", zh: "见 C1。" }, nextStep: { en: "x", zh: "x" } },
      { contactId: "contact:other-actor", evidence: [], goalRelation: { en: "x", zh: "x" }, nextStep: { en: "x", zh: "x" } },
    ],
  });
  const parsed = parseInsightOutput(content, INPUT);
  assert.deepEqual([...parsed.insights.keys()], ["contact:tanaka"]);
  assert.deepEqual(parsed.insights.get("contact:tanaka")?.evidence, [
    { id: "memo:note:live-contact-detail-update:aaa", source: "memo" },
    { id: "item:need-1", source: "plan_need" },
  ]);
  assert.equal(parsed.dropped.foreignContacts, 1);
  assert.equal(parsed.dropped.unsafeText, 1);
  assert.equal(parsed.dropped.foreignEvidence, 2);
  // 只有一种语言：不收。
  assert.equal(parseInsightOutput(JSON.stringify({ insights: [{ contactId: "contact:tanaka", evidence: [], goalRelation: { zh: "只有中文" }, nextStep: { en: "a", zh: "b" } }] }), INPUT).insights.size, 0);
  assert.throws(() => parseInsightOutput("not json", INPUT), /not JSON/);
  // 超长文字截到 120 字。
  const long = parseInsightOutput(JSON.stringify({ insights: [{ contactId: "contact:tanaka", evidence: [], goalRelation: { en: "a".repeat(300), zh: "长".repeat(300) }, nextStep: { en: "b", zh: "c" } }] }), INPUT);
  assert.equal(Array.from(long.insights.get("contact:tanaka")!.goalRelation.zh).length, 120);
});

test("generator factory: production default is mock (no HTTP); DeepSeek only with the explicit switch and a key", async () => {
  assert.equal(createConfiguredContactInsightGenerator({}).provider, "mock");
  assert.equal(createConfiguredContactInsightGenerator({ ORBIT_CONTACT_INSIGHT_GENERATOR: "deepseek" }).provider, "mock");
  assert.equal(createConfiguredContactInsightGenerator({ DEEPSEEK_API_KEY: "k" }).provider, "mock");
  assert.equal(createConfiguredContactInsightGenerator({ DEEPSEEK_API_KEY: "k", ORBIT_CONTACT_INSIGHT_GENERATOR: "deepseek" }).provider, "deepseek");
  const mock = createMockContactInsightGenerator();
  assert.equal(mock.billable, false);
  const parsed = parseInsightOutput((await mock.generate(INPUT)).content, INPUT);
  assert.equal(parsed.insights.size, 2);
  assert.match(parsed.insights.get("contact:tanaka")!.goalRelation.zh, /日本市场的渠道伙伴/);
});

const base: ContactInsightRelevanceInput = { industryMatchesNeed: false, lastSignalAt: null, now: new Date("2026-10-03T00:00:00.000Z"), pendingCandidate: false, planLink: null, tier: null };
const recent = "2026-10-01T00:00:00.000Z";

test("rule relevance (W51-4) is table-driven and strictly ordered: confirmed link > pending candidate > industry match > tier > recency", () => {
  const cases: [string, Partial<ContactInsightRelevanceInput>, number][] = [
    ["nothing", {}, 0],
    ["recent only", { lastSignalAt: recent }, 2],
    ["90 days", { lastSignalAt: "2026-08-01T00:00:00.000Z" }, 1],
    ["new", { tier: "new" }, 3],
    ["core + recent", { lastSignalAt: recent, tier: "core" }, 11],
    ["industry", { industryMatchesNeed: true }, 14],
    ["candidate", { pendingCandidate: true }, 30],
    ["linked", { planLink: "linked" }, 56],
    ["established, everything", { industryMatchesNeed: true, lastSignalAt: recent, pendingCandidate: true, planLink: "established", tier: "core" }, 86],
  ];
  for (const [name, overrides, expected] of cases) assert.equal(contactInsightRelevance({ ...base, ...overrides }), expected, name);
  // 每一级的最低分高于其下各级之和。
  const max = (overrides: Partial<ContactInsightRelevanceInput>) => contactInsightRelevance({ ...base, lastSignalAt: recent, tier: "core", ...overrides });
  assert.ok(contactInsightRelevance({ ...base, tier: "new" }) > contactInsightRelevance({ ...base, lastSignalAt: recent }));
  assert.equal(CONTACT_INSIGHT_RELEVANCE_WEIGHTS.recency30, 2);
  assert.ok(contactInsightRelevance({ ...base, industryMatchesNeed: true }) > max({}));
  assert.ok(contactInsightRelevance({ ...base, pendingCandidate: true }) > max({ industryMatchesNeed: true }));
  assert.ok(contactInsightRelevance({ ...base, planLink: "linked" }) > max({ industryMatchesNeed: true, pendingCandidate: true }));
  assert.ok(contactInsightRelevance({ ...base, planLink: "established" }) > contactInsightRelevance({ ...base, planLink: "linked" }));
  assert.ok(contactInsightRelevance({ ...base, tier: "active" }) > contactInsightRelevance({ ...base, lastSignalAt: recent, tier: "new" }));
  assert.ok(contactInsightRelevance({ ...base, tier: "core" }) > contactInsightRelevance({ ...base, lastSignalAt: recent, tier: "active" }));
});

const VERSION: ContactInsightVersionInput = {
  displayName: "田中", enrichedValues: { primaryIndustryId: "trade_logistics" }, enrichmentFields: { industry: { origin: "card", updatedAt: "2026-09-01T00:00:00.000Z" } },
  goalHash: contactInsightGoalHash("目标"), memos: [{ at: "2026-09-28", id: "note:1" }], organization: "Acme", planLinks: [{ needId: "n1", state: "linked" }], role: "BD",
};

test("source_data_version (R-10): changes with enrichment, provenance, memos, plan links and goal; stable under reordering; has no tier input", () => {
  const version = contactInsightSourceVersion(VERSION);
  assert.equal(contactInsightSourceVersion({ ...VERSION, memos: [...VERSION.memos] }), version);
  assert.notEqual(contactInsightSourceVersion({ ...VERSION, enrichedValues: { primaryIndustryId: "finance_investment" } }), version);
  assert.notEqual(contactInsightSourceVersion({ ...VERSION, enrichmentFields: { industry: { origin: "user", updatedAt: "2026-09-02T00:00:00.000Z" } } }), version);
  assert.notEqual(contactInsightSourceVersion({ ...VERSION, memos: [...VERSION.memos, { at: "2026-10-01", id: "note:2" }] }), version);
  assert.notEqual(contactInsightSourceVersion({ ...VERSION, planLinks: [{ needId: "n1", state: "established" }] }), version);
  assert.notEqual(contactInsightSourceVersion({ ...VERSION, goalHash: contactInsightGoalHash("另一个目标") }), version);
  const twoMemos = { ...VERSION, memos: [{ at: "a", id: "x" }, { at: "b", id: "y" }] };
  assert.equal(contactInsightSourceVersion(twoMemos), contactInsightSourceVersion({ ...twoMemos, memos: [...twoMemos.memos].reverse() }));
  // 档位不是版本的输入：额外带上 tier 字段也不改变结果。
  assert.equal(contactInsightSourceVersion({ ...VERSION, tier: "core" } as ContactInsightVersionInput), version);
});

const ROW: ContactInsightRow = {
  aiState: "done", attempts: 1, contactId: "c1", deferredUntil: null, dirtyAt: null, dirtyReasons: [], evidence: [],
  generatedAt: "2026-10-01T00:00:00.000Z", goalHash: contactInsightGoalHash("目标"), goalRelation: { en: "E".repeat(80), zh: "关".repeat(80) },
  lastErrorCode: null, leaseExpiresAt: null, model: "m", nextStep: { en: "n", zh: "n" }, relevance: 50, sourceDataVersion: "v", status: "ready",
};
const NOW = new Date("2026-10-03T00:00:00.000Z");

test("view states: no goal / none / ready / stale / goal updated / deferred / failed / in progress; preview clips to 60", () => {
  assert.equal(contactInsightView(ROW, { contactId: "c1", goal: "", now: NOW }).state, "no_goal");
  assert.equal(contactInsightView(null, { contactId: "c1", goal: "目标", now: NOW }).state, "none");
  assert.equal(contactInsightView(null, { contactId: "c1", goal: null, goalKnown: false, now: NOW }).state, "none");
  const ready = contactInsightView(ROW, { contactId: "c1", goal: "目标", now: NOW });
  assert.deepEqual([ready.state, ready.stale, ready.canRegenerate], ["ready", false, false]);
  const dirty = contactInsightView({ ...ROW, dirtyAt: NOW.toISOString() }, { contactId: "c1", goal: "目标", now: NOW });
  assert.deepEqual([dirty.stale, dirty.canRegenerate, dirty.goalUpdated], [true, true, false]);
  const goalUpdated = contactInsightView(ROW, { contactId: "c1", goal: "新目标", now: NOW });
  assert.deepEqual([goalUpdated.goalUpdated, goalUpdated.canRegenerate], [true, true]);
  const deferred = contactInsightView({ ...ROW, deferredUntil: "2026-10-03T15:00:00.000Z", status: "pending" }, { contactId: "c1", goal: "目标", now: NOW });
  assert.deepEqual([deferred.state, deferred.deferredUntil], ["pending", "2026-10-03T15:00:00.000Z"]);
  const failed = contactInsightView({ ...ROW, status: "failed" }, { contactId: "c1", goal: "目标", now: NOW });
  assert.deepEqual([failed.state, failed.canRegenerate], ["failed", true]);
  const running = contactInsightView({ ...ROW, aiState: "started", leaseExpiresAt: "2026-10-03T00:05:00.000Z", status: "failed" }, { contactId: "c1", goal: "目标", now: NOW });
  assert.deepEqual([running.inProgress, running.canRegenerate], [true, false]);
  const preview = contactInsightPreview(ROW)!;
  assert.equal(Array.from(preview.zh).length, 60);
  assert.ok(preview.zh.endsWith("…"));
  assert.equal(contactInsightPreview({ ...ROW, goalRelation: null }), undefined);
});

test("review P2: the regenerate idempotency key hashes the full contact id and always keeps the full version digest", async () => {
  const { insightRegenerationKey } = await import("../../features/contacts/insights/regenerate");
  const version = "a".repeat(40);
  const longA = `contact:${"x".repeat(500)}A`;
  const longB = `contact:${"x".repeat(500)}B`;
  const keyA = insightRegenerationKey(longA, version);
  assert.ok(keyA.endsWith(`:${version}`));
  assert.ok(keyA.length <= 120, `${keyA.length}`);
  assert.notEqual(keyA, insightRegenerationKey(longB, version), "long ids with a shared prefix do not collide");
  assert.notEqual(keyA, insightRegenerationKey(longA, "b".repeat(40)), "a new version is a new key");
  assert.equal(keyA, insightRegenerationKey(longA, version));
});
