/**
 * R26 活动评估服务（契约 8 live；events DESIGN §2.1、§3.1、§5）。Owner: 甲 (R26).
 * Used by: `handlers.ts`（live 路由）、`job.ts`（after() / cron 处理器）、`recompute-job.ts`。
 *
 * - 幂等：同一幂等键 → 同一条；同一来源（规范化 URL / 海报 / 正文 / 3 项的摘要 / `event:<id>`）同一评分版本 → 已有记录，不重复扣额度。
 * - 来源：url → 抓取（SSRF 防护）→ 规则判登录页 → JSON-LD / meta → E1；poster → E2；text → E1；manual / orbit_event → 只规则。
 * - 异步：url / poster / text 先写 `reading` 返回，处理器（after() 立即一次、cron 每分钟兜底认领租约过期的）完成；
 *   `reading` 超过 2 分钟回收为 `failed / timeout`，已扣额度按账本 `finish(failed)`（0 次响应 → released 不计次）。
 * - 分数只来自 `scoreEvent`（judge.ts），读时按当前计划重算；PATCH 只规则重算、不再调 AI。
 * - 外部活动「参加予定に追加」不建活动：计划条目引用 `assessment:<id>`，只对本人可见（复核 S1）。
 * - 見送る只写这条记录的 `user_decision`（不影响探す，复核 m4）。
 */
import { createHash, randomUUID } from "node:crypto";

import { EVENT_SCORE_RUBRIC_VERSION } from "../../../shared/compute/event-score";
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type {
  EventAssessmentAvailability,
  EventAssessmentContract,
  EventAssessmentCreateInput,
  EventAssessmentFactBasis,
  EventAssessmentFacts,
  EventAssessmentFailureReason,
  EventAssessmentPatchInput,
} from "../../../shared/contract/event-assessment";
import type { AiQuotaGate } from "../../ai-quota/gate";
import { EventExtractionError, type EventFactsExtraction, type EventFactsProvider } from "./extract-provider";
import { judgeEvent, missingRequiredFields, type JudgeContext, type OrbitEventExtras } from "./judge";
import { extractEventPage } from "./page-extract";
import type { AssessmentRow, EventAssessmentRepository, PosterAsset } from "./repository";
import { normalizeUrl, type UrlFetchResult } from "./url-fetch";

export const ASSESSMENT_LEASE_MS = 60_000;
/** `reading` 超过 2 分钟回收为 timeout（DESIGN §5）。 */
export const ASSESSMENT_STALE_MS = 120_000;
export const URL_FETCH_PER_ACTOR_PER_MINUTE = 10;
export const URL_FETCH_PER_HOST_PER_MINUTE = 30;
export const ASSESSMENT_LIST_LIMIT = 100;
export const POSTER_MAX_BYTES = 6 * 1024 * 1024;
/** 海报短期资产的保存期（维护任务清理）。 */
export const POSTER_RETENTION_MS = 7 * 86_400_000;
export const POSTER_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

export class EventAssessmentError extends Error {
  constructor(readonly code: "NOT_FOUND" | "RATE_LIMITED" | "INVALID" | "CONFLICT" | "UNAVAILABLE", message: string) {
    super(message);
    this.name = "EventAssessmentError";
  }
}

export interface AssessmentPlanPort {
  /** 当前目标（首页 / Task 显示的那一个）的判定上下文；没有计划时 `types` 为空。 */
  context(actorId: string, language: PlanCopyLanguage): Promise<JudgeContext>;
  /** 加到当前目标；外部活动用 `assessment:<id>`，不建活动。没有计划 → null。 */
  addToPlan(actorId: string, input: { eventId: string; title: string; external: boolean }): Promise<{ planId: string; itemId: string } | null>;
}

export interface OrbitEventPort {
  /** 库内活动的规则事实（发布中的活动；没有 → null）。 */
  facts(actorId: string, eventId: string, context: JudgeContext): Promise<{ facts: EventAssessmentFacts; extras: OrbitEventExtras; attendeeSignature: string | null } | null>;
}

