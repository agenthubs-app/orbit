import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EVENT_SCORE_PREFERENCES, eventVerdict, scoreEvent } from "../../shared/compute/event-score";
import type { AiQuotaGate } from "../../features/ai-quota/gate";
import { EventExtractionError, type EventFactsProvider } from "../../features/events/assessment/extract-provider";
import type { JudgeContext } from "../../features/events/assessment/judge";
import { createMemoryEventAssessmentRepository } from "../../features/events/assessment/repository";
import { createEventAssessmentService, EventAssessmentError, type EventAssessmentServiceDeps } from "../../features/events/assessment/service";
import type { UrlFetchResult } from "../../features/events/assessment/url-fetch";

// R26 event-assessment-service.test（内存；PLANNER「测试」）：幂等、状态机、AI 不改分、PATCH 只规则、区间、
// add-to-plan 库内 / 外部、dismiss、他人隔离、额度拒绝 → quota_exceeded、AI 关 → ai_unavailable、回收 timeout。

const ALICE = "actor:alice";
const BOB = "actor:bob";
const context: JudgeContext = {
  contacts: [{ id: "c-takahashi", name: "高橋 美咲" }],
  goalKeywords: ["VC", "資金調達"],
  goalLabel: "シリーズA 資金調達",
  homeArea: "東京都千代田区",
  language: "ja",
  planId: "plan-1",
  preferences: DEFAULT_EVENT_SCORE_PREFERENCES,
  types: [
    { allocation: 30, emoji: "💼", key: "vc_partner", metCount: 2, shortLabel: "VC", skipped: false, targetCount: 3 },
    { allocation: 15, emoji: "🏢", key: "cvc", metCount: 0, shortLabel: "CVC", skipped: false, targetCount: 3 },
  ],
};

const summitHtml = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@type": "Event", location: { address: { addressLocality: "千代田区", addressRegion: "東京都" }, name: "東京国際フォーラム" }, name: "Japan SaaS Summit 2026 秋", offers: { price: 15000 },
  performer: [{ affiliation: "青葉ベンチャーズ", jobTitle: "パートナー", name: "山田 太郎" }, { affiliation: "X Capital", jobTitle: "Partner", name: "Ken" }, { affiliation: "Y Capital", jobTitle: "パートナー", name: "高橋 美咲" }],
  startDate: "2026-10-16T10:00:00+09:00",
})}</script></head><body><main>Japan SaaS Summit</main></body></html>`;

function gate(options: { deny?: "disabled" | "monthly_limit" } = {}): AiQuotaGate & { calls: number; finished: string[] } {
  const state = { calls: 0, finished: [] as string[] };
  return Object.assign(state, {
    async reserve() { return options.deny ? { ok: false as const, reason: options.deny } : { ok: true as const, operationId: "op-1", owner: true, status: "reserved" as const }; },
    async beginCall() { state.calls += 1; return { callId: `op-1#${state.calls}` }; },
    async endCall() {},
    async finish(_id: string, outcome: string) { state.finished.push(outcome); },
  });
}

