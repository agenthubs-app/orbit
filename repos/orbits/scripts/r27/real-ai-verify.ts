/**
 * R27 真实 AI 验证（用户 2026-10-14 授权 A6：只在本机，E3 / E4 各 ≤5 次 HTTP）。
 *
 * - 本机回环测试库建临时 schema（network-analysis 迁移含 v4），走真实 E3 worker（会後まとめ v3）与真实 E4（persona + 自己紹介，日文），
 *   账本照常记 `event_post_summary` / `event_registration_interview`；打印每次的耗时、结果、token、估算费用、账本行，最后删 schema。
 * - 硬上限：E3 / E4 各自的 HTTP 次数一到 5 次就不再发（runner 外再包一层计数）。
 * - 只读 `.env.local` 里的模型密钥（不打印）。只接受回环地址的 ORBIT_EVENT_DATABASE_URL，不连 Neon。
 *
 *   ORBIT_EVENT_DATABASE_URL=postgres://localhost/orbit_test npx tsx scripts/r27/real-ai-verify.ts [e3runs=2] [e4runs=2]
 */
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { runOrbitAgentModelText } from "../../features/orbit-ai/gemini-provider";
import { createLiveRecordAttendeePostEventAiArtifactReader } from "../../features/events/post-event-artifact/live-record-reader";
import { processAttendeePostEventAiTask } from "../../features/events/post-event-artifact/processor";
import { ATTENDEE_POST_EVENT_AI_PROMPT_VERSION, resolveAttendeePostEventAiProviderConfiguration } from "../../features/events/post-event-artifact/provider-config";
import { createAttendeePostEventAiTaskRepository } from "../../features/events/post-event-artifact/task-repository";
import { generateEventPersona } from "../../features/events/registration/adaptive-interview-service";
import { createLedgeredRunner } from "../../features/events/journey/ledgered-runner";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { loadLocalEnv } from "../load-local-env";

const CAP = Math.min(5, Number(process.env.R27_AI_CAP ?? 5)); // 剩余额度（已用的次数由调用方扣掉）
const PRICE = { input: 0.6, output: 2.2 }; // 美元 / 百万 token（保守估算）
const WS = "workspace:r27-real-ai";

loadLocalEnv();
const url = process.env.ORBIT_EVENT_DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) throw new Error("loopback ORBIT_EVENT_DATABASE_URL only");
const e3Runs = Math.min(2, Number(process.argv[2] ?? 2));
const e4Runs = Math.min(2, Number(process.argv[3] ?? 2));

const usage = { e3: { calls: 0, input: 0, output: 0 }, e4: { calls: 0, input: 0, output: 0 } };
function counted(kind: "e3" | "e4"): typeof runOrbitAgentModelText {
  return async (args) => {
    if (usage[kind].calls >= CAP) throw new Error(`${kind} cap ${CAP} reached`);
    usage[kind].calls += 1;
    const started = Date.now();
    const result = await runOrbitAgentModelText(args);
    const u = result.responseMetadata?.usage;
    usage[kind].input += u?.promptTokens ?? 0;
    usage[kind].output += u?.completionTokens ?? 0;
    console.log(JSON.stringify({ call: usage[kind].calls, kind, ms: Date.now() - started, ok: result.success, error: result.success === false ? `${result.error.code}: ${result.error.message.slice(0, 160)}` : undefined, tokens: u ? { in: u.promptTokens, out: u.completionTokens } : null }));
    return result;
  };
}

const context = {
  eventDate: "2026-10-07",
  eventTitle: "CFO Night Tokyo vol.18",
  language: "ja" as const,
  people: [
    { contactId: "contact:shimizu", name: "清水 玲奈", org: "Sorae Capital" },
    { contactId: "contact:inoue", name: "井上 早紀", org: "ノードワークス" },
    { contactId: "contact:mori", name: "森 拓也", org: "ブルーム証券" },
  ],
  planTypes: [{ key: "vc_partner", label: "VC パートナー" }, { key: "cfo_experienced", label: "CFO 経験者" }, { key: "financial_institution", label: "金融機関" }],
};
const evidence = [
  { commitments: ["11月にオフィス訪問"], contactId: "contact:shimizu", evidenceId: "evidence:human-encounter:1", nextStep: "訪問の候補日を送る", noteText: "B2B SaaS に注力、今年 5社に出資。製造業向け SaaS にも関心", observedAt: "2026-10-07T21:04:00+09:00", talked: "yes" as const },
  { commitments: [], contactId: "contact:inoue", evidenceId: "evidence:human-encounter:2", nextStep: "", noteText: "音声メモ：優先株の条件は 2社以上で比較を、とのこと", observedAt: "2026-10-07T20:31:00+09:00", talked: "yes" as const },
  { commitments: ["IPO 準備の資料を共有"], contactId: "contact:mori", evidenceId: "evidence:human-encounter:3", nextStep: "資料を受け取る", noteText: "資本政策の担当。上場準備の進め方", observedAt: "2026-10-07T20:15:00+09:00", talked: "yes" as const },
];

