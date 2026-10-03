/**
 * W0051：洞察生成的执行器（后台批量与单人重新生成共用）。
 *
 * 顺序（防重复计费，照 `features/plans/match-worker.ts`）：
 *  1. 行已经以 CAS 领取（`ai_state = started` + 租约，已提交）——只有领到的执行器走到这里；
 *  2. `prepareInsightGeneration`：读目标与输入、算版本。没有关系目标 → blocked_no_goal（0 次调用、不预留）；
 *     版本与目标都没变的行 → 只清待更新（0 次调用）；读不到的联系人 → failed；
 *  3. 调用方预留 1 次操作（后台池：一批 ≤20 人 = 1 次；单人重新生成：用户主动池 1 次）；
 *  4. `executeInsightGeneration`：每次 HTTP 前 `beginCall`、后 `endCall`（一条成本子账），解析校验后写回，
 *     由本执行器唯一 `finish`。失败的行标 failed；W0057 起供应商错误、超时、输出无效、缺输出按本轮失败次数自动重试
 *     （第 1／2 次失败 5／10 分钟后由心跳维护任务重试，第 3 次停下等用户「重新生成」，见 repository.ts）。
 *  5. W0058（rev 2 G-3）：同一调用产出的名片推测与洞察同一条 complete 语句写进行（`profile_apply_state = pending`），
 *     再按行写回联系人（来源 ai／card_inference，完整来源判定）；写回失败或冲突只记日志、行保持 pending，
 *     由维护任务 `replayPendingProfileApplies` 从存的推测重放（0 次模型调用，最多 3 次，之后 skipped）。
 */
import { createHash } from "node:crypto";

import type { AiQuotaGate } from "../../ai-quota/gate";
import { nextTokyoMidnight } from "../../ai-quota/constants";
import { InsightGeneratorError, parseInsightOutput, type ContactInsightGenerator, type InsightGenerationInput } from "./generator";
import type { ContactInsightInputSource } from "./input-source";
import { contactInsightRelevance } from "./relevance";
import { contactInsightGoalHash, type ClaimedInsightBatch, type ContactInsightCompletion, type ContactInsightRepository } from "./repository";
import { contactInsightSourceVersion } from "./source-version";
import type { EnrichedValue } from "../enrichment/apply-enrichment";
import {
  profileInferenceIsEmpty,
  profileInferenceValues,
  profileLanguageForGoal,
  type StoredProfileInference,
} from "./profile-inference";

/** 租约：生成超时 60 s，留足余量。 */
export const CONTACT_INSIGHT_LEASE_MS = 5 * 60_000;

export interface ContactInsightWorkerDeps {
  repository: ContactInsightRepository;
  inputs: ContactInsightInputSource;
  generator: ContactInsightGenerator;
  gate: AiQuotaGate;
  readGoal(actorId: string): Promise<string | null>;
  /**
   * W0058：把推测写回联系人（provider.applyContactCardInference）；返回实际写入的字段。未配置时推测只留在洞察行上（pending）。
   * 冲突时实现方重读重试 ≤2 次，仍冲突抛错。
   */
  applyProfileInference?: (input: { actorId: string; contactId: string; values: readonly EnrichedValue[]; at: string }) => Promise<readonly string[]>;
  now?: () => Date;
  log?: (line: Record<string, unknown>) => void;
}

export type PreparedInsightGeneration =
  | { kind: "no_goal" }
  | { kind: "nothing"; unchanged: number; missing: number }
  | {
      kind: "generate";
      goalHash: string;
      input: InsightGenerationInput;
      completions: Map<string, Omit<ContactInsightCompletion, "goalRelation" | "nextStep" | "evidence">>;
      /** 本次要生成的联系人 id + 版本的摘要（幂等键用）。 */
      fingerprint: string;
      unchanged: number;
      missing: number;
    };

function logger(deps: ContactInsightWorkerDeps) {
  return deps.log ?? ((line: Record<string, unknown>) => console.info(JSON.stringify(line)));
}

