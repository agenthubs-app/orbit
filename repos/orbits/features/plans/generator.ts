/**
 * 计划生成器的接口与一次生成的编排（W0008，RW-08）。
 *
 * 两阶段（Q17A）：`skeleton(input)` 先出目标分析和阶段骨架；`phaseDetail(input, phase)`
 * 再逐阶段补细节。编排 `generatePlanDraft`：
 * - 阶段细节有界并行（默认 2 路），结果按阶段顺序拼装，与完成先后无关；
 * - 任一阶段失败 → 整份失败（`PlanGenerationError`），调用方不保存任何内容；
 * - 产物是 `CreatePlanVersionInput` 形状的草稿（阶段 + 四类条目 + `analysis`），
 *   保存前还要经过 `validate.ts` 的结构与引用校验。
 *
 * 现在只有 mock 实现（D3：不调用付费 AI）；接真实 AI 时实现同一个接口，
 * 在 `generator-service-factory.ts` 注册即可，路由与界面都不用改。
 *
 * `analysis`（`PlanAnalysisV1`）存的是回答卡片「结论在前」的那几块：一句话回答、
 * 3 个关键数字、这周 3 件事、现有人脉、还缺的人、最大风险、30 秒自我介绍、每阶段的跟进方式。
 * 里面引用的联系人／活动一律是 id + 生成时的显示名快照，同样经过引用校验。
 */
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../shared/contract/industries";
import type { CreatePlanVersionInput, NewPlanItemInput, PlanHorizon, PlanPhase } from "./contract";

export type PlanLocale = "en" | "zh";

/** 生成器读到的一位联系人（已按 actor 过滤、已确认）。 */
export interface PlanInputContact {
  id: string;
  /** 归属的 actor；输入裁剪会再过滤一次，别人的联系人永远进不了生成器。 */
  ownerId: string;
  displayName: string;
  organization: string | null;
  role: string | null;
  primaryIndustryId: IndustryIdCode | null;
  secondaryIndustryId: SecondaryIndustryIdCode | null;
  /** 最近一次互动（联系人详情里记录的最后互动），没有为 null。 */
  lastInteractionAt: string | null;
  /** 交换名片／建联系人的时间，也算一次互动。 */
  createdAt: string;
}

/** 真实活动目录里的一场活动（canonical event id，已发布、还没开始）。 */
export interface PlanInputEvent {
  id: string;
  title: string;
  startsAt: string;
  venue: string | null;
}

export interface PlanGeneratorInput {
  actorId: string;
  locale: PlanLocale;
  goal: { text: string; horizon: PlanHorizon; snapshot: string };
  supplement: string | null;
  question: string;
  /** YYYY-MM-DD（东京），第 1 周的起点。 */
  startsOn: string;
  /** 裁剪后的联系人（见 `input-selector.ts`）。 */
  contacts: readonly PlanInputContact[];
  /** 裁剪前本人已确认联系人的总数。 */
  contactsTotal: number;
  events: readonly PlanInputEvent[];
}

export interface PlanAnswerSegment {
  text: string;
  /** 关键的人／活动／数字，卡片里用靛蓝色强调。 */
  emphasis?: boolean;
}

export interface PlanFigure {
  value: string;
  unit: string;
  label: string;
}

export interface PlanAnalysisThisWeek {
  title: string;
  why: string;
  contactIds: string[];
  eventIds: string[];
}

export interface PlanAnalysisAlly {
  contactId: string;
  name: string;
  subtitle: string | null;
  help: string;
}

export interface PlanAnalysisPhase {
  key: string;
  /** 这一阶段要认识的人（人脉需求标题）。 */
  who: string[];
  /** 是否细到周（一年期只有第一段是 true）。 */
  detailed: boolean;
  followups: string[];
}

export interface PlanAnalysisV1 {
  kind: "plan_bootstrap";
  version: 1;
  generator: string;
  locale: PlanLocale;
  request: { question: string; supplement: string | null; idempotencyKey: string | null };
  read: { contacts: number; contactsTotal: number; events: number };
  answer: PlanAnswerSegment[];
  figures: PlanFigure[];
  risk: string;
  pitch: { setting: string; text: string };
  thisWeek: PlanAnalysisThisWeek[];
  allies: PlanAnalysisAlly[];
  gaps: string[];
  phases: PlanAnalysisPhase[];
}

