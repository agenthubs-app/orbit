import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  applyContactEnrichmentBackfillPlan,
  assertEnrichmentBackfillTarget,
  buildContactEnrichmentBackfillPlan,
  type EnrichmentBackfillRecord,
} from "../../features/contacts/enrichment/backfill";
import {
  TEXT_ENRICHMENT_MAX_CONTACTS,
  TextEnrichmentError,
  buildTextEnrichmentInput,
  createConfiguredTextEnricher,
  createDeepseekTextEnricher,
} from "../../features/contacts/enrichment/text-enrichment";
import { SYNC_COMMIT_ORDER_LOCK_SQL } from "../../features/sync/commit-order-lock";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

// W0045 SC-05：回填只补空、可复核、可重放；按文字补全每次 ≤20 人、请求体不含邮箱电话；非 localhost 库无确认即拒绝。

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";
const WS = "ws:enrichment-backfill";
const OLD = "2026-09-01T00:00:00.000Z";
const USER = { origin: "user", updatedAt: OLD, via: "contact_edit" };
const AI = { origin: "ai", updatedAt: OLD, via: "card_ocr" };

function contact(id: string, extra: Record<string, unknown>): EnrichmentBackfillRecord {
  return {
    recordId: id, userId: "actor:a", updatedAt: OLD,
    payload: { id, displayName: id, stage: "captured", source: { type: "manual", id: "fixture" }, evidenceIds: ["e"], createdAt: OLD, updatedAt: OLD, ...extra },
  };
}

function fixtures(): EnrichmentBackfillRecord[] {
  return [
    // 存量：旧职级 + 可命中别名的地址 + 无来源行业。
    contact("a-legacy", { organization: "架空技研", role: "部長", location: "〒100-0001 東京都千代田区1-1-1", primaryIndustryId: "technology_internet", publicProfile: { seniorityLevel: "manager" } }),
    // 用户填过地区；行业职级为空。
    contact("b-user", { organization: "架空法律事務所", role: "弁護士", region: { countryCode: "JP", city: "Osaka" }, enrichment: { version: 1, fields: { region: USER } } }),
    // 全空；备注里有邮箱和电话。
    contact("c-empty", { organization: "Sendai Robotics", role: "CEO", location: "Sendai", notes: "Email: ceo@example.test\nTEL: 022-123-4567\n展示会で名刺交換" }),
    // ai 来源的职级 + 其余空：回填只补空，不替换 ai 值。
    contact("d-ai", { organization: "架空商事", role: "課長", publicProfile: { seniorityLevel: "manager" }, enrichment: { version: 1, fields: { seniorityLevel: AI } } }),
    // 没有任何文字：不进模型。
    contact("e-blank", {}),
  ];
}

function mockProvider() {
  const bodies: string[] = [];
  const fetchImplementation = (async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    const input = JSON.parse((JSON.parse(String(init.body)) as { messages: { content: string }[] }).messages[1]!.content) as { contacts: { id: string }[] };
    const contacts = input.contacts.map(({ id }) => ({
      id,
      primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal",
      seniorityLevel: "c_level",
      regionCountryCode: id === "c-empty" ? "JP" : id === "b-user" ? "US" : null,
      regionCity: id === "c-empty" ? "Sendai" : null,
    }));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ contacts }) } }], usage: { prompt_tokens: 1000 + contacts.length, completion_tokens: 200 } });
  }) as unknown as typeof fetch;
  return { bodies, enricher: createDeepseekTextEnricher({ apiKey: "test-key", fetchImplementation }) };
}