export async function prepareInsightGeneration(deps: ContactInsightWorkerDeps, batch: ClaimedInsightBatch): Promise<PreparedInsightGeneration> {
  const now = (deps.now ?? (() => new Date()))();
  const ids = batch.rows.map((row) => row.contactId);
  const goal = ((await deps.readGoal(batch.actorId)) ?? "").trim();
  if (!goal) {
    // W51-6：未设关系目标不生成、不消耗任何池。
    await deps.repository.blockNoGoal({ actorId: batch.actorId, claimedAt: batch.claimedAt, contactIds: ids, now, owner: batch.owner });
    return { kind: "no_goal" };
  }
  const goalHash = contactInsightGoalHash(goal);
  const bundle = await deps.inputs.read({ actorId: batch.actorId, contactIds: ids, now });
  const missing = ids.filter((id) => !bundle.contacts.has(id));
  if (missing.length) {
    await deps.repository.fail({ actorId: batch.actorId, claimedAt: batch.claimedAt, code: "CONTACT_UNAVAILABLE", contactIds: missing, now, owner: batch.owner });
  }
  const unchanged: string[] = [];
  const completions = new Map<string, Omit<ContactInsightCompletion, "goalRelation" | "nextStep" | "evidence">>();
  const contacts: InsightGenerationInput["contacts"] = [];
  for (const row of batch.rows) {
    const source = bundle.contacts.get(row.contactId);
    if (!source) continue;
    const version = contactInsightSourceVersion({ ...source.version, goalHash });
    if (row.status === "ready" && row.sourceDataVersion === version) {
      unchanged.push(row.contactId);
      continue;
    }
    completions.set(row.contactId, { contactId: row.contactId, relevance: contactInsightRelevance({ ...source.relevance, now }), sourceDataVersion: version });
    contacts.push(source.input);
  }
  if (unchanged.length) {
    await deps.repository.markUnchanged({ actorId: batch.actorId, claimedAt: batch.claimedAt, contactIds: unchanged, now, owner: batch.owner });
  }
  if (!contacts.length) return { kind: "nothing", missing: missing.length, unchanged: unchanged.length };
  const usedNeedIds = new Set(contacts.flatMap((contact) => contact.needLinks.map((link) => link.needId)));
  const fingerprint = createHash("sha256")
    .update([...completions.values()].map((entry) => `${entry.contactId}@${entry.sourceDataVersion}`).sort().join("\n"))
    .digest("hex")
    .slice(0, 32);
  return {
    completions,
    fingerprint,
    goalHash,
    input: { contacts, goal, needs: bundle.needs.filter((need) => usedNeedIds.has(need.id) || bundle.needs.length <= 12) },
    kind: "generate",
    missing: missing.length,
    unchanged: unchanged.length,
  };
}

export interface InsightExecutionResult {
  status: "succeeded" | "failed";
  written: number;
  failed: number;
  callsResponded: number;
  errorCode?: string;
}

