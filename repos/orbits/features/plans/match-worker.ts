/**
 * 人脉需求匹配任务的执行者（RW-11，Sprint W0010）。
 *
 * 触发有两条路，执行逻辑是同一个 `runClaimedMatchJob`：
 * 1. 审阅页在批次确认完成后调用 `POST /api/agent/plans/candidates/run`：按 (actor, batch)
 *    领取这一批的任务并在请求内执行（`runMatchJobForBatch`）；界面最多等 8 秒，晚到的结果
 *    由今日要事与计划页角标读取。单张补录的当天任务还没到期时，只为这一批的联系人跑规则层
 *    （不领取任务、不调 AI），当天结束后由维护任务统一跑一次 AI。
 * 2. 每日 `/api/internal/maintenance` 的 `plan-match` 任务（`runDueMatchJobs`）：有上限地领取
 *    到期的 pending 任务（含租约过期的 running），兜底用户关掉页面、请求中途消失的情况。
 *
 * 一个任务的执行：读本人所有生效的人脉需求 + 任务里的联系人 → 规则层落候选 →
 * AI 层（每个任务最多一次：先把 ai_state 从 none 置为 started 并提交，再发请求；
 * 失败／超时只记 failed，保留规则结果；重试时 ai_state 已不是 none，绝不再调用）→ 完成。
 * 读库或写库出错才让任务回到 pending（满 3 次记 failed）。
 */
import type { PlanAiMatcher, PlanAiMatchUsage } from "./ai-matcher";
import { PlanAiMatcherError } from "./ai-matcher";
import { acceptedAiPairs, scoreRuleMatches } from "./matching";
import type { PlanMatchJob, PlanMatchRepository } from "./matching-repository";

export interface PlanMatchWorkerDeps {
  repository: PlanMatchRepository;
  /** null = 未配置模型：AI 层记为 skipped。 */
  aiMatcher: PlanAiMatcher | null;
  /** AI 请求的上限（毫秒）；请求内执行时可以更短。 */
  aiTimeoutMs?: number;
  log?: (line: string) => void;
}

export interface PlanMatchJobOutcome {
  jobId: string;
  status: "completed" | "retry" | "lost_lease";
  ruleHits: number;
  aiHits: number;
  aiState: "succeeded" | "failed" | "skipped" | "already_attempted";
  usage: PlanAiMatchUsage | null;
}

function usageRecord(usage: PlanAiMatchUsage | null): Record<string, unknown> | null {
  return usage ? { inputTokens: usage.inputTokens, latencyMs: usage.latencyMs, outputTokens: usage.outputTokens } : null;
}

export async function runClaimedMatchJob(deps: PlanMatchWorkerDeps, job: PlanMatchJob): Promise<PlanMatchJobOutcome> {
  const { repository } = deps;
  const leaseToken = job.leaseToken;
  if (!leaseToken) throw new Error("A match job must be claimed before it runs.");
  let ruleHits = 0;
  let aiHits = 0;
  let aiState: PlanMatchJobOutcome["aiState"] = "already_attempted";
  let usage: PlanAiMatchUsage | null = null;
  try {
    const [needs, contacts] = await Promise.all([
      repository.readActiveNeeds(job.actorId),
      repository.readContacts(job.actorId, job.contactIds),
    ]);
    const rulePairs = scoreRuleMatches(contacts, needs);
    ruleHits = await repository.insertCandidates({ actorId: job.actorId, jobId: job.id, pairs: rulePairs });

    if (job.aiState === "none") {
      if (!deps.aiMatcher || contacts.length === 0 || needs.length === 0) {
        await repository.finishAi({ jobId: job.id, leaseToken, model: null, state: "skipped", usage: null });
        aiState = "skipped";
      } else if (await repository.markAiStarted({ jobId: job.id, leaseToken })) {
        // ai_state 已提交为 started：从这一刻起，这个任务不会再发起第二次计费调用。
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), deps.aiTimeoutMs ?? 30_000);
        let result: Awaited<ReturnType<PlanAiMatcher["match"]>> | null = null;
        let failure: unknown = null;
        try {
          result = await deps.aiMatcher.match({ contacts, needs, signal: controller.signal });
        } catch (error) {
          failure = error;
        } finally {
          clearTimeout(timer);
        }
        // 下面的写库失败会让任务重试（外层 catch）；ai_state 仍是 started，重试时不会再调用。
        if (result) {
          usage = result.usage;
          const aiPairs = acceptedAiPairs({ contacts, existing: rulePairs, needs, proposals: result.proposals });
          aiHits = await repository.insertCandidates({ actorId: job.actorId, jobId: job.id, pairs: aiPairs });
          await repository.finishAi({ jobId: job.id, leaseToken, model: result.model, state: "succeeded", usage: usageRecord(usage) });
          aiState = "succeeded";
        } else {
          usage = failure instanceof PlanAiMatcherError ? failure.usage : null;
          await repository.finishAi({ jobId: job.id, leaseToken, model: deps.aiMatcher.model, state: "failed", usage: usageRecord(usage) });
          aiState = "failed";
          deps.log?.(`plan-match job ${job.id}: AI layer failed (${failure instanceof PlanAiMatcherError ? failure.code : "error"}); rule results kept`);
        }
      }
    }

    const completed = await repository.completeJob({ aiHits, jobId: job.id, leaseToken, ruleHits });
    return { aiHits, aiState, jobId: job.id, ruleHits, status: completed ? "completed" : "lost_lease", usage };
  } catch (error) {
    await repository
      .failJob({ error: error instanceof Error ? error.message : "match job failed", jobId: job.id, leaseToken })
      .catch(() => undefined);
    return { aiHits, aiState, jobId: job.id, ruleHits, status: "retry", usage };
  }
}

