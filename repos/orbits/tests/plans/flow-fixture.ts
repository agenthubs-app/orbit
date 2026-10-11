/**
 * R23 测试夹具：内存仓储 + mock AI（可计数、可注入失败 / 上限）+ 演示世界的上下文。
 */
import { createMockPlanFlowAi } from "../../features/plans/v2/ai/mock";
import type { PlanAiOutcome, PlanFlowAi } from "../../features/plans/v2/ai/types";
import { createMockPlanFlowContext, type PlanFlowContextSource } from "../../features/plans/v2/flow-context";
import { createPlanFlowService, type PlanFlowRequestContext } from "../../features/plans/v2/flow-service";
import { createMemoryPlanV2Repository } from "../../features/plans/v2/repository";
import type { PlanReviewBudgetReader } from "../../features/plans/v2/service";
import { SCOPE, serviceFor, steppingClock } from "./v2-fixture";

export type AiStep = Exclude<keyof PlanFlowAi, "id">;
export const JA: PlanFlowRequestContext = { language: "ja", platform: "web" };

export interface CountingAi extends PlanFlowAi {
  calls: Record<AiStep, number>;
  keys: string[];
  /** 下一次调用这一步时返回的结果（用一次就清掉）。 */
  next: Partial<Record<AiStep, PlanAiOutcome<never>>>;
}

export function countingAi(base: PlanFlowAi = createMockPlanFlowAi()): CountingAi {
  const calls = { background: 0, firstDraft: 0, fix: 0, goalKind: 0, ladder: 0, members: 0, nextGoals: 0, questions: 0, reviewFix: 0, reviewMarks: 0 } as Record<AiStep, number>;
  const keys: string[] = [];
  const next: CountingAi["next"] = {};
  const wrap = <K extends AiStep>(step: K) => (async (input: never, context: { ledgerKey: string }) => {
    calls[step] += 1;
    keys.push(context.ledgerKey);
    const forced = next[step];
    if (forced) {
      delete next[step];
      return forced;
    }
    return (base[step] as (input: never, context: never) => Promise<unknown>)(input, context as never);
  }) as PlanFlowAi[K];
  return {
    background: wrap("background"),
    calls,
    firstDraft: wrap("firstDraft"),
    fix: wrap("fix"),
    goalKind: wrap("goalKind"),
    id: "mock",
    keys,
    ladder: wrap("ladder"),
    members: wrap("members"),
    next,
    nextGoals: wrap("nextGoals"),
    questions: wrap("questions"),
    reviewFix: wrap("reviewFix"),
    reviewMarks: wrap("reviewMarks"),
  };
}

export function flowWorld(options: { context?: PlanFlowContextSource; ai?: CountingAi; now?: () => Date; reviewBudget?: PlanReviewBudgetReader } = {}) {
  const repository = createMemoryPlanV2Repository();
  const now = options.now ?? steppingClock();
  const planService = serviceFor(repository, SCOPE, now);
  const ai = options.ai ?? countingAi();
  let n = 0;
  const flow = createPlanFlowService({ ai, context: options.context ?? createMockPlanFlowContext(), newId: () => `f${(n += 1)}`, now, planService, repository, reviewBudget: options.reviewBudget, scope: SCOPE });
  return { ai, flow, planService, repository };
}

let keyCounter = 0;
export const key = (label = "k") => `${label}-${(keyCounter += 1)}`;

/** 走到「背景三块都确认」。 */
export async function confirmedBackground(world: ReturnType<typeof flowWorld>, goalText = "シリーズA の資金調達をしたい") {
  let intake = await world.flow.createIntake({ goalKind: "fundraising", goalText, idempotencyKey: key("create"), source: "task" }, JA);
  const me = intake.background.me.value;
  intake = await world.flow.confirmBlock(intake.intakeId, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: key("me"), me: { stance: me.stance ?? "owner", wants: me.wants } }, JA);
  const team = intake.background.team.value;
  intake = await world.flow.confirmBlock(intake.intakeId, {
    block: "team",
    expectedUpdatedAt: intake.updatedAt,
    idempotencyKey: key("team"),
    team: { members: team.members.map((member) => ({ capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [], relation: member.relation })), mode: team.mode },
  }, JA);
  intake = await world.flow.confirmBlock(intake.intakeId, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: key("purpose"), purpose: { selectedLevel: intake.background.purpose.value.selectedLevel ?? 2 } }, JA);
  return intake;
}

/** 走到「确定的前提」。 */
export async function premiseReady(world: ReturnType<typeof flowWorld>) {
  const background = await confirmedBackground(world);
  const asked = await world.flow.chooseQuestions(background.intakeId, key("questions"), JA);
  const first = asked.questions![0]!;
  return world.flow.submitAnswers(asked.intakeId, { answers: [{ questionId: first.id, text: "β 運用中", values: [] }], idempotencyKey: key("answers") }, JA);
}