/** 调用方已预留并持有 operationId；本函数唯一 finish。 */
export async function executeInsightGeneration(
  deps: ContactInsightWorkerDeps,
  batch: ClaimedInsightBatch,
  prepared: Extract<PreparedInsightGeneration, { kind: "generate" }>,
  operationId: string,
): Promise<InsightExecutionResult> {
  const log = logger(deps);
  const now = () => (deps.now ?? (() => new Date()))();
  const ids = [...prepared.completions.keys()];
  const failAll = async (code: string, retry = true) => {
    await deps.repository.fail({ actorId: batch.actorId, claimedAt: batch.claimedAt, code, contactIds: ids, now: now(), owner: batch.owner, retry });
  };
  let outcome: "succeeded" | "failed" = "failed";
  let callsResponded = 0;
  const language = profileLanguageForGoal(prepared.input.goal);
  try {
    let callId: string | null = null;
    if (deps.generator.billable) {
      try {
        callId = (await deps.gate.beginCall(operationId, { model: deps.generator.model, provider: deps.generator.provider })).callId;
      } catch {
        // 操作已结算或超出 max_calls：不发请求。
        await failAll("OPERATION_NOT_OPEN", false);
        return { callsResponded, errorCode: "OPERATION_NOT_OPEN", failed: ids.length, status: "failed", written: 0 };
      }
    }
    let content: string;
    let usage: { inputTokens: number; outputTokens: number } | null = null;
    try {
      const generated = await deps.generator.generate(prepared.input);
      content = generated.content;
      usage = generated.usage;
      if (callId) await deps.gate.endCall(callId, usage ?? { inputTokens: 0, outputTokens: 0 });
      if (callId) callsResponded += 1;
    } catch (error) {
      const responded = error instanceof InsightGeneratorError ? error.usage : null;
      if (callId) await deps.gate.endCall(callId, responded).catch(() => undefined);
      if (callId && responded) callsResponded += 1;
      const code = error instanceof InsightGeneratorError ? error.code : "PROVIDER_REQUEST_FAILED";
      log({ actorId: batch.actorId, code, contacts: ids.length, event: "contact_insight_generation_failed" });
      await failAll(code);
      return { callsResponded, errorCode: code, failed: ids.length, status: "failed", written: 0 };
    }
    let parsed;
    try {
      parsed = parseInsightOutput(content, prepared.input);
    } catch {
      log({ actorId: batch.actorId, code: "INVALID_OUTPUT", contacts: ids.length, event: "contact_insight_generation_failed" });
      await failAll("INVALID_OUTPUT");
      return { callsResponded, errorCode: "INVALID_OUTPUT", failed: ids.length, status: "failed", written: 0 };
    }
    const results: ContactInsightCompletion[] = [];
    const missing: string[] = [];
    for (const [contactId, base] of prepared.completions) {
      const insight = parsed.insights.get(contactId);
      if (insight) {
        results.push({
          ...base, evidence: insight.evidence, goalRelation: insight.goalRelation, nextStep: insight.nextStep,
          profileInference: { language, ...insight.profile },
        });
      } else missing.push(contactId);
    }
    const writtenIds = await deps.repository.complete({
      actorId: batch.actorId,
      claimedAt: batch.claimedAt,
      goalHash: prepared.goalHash,
      model: deps.generator.model,
      now: now(),
      owner: batch.owner,
      results,
      usage: { batchSize: ids.length, inputTokens: usage?.inputTokens ?? 0, operationId, outputTokens: usage?.outputTokens ?? 0, provider: deps.generator.provider },
    });
    if (missing.length) {
      await deps.repository.fail({ actorId: batch.actorId, claimedAt: batch.claimedAt, code: "MISSING_OUTPUT", contactIds: missing, now: now(), owner: batch.owner, retry: true });
    }
    if (parsed.dropped.foreignContacts || parsed.dropped.foreignEvidence || parsed.dropped.unsafeText || parsed.dropped.profileItems) {
      log({ actorId: batch.actorId, dropped: parsed.dropped, event: "contact_insight_output_dropped" });
    }
    const written = writtenIds.length;
    const writtenSet = new Set(writtenIds);
    for (const result of results) {
      if (!writtenSet.has(result.contactId) || profileInferenceIsEmpty(result.profileInference)) continue;
      await applyStoredProfileInference(deps, { actorId: batch.actorId, contactId: result.contactId, profileInference: result.profileInference! }, now());
    }
    outcome = written > 0 ? "succeeded" : "failed";
    return { callsResponded, failed: missing.length, status: outcome, written };
  } finally {
    await deps.gate.finish(operationId, outcome);
  }
}

/**
 * W0058：把洞察行上存的推测写回联系人（不调用模型）。写回失败只记日志、行保持 pending（到上限 skipped），绝不让洞察失败。
 * 返回本次结果：applied／pending（等下一轮）／skipped／null（未配置写回或行已不是 pending）。
 */
