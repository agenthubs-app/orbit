/**
 * 引导页 `/app/start` 的步骤规则（W0006，RW-04）。纯函数、零依赖，服务端（`progress.ts`）
 * 与客户端（`start-guide.tsx`）共用同一套判定，不会各算各的。
 *
 * 三步（W0035 删去原来排在最后的「活动」一步，RH-01）：1 名片 → 2 目标 → 3 计划。
 *   - 第 1 步完成：已确认联系人 ≥ 3，或 D2 老用户；W0054（RN-12）起不能再跳过，引导记录里存量的
 *     `step1Skipped = true`（W0006 时点过「先这样，继续」）只读兼容、照算完成（W54-1）；
 *   - 第 2 步完成：资料里有目标（relationshipGoal 非空），或 D2 老用户；
 *   - 第 3 步完成：有生效中的计划。
 * 严格按顺序解锁。引导记录里 W0035 之前写下的 `currentStep = 4` 不再是合法步骤：读取时按
 * 「没有记录」处理（`isGuideStartStep`），写入时拒绝。
 */

export type GuideStartStep = 1 | 2 | 3;
export const GUIDE_START_STEPS: readonly GuideStartStep[] = [1, 2, 3];

/** 第 1 步需要的已确认联系人数（与 `progress.ts` 的 `GUIDE_REQUIRED_CONTACTS` 同值）。 */
export const START_REQUIRED_CONTACTS = 3;

export function isGuideStartStep(value: unknown): value is GuideStartStep {
  return value === 1 || value === 2 || value === 3;
}

export interface StartGuideFlags {
  contacts: boolean;
  goal: boolean;
  plan: boolean;
}

export interface StartGuideFlagInput {
  confirmedContacts: number;
  grandfathered: boolean;
  hasActivePlan: boolean;
  relationshipGoal: string | null | undefined;
  step1Skipped: boolean;
}

/** 第 1 步：≥3 位已确认联系人、D2 老用户，或存量跳过（W54-1，只读兼容；新的跳过已关闭）。 */
export function contactsStepDone(input: {
  confirmedContacts: number;
  grandfathered?: boolean;
  step1Skipped?: boolean;
}): boolean {
  return (
    input.grandfathered === true ||
    input.step1Skipped === true ||
    Math.max(0, Math.floor(input.confirmedContacts)) >= START_REQUIRED_CONTACTS
  );
}

/** 第 2 步：有目标，或 D2 老用户。 */
export function goalStepDone(input: { grandfathered?: boolean; relationshipGoal: string | null | undefined }): boolean {
  return input.grandfathered === true || Boolean(input.relationshipGoal?.trim());
}

export function deriveStartGuideFlags(input: StartGuideFlagInput): StartGuideFlags {
  return {
    contacts: contactsStepDone(input),
    goal: goalStepDone(input),
    plan: input.hasActivePlan,
  };
}

const KEY_BY_STEP = { 1: "contacts", 2: "goal", 3: "plan" } as const;

export function startStepDone(flags: StartGuideFlags, step: GuideStartStep): boolean {
  return flags[KEY_BY_STEP[step]];
}

/** 第一个没完成的步骤；都完成为 null。 */
export function firstIncompleteStartStep(flags: StartGuideFlags): GuideStartStep | null {
  if (!flags.contacts) return 1;
  if (!flags.goal) return 2;
  if (!flags.plan) return 3;
  return null;
}

export function firstThreeStepsDone(flags: StartGuideFlags): boolean {
  return firstIncompleteStartStep(flags) === null;
}

/** 步骤状态：done 已完成；current 正在做的那一步；locked 前一步没完成。 */
export type StartStepStatus = "current" | "done" | "locked";

export function startStepStatus(flags: StartGuideFlags, step: GuideStartStep): StartStepStatus {
  if (startStepDone(flags, step)) return "done";
  return firstIncompleteStartStep(flags) === step ? "current" : "locked";
}

/** 能不能切到这一步：锁定的不行，其余（已完成、进行中）都可以。 */
export function canOpenStartStep(flags: StartGuideFlags, step: GuideStartStep): boolean {
  return startStepStatus(flags, step) !== "locked";
}

/** 页面主体：某一步的模块，或 3 步都完成后的「完成」卡片。 */
export type StartView = GuideStartStep | "finish";

/**
 * 进页面时显示哪一步：引导记录里的 `currentStep` 能打开就用它（刷新、换设备停在同一步）；
 * 记录为空或指向锁定的步骤时，没做完就停在第一个没完成的，都完成了就显示完成卡片。
 */
export function resolveStartView(flags: StartGuideFlags, recorded: GuideStartStep | null): StartView {
  if (recorded !== null && canOpenStartStep(flags, recorded)) return recorded;
  return firstIncompleteStartStep(flags) ?? "finish";
}

/**
 * `/app/start?step=N`（W0022）：只认单个、恰好是 `1`–`3` 的字符串；非法值（`4`、`abc`、`9`、`03`）、
 * 重复参数（数组）和缺省一律视为没有请求。
 */
export function parseStartStepParam(value: unknown): GuideStartStep | null {
  if (typeof value !== "string" || !/^[1-3]$/.test(value)) return null;
  return Number(value) as GuideStartStep;
}

/**
 * 带 `?step` 进页面时显示哪一步（W0022）：请求的步骤能打开（未锁定）就用它；锁定或没有请求时
 * 完全按 `resolveStartView` 的原逻辑，不绕过 3 步的硬顺序。只决定显示，不写引导记录。
 */
export function resolveRequestedStartView(
  flags: StartGuideFlags,
  recorded: GuideStartStep | null,
  requested: GuideStartStep | null,
): StartView {
  if (requested !== null && canOpenStartStep(flags, requested)) return requested;
  return resolveStartView(flags, recorded);
}

/**
 * W0054（W54-5）：进页面时显示哪一步，带完成闩锁。引导记录有 `completedAt` 的人永远算完成：
 * 默认显示完成卡片（即使联系人后来删到不足 3 位）；只有显式请求或记录里能打开的步骤才打开它。
 * 没有 `completedAt` 时与 `resolveRequestedStartView` 完全一致。
 */
export function resolveStartEntryView(
  flags: StartGuideFlags,
  recorded: GuideStartStep | null,
  requested: GuideStartStep | null,
  completedAt: string | null,
): StartView {
  if (!completedAt) return resolveRequestedStartView(flags, recorded, requested);
  if (requested !== null && canOpenStartStep(flags, requested)) return requested;
  if (recorded !== null && canOpenStartStep(flags, recorded)) return recorded;
  return "finish";
}

/** 当前这一步刚完成后去哪：下一个没完成的步骤；3 步都完成则是完成卡片。 */
export function viewAfterStepDone(flags: StartGuideFlags): StartView {
  return firstIncompleteStartStep(flags) ?? "finish";
}

/** 服务端读到的已确认联系人示例（第 1 步的名片槽位）。 */
export interface StartContactSample {
  displayName: string;
  organization: string | null;
  role: string | null;
}

/** `/app/start` 服务端下传给客户端的引导快照（可序列化）。 */
export interface StartGuideSnapshot {
  completedAt: string | null;
  confirmedContacts: number;
  contactSamples: readonly StartContactSample[];
  currentStep: GuideStartStep | null;
  grandfathered: boolean;
  hasActivePlan: boolean;
  step1Skipped: boolean;
}