export interface AssessmentAiPort {
  /** URL / 海报入口是否开放（provider 已配置且 live 已授权打开；G18）。 */
  available(): boolean;
  provider: EventFactsProvider | null;
  gate: AiQuotaGate;
  /** 本月 / 今天已用（availability 用）；没有账本时 null。 */
  usage?(actorId: string, now: Date): Promise<{ monthlyUsed: number; dailyUsed: number } | null>;
  monthlyLimit: number;
  dailyLimit: number;
}

export interface EventAssessmentServiceDeps {
  repository: EventAssessmentRepository;
  plan: AssessmentPlanPort;
  orbitEvents: OrbitEventPort;
  ai: AssessmentAiPort;
  fetchPage(url: string): Promise<UrlFetchResult>;
  /** 请求结束后跑一次（Next `after()`）；测试里同步执行。 */
  schedule(job: () => Promise<void>): void;
  /** HEIC → JPEG（懒加载 heic-convert）。 */
  convertHeic?(bytes: Buffer): Promise<Buffer>;
  now?(): Date;
  newId?(): string;
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

function digestOf(input: EventAssessmentCreateInput): { digest: string; url: string | null; host: string | null } {
  switch (input.sourceKind) {
    case "url": {
      const url = normalizeUrl(input.url);
      if (!url) throw new EventAssessmentError("INVALID", "This URL cannot be read.");
      return { digest: `url:${sha(url)}`, host: new URL(url).hostname, url };
    }
    case "poster": {
      const ids = [...new Set([input.posterAssetId, ...(input.posterAssetIds ?? [])])].sort();
      return { digest: `poster:${sha(ids.join(","))}`, host: null, url: null };
    }
    case "text":
      return { digest: `text:${sha(input.text.trim())}`, host: null, url: input.url ?? null };
    case "manual":
      return { digest: `manual:${sha(JSON.stringify(input.facts, Object.keys(input.facts).sort()))}`, host: null, url: null };
    case "orbit_event":
      return { digest: `event:${input.eventId}`, host: null, url: null };
  }
}

function basisFor(facts: EventAssessmentFacts, basis: EventAssessmentFactBasis): Partial<Record<keyof EventAssessmentFacts, EventAssessmentFactBasis>> {
  return Object.fromEntries(Object.keys(facts).map((key) => [key, basis])) as Partial<Record<keyof EventAssessmentFacts, EventAssessmentFactBasis>>;
}

/** 合并事实：先来的优先（JSON-LD 读到的 > AI 读到的）。 */
function mergeFacts(primary: EventAssessmentFacts, secondary: EventAssessmentFacts): EventAssessmentFacts {
  const out: EventAssessmentFacts = { ...secondary };
  for (const [key, value] of Object.entries(primary)) if (value !== undefined && value !== null && value !== "") (out as Record<string, unknown>)[key] = value;
  return out;
}

export interface EventAssessmentService {
  create(actorId: string, input: EventAssessmentCreateInput, language: PlanCopyLanguage): Promise<EventAssessmentContract>;
  list(actorId: string, language: PlanCopyLanguage): Promise<EventAssessmentContract[]>;
  get(actorId: string, id: string, language: PlanCopyLanguage): Promise<EventAssessmentContract | null>;
  patch(actorId: string, id: string, input: EventAssessmentPatchInput, language: PlanCopyLanguage): Promise<EventAssessmentContract | null>;
  addToPlan(actorId: string, id: string): Promise<{ planId: string | null; planItemId: string | null } | null>;
  dismiss(actorId: string, id: string): Promise<boolean>;
  availability(actorId: string): Promise<EventAssessmentAvailability>;
  uploadPoster(actorId: string, input: { mimeType: string; bytes: Buffer }): Promise<{ posterAssetId: string }>;
  /** 本人的海报（结果页缩略图）。 */
  poster(actorId: string, id: string): Promise<{ mimeType: string; bytes: Buffer } | null>;
  /** 处理器：认领并处理一条（或一批）`reading`。 */
  processReading(input?: { id?: string; limit?: number }): Promise<number>;
  /** 回收卡死的 `reading`（>2 分钟）→ failed / timeout，退额度。 */
  reclaimStale(input?: { limit?: number }): Promise<number>;
  /** 读时判定（计划事实「我的外部评估」一路也用它）。 */
  view(row: AssessmentRow, context: JudgeContext): Promise<EventAssessmentContract>;
}

export function createEventAssessmentService(deps: EventAssessmentServiceDeps): EventAssessmentService {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => randomUUID());
  /** 贴正文只在内存里交给处理器（不落库，DESIGN §9 #9）。 */
  const pendingText = new Map<string, string>();