/** 骨架里的一个阶段：保存用的阶段字段 + 生成细节需要的提示。 */
export interface PlanSkeletonPhase extends PlanPhase {
  summary: string;
  detailed: boolean;
}

export interface PlanSkeleton {
  horizon: PlanHorizon;
  phases: PlanSkeletonPhase[];
  analysis: Omit<PlanAnalysisV1, "phases" | "request">;
}

export interface PlanPhaseDetail {
  phaseKey: string;
  items: NewPlanItemInput[];
  who: string[];
  followups: string[];
}

export interface PlanGenerator {
  /** 写进 `analysis.generator`，便于之后区分 mock 与真实 AI 生成的计划。 */
  readonly id: string;
  skeleton(input: PlanGeneratorInput): Promise<PlanSkeleton>;
  phaseDetail(input: PlanGeneratorInput, phase: PlanSkeletonPhase): Promise<PlanPhaseDetail>;
}

export type PlanDraft = Omit<CreatePlanVersionInput, "analysis"> & { analysis: PlanAnalysisV1 };

/** 生成失败（任一阶段）：不保存半份，界面提示重试。 */
export class PlanGenerationError extends Error {
  readonly phaseKey: string | null;

  constructor(message: string, phaseKey: string | null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PlanGenerationError";
    this.phaseKey = phaseKey;
  }
}

/** 东京日历日 YYYY-MM-DD（计划的第 1 周从生成当天算起）。 */
export function tokyoDate(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 默认同时生成的阶段数。mock 下无所谓；真实 AI 时限制并发请求。 */
export const PLAN_PHASE_CONCURRENCY = 2;

/**
 * 有界并行：最多 `limit` 个任务同时进行，结果按输入顺序返回。
 * 全部结束后再判定：有失败时抛出**顺序最靠前**的那个失败，保证同样的输入报同样的错。
 */
export async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await run(items[index]!, index) };
      } catch (reason) {
        results[index] = { reason, status: "rejected" };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  const failed = results.find((result) => result.status === "rejected");
  if (failed && failed.status === "rejected") throw failed.reason;
  return results.map((result) => (result as PromiseFulfilledResult<R>).value);
}

export async function generatePlanDraft(
  generator: PlanGenerator,
  input: PlanGeneratorInput,
  options: { concurrency?: number; idempotencyKey?: string | null } = {},
): Promise<PlanDraft> {
  let skeleton: PlanSkeleton;
  try {
    skeleton = await generator.skeleton(input);
  } catch (error) {
    throw new PlanGenerationError("The plan skeleton could not be generated.", null, { cause: error });
  }

  const details = await mapBounded(skeleton.phases, options.concurrency ?? PLAN_PHASE_CONCURRENCY, async (phase) => {
    try {
      const detail = await generator.phaseDetail(input, phase);
      if (detail.phaseKey !== phase.key) throw new Error(`Detail for ${detail.phaseKey} returned for phase ${phase.key}.`);
      return detail;
    } catch (error) {
      throw error instanceof PlanGenerationError
        ? error
        : new PlanGenerationError(`Phase ${phase.key} could not be generated.`, phase.key, { cause: error });
    }
  });

  return {
    analysis: {
      ...skeleton.analysis,
      generator: generator.id,
      phases: skeleton.phases.map((phase, index) => ({
        detailed: phase.detailed,
        followups: details[index]!.followups,
        key: phase.key,
        who: details[index]!.who,
      })),
      request: {
        idempotencyKey: options.idempotencyKey ?? null,
        question: input.question,
        supplement: input.supplement,
      },
    },
    goalSnapshot: input.goal.snapshot,
    horizon: skeleton.horizon,
    items: details.flatMap((detail) => detail.items),
    phases: skeleton.phases.map(({ detailed: _detailed, ...phase }) => phase),
    startsOn: input.startsOn,
  };
}
