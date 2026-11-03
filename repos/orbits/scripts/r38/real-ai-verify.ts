/**
 * R38 真实 AI 验证（用户 2026-11-03 授权：DeepSeek，fund / sales / hire 各 1 次；只在本机）。
 *
 * - 计划与联系人走本机回环库（live 仓储，账号默认 `user_orbit_primary_qa`）；AI 账本放临时 schema（network-analysis 迁移含 v8），
 *   打印完账本行后删 schema，不动本机库的 public 账本。
 * - 每种目标：建 intake → 背景三块确认 → 选题、作答 → 初稿（`firstDraftV3`，`plan_draft` / trigger `plan`）→ 确定 →
 *   准备卡初次生成（`plan_prep` pick + card，trigger `plan`，不计日限）→ 跑候补匹配作业后再 ensure（看补生成）→
 *   给第一件事的联系人手动补一条事实（置 `staleSince`）→ 重新生成该卡（trigger `manual`，计入每日 15 次）。
 * - 账号同时最多 2 个进行中的目标：`R38_ARCHIVE_IDS=plan_a,plan_b` 先归档这些计划；除最后一种目标外，每种跑完即归档（最后一份留给界面核对）。
 * - DeepSeek 的 HTTP 次数有硬上限 `R38_AI_CAP`（默认 36），逐次打印耗时与 token；Tavily 没有密钥时搜索走 disabled。
 * - 只读 `.env.local` 里的模型密钥（不打印）。只接受回环地址的 ORBIT_EVENT_DATABASE_URL，不连 Neon。
 *
 *   npx tsx scripts/r38/real-ai-verify.ts [fundraising,sales,hiring] [actorId]
 */
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { loadLocalEnv } from "../load-local-env";

loadLocalEnv();
const url = process.env.ORBIT_EVENT_DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/([^@]*@)?(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) throw new Error("loopback ORBIT_EVENT_DATABASE_URL only");
Object.assign(process.env, { ORBIT_DATABASE_TARGET: "", ORBIT_FEATURE_MODE: "live", ORBIT_MODULE_MODE: "live", ORBIT_PLAN_SEARCH: process.env.ORBIT_PLAN_SEARCH ?? "" });

const CAP = Number(process.env.R38_AI_CAP ?? 36);
const PRICE = { input: 0.6, output: 2.2 }; // 美元 / 百万 token（保守估算，同 R27）
const GOALS = (process.argv[2] ?? "fundraising,sales,hiring").split(",") as Array<"fundraising" | "sales" | "hiring">;
const ACTOR = process.argv[3] ?? "user_orbit_primary_qa";
const GOAL_TEXT = {
  fundraising: "シリーズAで3億円を調達したい",
  hiring: "フルスタックエンジニアを2名採用したい",
  sales: "製造業向けSaaSの新規顧客を半年で10社獲得したい",
} as const;
const FACT_TEXT = {
  fundraising: "前回の交流会で、来年はB2B SaaSへの出資を増やすと話していた",
  hiring: "以前、知り合いのエンジニアを紹介できると言っていた",
  sales: "工場の受発注がまだFAXと電話中心だと話していた",
} as const;

// DeepSeek / Tavily 的 HTTP：硬上限 + 计数（覆盖所有路径，包括可能的候补匹配 AI）。
const http = { deepseek: 0, tavily: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (target.includes("deepseek")) {
    if (http.deepseek >= CAP) throw new Error(`deepseek cap ${CAP} reached`);
    http.deepseek += 1;
  }
  if (target.includes("tavily")) http.tavily += 1;
  return realFetch(input, init);
}) as typeof fetch;

const usage: Record<string, { calls: number; input: number; output: number }> = {};
const rejected: Array<Record<string, unknown>> = [];
const JA = { language: "ja" as const, platform: "web" as const };
const key = (label: string) => `r38-${label}-${randomUUID().slice(0, 8)}`;
const log = (label: string, value: unknown) => console.log(`\n### ${label}\n${JSON.stringify(value, null, 1)}`);

