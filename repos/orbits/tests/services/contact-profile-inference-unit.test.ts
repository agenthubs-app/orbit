/**
 * W0058 SC-W0058-02／03／04（纯函数与 fetch 桩，不出网）：
 * - 写入规则：完整来源判定 user > memo_extraction > card_inference，用户清空不回填，只传 origin 的旧语义不变（表驱动）；
 * - 不编造：套话、无 basis、basis 指向空字段、与职位／公司原文相同、超长、带别名／id、他人联系人的条目全部丢弃；推不出为空；
 *   名片备注里的邮箱、电话、URL 不出现在请求体；同一批仍是 1 次 HTTP；
 * - 版本：card_inference 的三栏不进输入版本；提示词升 contact-insight@2；存量 ready 行不显示过期。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { applyEnrichedValues, type EnrichedValue } from "../../features/contacts/enrichment/apply-enrichment";
import {
  buildInsightPromptInput,
  createConfiguredContactInsightGenerator,
  createDeepseekContactInsightGenerator,
  createMockContactInsightGenerator,
  parseInsightOutput,
  restoreInsightAliases,
  type InsightGenerationInput,
} from "../../features/contacts/insights/generator";
import {
  isProfileBoilerplate,
  profileInferenceValues,
  profileLanguageForGoal,
  readStoredProfileInference,
  sanitizeCardNotes,
} from "../../features/contacts/insights/profile-inference";
import { contactInsightGoalHash, type ContactInsightRow } from "../../features/contacts/insights/repository";
import { CONTACT_INSIGHT_PROMPT_VERSION, contactInsightSourceVersion, type ContactInsightVersionInput } from "../../features/contacts/insights/source-version";
import { contactInsightView } from "../../features/contacts/insights/view";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";
import { canWriteEnrichedValue, readStoredEnrichment, type EnrichedValueState } from "../../shared/domain/enrichment";
import type { EnrichmentOrigin, EnrichmentProvenance, EnrichmentVia } from "../../shared/domain/contracts";

const AT = "2026-10-03T00:00:00.000Z";
const prov = (origin: EnrichmentOrigin, via: EnrichmentVia): EnrichmentProvenance => ({ origin, updatedAt: AT, via });

test("SC-02 canWriteEnrichedValue with the full incoming provenance: user > memo_extraction > card_inference; user-cleared fields are never refilled", () => {
  const memo = { origin: "ai", via: "memo_extraction" } as const;
  const card = { origin: "ai", via: "card_inference" } as const;
  const user = { origin: "user", via: "contact_edit" } as const;
  const cases: { name: string; current: EnrichedValueState; memo: boolean; card: boolean; user: boolean }[] = [
    { name: "empty, no provenance", current: { hasValue: false }, memo: true, card: true, user: true },
    { name: "user cleared (origin user, empty)", current: { hasValue: false, provenance: prov("user", "contact_edit") }, memo: false, card: false, user: true },
    { name: "user edited value", current: { hasValue: true, provenance: prov("user", "contact_edit") }, memo: false, card: false, user: true },
    { name: "legacy value without provenance", current: { hasValue: true }, memo: false, card: false, user: true },
    { name: "memo_extraction value", current: { hasValue: true, provenance: prov("ai", "memo_extraction") }, memo: true, card: false, user: true },
    { name: "card_inference value", current: { hasValue: true, provenance: prov("ai", "card_inference") }, memo: true, card: true, user: true },
    { name: "card origin value", current: { hasValue: true, provenance: prov("card", "card_ocr") }, memo: false, card: false, user: true },
    { name: "other ai value", current: { hasValue: true, provenance: prov("ai", "text_enrichment") }, memo: true, card: true, user: true },
  ];
  for (const entry of cases) {
    assert.equal(canWriteEnrichedValue(entry.current, memo), entry.memo, `memo over ${entry.name}`);
    assert.equal(canWriteEnrichedValue(entry.current, card), entry.card, `card_inference over ${entry.name}`);
    assert.equal(canWriteEnrichedValue(entry.current, user), entry.user, `user over ${entry.name}`);
  }
  // 只传 origin 的旧调用方逐项不变（含「当前为空即可写」——用户清空的旧行为对行业／职级／地区保持原样）。
  const legacy: [EnrichedValueState, EnrichmentOrigin, boolean][] = [
    [{ hasValue: false }, "ai", true], [{ hasValue: false, provenance: prov("user", "contact_edit") }, "ai", true],
    [{ hasValue: true, provenance: prov("ai", "card_ocr") }, "ai", true], [{ hasValue: true, provenance: prov("ai", "card_ocr") }, "card", true],
    [{ hasValue: true, provenance: prov("user", "contact_edit") }, "ai", false], [{ hasValue: true, provenance: prov("card", "card_ocr") }, "card", false],
    [{ hasValue: true }, "ai", false], [{ hasValue: true }, "user", true], [{ hasValue: true, provenance: prov("user", "contact_edit") }, "user", true],
    [{ hasValue: true, provenance: prov("ai", "memo_extraction") }, "ai", true],
  ];
  for (const [current, origin, expected] of legacy) assert.equal(canWriteEnrichedValue(current, origin), expected, JSON.stringify({ current, origin }));
});

test("SC-02 applyEnrichedValues: card_inference fills empty lists with bilingual originals; memo replaces it; card_inference never replaces memo, user edits, user-cleared or legacy values", () => {
  const inference: EnrichedValue = { bilingual: { en: ["Cold-chain routes"], zh: ["冷链线路"] }, field: "offering", origin: "ai", value: ["冷链线路"], via: "card_inference" };
  const empty: Record<string, unknown> = {};
  assert.deepEqual(applyEnrichedValues(empty, [inference], AT), ["offering"]);
  assert.deepEqual((empty.publicProfile as Record<string, unknown>).offering, ["冷链线路"]);
  const stored = readStoredEnrichment(empty.enrichment)!;
  assert.deepEqual(stored.fields.offering, { bilingual: { en: ["Cold-chain routes"], zh: ["冷链线路"] }, origin: "ai", updatedAt: AT, via: "card_inference" });
  // memo 提取替换推测（来源换成 memo_extraction，双语原文随之去掉）。
  assert.deepEqual(applyEnrichedValues(empty, [{ field: "offering", origin: "ai", value: ["报关代理"], via: "memo_extraction" }], AT), ["offering"]);
  assert.deepEqual(readStoredEnrichment(empty.enrichment)!.fields.offering, prov("ai", "memo_extraction"));
  // 推测不覆盖 memo 值。
  assert.deepEqual(applyEnrichedValues(empty, [inference], AT), []);
  assert.deepEqual((empty.publicProfile as Record<string, unknown>).offering, ["报关代理"]);
  // 用户清空（来源 user、值为空）：推测与 memo 都不写。
  const cleared: Record<string, unknown> = { enrichment: { fields: { offering: prov("user", "contact_edit") }, version: 1 }, publicProfile: { offering: [] } };
  assert.deepEqual(applyEnrichedValues(cleared, [inference, { ...inference, via: "memo_extraction", bilingual: undefined }], AT), []);
  // 存量无来源值：不写。
  assert.deepEqual(applyEnrichedValues({ publicProfile: { offering: ["老数据"] } }, [inference], AT), []);
  // 推测可被新的推测替换。
  const previous: Record<string, unknown> = {};
  applyEnrichedValues(previous, [inference], AT);
  assert.deepEqual(applyEnrichedValues(previous, [{ ...inference, value: ["跨境仓储"], bilingual: { en: ["Bonded storage"], zh: ["跨境仓储"] } }], AT), ["offering"]);
});

const INPUT: InsightGenerationInput = {
  contacts: [
    {
      cardNotes: "海外事業部 / Overseas Div. tanaka@acme.co.jp Tel 03-1234-5678 +81 90 1111 2222 https://acme.example.com 冷链物流专线",
      dormant: false, id: "contact:tanaka", industry: "Trade & Logistics", name: "田中", needLinks: [], organization: "Acme Logistics",
      records: [{ id: "memo:note:live-contact-detail-update:aaa", occurredAt: "2026-09-28T00:00:00.000Z", source: "memo", title: "Wrote a memo" }],
      region: null, role: "海外营业部长", seniorityGroup: "manager", tier: null,
    },
    { dormant: false, id: "contact:sato", industry: null, name: "佐藤", needLinks: [], organization: null, records: [], region: null, role: "Engineer", seniorityGroup: "other", tier: null },
  ],
  goal: "三个月内找到日本市场的渠道伙伴",
  needs: [],
};

test("SC-03 the request body carries sanitized card notes (no email, phone or URL, ≤200 chars) and the system prompt limits profile basis to card fields", async () => {
  assert.equal(sanitizeCardNotes(`${"备".repeat(250)}`)!.length, 200);
  assert.equal(sanitizeCardNotes(" tanaka@acme.co.jp  03-1234-5678 "), null);
  assert.equal(sanitizeCardNotes("Room 12, 3F"), "Room 12, 3F", "short numbers are kept");
  assert.equal(sanitizeCardNotes("正面 · orbit-verify-card-1.jpg 部门: 営業部"), "正面 · orbit-verify-card-1.jpg 部门: 営業部", "file names are not URLs");
  assert.equal(sanitizeCardNotes("see acme.co.jp/about or www.acme.com"), "see or");
  const bodies: Record<string, unknown>[] = [];
  const generator = createDeepseekContactInsightGenerator({
    apiKey: "k",
    fetchImplementation: (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ insights: [] }) } }], usage: { completion_tokens: 1, prompt_tokens: 1 } }), { status: 200 });
    }) as typeof fetch,
  });
  await generator.generate(INPUT);
  assert.equal(bodies.length, 1, "one HTTP per batch, profile included in the same call");
  const raw = JSON.stringify(bodies[0]);
  assert.doesNotMatch(raw, /tanaka@acme|03-1234-5678|\+81 90|https:\/\/|acme\.example\.com/);
  const messages = bodies[0]!.messages as { content: string }[];
  const user = JSON.parse(messages[1]!.content) as { contacts: Record<string, unknown>[] };
  assert.match(String(user.contacts[0]!.cardNotes), /海外事業部.*冷链物流专线/);
  assert.equal("cardNotes" in user.contacts[1]!, false);
  assert.match(messages[0]!.content, /ONLY from this contact's company, title, card notes .* and industry/);
  assert.match(messages[0]!.content, /Never base profile items on the goal, records/);
  assert.match(messages[0]!.content, /untrusted data/);
  assert.equal(buildInsightPromptInput(INPUT).aliases.toId.get("C1"), "contact:tanaka");
});

test("SC-03 parseInsightOutput keeps grounded profile items and drops boilerplate, missing / empty / unknown basis, verbatim title or company, over-long, alias-leaking items and other contacts' entries", () => {
  const item = (zh: string, en: string, basis?: string) => ({ basis, text: { en, zh } });
  const content = JSON.stringify({
    insights: [
      {
        contactId: "C1", evidence: [], goalRelation: { en: "a", zh: "甲" }, nextStep: { en: "b", zh: "乙" },
        profile: {
          offering: [
            item("冷链物流专线", "Cold-chain freight lanes", "card_notes"),
            item("人脉资源", "Networking", "title"),
            item("合作机会、资源对接", "business opportunities & resources", "company"),
            item("海外营业部长", "Overseas sales head", "title"),
            item("日本进口清关", "Japan import clearance"),
            item("仓储", "Warehousing", "department"),
            item("超长的条目超长的条目超长的条目超长的条目超长", "Too long in Chinese", "industry"),
            item("东南亚航线", "Southeast Asia shipping routes, carriers, schedules and many more words", "industry"),
            item("对接 C2 的渠道", "Channel with C2", "company"),
            item("海外渠道开拓", "Overseas channel building", "title"),
            item("海外渠道开拓", "Overseas channel building", "title"),
            item("物流报价", "Freight quotes", "company"),
            item("第四条", "Fourth item", "company"),
          ],
          seeking: [item("日本经销商", "Japanese distributors", "company")],
          topics: [item("acme logistics", "Acme Logistics", "company"), item("物流行业动态", "Logistics trends", "industry")],
        },
      },
      {
        contactId: "C2", evidence: [], goalRelation: { en: "a", zh: "甲" }, nextStep: { en: "b", zh: "乙" },
        profile: { offering: [item("工程实践", "Engineering practice", "company"), item("云原生架构", "Cloud-native design", "card_notes")], seeking: [], topics: [] },
      },
      { contactId: "C9", evidence: [], goalRelation: { en: "a", zh: "甲" }, nextStep: { en: "b", zh: "乙" }, profile: { offering: [item("幽灵", "Ghost", "title")] } },
    ],
  });
  const { payload, aliases } = buildInsightPromptInput(INPUT);
  void payload;
  const parsed = parseInsightOutput(restoreInsightAliases(content, aliases), INPUT);
  const tanaka = parsed.insights.get("contact:tanaka")!.profile;
  assert.deepEqual(tanaka.offering.map((entry) => entry.text.zh), ["冷链物流专线", "海外渠道开拓", "物流报价"], "max 3 per list, duplicates dropped");
  assert.deepEqual(tanaka.offering.map((entry) => entry.basis), ["card_notes", "title", "company"]);
  assert.deepEqual(tanaka.seeking.map((entry) => entry.text.en), ["Japanese distributors"]);
  assert.deepEqual(tanaka.topics.map((entry) => entry.text.zh), ["物流行业动态"], "verbatim company name dropped (case-insensitive)");
  const sato = parsed.insights.get("contact:sato")!.profile;
  assert.deepEqual(sato, { offering: [], seeking: [], topics: [] }, "basis pointing at an empty company / card-notes field is dropped");
  assert.equal(parsed.insights.has("C9"), false);
  assert.ok(parsed.dropped.profileItems >= 10, `dropped ${parsed.dropped.profileItems}`);
  // 推不出时为空（没有 profile 也不影响洞察）。
  const bare = parseInsightOutput(JSON.stringify({ insights: [{ contactId: "contact:sato", evidence: [], goalRelation: { en: "a", zh: "甲" }, nextStep: { en: "b", zh: "乙" } }] }), INPUT);
  assert.deepEqual(bare.insights.get("contact:sato")!.profile, { offering: [], seeking: [], topics: [] });
  for (const phrase of ["人脉资源", "Business Opportunities", "industry  experience", "资源对接 / 合作机会", "Networking & Resources", "collaboration"]) {
    assert.equal(isProfileBoilerplate(phrase), true, phrase);
  }
  for (const phrase of ["跨境冷链合作伙伴", "Cold-chain partners", "SaaS 定价"]) assert.equal(isProfileBoilerplate(phrase), false, phrase);
});

test("SC-03 the mock generator only builds profile items from the contact's own card fields", async () => {
  const { content } = await createMockContactInsightGenerator().generate(INPUT);
  const parsed = parseInsightOutput(content, INPUT);
  const tanaka = parsed.insights.get("contact:tanaka")!.profile;
  assert.ok(tanaka.offering.length + tanaka.topics.length + tanaka.seeking.length > 0);
  for (const field of ["offering", "seeking", "topics"] as const) {
    for (const entry of tanaka[field]) assert.ok(["title", "company", "industry"].includes(entry.basis));
  }
  assert.deepEqual(parsed.insights.get("contact:sato")!.profile.seeking, []);
  // 部署环境（NODE_ENV=production）的 mock 不产出推测：模板文字不写进真实联系人。
  const deployed = createConfiguredContactInsightGenerator({ NODE_ENV: "production" });
  assert.equal(deployed.provider, "mock");
  const quiet = parseInsightOutput((await deployed.generate(INPUT)).content, INPUT);
  assert.deepEqual(quiet.insights.get("contact:tanaka")!.profile, { offering: [], seeking: [], topics: [] });
  const local = parseInsightOutput((await createConfiguredContactInsightGenerator({ NODE_ENV: "development" }).generate(INPUT)).content, INPUT);
  assert.ok(local.insights.get("contact:tanaka")!.profile.offering.length > 0);
});

test("W58-3 write language follows the goal text; both originals stay aligned; stored inference round-trips", () => {
  assert.equal(profileLanguageForGoal("三个月内找到日本市场的渠道伙伴"), "zh");
  assert.equal(profileLanguageForGoal("日本のパートナーを探す"), "zh");
  assert.equal(profileLanguageForGoal("Find channel partners in Japan"), "en");
  assert.equal(profileLanguageForGoal(null), "en");
  const stored = {
    language: "en" as const,
    offering: [{ basis: "title" as const, text: { en: "Freight quotes", zh: "物流报价" } }, { basis: "company" as const, text: { en: "Freight quotes", zh: "运价" } }],
    seeking: [], topics: [{ basis: "industry" as const, text: { en: "Logistics trends", zh: "物流行业动态" } }],
  };
  assert.deepEqual(profileInferenceValues(stored), [
    { bilingual: { en: ["Freight quotes"], zh: ["物流报价"] }, field: "offering", origin: "ai", value: ["Freight quotes"], via: "card_inference" },
    { bilingual: { en: ["Logistics trends"], zh: ["物流行业动态"] }, field: "topics", origin: "ai", value: ["Logistics trends"], via: "card_inference" },
  ]);
  assert.deepEqual(readStoredProfileInference(JSON.stringify(stored)), stored);
  assert.equal(readStoredProfileInference({ offering: [] }), null);
});

const VERSION: ContactInsightVersionInput = {
  displayName: "田中", enrichedValues: { offering: null, primaryIndustryId: "trade_logistics", seeking: null, topics: null },
  enrichmentFields: { industry: prov("ai", "card_ocr") }, goalHash: contactInsightGoalHash("目标"), memos: [], organization: "Acme", planLinks: [], role: "BD",
};

test("SC-04 source_data_version ignores card_inference values (written-back inference does not look like new data) but counts memo / user values; prompt version is contact-insight@2", () => {
  assert.equal(CONTACT_INSIGHT_PROMPT_VERSION, "contact-insight@2");
  const base = contactInsightSourceVersion(VERSION);
  const afterInference = contactInsightSourceVersion({
    ...VERSION,
    enrichedValues: { ...VERSION.enrichedValues, offering: ["Freight quotes"], topics: ["Logistics trends"] },
    enrichmentFields: { ...VERSION.enrichmentFields, offering: { ...prov("ai", "card_inference"), bilingual: { en: ["Freight quotes"], zh: ["物流报价"] } }, topics: prov("ai", "card_inference") },
  });
  assert.equal(afterInference, base);
  assert.equal(contactInsightSourceVersion({ ...VERSION, enrichedValues: { ...VERSION.enrichedValues, offering: [] } }), base, "empty list equals missing");
  assert.notEqual(contactInsightSourceVersion({
    ...VERSION, enrichedValues: { ...VERSION.enrichedValues, offering: ["报关代理"] }, enrichmentFields: { ...VERSION.enrichmentFields, offering: prov("ai", "memo_extraction") },
  }), base);
  assert.notEqual(contactInsightSourceVersion({ ...VERSION, cardNotes: "冷链物流专线" }), base, "card notes are an input");
});

test("SC-04 bumping the prompt version never makes an existing ready row stale (view looks at dirty and goal hash only)", () => {
  const row: ContactInsightRow = {
    aiState: "done", attempts: 1, contactId: "contact:tanaka", deferredUntil: null, dirtyAt: null, dirtyReasons: [], evidence: [],
    generatedAt: AT, goalHash: contactInsightGoalHash("目标"), goalRelation: { en: "a", zh: "甲" }, lastErrorCode: null, leaseExpiresAt: null,
    model: "m", nextStep: { en: "b", zh: "乙" }, relevance: 10, retryCount: 0, sourceDataVersion: "built-with-contact-insight@1", status: "ready",
  };
  const view = contactInsightView(row, { contactId: row.contactId, goal: "目标", now: new Date(AT) });
  assert.equal(view.state, "ready");
  assert.equal(view.stale, false);
  assert.equal(view.canRegenerate, false);
});

test("SC-02 provider write path: card_inference only via applyContactCardInference, conflicts re-read and retry at most 2 times, then CONFLICT", async () => {
  const base = { workspaceId: "w", sourceType: "manual", sourceId: "f", evidenceIds: ["e"], lifecycleState: "active" as const, createdAt: AT, updatedAt: AT, userId: "a", collectionName: "contacts" };
  const common = { source: { type: "manual", id: "f" }, evidenceIds: ["e"], createdAt: AT, updatedAt: AT, stage: "active", accountId: "a" };
  const memory = createMemoryLiveRecordStore([
    { ...base, recordId: "c1", payload: { ...common, id: "c1", displayName: "One" } },
    { ...base, recordId: "c2", payload: { ...common, id: "c2", displayName: "Two" } },
    { ...base, recordId: "memo", payload: { ...common, id: "memo", displayName: "M", publicProfile: { offering: ["报关代理"] }, enrichment: { version: 1, fields: { offering: prov("ai", "memo_extraction") } } } },
  ] as LiveRecord[]);
  let failures = 0;
  let attempts = 0;
  const store = {
    ...memory,
    getRecord: memory.getRecord.bind(memory),
    updateRecordIfCurrent: async (...args: Parameters<NonNullable<typeof memory.updateRecordIfCurrent>>) => {
      attempts += 1;
      if (failures > 0) {
        failures -= 1;
        return null;
      }
      return memory.updateRecordIfCurrent!(...args);
    },
  };
  const provider = createStorageContactGraphProvider({ store: store as never, workspaceId: "w" });
  const values: EnrichedValue[] = [{ bilingual: { en: ["Freight quotes"], zh: ["物流报价"] }, field: "offering", origin: "ai", value: ["物流报价"], via: "card_inference" }];
  failures = 2;
  assert.deepEqual(await provider.applyContactCardInference!("c1", "a", values, AT), ["offering"]);
  assert.equal(attempts, 3, "two conflicts, third attempt wins");
  failures = 3;
  attempts = 0;
  await assert.rejects(() => Promise.resolve(provider.applyContactCardInference!("c2", "a", values, AT)), (error: unknown) => (error as { code?: string }).code === "CONFLICT");
  assert.equal(attempts, 3);
  assert.deepEqual(await provider.applyContactCardInference!("memo", "a", values, AT), [], "memo value is kept");
  // memo 写入口不接受 card_inference 值，推测写入口不接受 memo 值。
  assert.deepEqual(await provider.applyContactMemoExtraction!("c2", "a", values, AT), []);
  assert.deepEqual(await provider.applyContactCardInference!("c2", "a", [{ ...values[0]!, via: "memo_extraction" }], AT), []);
});