/** 单张补录的当天任务还没到期：只为**这一批**的联系人跑规则层，不领取任务、不调 AI。 */
async function previewRuleLayer(deps: PlanMatchWorkerDeps, job: PlanMatchJob, batchId: string): Promise<number> {
  const batchContacts = await deps.repository.contactIdsForBatch({ actorId: job.actorId, batchId });
  const [needs, contacts] = await Promise.all([
    deps.repository.readActiveNeeds(job.actorId),
    deps.repository.readContacts(job.actorId, batchContacts),
  ]);
  return deps.repository.insertCandidates({ actorId: job.actorId, jobId: job.id, pairs: scoreRuleMatches(contacts, needs) });
}

export type PlanMatchBatchRun =
  | { state: "missing" }
  | { state: "ran"; outcome: PlanMatchJobOutcome }
  | { state: "rule_preview"; ruleHits: number }
  | { state: "completed" | "running" | "failed" };

/** 审阅页触发：只找本人这一批的任务（他人的批次一律 missing）。 */
export async function runMatchJobForBatch(
  deps: PlanMatchWorkerDeps,
  input: { actorId: string; batchId: string },
): Promise<PlanMatchBatchRun> {
  const claim = await deps.repository.claimJobForBatch(input);
  if (claim.state === "missing") return { state: "missing" };
  if (claim.state === "claimed") return { outcome: await runClaimedMatchJob(deps, claim.job), state: "ran" };
  if (claim.state === "not_due") return { ruleHits: await previewRuleLayer(deps, claim.job, input.batchId), state: "rule_preview" };
  return { state: claim.state };
}

/** 维护任务：有上限地执行到期任务，到截止时间就停止领取新的。 */
export async function runDueMatchJobs(
  deps: PlanMatchWorkerDeps,
  input: { limit: number; deadline: number; now?: () => number },
): Promise<{ examined: number; completed: number; retried: number; aiCalls: number }> {
  const now = input.now ?? Date.now;
  const summary = { aiCalls: 0, completed: 0, examined: 0, retried: 0 };
  let remaining = Math.max(0, input.limit);
  while (remaining > 0 && now() < input.deadline) {
    const jobs = await deps.repository.claimDueJobs({ limit: Math.min(remaining, 5) });
    if (jobs.length === 0) break;
    for (const job of jobs) {
      remaining -= 1;
      summary.examined += 1;
      const outcome = await runClaimedMatchJob(deps, job);
      if (outcome.status === "completed") summary.completed += 1;
      else summary.retried += 1;
      if (outcome.aiState === "succeeded" || outcome.aiState === "failed") summary.aiCalls += 1;
    }
  }
  return summary;
}