async function main(): Promise<void> {
  const schema = `r27_ai_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
  try {
    await admin.query(`create schema ${schema}`);
    await runNetworkAnalysisMigrations(pool);
    const gate = createPostgresAiUsageLedger({ client: createTransactionalPostgresClient({ connectionString: url, pool: pool as never }), workspaceId: WS });

    // E3
    const provider = resolveAttendeePostEventAiProviderConfiguration();
    if (!provider) throw new Error("post-event AI provider unconfigured");
    for (let run = 1; run <= e3Runs; run += 1) {
      const store = createMemoryLiveRecordStore<Record<string, unknown>>();
      const repository = createAttendeePostEventAiTaskRepository({ store, workspaceId: WS });
      await repository.request({ attendeeActorId: `actor:verify-${run}`, attendeeDisplayName: "佐藤 健一", context, eventId: "event:cfo-18", evidenceSnapshot: evidence.slice(0, run === 1 ? 3 : 2), evidenceWhitelist: evidence.slice(0, run === 1 ? 3 : 2).map((item) => item.evidenceId), model: provider.model, promptVersion: ATTENDEE_POST_EVENT_AI_PROMPT_VERSION, provider: provider.provider, requestedAt: new Date().toISOString() });
      const started = Date.now();
      const outcome = await processAttendeePostEventAiTask({ config: provider.config, ledger: gate, repository, runModelText: counted("e3"), workerId: "r27-verify" });
      const view = await createLiveRecordAttendeePostEventAiArtifactReader({ store, workspaceId: WS }).read({ attendeeActorId: `actor:verify-${run}`, eventId: "event:cfo-18" });
      console.log(JSON.stringify({ e3run: run, ms: Date.now() - started, outcome, status: view.status, failure: view.failureCode, highlights: view.artifact?.highlights, nextSteps: view.artifact?.nextSteps?.map((step) => ({ attendeeId: step.attendeeId, followupDate: step.followupDate, planType: step.planTypeSuggestion, subject: step.thanksDraft.subject, bodyChars: step.thanksDraft.body.length })), sample: view.artifact?.nextSteps?.[0]?.thanksDraft.body }, null, 1));
    }

    // E4
    const event = { ...mockEventRecords[0]!, title: "CFO Night Tokyo vol.18", description: "上場を目指すスタートアップの CFO・経営陣と、投資家・金融機関が本音で話す夜。", venue: "渋谷ストリーム 4F ホール" };
    const transcript = [
      { answer: "製造業向け IoT SaaS「ミナトリンク」の代表取締役CEO", field: "positioning" as const, prompt: "あなたの立場は？" },
      { answer: "資金調達の相談相手を見つけたい", field: "desiredOutcome" as const, prompt: "今回の参加目的にいちばん近いものは？" },
      { answer: "VC・CVC、上場企業の CFO", field: "targetAttendees" as const, prompt: "どんな方に会いたいですか？" },
      { answer: "工場 DX の現場事情", field: "valueOffered" as const, prompt: "提供できることは？" },
      { answer: "シリーズAの資本政策、CFO 採用", field: "experienceHighlight" as const, prompt: "当日話したいテーマは？" },
    ];
    for (let run = 1; run <= e4Runs; run += 1) {
      const ledgered = createLedgeredRunner({ actorId: `actor:verify-${run}`, gate, idempotencyKey: `r27-e4-${run}`, purpose: "event_registration_interview", runner: counted("e4") });
      const started = Date.now();
      try {
        const persona = await generateEventPersona({ event, language: "ja", modelRunner: ledgered.run, transcript });
        await ledgered.finish("succeeded");
        console.log(JSON.stringify({ e4run: run, ms: Date.now() - started, ok: true, promptVersion: persona.promptVersion, selfIntroChars: persona.selfIntroDraft?.length ?? 0, selfIntroDraft: persona.selfIntroDraft, tagline: persona.tagline }, null, 1));
      } catch (error) {
        await ledgered.finish("failed");
        console.log(JSON.stringify({ e4run: run, error: error instanceof Error ? error.message : "unknown", ok: false }));
      }
    }

    const ledgerRows = (await pool.query("select purpose, status, max_calls, (select count(*)::int from ai_usage_calls c where c.operation_id = l.id) as calls, (select coalesce(sum(input_tokens),0)::int from ai_usage_calls c where c.operation_id = l.id) as input_tokens from ai_usage_ledger l order by purpose")).rows;
    const cost = (k: "e3" | "e4") => (usage[k].input * PRICE.input + usage[k].output * PRICE.output) / 1_000_000;
    console.log(JSON.stringify({ costUsd: { e3: cost("e3").toFixed(4), e4: cost("e4").toFixed(4) }, ledgerRows, usage }, null, 1));
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