  async function viewOf(row: AssessmentRow, context: JudgeContext): Promise<EventAssessmentContract> {
    const base: EventAssessmentContract = {
      createdAt: row.createdAt,
      facts: row.facts,
      id: row.id,
      missingFields: row.missingFields,
      rubricVersion: row.rubricVersion,
      scoreBreakdown: row.scoreBreakdown,
      sourceKind: row.sourceKind,
      status: row.status,
      total: row.total,
      verdict: row.verdict,
      ...(Object.keys(row.factBasis).length ? { factBasis: row.factBasis } : {}),
      ...(row.failureReason ? { failureReason: row.failureReason } : {}),
      ...(row.pageCandidates?.length ? { pageCandidates: row.pageCandidates } : {}),
      ...(row.userFilledFields.length ? { userFilledFields: row.userFilledFields } : {}),
      ...(row.userDecision ? { userDecision: row.userDecision } : {}),
      ...(row.eventId ? { eventId: row.eventId } : {}),
      ...(row.planItemId ? { planItemId: row.planItemId } : {}),
      assessedAt: row.factsRefreshedAt ?? row.updatedAt,
      ...(row.sourceUrl ? { sourceLabel: row.sourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") } : {}),
      ...(row.readMs !== null ? { readSeconds: Math.max(1, Math.round(row.readMs / 1000)) } : {}),
      ...(row.posterAssetIds.length ? { posterAssetIds: row.posterAssetIds } : {}),
    };
    if (row.status !== "ready" && row.status !== "needs_input") return base;
    const orbit = row.eventId ? await deps.orbitEvents.facts(row.actorId, row.eventId, context) : null;
    const facts = orbit ? mergeFacts(row.facts, orbit.facts) : row.facts;
    const judged = judgeEvent({ context, eventId: row.eventId, facts, orbit: orbit?.extras ?? null });
    return {
      ...base,
      basisLines: judged.basisLines,
      cautions: judged.cautions,
      display: judged.display,
      facts,
      ...(context.goalLabel ? { goalLabel: context.goalLabel } : {}),
      knownAttendees: judged.knownAttendees,
      meetCandidates: judged.meetCandidates,
      ...(judged.partialAttendanceHint ? { partialAttendanceHint: judged.partialAttendanceHint } : {}),
      ...(judged.range ? { scoreRange: judged.range } : {}),
      ...(row.eventId ? { recomputeOnAttendeeList: true } : {}),
      scoreBreakdown: judged.scoreBreakdown,
      total: judged.total,
      verdict: judged.verdict,
    };
  }

  /** 事实 → 状态 + 分数快照（写库用；读时仍会重算）。 */
  async function settle(row: AssessmentRow, facts: EventAssessmentFacts, factBasis: AssessmentRow["factBasis"], extra: Partial<AssessmentRow>, unknown: readonly string[] = []): Promise<AssessmentRow> {
    const context = await deps.plan.context(row.actorId, "ja");
    const orbit = row.eventId ? await deps.orbitEvents.facts(row.actorId, row.eventId, context) : null;
    const merged = orbit ? mergeFacts(facts, orbit.facts) : facts;
    const missing = missingRequiredFields(merged, unknown);
    // 判定必须的日时与场所缺失 → 补 3 项；只缺参加費时直接出区间（url / orbit_event）。海报 / 正文 3 项缺一即补。
    const needsInput = row.sourceKind === "poster" || row.sourceKind === "text"
      ? missing.length > 0
      : missing.some((field) => field !== "price");
    const judged = judgeEvent({ context, eventId: row.eventId, facts: merged, orbit: orbit?.extras ?? null });
    const at = now().toISOString();
    const updated = await deps.repository.update(row.actorId, row.id, {
      attendeeSignature: orbit?.attendeeSignature ?? null,
      factBasis,
      facts,
      factsRefreshedAt: at,
      failureReason: null,
      leaseUntil: null,
      missingFields: missing,
      scoreBreakdown: judged.scoreBreakdown,
      status: needsInput ? "needs_input" : "ready",
      total: judged.total,
      totalMax: judged.range?.max ?? null,
      totalMin: judged.range?.min ?? null,
      updatedAt: at,
      verdict: judged.verdict,
      ...extra,
    });
    if (!updated) throw new EventAssessmentError("NOT_FOUND", "Assessment not found.");
    return updated;
  }

  async function fail(row: AssessmentRow, reason: EventAssessmentFailureReason, extra: Partial<AssessmentRow> = {}): Promise<AssessmentRow> {
    const at = now().toISOString();
    return (await deps.repository.update(row.actorId, row.id, { failureReason: reason, leaseUntil: null, status: extra.status ?? "failed", updatedAt: at, ...extra })) ?? row;
  }

  async function withAi(row: AssessmentRow, run: (meter: { begin(model: string): Promise<string>; end(callId: string, usage: { inputTokens: number; outputTokens: number } | null): Promise<void> }) => Promise<EventFactsExtraction>): Promise<EventFactsExtraction | EventAssessmentFailureReason> {
    if (!deps.ai.available() || !deps.ai.provider) return "ai_unavailable";
    const reservation = await deps.ai.gate.reserve({ actorId: row.actorId, idempotencyKey: `event-assessment:${row.id}`, now: now(), pool: "user", purpose: "event_assessment", takeover: true, trigger: "manual" });
    if (reservation.ok === false) return reservation.reason === "disabled" ? "ai_unavailable" : "quota_exceeded";
    if (!reservation.owner) return "ai_unavailable";
    await deps.repository.update(row.actorId, row.id, { aiOperationId: reservation.operationId });
    const meter = {
      begin: async (model: string) => (await deps.ai.gate.beginCall(reservation.operationId, { model, provider: "deepseek" })).callId,
      end: (callId: string, usage: { inputTokens: number; outputTokens: number } | null) => deps.ai.gate.endCall(callId, usage),
    };
    try {
      const result = await run(meter);
      await deps.ai.gate.finish(reservation.operationId, "succeeded");
      return result;
    } catch (error) {
      await deps.ai.gate.finish(reservation.operationId, "failed").catch(() => undefined);
      if (error instanceof EventExtractionError) return error.code === "TIMEOUT" ? "timeout" : error.code === "UNREADABLE" ? "unreadable" : "ai_unavailable";
      return "ai_unavailable";
    }
  }

  async function processRow(row: AssessmentRow): Promise<void> {
    const started = now().getTime();
    const elapsed = () => Math.max(0, now().getTime() - started);
    if (row.sourceKind === "url" && row.sourceUrl) {
      const page = await deps.fetchPage(row.sourceUrl);
      if (page.ok === false) { await fail(row, page.reason, { readMs: elapsed() }); return; }
      const extract = extractEventPage(page.html, page.finalUrl);
      if (extract.loginRequired) { await fail(row, "login_required", { readMs: elapsed() }); return; }
      if (extract.eventCount > 1) { await fail(row, "not_event_page", { pageCandidates: extract.pageCandidates, readMs: elapsed() }); return; }
      const ruleFacts = extract.facts;
      const ruleComplete = Boolean(ruleFacts.title && ruleFacts.startsAt && (ruleFacts.venue || ruleFacts.area));
      const ai = await withAi(row, (meter) => deps.ai.provider!.extractFromText({ knownFacts: ruleFacts, meter, text: extract.text }));
      if (typeof ai === "string") {
        // AI 不可用 / 超限时：JSON-LD 已经够判定就照规则出结果；否则按原因失败。
        if (ruleComplete && (ai === "ai_unavailable" || ai === "quota_exceeded")) {
          await settle(row, ruleFacts, basisFor(ruleFacts, "read"), { readMs: elapsed() });
          return;
        }
        await fail(row, ai, { facts: ruleFacts, factBasis: basisFor(ruleFacts, "read"), readMs: elapsed(), ...(ai === "unreadable" ? { missingFields: missingRequiredFields(ruleFacts), status: "needs_input" } : {}) });
        return;
      }
      if (!ai.isEventPage && !ruleComplete) { await fail(row, "not_event_page", { pageCandidates: ai.pageCandidates, promptVersion: ai.promptVersion, readMs: elapsed() }); return; }
      const facts = mergeFacts(ruleFacts, ai.facts);
      const basis = { ...basisFor(ai.facts, "read"), ...Object.fromEntries(ai.guessed.map((key) => [key, "guessed"])), ...basisFor(ruleFacts, "read") } as AssessmentRow["factBasis"];
      await settle(row, facts, basis, { promptVersion: ai.promptVersion, readMs: elapsed() });
      return;
    }
    if (row.sourceKind === "text") {
      const text = pendingText.get(row.id);
      if (!text) { await fail(row, "timeout"); return; }
      const ai = await withAi(row, (meter) => deps.ai.provider!.extractFromText({ meter, text }));
      pendingText.delete(row.id);
      if (typeof ai === "string") { await fail(row, ai, { readMs: elapsed() }); return; }
      if (!ai.isEventPage) { await fail(row, "not_event_page", { pageCandidates: ai.pageCandidates, promptVersion: ai.promptVersion, readMs: elapsed() }); return; }
      const basis = { ...basisFor(ai.facts, "read"), ...Object.fromEntries(ai.guessed.map((key) => [key, "guessed"])) } as AssessmentRow["factBasis"];
      await settle(row, ai.facts, basis, { promptVersion: ai.promptVersion, readMs: elapsed() });
      return;
    }
    if (row.sourceKind === "poster") {
      const assets = await deps.repository.getPosters(row.actorId, row.posterAssetIds);
      if (assets.length === 0) { await fail(row, "unreadable"); return; }
      const images = await Promise.all(assets.map(async (asset: PosterAsset) => {
        const heic = asset.mimeType === "image/heic" || asset.mimeType === "image/heif";
        const bytes = heic && deps.convertHeic ? await deps.convertHeic(asset.bytes) : asset.bytes;
        return { base64: bytes.toString("base64"), mimeType: heic ? "image/jpeg" : asset.mimeType };
      }));
      const ai = await withAi(row, (meter) => deps.ai.provider!.extractFromImages({ images, meter }));
      // 海报按短期资产保存（结果页显示缩略图；7 天后由维护任务清理，DESIGN §3.1「按现有资产保存期」）。
      if (typeof ai === "string") { await fail(row, ai, { readMs: elapsed(), ...(ai === "unreadable" ? { missingFields: ["startsAt", "venue", "price"], status: "needs_input" } : {}) }); return; }
      const basis = { ...basisFor(ai.facts, "read"), ...Object.fromEntries(ai.guessed.map((key) => [key, "guessed"])) } as AssessmentRow["factBasis"];
      await settle(row, ai.facts, basis, { promptVersion: ai.promptVersion, readMs: elapsed() });
      return;
    }
    await fail(row, "unreadable");
  }

  function baseRow(actorId: string, input: EventAssessmentCreateInput, source: { digest: string; url: string | null; host: string | null }): AssessmentRow {
    const at = now().toISOString();
    return {
      actorId, aiOperationId: null, attempts: 0, attendeeSignature: null, createdAt: at,
      eventId: input.sourceKind === "orbit_event" ? input.eventId : null,
      factBasis: {}, facts: input.sourceKind === "manual" ? input.facts : source.url ? { url: source.url } : {},
      factsRefreshedAt: null, failureReason: null, id: `evas_${newId()}`, idempotencyKey: input.idempotencyKey, leaseUntil: null,
      missingFields: [], pageCandidates: null, planItemId: null,
      posterAssetIds: input.sourceKind === "poster" ? [...new Set([input.posterAssetId, ...(input.posterAssetIds ?? [])])].slice(0, 3) : [],
      promptVersion: null, readMs: null, rubricVersion: EVENT_SCORE_RUBRIC_VERSION, scoreBreakdown: [], sourceDigest: source.digest,
      sourceHost: source.host, sourceKind: input.sourceKind, sourceUrl: source.url, status: "reading", total: 0, totalMax: null, totalMin: null,
      updatedAt: at, userDecision: null, userFilledFields: input.sourceKind === "manual" ? (Object.keys(input.facts) as (keyof EventAssessmentFacts)[]) : [],
      verdict: "conditional", view: {},
    };
  }

  const service: EventAssessmentService = {
    async create(actorId, input, language) {
      const replay = await deps.repository.findByKey(actorId, input.idempotencyKey);
      if (replay) return viewOf(replay, await deps.plan.context(actorId, language));
      const source = digestOf(input);
      const sameSource = await deps.repository.findBySource(actorId, source.digest, EVENT_SCORE_RUBRIC_VERSION);
      if (sameSource) return viewOf(sameSource, await deps.plan.context(actorId, language));
      if ((input.sourceKind === "url" || input.sourceKind === "poster" || input.sourceKind === "text") && !deps.ai.available() && input.sourceKind !== "url") {
        throw new EventAssessmentError("UNAVAILABLE", "Reading posters and pasted text is not available.");
      }
      if (input.sourceKind === "url") {
        const since = new Date(now().getTime() - 60_000).toISOString();
        if (await deps.repository.countUrlFetchesSince({ actorId, since }) >= URL_FETCH_PER_ACTOR_PER_MINUTE) throw new EventAssessmentError("RATE_LIMITED", "Too many links in a minute.");
        if (source.host && await deps.repository.countUrlFetchesSince({ host: source.host, since }) >= URL_FETCH_PER_HOST_PER_MINUTE) throw new EventAssessmentError("RATE_LIMITED", "This site is busy. Try again in a minute.");
      }
      const { row, created } = await deps.repository.insert(baseRow(actorId, input, source));
      if (!created) return viewOf(row, await deps.plan.context(actorId, language));
      if (input.sourceKind === "manual") {
        const settled = await settle(row, input.facts, basisFor(input.facts, "user"), {}, []);
        return viewOf(settled, await deps.plan.context(actorId, language));
      }
      if (input.sourceKind === "orbit_event") {
        const settled = await settle(row, {}, {}, {});
        return viewOf(settled, await deps.plan.context(actorId, language));
      }
      if (input.sourceKind === "text") pendingText.set(row.id, input.text);
      deps.schedule(async () => { await service.processReading({ id: row.id, limit: 1 }); });
      return viewOf(row, await deps.plan.context(actorId, language));
    },
    async list(actorId, language) {
      const rows = await deps.repository.list(actorId, ASSESSMENT_LIST_LIMIT);
      const context = await deps.plan.context(actorId, language);
      const views = await Promise.all(rows.map((row) => viewOf(row, context)));
      // 評価したイベント · スコア順；見送り沉到底部（DESIGN §2.1）。
      return views.sort((a, b) => Number(a.userDecision === "dismissed") - Number(b.userDecision === "dismissed") || b.total - a.total || b.createdAt.localeCompare(a.createdAt));
    },
    async get(actorId, id, language) {
      const row = await deps.repository.get(actorId, id);
      return row ? viewOf(row, await deps.plan.context(actorId, language)) : null;
    },
    async patch(actorId, id, input, language) {
      const row = await deps.repository.get(actorId, id);
      if (!row) return null;
      if (row.status === "reading") throw new EventAssessmentError("CONFLICT", "This assessment is still being read.");
      const facts = mergeFacts(input.facts, row.facts);
      const filled = [...new Set([...row.userFilledFields, ...(Object.keys(input.facts) as (keyof EventAssessmentFacts)[]), ...((input.unknownFields ?? []) as (keyof EventAssessmentFacts)[])])];
      const basis = { ...row.factBasis, ...basisFor(input.facts, "user") };
      // 只规则重算，不再调 AI（PLANNER SC-R26-02）。「不明」的项接受缺失（参加費 → 区间）。
      const settled = await settle(row, facts, basis, { pageCandidates: row.pageCandidates, userFilledFields: filled }, input.unknownFields ?? []);
      return viewOf(settled, await deps.plan.context(actorId, language));
    },
    async addToPlan(actorId, id) {
      const row = await deps.repository.get(actorId, id);
      if (!row) return null;
      if (row.status !== "ready" && row.status !== "needs_input") throw new EventAssessmentError("CONFLICT", "Only a finished assessment can be added.");
      const external = row.eventId === null;
      const added = await deps.plan.addToPlan(actorId, { eventId: external ? `assessment:${row.id}` : row.eventId!, external, title: row.facts.title ?? "" });
      await deps.repository.update(actorId, id, { planItemId: added?.itemId ?? null, userDecision: "added" });
      return { planId: added?.planId ?? null, planItemId: added?.itemId ?? null };
    },
    async dismiss(actorId, id) {
      return Boolean(await deps.repository.update(actorId, id, { userDecision: "dismissed" }));
    },
    async availability(actorId) {
      const usage = deps.ai.usage ? await deps.ai.usage(actorId, now()) : null;
      return {
        aiReadAvailable: deps.ai.available(),
        dailyLeft: usage ? Math.max(0, deps.ai.dailyLimit - usage.dailyUsed) : null,
        monthlyLeft: usage ? Math.max(0, deps.ai.monthlyLimit - usage.monthlyUsed) : null,
        monthlyLimit: deps.ai.monthlyLimit,
      };
    },
    async uploadPoster(actorId, input) {
      if (!(POSTER_MIME_TYPES as readonly string[]).includes(input.mimeType)) throw new EventAssessmentError("INVALID", "Unsupported image type.");
      if (input.bytes.length === 0 || input.bytes.length > POSTER_MAX_BYTES) throw new EventAssessmentError("INVALID", "The image is too large.");
      const id = `evposter_${newId()}`;
      await deps.repository.putPoster({ actorId, byteSize: input.bytes.length, bytes: input.bytes, createdAt: now().toISOString(), digest: createHash("sha256").update(input.bytes).digest("hex"), id, mimeType: input.mimeType });
      return { posterAssetId: id };
    },
    async poster(actorId, id) {
      const [asset] = await deps.repository.getPosters(actorId, [id]);
      return asset ? { bytes: asset.bytes, mimeType: asset.mimeType } : null;
    },
    async processReading(input = {}) {
      const claimed = await deps.repository.claimReading({ id: input.id, leaseMs: ASSESSMENT_LEASE_MS, limit: input.limit ?? 20, now: now().toISOString() });
      for (const row of claimed) {
        try {
          await processRow(row);
        } catch (error) {
          console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_assessment_process_failed", id: row.id }));
          await fail(row, "fetch_failed").catch(() => undefined);
        }
      }
      return claimed.length;
    },
    async reclaimStale(input = {}) {
      const olderThan = new Date(now().getTime() - ASSESSMENT_STALE_MS).toISOString();
      const stale = await deps.repository.listStaleReading({ limit: input.limit ?? 50, olderThan });
      for (const row of stale) {
        if (row.aiOperationId) await deps.ai.gate.finish(row.aiOperationId, "failed").catch(() => undefined);
        pendingText.delete(row.id);
        await fail(row, "timeout");
      }
      return stale.length;
    },
    view: viewOf,
  };
  return service;
}