async function main(): Promise<void> {
  const { createPostgresAiUsageLedger } = await import("../../features/ai-quota/ledger");
  const { runNetworkAnalysisMigrations } = await import("../../features/network-analysis/migrations");
  const { createTransactionalPostgresClient } = await import("../../shared/storage/transactional-postgres");
  const { bindDeepseekPlanChat } = await import("../../features/plans/ai-generator");
  const { createDeepseekPlanFlowAi } = await import("../../features/plans/v2/ai/deepseek");
  const { PLAN_V2_MAX_OUTPUT_TOKENS, resolvePlanFlowService } = await import("../../features/plans/v2/flow-factory");
  const { createDeepseekPlanPrepAi, PLAN_PREP_PROMPT_VERSION } = await import("../../features/plans/prep/ai");
  const { resolvePlanPrepService } = await import("../../features/plans/prep/factory");
  const { DEFAULT_BUSINESS_CARD_TEXT_MODEL } = await import("../../features/acquisition/deepseek-business-card-ocr-provider");
  const { getConfiguredPlanMatchingRuntime } = await import("../../features/plans/matching-runtime");
  const { runPlanSourceMatchJob } = await import("../../features/plans/match-worker");
  const { addManualContactFact } = await import("../../features/contacts/facts/accumulate");
  const { createConfiguredContactFactStore } = await import("../../features/contacts/facts/store");
  const { PLAN_GOAL_TEMPLATES } = await import("../../shared/compute/plan-templates");

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY missing");
  const model = process.env.ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL?.trim() || DEFAULT_BUSINESS_CARD_TEXT_MODEL;
  const counted = (step: string, maxTokens: number) => {
    const chat = bindDeepseekPlanChat({ apiKey, maxTokens, model });
    return (async (args: Parameters<typeof chat>[0]) => {
      const started = Date.now();
      const bucket = (usage[step] ??= { calls: 0, input: 0, output: 0 });
      bucket.calls += 1;
      try {
        const result = await chat(args);
        bucket.input += result.usage.inputTokens;
        bucket.output += result.usage.outputTokens;
        console.log(JSON.stringify({ call: http.deepseek, ms: Date.now() - started, step, tokens: result.usage }));
        return result;
      } catch (error) {
        console.log(JSON.stringify({ call: http.deepseek, error: error instanceof Error ? error.message.slice(0, 160) : "unknown", ms: Date.now() - started, step }));
        throw error;
      }
    }) as typeof chat;
  };

  const schema = `r38_ai_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const ledgerPool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
  const workspaceId = process.env.ORBIT_WORKSPACE_ID ?? "";
  try {
    await admin.query(`create schema ${schema}`);
    await runNetworkAnalysisMigrations(ledgerPool as never);
    const ledger = createPostgresAiUsageLedger({ client: createTransactionalPostgresClient({ connectionString: url, pool: ledgerPool as never }), workspaceId });
    const flowAi = createDeepseekPlanFlowAi({ chat: counted("flow", PLAN_V2_MAX_OUTPUT_TOKENS), ledger, model, onRejected: (entry) => rejected.push({ kind: "flow", ...entry }) });
    const prepAi = createDeepseekPlanPrepAi({
      chat: counted("prep", 2048),
      ledger,
      log: (entry) => {
        console.log(JSON.stringify(entry));
        if (String(entry.event).includes("rejected")) rejected.push({ kind: "prep", ...entry });
      },
      model,
    });
    const flowResolution = resolvePlanFlowService({ actorId: ACTOR, ai: flowAi, mode: "live" });
    const prepResolution = resolvePlanPrepService({ actorId: ACTOR, ai: prepAi, mode: "live" });
    if (flowResolution.success === false || prepResolution.success === false) throw new Error("live services unavailable");
    const flow = flowResolution.service;
    const prep = prepResolution.service;
    const facts = createConfiguredContactFactStore();
    const matching = getConfiguredPlanMatchingRuntime();
    log("setup", { actor: ACTOR, goals: GOALS, matching: Boolean(matching), model, promptPrep: PLAN_PREP_PROMPT_VERSION, schema, search: process.env.ORBIT_PLAN_SEARCH || "disabled" });

    for (const planId of (process.env.R38_ARCHIVE_IDS ?? "").split(",").filter(Boolean)) await flow.deleteGoal(planId, key("archive"));
    const results: Array<Record<string, unknown>> = [];
    for (const [index, goalKind] of GOALS.entries()) {
      const usageAt = async () => (await ledger.readUsageToday(ACTOR, new Date())).planFlow;
      const row: Record<string, unknown> = { goalKind };
      try {
        let intake = await flow.createIntake({ goalKind, goalText: GOAL_TEXT[goalKind], idempotencyKey: key("create"), source: "task" }, JA);
        const me = intake.background.me.value;
        intake = await flow.confirmBlock(intake.intakeId, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: key("me"), me: { stance: me.stance ?? "owner", wants: me.wants } }, JA);
        const team = intake.background.team.value;
        intake = await flow.confirmBlock(intake.intakeId, {
          block: "team", expectedUpdatedAt: intake.updatedAt, idempotencyKey: key("team"),
          team: { members: team.members.map((member) => ({ capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [], relation: member.relation })), mode: team.mode },
        }, JA);
        intake = await flow.confirmBlock(intake.intakeId, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: key("purpose"), purpose: { selectedLevel: intake.background.purpose.value.selectedLevel ?? 2 } }, JA);
        const asked = await flow.chooseQuestions(intake.intakeId, key("questions"), JA);
        const bank = new Map(PLAN_GOAL_TEMPLATES[goalKind].questions.map((question) => [question.id, question]));
        const answers = (asked.questions ?? []).map((question) => {
          const values = question.guess?.values?.length ? [...question.guess.values] : (bank.get(question.id)?.options.slice(0, 1) ?? []);
          return { questionId: question.id, text: question.guess?.text ?? null, values };
        });
        const premise = await flow.submitAnswers(asked.intakeId, { answers, idempotencyKey: key("answers") }, JA);
        row.intakeId = premise.intakeId;
        row.questions = (asked.questions ?? []).map((question) => question.id);

        const planFlowBeforeDraft = await usageAt();
        const draft = await flow.makeDraft(premise.intakeId, key("draft"), JA);
        const content = draft.content as unknown as Record<string, unknown> | null;
        row.draft = {
          state: (draft as unknown as { state?: string }).state,
          schemaVersion: content?.schemaVersion,
          outcome: content?.outcome,
          verdict: content?.verdict,
          confidence: content?.confidence,
          summary: content?.summary,
          steps: (content?.steps as Array<Record<string, unknown>> | undefined)?.map((step) => ({ title: step.title, doneCriteria: step.doneCriteria, why: step.why, personTypeKeys: step.personTypeKeys })),
          personTypes: (content?.personTypes as Array<Record<string, unknown>> | undefined)?.map((type) => ({ key: type.key, label: type.label, stepKey: type.stepKey, count: type.count, weight: type.weight })),
          risks: content?.risks,
          sources: (content?.sources as unknown[] | undefined)?.length ?? 0,
          planFlowUsed: { after: await usageAt(), before: planFlowBeforeDraft },
        };
        const draftId = (draft as unknown as { draftId: string }).draftId;
        if (content?.schemaVersion !== 3) throw new Error(`draft not v3: ${JSON.stringify(draft).slice(0, 300)}`);
        const confirmed = await flow.confirm(draftId, key("confirm"), JA);
        const planId = (confirmed as unknown as { planId?: string; plan?: { id: string } }).planId ?? (confirmed as unknown as { plan: { id: string } }).plan.id;
        row.planId = planId;

        const beforePrep = await usageAt();
        const first = await prep.ensure(planId, "ja");
        const afterPrep = await usageAt();
        row.homeBeforeMatch = summarizeHome(first);
        row.planFlowAroundInitialPrep = { after: afterPrep, before: beforePrep };

        if (matching) {
          const outcome = await runPlanSourceMatchJob(matching.worker, { actorId: ACTOR, planId });
          row.matchJob = outcome;
          const second = await prep.ensure(planId, "ja");
          row.homeAfterMatch = summarizeHome(second);
        }
        const home = (row.homeAfterMatch ?? row.homeBeforeMatch) as ReturnType<typeof summarizeHome>;
        const target = home?.actions.find((action) => action.contactId);
        if (target && facts) {
          await addManualContactFact(facts, { actorId: ACTOR, at: new Date().toISOString(), contactId: target.contactId!, text: FACT_TEXT[goalKind] });
          row.markedStale = await prep.markStale(target.contactId!);
          const beforeRegen = await usageAt();
          const regenerated = await prep.regenerate({ actionKey: target.actionKey, idempotencyKey: key("regen"), language: "ja", planId });
          row.regenerated = summarizeHome(regenerated)?.actions.find((action) => action.actionKey === target.actionKey);
          row.planFlowAroundRegenerate = { after: await usageAt(), before: beforeRegen };
        } else {
          row.regenerated = "skipped: no contact action";
        }
      } catch (error) {
        row.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      }
      if (row.planId && index < GOALS.length - 1) await flow.deleteGoal(String(row.planId), key("archive"));
      log(`goal ${goalKind}`, row);
      results.push(row);
    }

    const ledgerRows = (await ledgerPool.query(`select purpose, trigger, status, idempotency_key,
        (select count(*)::int from ai_usage_calls c where c.operation_id = l.id) as calls,
        (select coalesce(sum(input_tokens),0)::int from ai_usage_calls c where c.operation_id = l.id) as input_tokens,
        (select coalesce(sum(output_tokens),0)::int from ai_usage_calls c where c.operation_id = l.id) as output_tokens
      from ai_usage_ledger l order by created_at`)).rows;
    const tokens = Object.values(usage).reduce((sum, bucket) => ({ input: sum.input + bucket.input, output: sum.output + bucket.output }), { input: 0, output: 0 });
    log("ledger", ledgerRows);
    log("rejected", rejected);
    log("totals", { costUsd: ((tokens.input * PRICE.input + tokens.output * PRICE.output) / 1_000_000).toFixed(4), http, planIds: results.map((item) => item.planId), tokens, usage });
  } finally {
    await ledgerPool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

function summarizeHome(home: Awaited<ReturnType<import("../../features/plans/prep/service").PlanPrepService["ensure"]>>) {
  if (!home) return null;
  return {
    state: home.state,
    lead: home.lead,
    actions: home.actions.map((action) => {
      const raw = action as unknown as Record<string, unknown> & { prep?: Record<string, unknown> | null };
      return { actionKey: action.actionKey, contactId: (raw.contactId as string | null) ?? null, kind: raw.kind, title: raw.title, reason: raw.reason, stepNumber: raw.stepNumber, meta: raw.meta, prep: raw.prep ?? null };
    }),
  };
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