export async function applyStoredProfileInference(
  deps: Pick<ContactInsightWorkerDeps, "repository" | "applyProfileInference" | "log">,
  input: { actorId: string; contactId: string; profileInference: StoredProfileInference },
  now: Date,
): Promise<"applied" | "pending" | "skipped" | null> {
  const log = deps.log ?? ((line: Record<string, unknown>) => console.info(JSON.stringify(line)));
  if (!deps.applyProfileInference) return null;
  let outcome: "applied" | "failed" = "applied";
  let fields: readonly string[] = [];
  try {
    const values = profileInferenceValues(input.profileInference);
    if (values.length) fields = await deps.applyProfileInference({ actorId: input.actorId, at: now.toISOString(), contactId: input.contactId, values });
  } catch (error) {
    outcome = "failed";
    log({
      actorId: input.actorId, code: (error as { code?: unknown })?.code ?? (error instanceof Error ? error.name : "unknown"),
      contactId: input.contactId, event: "contact_insight_profile_apply_failed",
    });
  }
  try {
    const state = await deps.repository.recordProfileApply({ actorId: input.actorId, contactId: input.contactId, now, outcome });
    if (state === "skipped") log({ actorId: input.actorId, contactId: input.contactId, event: "contact_insight_profile_apply_skipped" });
    if (state === "applied" && fields.length) log({ actorId: input.actorId, contactId: input.contactId, event: "contact_insight_profile_applied", fields });
    return state;
  } catch (error) {
    log({ actorId: input.actorId, contactId: input.contactId, error: error instanceof Error ? error.name : "unknown", event: "contact_insight_profile_apply_record_failed" });
    return null;
  }
}

/** W0058：维护任务每轮重放待写回的推测（0 次模型调用）。 */
export async function replayPendingProfileApplies(
  deps: Pick<ContactInsightWorkerDeps, "repository" | "applyProfileInference" | "log">,
  input: { now: Date; limit?: number },
): Promise<{ applied: number; pending: number; skipped: number }> {
  const summary = { applied: 0, pending: 0, skipped: 0 };
  if (!deps.applyProfileInference) return summary;
  const rows = await deps.repository.listPendingProfileApplies({ limit: input.limit ?? 50 });
  for (const row of rows) {
    const state = await applyStoredProfileInference(deps, row, input.now);
    if (state) summary[state] += 1;
  }
  return summary;
}

export interface InsightBatchOutcome {
  status: "succeeded" | "failed" | "deferred" | "no_goal" | "nothing" | "unavailable" | "not_owner";
  contacts: number;
  callsResponded: number;
  retryOn?: string;
}

/** 后台批量：预留后台池 1 次操作（一批 ≤20 人），额度不够整组顺延到下一东京日、释放租约、0 次调用。 */
export async function processClaimedInsightBatch(deps: ContactInsightWorkerDeps, batch: ClaimedInsightBatch): Promise<InsightBatchOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const prepared = await prepareInsightGeneration(deps, batch);
  if (prepared.kind !== "generate") return { callsResponded: 0, contacts: 0, status: prepared.kind };
  const ids = [...prepared.completions.keys()];
  const reservation = await deps.gate.reserve({
    actorId: batch.actorId,
    // 每次领取一个键（领取时刻 + 内容指纹）：CAS 已保证同一批只有一个执行器；失败后再次待更新会用新键重试。
    idempotencyKey: `insight:auto:${batch.actorId}:${prepared.fingerprint}:${batch.claimedAt}`.slice(0, 300),
    now,
    pool: "background",
    purpose: "insight",
    trigger: "auto",
  });
  if (reservation.ok !== true) {
    const denial = reservation as Extract<typeof reservation, { ok: false }>;
    const retryOn = denial.reason === "daily_limit" ? denial.retryOn ?? nextTokyoMidnight(now) : nextTokyoMidnight(now);
    await deps.repository.defer({ actorId: batch.actorId, contactIds: ids, notBefore: retryOn, now, owner: batch.owner });
    return { callsResponded: 0, contacts: ids.length, retryOn, status: denial.reason === "daily_limit" ? "deferred" : "unavailable" };
  }
  if (!reservation.owner) {
    // 同一批内容的操作已结束：不再执行、不结算，这些行按失败等下一次待更新。
    await deps.repository.fail({ actorId: batch.actorId, claimedAt: batch.claimedAt, code: "DUPLICATE_OPERATION", contactIds: ids, now, owner: batch.owner });
    return { callsResponded: 0, contacts: ids.length, status: "not_owner" };
  }
  const result = await executeInsightGeneration(deps, batch, prepared, reservation.operationId);
  return { callsResponded: result.callsResponded, contacts: ids.length, status: result.status };
}