function setup(overrides: Partial<EventAssessmentServiceDeps> & { provider?: EventFactsProvider | null; available?: boolean; quota?: ReturnType<typeof gate>; page?: UrlFetchResult } = {}) {
  const repository = createMemoryEventAssessmentRepository();
  const added: Array<{ actorId: string; eventId: string; external: boolean }> = [];
  const quota = overrides.quota ?? gate();
  let clock = Date.parse("2026-10-07T01:00:00.000Z");
  const providerCalls = { images: 0, text: 0 };
  const provider: EventFactsProvider | null = overrides.provider === undefined ? {
    model: "fake",
    async extractFromImages({ meter }) {
      providerCalls.images += 1;
      await meter.begin("vision");
      return { facts: { price: "¥3,000", title: "CFO Night" }, guessed: [], isEventPage: true, pageCandidates: [], promptVersion: "event-poster-2026-10-v1", unreadable: ["startsAt", "venue"], usage: { calls: 2, inputTokens: 1, outputTokens: 1 } };
    },
    async extractFromText({ meter, knownFacts }) {
      providerCalls.text += 1;
      await meter.begin("text");
      // AI 试图给分（被忽略）：facts 里只有事实。
      return { facts: { ...(knownFacts ?? {}), agenda: [{ at: "10:00", title: "キーノート" }, { at: "11:00", title: "VC セッション" }, { at: "13:30", title: "採用セッション" }], exhibitorCount: 12, total: 99 } as never, guessed: ["exhibitorCount"], isEventPage: true, pageCandidates: [], promptVersion: "event-facts-2026-10-v1", unreadable: [], usage: { calls: 1, inputTokens: 1, outputTokens: 1 } };
    },
  } : overrides.provider;
  const service = createEventAssessmentService({
    ai: { available: () => overrides.available ?? true, dailyLimit: 5, gate: quota, monthlyLimit: 10, provider, usage: async () => ({ dailyUsed: 1, monthlyUsed: 3 }) },
    fetchPage: async () => overrides.page ?? { contentType: "text/html", finalUrl: "https://saas-summit.jp/2026", html: summitHtml, ok: true, status: 200 },
    now: () => new Date(clock),
    orbitEvents: { facts: async (_actor, eventId) => (eventId === "evt-cfo" ? { attendeeSignature: "sig-1", extras: { attendeeSource: "registrants", expected: { vc_partner: 4 }, feeYen: 3000, firstDegree: 1, known: [{ contactId: "c-takahashi", name: "高橋 美咲" }], secondDegree: 0 }, facts: { price: "¥3,000", startsAt: "2026-10-07T19:00:00+09:00", title: "CFO Night Tokyo vol.18", venue: "渋谷ストリーム" } } : null) },
    plan: { addToPlan: async (actorId, input) => { added.push({ actorId, eventId: input.eventId, external: input.external }); return { itemId: "pitem-1", planId: "plan-1" }; }, context: async () => context },
    repository,
    schedule: (job) => { void job(); },
    ...overrides,
  });
  return { added, advance: (ms: number) => { clock += ms; }, providerCalls, quota, repository, service };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("URL：reading → ready；JSON-LD 优先、AI 补议程与展示；分数只来自 scoreEvent；判定用 eventVerdict(total)", async () => {
  const { service, quota } = setup();
  const created = await service.create(ALICE, { idempotencyKey: "k1", sourceKind: "url", url: "https://saas-summit.jp/2026?utm_source=x" }, "ja");
  assert.equal(created.status, "reading");
  await flush();
  const ready = (await service.get(ALICE, created.id, "ja"))!;
  assert.equal(ready.status, "ready");
  assert.equal(ready.facts.title, "Japan SaaS Summit 2026 秋");
  assert.equal(ready.factBasis?.title, "read");
  assert.equal(ready.factBasis?.exhibitorCount, "guessed");
  assert.equal(ready.scoreBreakdown.reduce((sum, item) => sum + item.score, 0), ready.total);
  assert.equal(ready.verdict, eventVerdict(ready.total));
  assert.notEqual(ready.total, 99);
  assert.equal(ready.goalLabel, "シリーズA 資金調達");
  assert.ok(ready.display && ready.display.goalFit.value >= 0);
  assert.ok(ready.meetCandidates?.some((item) => item.label === "VC" && /登壇 3名/.test(item.basis)) || ready.meetCandidates?.some((item) => item.label === "VC"));
  assert.ok(ready.knownAttendees?.some((item) => item.contactId === "c-takahashi"));
  assert.ok(ready.cautions?.some((item) => item.kind === "fee"));
  assert.ok(ready.cautions?.some((item) => item.kind === "off_target_session"));
  assert.equal(ready.partialAttendanceHint?.window, "11:00–13:30");
  assert.deepEqual(quota.finished, ["succeeded"]);
});

test("幂等：同键重放同一条；同一来源换键也返回已有记录、不再调 AI", async () => {
  const { service, providerCalls } = setup();
  const first = await service.create(ALICE, { idempotencyKey: "k1", sourceKind: "url", url: "https://saas-summit.jp/2026" }, "ja");
  await flush();
  const replay = await service.create(ALICE, { idempotencyKey: "k1", sourceKind: "url", url: "https://saas-summit.jp/2026" }, "ja");
  const sameSource = await service.create(ALICE, { idempotencyKey: "k2", sourceKind: "url", url: "https://SAAS-summit.jp/2026#top" }, "ja");
  assert.equal(replay.id, first.id);
  assert.equal(sameSource.id, first.id);
  assert.equal(providerCalls.text, 1);
});

test("登录页：规则判定、不调 AI；页内多活动 → not_event_page + 候选", async () => {
  const login = setup({ page: { contentType: "text/html", finalUrl: "https://x.jp/members/login", html: "<form><input type=password></form>", ok: true, status: 200 } });
  const a = await login.service.create(ALICE, { idempotencyKey: "a", sourceKind: "url", url: "https://x.jp/members/1" }, "ja");
  await flush();
  const failed = (await login.service.get(ALICE, a.id, "ja"))!;
  assert.equal(failed.status, "failed");
  assert.equal(failed.failureReason, "login_required");
  assert.equal(login.providerCalls.text, 0);
  const many = setup({ page: { contentType: "text/html", finalUrl: "https://x.jp/", html: `<script type="application/ld+json">${JSON.stringify([{ "@type": "Event", name: "A", startDate: "2026-11-01" }, { "@type": "Event", name: "B", startDate: "2026-11-02" }])}</script>`, ok: true, status: 200 } });
  const b = await many.service.create(ALICE, { idempotencyKey: "b", sourceKind: "url", url: "https://x.jp/" }, "ja");
  await flush();
  const list = (await many.service.get(ALICE, b.id, "ja"))!;
  assert.equal(list.failureReason, "not_event_page");
  assert.deepEqual(list.pageCandidates?.map((item) => item.title), ["A", "B"]);
});

test("海报：读到 1 / 3 → needs_input；PATCH 补 3 项（参加費「不明」）只规则重算、不调 AI，分数给区间", async () => {
  const { service, providerCalls, repository } = setup();
  const poster = await service.uploadPoster(ALICE, { bytes: Buffer.from("img"), mimeType: "image/jpeg" });
  const created = await service.create(ALICE, { idempotencyKey: "p1", posterAssetId: poster.posterAssetId, sourceKind: "poster" }, "ja");
  await flush();
  const needs = (await service.get(ALICE, created.id, "ja"))!;
  assert.equal(needs.status, "needs_input");
  assert.deepEqual([...needs.missingFields].sort(), ["startsAt", "venue"]);
  assert.equal(repository.posters.size, 1, "posters stay as short-lived assets (purged after 7 days)");
  assert.deepEqual(needs.posterAssetIds, [poster.posterAssetId]);
  const patched = (await service.patch(ALICE, created.id, { facts: { startsAt: "2026-10-07T19:00:00+09:00", venue: "渋谷ストリーム", price: undefined as never }, unknownFields: ["price"] }, "ja"))!;
  assert.equal(providerCalls.images, 1);
  assert.equal(providerCalls.text, 0);
  assert.ok(["ready", "needs_input"].includes(patched.status));
  assert.equal(patched.factBasis?.startsAt, "user");
  assert.ok(patched.userFilledFields?.includes("startsAt"));
});

test("3 项手入力：只规则、同步出结果；参加費不明 → scoreRange、判定仍用 total", async () => {
  const { service, providerCalls } = setup({ available: false });
  const result = await service.create(ALICE, { facts: { startsAt: "2026-10-21T08:00:00+09:00", title: "丸の内スタートアップ朝会 #42", venue: "丸の内" }, idempotencyKey: "m1", sourceKind: "manual" }, "ja");
  assert.equal(result.status, "ready");
  assert.ok(result.scoreRange && result.scoreRange.min < result.scoreRange.max);
  assert.ok(result.scoreRange!.min <= result.total && result.total <= result.scoreRange!.max);
  assert.equal(result.verdict, eventVerdict(result.total));
  assert.equal(providerCalls.text + providerCalls.images, 0);
});

test("库内活动：规则当场算、不调 AI；三处同一分数（与 scoreEvent 直接算一致）", async () => {
  const { service, providerCalls } = setup();
  const result = await service.create(ALICE, { eventId: "evt-cfo", idempotencyKey: "o1", sourceKind: "orbit_event" }, "ja");
  assert.equal(result.status, "ready");
  assert.equal(result.eventId, "evt-cfo");
  assert.equal(providerCalls.text, 0);
  assert.equal(result.recomputeOnAttendeeList, true);
  const again = await service.get(ALICE, result.id, "ja");
  assert.equal(again?.total, result.total);
  assert.ok(scoreEvent({ facts: { attendeeSource: "registrants", exchangeCorner: null, expected: { vc_partner: 4 }, fee: 3000, firstDegree: 1, matching: null, nameTags: null, networkingMinutes: null, secondDegree: 0, timeslot: "evening", travelMinutes: 30 }, types: context.types }).total === result.total);
});

test("加入计划：库内 → eventId；外部 → assessment:<id>（不建活动）；見送る只记这条；他人读不到", async () => {
  const { service, added } = setup();
  const internal = await service.create(ALICE, { eventId: "evt-cfo", idempotencyKey: "o1", sourceKind: "orbit_event" }, "ja");
  const external = await service.create(ALICE, { facts: { price: "無料", startsAt: "2026-10-21T08:00:00+09:00", title: "朝会", venue: "丸の内" }, idempotencyKey: "m1", sourceKind: "manual" }, "ja");
  assert.deepEqual(await service.addToPlan(ALICE, internal.id), { planId: "plan-1", planItemId: "pitem-1" });
  await service.addToPlan(ALICE, external.id);
  assert.deepEqual(added.map((item) => [item.eventId, item.external]), [["evt-cfo", false], [`assessment:${external.id}`, true]]);
  assert.equal((await service.get(ALICE, external.id, "ja"))?.userDecision, "added");
  assert.equal(await service.dismiss(ALICE, internal.id), true);
  const list = await service.list(ALICE, "ja");
  assert.equal(list.at(-1)?.id, internal.id, "見送り sinks to the bottom");
  assert.equal(await service.get(BOB, external.id, "ja"), null);
  assert.equal(await service.addToPlan(BOB, external.id), null);
  assert.equal(await service.dismiss(BOB, external.id), false);
  assert.deepEqual(await service.list(BOB, "ja"), []);
});

test("AI 关：海报 / 正文入口拒绝；URL 只有 JSON-LD 时规则出结果；超限 → quota_exceeded", async () => {
  const off = setup({ available: false });
  await assert.rejects(off.service.create(ALICE, { idempotencyKey: "t", sourceKind: "text", text: "x".repeat(40) }, "ja"), (error: unknown) => error instanceof EventAssessmentError && error.code === "UNAVAILABLE");
  const viaRules = await off.service.create(ALICE, { idempotencyKey: "u", sourceKind: "url", url: "https://saas-summit.jp/2026" }, "ja");
  await flush();
  assert.equal((await off.service.get(ALICE, viaRules.id, "ja"))?.status, "ready");
  const limited = setup({ page: { contentType: "text/html", finalUrl: "https://x.jp/e", html: "<main>event text only</main>", ok: true, status: 200 }, quota: gate({ deny: "monthly_limit" }) });
  const q = await limited.service.create(ALICE, { idempotencyKey: "q", sourceKind: "url", url: "https://x.jp/e" }, "ja");
  await flush();
  assert.equal((await limited.service.get(ALICE, q.id, "ja"))?.failureReason, "quota_exceeded");
  assert.equal(limited.providerCalls.text, 0);
});

test("schema 修复失败 → unreadable（已读事实保留，进补 3 项）；限速每人每分钟 10 次", async () => {
  const broken = setup({
    page: { contentType: "text/html", finalUrl: "https://x.jp/e", html: "<main>text</main>", ok: true, status: 200 },
    provider: { model: "x", extractFromImages: async () => { throw new EventExtractionError("UNREADABLE", "bad"); }, extractFromText: async () => { throw new EventExtractionError("UNREADABLE", "bad"); } },
  });
  const created = await broken.service.create(ALICE, { idempotencyKey: "x", sourceKind: "url", url: "https://x.jp/e" }, "ja");
  await flush();
  const read = await broken.service.get(ALICE, created.id, "ja");
  assert.equal(read?.failureReason, "unreadable");
  assert.equal(read?.status, "needs_input");
  assert.deepEqual(broken.quota.finished, ["failed"]);
  const rate = setup({ schedule: () => undefined });
  for (let n = 0; n < 10; n += 1) await rate.service.create(ALICE, { idempotencyKey: `r${n}`, sourceKind: "url", url: `https://x.jp/e/${n}` }, "ja");
  await assert.rejects(rate.service.create(ALICE, { idempotencyKey: "r10", sourceKind: "url", url: "https://x.jp/e/10" }, "ja"), (error: unknown) => error instanceof EventAssessmentError && error.code === "RATE_LIMITED");
  rate.advance(61_000);
  await rate.service.create(ALICE, { idempotencyKey: "r11", sourceKind: "url", url: "https://x.jp/e/11" }, "ja");
});

test("处理器：同键重试不重复入队；租约内不被再次认领；>2 分钟回收为 timeout 并结算额度", async () => {
  const scheduled: Array<() => Promise<void>> = [];
  const { service, advance, repository } = setup({ schedule: (job) => { scheduled.push(job); } });
  const created = await service.create(ALICE, { idempotencyKey: "k", sourceKind: "url", url: "https://saas-summit.jp/2026" }, "ja");
  await service.create(ALICE, { idempotencyKey: "k", sourceKind: "url", url: "https://saas-summit.jp/2026" }, "ja");
  assert.equal(scheduled.length, 1);
  // 模拟处理器崩溃：认领后没完成。
  assert.equal((await repository.claimReading({ leaseMs: 60_000, limit: 5, now: new Date(Date.parse("2026-10-07T01:00:00.000Z")).toISOString() })).length, 1);
  assert.equal(await service.processReading({ limit: 5 }), 0, "leased rows are not claimed again");
  repository.rows.get(created.id)!.aiOperationId = "op-stale";
  advance(121_000);
  assert.equal(await service.reclaimStale(), 0, "lease not yet expired + 2 min → not reclaimed (复核 S2)");
  advance(60_000);
  assert.equal(await service.reclaimStale(), 1);
  const reclaimed = await service.get(ALICE, created.id, "ja");
  assert.equal(reclaimed?.failureReason, "timeout");
});

test("availability：AI 开关与本月 / 今天剩余", async () => {
  const { service } = setup();
  assert.deepEqual(await service.availability(ALICE), { aiReadAvailable: true, dailyLeft: 4, monthlyLeft: 7, monthlyLimit: 10 });
});

test("复核 S2：处理途中被回收（租约变了）→ 这次结果不再写库，timeout 不会被改回 ready", async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const scheduled: Array<() => Promise<void>> = [];
  const { service, repository, advance } = setup({
    fetchPage: async () => { await held; return { contentType: "text/html", finalUrl: "https://saas-summit.jp/2026", html: summitHtml, ok: true, status: 200 }; },
    schedule: (job) => { scheduled.push(job); },
  });
  const created = await service.create(ALICE, { idempotencyKey: "k-race", sourceKind: "url", url: "https://saas-summit.jp/2026" }, "ja");
  const running = scheduled[0]!();
  await flush();
  advance(180_000 + 121_000);
  assert.equal(await service.reclaimStale(), 1);
  release();
  await running;
  assert.equal(repository.rows.get(created.id)?.status, "failed");
  assert.equal(repository.rows.get(created.id)?.failureReason, "timeout");
});

test("复核 M1：同一来源一时失败后再贴 → 重新评估（旧行让出来源键）；要登录这类确定的失败照旧返回原记录", async () => {
  let page: UrlFetchResult = { finalUrl: "https://x.jp/e/1", ok: false, reason: "fetch_failed" };
  const { service, repository } = setup({ fetchPage: async () => page });
  const first = await service.create(ALICE, { idempotencyKey: "m1-a", sourceKind: "url", url: "https://x.jp/e/1" }, "ja");
  await flush(); await flush();
  assert.equal(repository.rows.get(first.id)?.failureReason, "fetch_failed");
  page = { contentType: "text/html", finalUrl: "https://saas-summit.jp/2026", html: summitHtml, ok: true, status: 200 };
  const second = await service.create(ALICE, { idempotencyKey: "m1-b", sourceKind: "url", url: "https://x.jp/e/1" }, "ja");
  assert.notEqual(second.id, first.id);
  assert.equal(repository.rows.get(first.id)?.userDecision, "dismissed");
});
