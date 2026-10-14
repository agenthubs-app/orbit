/**
 * R26 真实 AI 验证（用户 2026-10-14 授权：只在本机，E1 ≤15 次、E2 ≤10 次，合计 ≤ $0.3）。
 *
 * - 本机回环测试库里建一个临时 schema（network-analysis + event-assessments 迁移），走真实的评估服务、真实抓取、真实 DeepSeek，
 *   账本照常记 `ai_usage_ledger` / `ai_usage_calls`（`event_assessment`），结束后打印每次的耗时、状态、分数、token、账本行，然后删 schema。
 * - 硬上限：E1 / E2 的 HTTP 次数一到上限就不再发（provider 外再包一层计数）；估算费用超过 $0.3 也停。
 * - 只读 `.env.local` 里的 DEEPSEEK_API_KEY（不打印）。不连 Neon：只接受回环地址的 ORBIT_EVENT_DATABASE_URL。
 *
 *   ORBIT_EVENT_DATABASE_URL=postgres://localhost/orbit_test npx tsx scripts/r26/real-ai-verify.ts <poster.jpg>
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Pool } from "pg";

import { DEFAULT_EVENT_SCORE_PREFERENCES } from "../../shared/compute/event-score";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { createConfiguredEventFactsProvider, type EventFactsProvider } from "../../features/events/assessment/extract-provider";
import type { JudgeContext } from "../../features/events/assessment/judge";
import { runEventAssessmentMigrations } from "../../features/events/assessment/migrations";
import { createPostgresEventAssessmentRepository } from "../../features/events/assessment/repository";
import { createEventAssessmentService } from "../../features/events/assessment/service";
import { fetchEventPage } from "../../features/events/assessment/url-fetch";
import { loadLocalEnv } from "../load-local-env";

const CAPS = { e1: 15, e2: 10, usd: 0.3 };
// DeepSeek 公开价（估算用，美元 / 百万 token；取保守的较高值）。
const PRICE = { input: 0.6, output: 2.2 };
const WS = "workspace:r26-real-ai";
const ACTOR = "actor:r26-verify";

const context: JudgeContext = {
  contacts: [{ id: "c-1", name: "高橋 美咲" }],
  goalKeywords: ["資金調達", "VC", "投資家", "シリーズ"],
  goalLabel: "シリーズA 資金調達",
  homeArea: "東京都千代田区",
  language: "ja",
  planId: "plan-verify",
  preferences: DEFAULT_EVENT_SCORE_PREFERENCES,
  types: [
    { allocation: 10, emoji: "📊", key: "cfo", metCount: 0, shortLabel: "CFO", skipped: false, targetCount: 1 },
    { allocation: 15, emoji: "🧗", key: "funded_founder", metCount: 2, shortLabel: "起業家", skipped: false, targetCount: 5 },
    { allocation: 10, emoji: "👼", key: "angel", metCount: 0, shortLabel: "エンジェル", skipped: false, targetCount: 2 },
    { allocation: 30, emoji: "💼", key: "vc_partner", metCount: 2, shortLabel: "VC", skipped: false, targetCount: 3 },
    { allocation: 15, emoji: "🏢", key: "cvc", metCount: 0, shortLabel: "CVC", skipped: false, targetCount: 3 },
  ],
};

async function main() {
  loadLocalEnv();
  const url = process.env.ORBIT_EVENT_DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) throw new Error("loopback database only");
  const base = createConfiguredEventFactsProvider();
  if (!base) throw new Error("DEEPSEEK_API_KEY missing");
  const posterPath = process.argv[2];
  const counts = { e1: 0, e2: 0, inputTokens: 0, outputTokens: 0 };
  const usd = () => (counts.inputTokens * PRICE.input + counts.outputTokens * PRICE.output) / 1_000_000;
  // 上限守卫：每次 HTTP 前查次数与费用。
  const guarded: EventFactsProvider = {
    model: base.model,
    extractFromText: (input) => base.extractFromText({ ...input, meter: { begin: async (model) => { if (counts.e1 >= CAPS.e1 || usd() >= CAPS.usd) throw new Error("E1 cap"); counts.e1 += 1; return input.meter.begin(model); }, end: async (id, usage) => { if (usage) { counts.inputTokens += usage.inputTokens; counts.outputTokens += usage.outputTokens; } return input.meter.end(id, usage); } } }),
    extractFromImages: (input) => base.extractFromImages({ ...input, meter: { begin: async (model) => { if (counts.e2 >= CAPS.e2 || usd() >= CAPS.usd) throw new Error("E2 cap"); counts.e2 += 1; return input.meter.begin(model); }, end: async (id, usage) => { if (usage) { counts.inputTokens += usage.inputTokens; counts.outputTokens += usage.outputTokens; } return input.meter.end(id, usage); } } }),
  };
  const schema = `r26_real_ai_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
  const client = createTransactionalPostgresClient({ connectionString: url, max: 4, pool: pool as never });
  try {
    await admin.query(`create schema ${schema}`);
    await runNetworkAnalysisMigrations(pool);
    await runEventAssessmentMigrations(pool);
    const repository = createPostgresEventAssessmentRepository({ client, workspaceId: WS });
    const ledger = createPostgresAiUsageLedger({ client, workspaceId: WS });
    const jobs: Promise<void>[] = [];
    const service = createEventAssessmentService({
      ai: { available: () => true, dailyLimit: 5, gate: ledger, monthlyLimit: 10, provider: guarded, usage: async (actorId, now) => ({ dailyUsed: (await ledger.readUsageToday(actorId, now)).eventAssessment, monthlyUsed: await ledger.countMonthly(actorId, "event_assessment", now) }) },
      fetchPage: (target) => fetchEventPage(target),
      orbitEvents: { facts: async () => null },
      plan: { addToPlan: async () => null, context: async () => context },
      repository,
      schedule: (job) => { jobs.push(job()); },
    });
    const cases: { label: string; input: Parameters<typeof service.create>[1] }[] = [
      { input: { idempotencyKey: "connpass", sourceKind: "url", url: "https://devsumi.connpass.com/event/408981/" }, label: "connpass" },
      { input: { idempotencyKey: "peatix", sourceKind: "url", url: "https://peatix.com/event/5004206" }, label: "Peatix" },
      { input: { idempotencyKey: "official", sourceKind: "url", url: "https://www.ivs.events/" }, label: "主办方官网 IVS2026" },
      { input: { idempotencyKey: "members", sourceKind: "url", url: "https://github.com/settings/profile" }, label: "会员页（要登录）" },
    ];
    cases.push({ input: { idempotencyKey: "text", sourceKind: "text", text: "CFO Night Tokyo vol.18\n日時：2026年11月18日（水）19:00〜21:30\n会場：渋谷ストリーム 4F\n参加費：5,000円（懇親会込み）\n登壇：山田 太郎（青葉ベンチャーズ パートナー）、佐藤 花子（株式会社北辰 CFO）\n19:00 パネル「シリーズA の資金調達」 / 20:00 交流タイム（名札あり）\n主催：CFO Night 実行委員会" }, label: "贴正文" });
    if (posterPath) {
      const poster = await service.uploadPoster(ACTOR, { bytes: readFileSync(posterPath), mimeType: "image/jpeg" });
      cases.push({ input: { idempotencyKey: "poster", posterAssetId: poster.posterAssetId, sourceKind: "poster" }, label: "模糊海报" });
    }
    const rows: string[] = [];
    const only = process.env.R26_ONLY?.split(",") ?? null;
    for (const item of cases.filter((entry) => !only || only.some((name) => entry.label.includes(name)))) {
      const started = Date.now();
      const before = { ...counts };
      const created = await service.create(ACTOR, item.input, "ja");
      await Promise.all(jobs.splice(0));
      const result = (await service.get(ACTOR, created.id, "ja"))!;
      rows.push(JSON.stringify({
        case: item.label,
        e1Calls: counts.e1 - before.e1,
        e2Calls: counts.e2 - before.e2,
        facts: { price: result.facts.price, speakers: result.facts.speakers?.length ?? 0, startsAt: result.facts.startsAt, title: result.facts.title, venue: result.facts.venue ?? result.facts.area },
        failureReason: result.failureReason ?? null,
        inputTokens: counts.inputTokens - before.inputTokens,
        missing: result.missingFields,
        ms: Date.now() - started,
        outputTokens: counts.outputTokens - before.outputTokens,
        status: result.status,
        total: result.total,
        verdict: result.verdict,
      }));
    }
    const ledgerRows = (await pool.query("select purpose, status, max_calls, (select count(*) from ai_usage_calls c where c.operation_id = l.id) as calls from ai_usage_ledger l order by created_at")).rows;
    console.log(rows.join("\n"));
    console.log(JSON.stringify({ e1: counts.e1, e2: counts.e2, estimatedUsd: Number(usd().toFixed(4)), inputTokens: counts.inputTokens, ledgerRows, model: base.model, outputTokens: counts.outputTokens }));
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
