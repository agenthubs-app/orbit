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
import { PLAN_LIMITS, type CreatePlanVersionInput, type NewPlanItemInput, type PlanHorizon, type PlanPhase } from "./contract";

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
  /** W0048b：AI 生成时同一操作产出或复用的人脉分析快照（`network_analysis_snapshots.id`）；mock 计划没有。 */
  snapshotId?: string;
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

/**
 * W0048b：按操作计次的生成器（`ai` provider）。一次计划生成 = 用户主动池 1 次操作：
 * `openSession` 先向账本预留（并按 W0048a 判定产出或复用快照），返回本次操作专用的生成器（每次 HTTP 前登记子账）；
 * 调用方（`runPlanGeneration`）是该操作的唯一结算者：保存成功 `finish("succeeded")`，其余任一失败 `finish("failed")`
 * （账本据「是否拿到过响应」记 failed 或 released）。
 */
export interface PlanGenerationSessionContext {
  actorId: string;
  /** 账本幂等键（计划的 creationKey；`ai_regenerate` 另带一次点击的键）。 */
  ledgerKey: string;
  locale: PlanLocale;
  now: Date;
  /** 预先分配的新计划 id：快照 `origin = plan` 时记在快照上，保存时用同一个 id。 */
  planId: string;
}

export interface PlanGenerationSession {
  generator: PlanGenerator;
  /** 生成时只细化前几个阶段（D46②：AI 为 2）；null = 全部。 */
  detailPhases: number | null;
  planId: string;
  /** 保存前由服务端补的字段（规则数字、快照 id）。 */
  finalize(draft: PlanDraft, input: PlanGeneratorInput): PlanDraft;
  /** 只生效一次（重复调用为 no-op）。 */
  finish(outcome: "succeeded" | "failed"): Promise<void>;
}

export interface MeteredPlanGenerator extends PlanGenerator {
  readonly metered: true;
  openSession(context: PlanGenerationSessionContext): Promise<PlanGenerationSession>;
}

export function isMeteredPlanGenerator(generator: PlanGenerator): generator is MeteredPlanGenerator {
  return (generator as Partial<MeteredPlanGenerator>).metered === true && typeof (generator as Partial<MeteredPlanGenerator>).openSession === "function";
}

/** 用户主动池（每人每东京日 10 次操作）用满：0 次调用，路由返回 429 `USER_DAILY_LIMIT`。 */
export class PlanGenerationLimitError extends Error {
  readonly retryOn: string | null;

  constructor(retryOn: string | null) {
    super("You have used today's AI plan generations. Try again tomorrow.");
    this.name = "PlanGenerationLimitError";
    this.retryOn = retryOn;
  }
}

/** 账本不可用（表未迁移等）：0 次调用，fail closed（路由 503）。 */
export class PlanGenerationUnavailableError extends Error {
  constructor(message = "AI plan generation is temporarily unavailable.") {
    super(message);
    this.name = "PlanGenerationUnavailableError";
  }
}

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
  options: { concurrency?: number; idempotencyKey?: string | null; detailPhases?: number | null } = {},
): Promise<PlanDraft> {
  let skeleton: PlanSkeleton;
  try {
    skeleton = await generator.skeleton(input);
  } catch (error) {
    throw error instanceof PlanGenerationError
      ? error
      : new PlanGenerationError("The plan skeleton could not be generated.", null, { cause: error });
  }
  // W0048b R-4：骨架解析后、任何阶段请求之前核对阶段数上限，超出整份失败（不发阶段请求）。
  if (skeleton.phases.length === 0 || skeleton.phases.length > PLAN_LIMITS.phasesPerPlan) {
    throw new PlanGenerationError(`A plan cannot have ${skeleton.phases.length} phases.`, null);
  }

  // D46②：只细化前 `detailPhases` 个阶段；其余以骨架形态保存（标题与摘要，无条目），到期前由维护任务补细。
  const detailCount = options.detailPhases == null ? skeleton.phases.length : Math.max(0, Math.min(options.detailPhases, skeleton.phases.length));
  const detailed = await mapBounded(skeleton.phases.slice(0, detailCount), options.concurrency ?? PLAN_PHASE_CONCURRENCY, async (phase) => {
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

  const details: PlanPhaseDetail[] = skeleton.phases.map(
    (phase, index) => detailed[index] ?? { followups: [], items: [], phaseKey: phase.key, who: [] },
  );

  return {
    analysis: {
      ...skeleton.analysis,
      generator: generator.id,
      phases: skeleton.phases.map((phase, index) => ({
        detailed: index < detailCount ? phase.detailed : false,
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

/**
 * W0048b：bootstrap／重新分析／下一份／AI 重新生成共用的「生成 → 校验 → 保存」流水线。
 * - mock：与改前相同（不预留、不结算）；
 * - 按操作计次的生成器：先 `openSession`（预留 1 次操作；额度不够 → `PlanGenerationLimitError`，0 次调用），
 *   生成只细化前 `detailPhases` 段，`finalize` 补规则数字与快照 id，保存成功后结算 succeeded；
 *   生成、校验、保存任一失败结算 failed（账本按是否拿到过响应记 failed／released）。本函数是唯一结算者。
 */
export async function runPlanGeneration<R>(args: {
  generator: PlanGenerator;
  input: PlanGeneratorInput;
  idempotencyKey: string;
  ledgerKey: string;
  now: Date;
  /** 生成失败（骨架或阶段）时包装成调用方的错误。 */
  wrapGenerationError: (error: unknown) => Error;
  validate: (draft: PlanDraft) => Promise<void>;
  save: (draft: PlanDraft, planId: string | undefined) => Promise<R>;
}): Promise<R> {
  if (!isMeteredPlanGenerator(args.generator)) {
    let draft: PlanDraft;
    try {
      draft = await generatePlanDraft(args.generator, args.input, { idempotencyKey: args.idempotencyKey });
    } catch (error) {
      throw args.wrapGenerationError(error);
    }
    await args.validate(draft);
    return args.save(draft, undefined);
  }
  let session: PlanGenerationSession;
  try {
    session = await args.generator.openSession({
      actorId: args.input.actorId,
      ledgerKey: args.ledgerKey,
      locale: args.input.locale,
      now: args.now,
      // 不 import node:crypto：本模块经 reanalysis.ts 进入客户端包（只在服务端执行到这里）。
      planId: globalThis.crypto.randomUUID(),
    });
  } catch (error) {
    if (error instanceof PlanGenerationLimitError || error instanceof PlanGenerationUnavailableError) throw error;
    throw args.wrapGenerationError(error);
  }
  try {
    let draft: PlanDraft;
    try {
      draft = await generatePlanDraft(session.generator, args.input, {
        detailPhases: session.detailPhases,
        idempotencyKey: args.idempotencyKey,
      });
    } catch (error) {
      throw args.wrapGenerationError(error);
    }
    draft = session.finalize(draft, args.input);
    await args.validate(draft);
    const result = await args.save(draft, session.planId);
    await session.finish("succeeded");
    return result;
  } catch (error) {
    await session.finish("failed").catch(() => undefined);
    throw error;
  }
}