test("text enrichment sends at most 20 contacts and never an email or phone number", async () => {
  assert.equal(createConfiguredTextEnricher({ env: {} }), null, "no key, no provider");
  const many = Array.from({ length: TEXT_ENRICHMENT_MAX_CONTACTS + 1 }, (_, index) => ({ contactId: `c${index}`, organization: "x" }));
  assert.throws(() => buildTextEnrichmentInput(many), TextEnrichmentError);
  const { bodies, enricher } = mockProvider();
  await assert.rejects(enricher.enrich({ contacts: many }), /At most 20/);
  assert.equal(bodies.length, 0, "an oversized batch never reaches the provider");
  const result = await enricher.enrich({ contacts: [{ contactId: "c-empty", organization: "Sendai Robotics", role: "CEO", location: "〒980-0001 宮城県仙台市 TEL 022-123-4567", cardNotes: "Email: ceo@example.test\n携帯 090-1111-2222\n展示会で名刺交換" }] });
  assert.equal(bodies.length, 1);
  assert.doesNotMatch(bodies[0]!, /ceo@example\.test|022-123-4567|090-1111-2222/);
  assert.match(bodies[0]!, /980-0001 宮城県仙台市/, "the address itself (postal code included) is kept");
  assert.match(bodies[0]!, /展示会で名刺交換/);
  assert.deepEqual(result.usage.inputTokens, 1001);
  assert.deepEqual(result.proposals[0], { contactId: "c-empty", primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal", seniorityLevel: "c_level", region: { countryCode: "JP", city: "Sendai" } });
});

test("the plan only fills empty fields, marks legacy seniority as card, batches ≤20 per serial call ≥1s apart, and caps calls", async () => {
  // 已有 ai 地区、location 又能命中别名：规则地区不得替换（回填只补空）。
  const aiRegion = contact("f-ai-region", { location: "東京都港区", region: { countryCode: "SG", city: "Singapore" }, enrichment: { version: 1, fields: { region: AI } } });
  const records = [...fixtures(), aiRegion, ...Array.from({ length: 23 }, (_, index) => contact(`z-${String(index).padStart(2, "0")}`, { organization: `Org ${index}` }))];
  const { bodies, enricher } = mockProvider();
  const sleeps: number[] = [];
  const plan = await buildContactEnrichmentBackfillPlan({ appliedAt: "2026-10-02T00:00:00.000Z", enricher, records, sleep: async (ms) => { sleeps.push(ms); }, workspaceId: WS });
  assert.equal(plan.ai.calls, 2, "27 candidates (a-legacy is complete after the rule step) → 20 + 7");
  assert.deepEqual(bodies.map((body) => (JSON.parse((JSON.parse(body) as { messages: { content: string }[] }).messages[1]!.content) as { contacts: unknown[] }).contacts.length), [20, 7]);
  assert.deepEqual(sleeps, [1000]);
  const entry = (id: string) => plan.entries.find((candidate) => candidate.recordId === id);
  const values = (id: string) => Object.fromEntries((entry(id)?.values ?? []).map((value) => [value.field, `${value.origin}/${value.via}`]));
  assert.deepEqual(values("a-legacy"), { region: "card/rule" }, "legacy industry and seniority are not overwritten");
  assert.deepEqual(entry("a-legacy")!.marks, [{ field: "seniorityLevel", origin: "card", via: "legacy_profile" }]);
  assert.deepEqual(values("b-user"), { industry: "ai/text_enrichment", seniorityLevel: "ai/text_enrichment" }, "the user's region is kept");
  assert.deepEqual(values("c-empty"), { industry: "ai/text_enrichment", seniorityLevel: "ai/text_enrichment", region: "ai/text_enrichment" });
  assert.deepEqual(values("d-ai"), { industry: "ai/text_enrichment" }, "backfill never replaces an existing ai value");
  assert.equal(entry("e-blank"), undefined);
  assert.equal(values("f-ai-region").region, undefined, "an existing ai region is never replaced by the location rule");

  const capped = await buildContactEnrichmentBackfillPlan({ appliedAt: "2026-10-02T00:00:00.000Z", enricher, maxCalls: 1, records, sleep: async () => {}, workspaceId: WS });
  assert.equal(capped.ai.calls, 1);
  assert.equal(capped.counts.aiDeferred, 7);
  const ruleOnly = await buildContactEnrichmentBackfillPlan({ appliedAt: "2026-10-02T00:00:00.000Z", records: fixtures(), workspaceId: WS });
  assert.equal(ruleOnly.ai.calls, 0);
  assert.deepEqual(ruleOnly.entries.map((candidate) => candidate.recordId), ["a-legacy"]);
});

test("every text field is scrubbed at the request boundary: 7/8-digit, unseparated and labelled numbers, extensions, polluted organization/title", async () => {
  const { bodies, enricher } = mockProvider();
  await enricher.enrich({ contacts: [
    { contactId: "c-empty", organization: "架空商事 TEL 6123-4567 info@example.test", role: "部長 携帯 090-1111-2222", location: "〒100-0001 東京都千代田区1-1-1 Tel: 123-4567", cardNotes: "FAX(代表): 6123 4567\n直通 0312345678 内線 1234\nOffice ext. 89\n展示会で名刺交換" },
    { contactId: "b-user", organization: "ＴＥＬ：０３－１２３４－５６７８ 架空法律事務所", role: "弁護士", location: "+81 3 1234 5678" },
  ] });
  const sent = (JSON.parse((JSON.parse(bodies[0]!) as { messages: { content: string }[] }).messages[1]!.content) as { contacts: Record<string, string>[] }).contacts;
  const text = JSON.stringify(sent);
  for (const leaked of ["6123-4567", "6123 4567", "info@example.test", "090-1111-2222", "123-4567", "0312345678", "1234", "ext", "89", "03-1234-5678", "81 3 1234 5678"]) {
    assert.ok(!text.includes(leaked), `${leaked} must not reach the provider`);
  }
  assert.deepEqual(sent[0], { id: "c-empty", organization: "架空商事", title: "部長", address: "〒100-0001 東京都千代田区1-1-1", cardNotes: "展示会で名刺交換" });
  assert.deepEqual(sent[1], { id: "b-user", organization: "架空法律事務所", title: "弁護士", address: "", cardNotes: "" });
});

test("a non-localhost database is refused without an explicit --confirm-remote", () => {
  assert.throws(() => assertEnrichmentBackfillTarget("postgresql://u:p@ep-cool-123.neon.tech/neondb", null), /ENRICHMENT_BACKFILL_REFUSED/);
  assert.throws(() => assertEnrichmentBackfillTarget("postgresql://u:p@ep-cool-123.neon.tech/neondb", "ep-cool-123.neon.tech/other"), /ENRICHMENT_BACKFILL_REFUSED/);
  assert.equal(assertEnrichmentBackfillTarget("postgresql://u:p@ep-cool-123.neon.tech/neondb", "ep-cool-123.neon.tech/neondb").remote, true);
  assert.equal(assertEnrichmentBackfillTarget("postgresql://u:p@localhost:5432/orbit_test", null).remote, false);
});

test("apply needs the reviewed hash, holds the commit-order lock, skips records changed meanwhile, and a second apply changes nothing", { skip }, async () => {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "local test database only");
  const schema = `enrichment_backfill_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 2, options: `-c search_path=${schema}` });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for (const record of fixtures()) {
      await pool.query(
        `insert into orbit_records (workspace_id, collection_name, record_id, provider, provider_record_id, source_type, source_id, source_label, target_type, target_id, occurred_at, evidence_ids, payload, search_text, lifecycle_state, created_at, updated_at, user_id)
         values ($1, 'contacts', $2, 'test', $2, 'manual', 'fixture', 'fixture', 'contact', $2, $3, array['e'], $4::jsonb, '', 'active', $3, $3, $5)`,
        [WS, record.recordId, OLD, JSON.stringify(record.payload), record.userId],
      );
    }
    // 真实库的 updated_at 是微秒精度；计划里是毫秒 ISO，同一毫秒内的记录仍按「未改动」处理。
    await pool.query(`update orbit_records set updated_at = '2026-09-01T00:00:00.000456Z' where record_id = 'b-user'`);
    const queries: string[] = [];
    const client = createTransactionalPostgresClient({ connectionString: url.toString(), pool: pool as never });
    const spying = { transaction: <T>(work: Parameters<typeof client.transaction<T>>[0]) => client.transaction<T>((sql) => work({ ...sql, query: (text: string, values?: readonly unknown[]) => { queries.push(text); return sql.query(text, values); } } as never)) };
    const { enricher } = mockProvider();
    const plan = await buildContactEnrichmentBackfillPlan({ appliedAt: "2026-10-02T00:00:00.000Z", enricher, records: fixtures(), sleep: async () => {}, workspaceId: WS });
    assert.equal(plan.entries.length, 4);
    await assert.rejects(applyContactEnrichmentBackfillPlan(spying, plan, "0".repeat(64)), /reviewed hash/);
    await assert.rejects(applyContactEnrichmentBackfillPlan(spying, { ...plan, entries: plan.entries.slice(1) }, plan.hash), /reviewed hash/, "a tampered plan is refused");

    // 计划之后、apply 之前用户改了 d-ai：这条跳过。
    await pool.query(`update orbit_records set payload = jsonb_set(payload, '{role}', '"部長"'), updated_at = '2026-09-30T00:00:00.000Z' where record_id = 'd-ai'`);
    // 计划之后所有者被改（owner-backfill 只改 user_id、不动 payload 与 updated_at）：不得跨所有者写入。
    await pool.query(`update orbit_records set user_id = 'actor:other' where record_id = 'c-empty'`);
    queries.length = 0;
    const first = await applyContactEnrichmentBackfillPlan(spying, plan, plan.hash);
    assert.equal(queries[0], SYNC_COMMIT_ORDER_LOCK_SQL, "the commit-order lock is taken before the first write");
    assert.ok(queries.filter((text) => /for update/.test(text)).length === 4);
    assert.deepEqual(first, { applied: 2, alreadyApplied: 0, skippedChanged: 2, skippedMissing: 0 });
    const c = (await pool.query(`select payload from orbit_records where record_id = 'c-empty'`)).rows[0].payload as Record<string, unknown>;
    assert.equal(c.enrichment, undefined, "the record now owned by someone else is untouched");

    const payload = async (id: string) => (await pool.query(`select payload from orbit_records where record_id = $1`, [id])).rows[0].payload as Record<string, unknown>;
    const a = await payload("a-legacy");
    assert.equal(a.primaryIndustryId, "technology_internet");
    assert.deepEqual(a.region, { countryCode: "JP", city: "Tokyo" });
    assert.deepEqual((a.enrichment as { fields: Record<string, unknown> }).fields, {
      region: { origin: "card", updatedAt: "2026-10-02T00:00:00.000Z", via: "rule" },
      seniorityLevel: { origin: "card", updatedAt: "2026-10-02T00:00:00.000Z", via: "legacy_profile" },
    });
    const b = await payload("b-user");
    assert.deepEqual(b.region, { countryCode: "JP", city: "Osaka" }, "user value untouched");
    assert.equal((b.publicProfile as Record<string, unknown>).seniorityLevel, "c_level");
    const d = await payload("d-ai");
    assert.equal(d.primaryIndustryId, undefined, "the changed record was skipped");

    const second = await applyContactEnrichmentBackfillPlan(spying, plan, plan.hash);
    assert.deepEqual(second, { applied: 0, alreadyApplied: 2, skippedChanged: 2, skippedMissing: 0 }, "re-applying changes nothing");
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`).catch(() => {});
    await pool.end();
  }
});
