/**
 * 引导进度与「是否进入示例」判定（W0004；W0005／W0006／W0014 复用）。
 *
 * 进度从真实数据推导，另加引导记录里的少量标记（规则在 `start-steps.ts`，客户端共用）：
 *   第 1 步 名片：本人已确认联系人 ≥ 3；W0054 起不能再跳过，存量 `step1Skipped = true`（W0006 时点过
 *     「先这样，继续」）只读兼容、照算完成（W54-1）
 *   第 2 步 目标：profile 的 relationshipGoal 非空
 *   第 3 步 计划：有生效中的计划（`features/plans` 的 `getCurrent()`）
 * （W0006 的「活动」一步已在 W0035 删除，引导只有这 3 步。）
 *
 * 进入示例 = 开关打开（D1）且第 1–3 步未全部完成且不是 D2 老用户。W0054（W54-5）：引导记录有
 * `completedAt` 即永远不在示例（闩锁），首页路径第一次推导出完成时补写它。
 *
 * D2 老用户：账号创建早于 `ORBIT_GUIDE_DEMO_SINCE` 且**首次判定**时已确认联系人 ≥ 3。
 * 读不到账号创建时间（或没配 SINCE）时按「已确认联系人 ≥ 3 即老用户」判定。首次判定的
 * 结果（true / false）写进引导记录 `grandfathered`，之后不再重算——上线后新注册、再扫满
 * 3 张的人不会变成老用户。
 *
 * 读取器按 actor 过滤；任何一个来源读不到都 fail closed：返回 null，页面按开关关闭的样子
 * 渲染真实首页（宁可少给人看示例，也不把老用户误关进示例）。开关关闭时不做任何读取。
 */
import { readGuideDemoConfig, type GuideDemoConfig } from "../../shared/config/guide-demo";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createConfiguredStorageAccountSessionProvider } from "../account/storage/account-live-record-provider";
import { resolvePlanService } from "../plans/service-factory";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import type { GuideState, GuideStateService } from "./guide-state";
import { resolveGuideStateService } from "./service-factory";
import {
  contactsStepDone,
  deriveStartGuideFlags,
  firstThreeStepsDone,
  goalStepDone,
  START_REQUIRED_CONTACTS,
  type StartContactSample,
  type StartGuideSnapshot,
} from "./start-steps";

/** 第 1 步需要的已确认联系人数。 */
export const GUIDE_REQUIRED_CONTACTS = START_REQUIRED_CONTACTS;

export type GuideStepKey = "contacts" | "goal" | "plan";
export const GUIDE_STEP_ORDER: readonly GuideStepKey[] = ["contacts", "goal", "plan"];

export interface GuideProgress {
  /** 第 1–3 步里已完成几步（0–3）。 */
  completed: number;
  confirmedContacts: number;
  /** 第一个未完成的步骤；全部完成为 null。 */
  nextStep: GuideStepKey | null;
  steps: Readonly<Record<GuideStepKey, boolean>>;
}

export interface GuideStatus {
  bannerCollapsed: boolean;
  grandfathered: boolean;
  inDemo: boolean;
  /** 老用户直接放行时不读进度，为 null。 */
  progress: GuideProgress | null;
}

/* ── 纯函数 ─────────────────────────────────────────────────────────── */

export function deriveGuideProgress(input: {
  confirmedContacts: number;
  /** D2 老用户：第 1、2 步视为完成（W0006）。 */
  grandfathered?: boolean;
  hasActivePlan: boolean;
  relationshipGoal: string | null | undefined;
  /** 存量：第 1 步点过「先这样，继续」（W0006）；W0054 起只读兼容（W54-1），不再有新的跳过。 */
  step1Skipped?: boolean;
}): GuideProgress {
  const confirmedContacts = Math.max(0, Math.floor(input.confirmedContacts));
  const steps = {
    contacts: contactsStepDone({ ...input, confirmedContacts }),
    goal: goalStepDone(input),
    plan: input.hasActivePlan,
  };
  return {
    completed: GUIDE_STEP_ORDER.filter((step) => steps[step]).length,
    confirmedContacts,
    nextStep: GUIDE_STEP_ORDER.find((step) => !steps[step]) ?? null,
    steps,
  };
}

/** D2 首次判定。只在引导记录里还没有 `grandfathered` 时调用。 */
export function decideGrandfathered(input: {
  accountCreatedAt: string | null | undefined;
  confirmedContacts: number;
  since: Date | null;
}): boolean {
  if (input.confirmedContacts < GUIDE_REQUIRED_CONTACTS) return false;
  const createdMs = input.accountCreatedAt ? Date.parse(input.accountCreatedAt) : Number.NaN;
  // 读不到创建时间或没配 SINCE：按「已确认联系人 ≥ 3 即老用户」。
  if (!Number.isFinite(createdMs) || !input.since) return true;
  return createdMs < input.since.getTime();
}

export function decideGuideDemo(input: {
  enabled: boolean;
  grandfathered: boolean;
  progress: GuideProgress | null;
}): boolean {
  return (
    input.enabled &&
    !input.grandfathered &&
    input.progress !== null &&
    input.progress.completed < GUIDE_STEP_ORDER.length
  );
}

/* ── 读取器 ─────────────────────────────────────────────────────────── */

/**
 * 本人已确认联系人计数：`orbit_records` 的 contacts，按 actor 过滤（与联系人列表同一套
 * 归属谓词：user_id 是本人，payload.accountId 为空或是本人），排除还在初始化
 * （`lifecycleInitialization = 'pending'`）与已删除的记录。只返回一个整数。
 */
export const CONFIRMED_CONTACT_COUNT_SQL = `select count(*)::integer as total
from orbit_records c
where c.workspace_id = $1
  and c.collection_name = 'contacts'
  and c.lifecycle_state <> 'deleted'
  and c.user_id = $2
  and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb or c.payload->'accountId' = to_jsonb($2::text))
  and jsonb_typeof(c.payload->'id') = 'string'
  and c.payload->>'lifecycleInitialization' is distinct from 'pending'`;

export type ConfirmedContactCounter = (actorId: string) => Promise<number>;

export function createPostgresConfirmedContactCounter(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): ConfirmedContactCounter {
  return async (actorId) => {
    const id = actorId.trim();
    if (!id) throw new Error("GUIDE_CONTACT_COUNT_ACTOR_REQUIRED");
    const result = await input.client.query<{ total: number | string }>(CONFIRMED_CONTACT_COUNT_SQL, [
      input.workspaceId,
      id,
    ]);
    const total = Number(result.rows[0]?.total);
    if (!Number.isFinite(total)) throw new Error("GUIDE_CONTACT_COUNT_INVALID");
    return total;
  };
}

/** W0054：人脉分析门槛与引导第 1 步共用这一条计数（同一谓词、同一常量）。 */
export function createConfiguredConfirmedContactCounter(): ConfirmedContactCounter {
  return configuredConfirmedContactCounter();
}

function configuredConfirmedContactCounter(): ConfirmedContactCounter {
  return async (actorId) => {
    const configured = createConfiguredPostgresLiveRecordStore();
    if (!configured) throw new Error("GUIDE_CONTACT_COUNT_UNCONFIGURED");
    resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "contacts" });
    return createPostgresConfirmedContactCounter({
      client: configured.client,
      workspaceId: configured.workspaceId,
    })(actorId);
  };
}

async function configuredHasActivePlan(actorId: string): Promise<boolean> {
  const resolution = resolvePlanService({ actorId });
  if (resolution.success === false) throw new Error(resolution.error.message);
  return (await resolution.service.getCurrent()) !== null;
}

/** 账号创建时间：从账号记录读（认证 actor 里没有这个字段）。读不到返回 null。 */
async function configuredAccountCreatedAt(input: { actorId: string; userId: string | null }): Promise<string | null> {
  if (!input.userId) return null;
  const provider = createConfiguredStorageAccountSessionProvider();
  if (!provider) return null;
  const graph = await provider.readAccountSessionGraph({ userId: input.userId });
  return graph.accounts.find((account) => account.id === input.actorId)?.createdAt ?? null;
}

export interface GuideStatusDependencies {
  config?: GuideDemoConfig;
  countConfirmedContacts?: ConfirmedContactCounter;
  guideState?: GuideStateService | null;
  hasActivePlan?: (actorId: string) => Promise<boolean>;
  readAccountCreatedAt?: (input: { actorId: string; userId: string | null }) => Promise<string | null>;
}

async function attempt<T>(read: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return { ok: false };
  }
}

/**
 * D2 首次判定并落库。首次判定必须先落库再生效：写不进去返回 null（调用方 fail closed，
 * 下次重新判定），免得「这次没写成、之后扫满 3 张」的新用户被误判成老用户。
 */
async function decideAndPersistGrandfathered(input: {
  actorId: string;
  config: GuideDemoConfig;
  confirmedContacts: number;
  dependencies: GuideStatusDependencies;
  service: GuideStateService;
  userId: string | null;
}): Promise<boolean | null> {
  // 联系人不足 3 位时结论必然是 false，不必再读账号记录。
  const createdAt =
    input.confirmedContacts >= GUIDE_REQUIRED_CONTACTS
      ? await attempt(() =>
          (input.dependencies.readAccountCreatedAt ?? configuredAccountCreatedAt)({
            actorId: input.actorId,
            userId: input.userId,
          }),
        )
      : { ok: true as const, value: null };
  const decided = decideGrandfathered({
    accountCreatedAt: createdAt.ok ? createdAt.value : null,
    confirmedContacts: input.confirmedContacts,
    since: input.config.since,
  });
  const persisted = await attempt(() => input.service.recordGrandfathered(decided));
  if (!persisted.ok || persisted.value.grandfathered === null) return null;
  return persisted.value.grandfathered;
}

/**
 * 服务端页面用：本人的引导状态。开关关闭返回 null（不做任何读取）；任一来源读不到也返回
 * null（fail closed，渲染真实首页）。
 */
export async function readGuideStatusForActor(
  input: {
    actorId: string;
    relationshipGoal: string | null | undefined;
    /** Auth.js 主体，用于读账号创建时间；读不到时按 D2 的退化规则判定。 */
    userId?: string | null;
  },
  dependencies: GuideStatusDependencies = {},
): Promise<GuideStatus | null> {
  const config = dependencies.config ?? readGuideDemoConfig();
  if (!config.enabled) return null;
  const actorId = input.actorId.trim();
  if (!actorId) return null;

  let guideState = dependencies.guideState;
  if (guideState === undefined) {
    const resolution = resolveGuideStateService({ actorId });
    guideState = resolution.success ? resolution.service : null;
  }
  if (!guideState) return null;
  const service = guideState;

  const state = await attempt(() => service.get());
  if (!state.ok) return null;
  if (state.value.grandfathered === true) {
    return { bannerCollapsed: state.value.bannerCollapsed, grandfathered: true, inDemo: false, progress: null };
  }
  // W0054（W54-5）：completedAt 是唯一闩锁——引导完成过一次就永远算完成，不再读联系人计数与计划，
  // 之后删联系人、计划到期、目标清空都不回示例（联系人不足 3 位由人脉分析门槛卡在功能处提示）。
  if (state.value.completedAt) {
    return { bannerCollapsed: state.value.bannerCollapsed, grandfathered: false, inDemo: false, progress: null };
  }

  const countContacts = dependencies.countConfirmedContacts ?? configuredConfirmedContactCounter();
  const contacts = await attempt(() => countContacts(actorId));
  if (!contacts.ok) return null;

  let grandfathered: boolean | null = state.value.grandfathered;
  if (grandfathered === null) {
    grandfathered = await decideAndPersistGrandfathered({
      actorId,
      config,
      confirmedContacts: contacts.value,
      dependencies,
      service,
      userId: input.userId ?? null,
    });
    if (grandfathered === null) return null;
  }
  if (grandfathered) {
    return { bannerCollapsed: state.value.bannerCollapsed, grandfathered: true, inDemo: false, progress: null };
  }

  const plan = await attempt(() => (dependencies.hasActivePlan ?? configuredHasActivePlan)(actorId));
  if (!plan.ok) return null;

  const progress = deriveGuideProgress({
    confirmedContacts: contacts.value,
    hasActivePlan: plan.value,
    relationshipGoal: input.relationshipGoal,
    step1Skipped: state.value.step1Skipped,
  });
  if (progress.completed === GUIDE_STEP_ORDER.length) {
    // 首页路径第一次推导出 3 步完成时补写闩锁（没打开过 /app/start 的人也有 completedAt）。
    // 写失败不影响本次显示、不抛错，下次再写。
    await attempt(() => service.markCompleted());
  }
  return {
    bannerCollapsed: state.value.bannerCollapsed,
    grandfathered: false,
    inDemo: decideGuideDemo({ enabled: true, grandfathered: false, progress }),
    progress,
  };
}

/* ── 引导页 /app/start（W0006） ─────────────────────────────────────── */

/**
 * 第 1 步名片槽位用的已确认联系人示例：与计数同一套归属谓词，按确认先后取最早的 3 位，
 * 只取姓名、公司、职位三个展示字段。
 */
export const CONFIRMED_CONTACT_SAMPLE_SQL = `select c.payload->>'displayName' as display_name,
  c.payload->>'organization' as organization,
  c.payload->>'role' as role
from orbit_records c
where c.workspace_id = $1
  and c.collection_name = 'contacts'
  and c.lifecycle_state <> 'deleted'
  and c.user_id = $2
  and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb or c.payload->'accountId' = to_jsonb($2::text))
  and jsonb_typeof(c.payload->'id') = 'string'
  and c.payload->>'lifecycleInitialization' is distinct from 'pending'
  and coalesce(trim(c.payload->>'displayName'), '') <> ''
order by c.created_at asc, c.record_id asc
limit 3`;

export type ConfirmedContactSampler = (actorId: string) => Promise<StartContactSample[]>;

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createPostgresConfirmedContactSampler(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
}): ConfirmedContactSampler {
  return async (actorId) => {
    const id = actorId.trim();
    if (!id) throw new Error("GUIDE_CONTACT_SAMPLE_ACTOR_REQUIRED");
    const result = await input.client.query<{
      display_name: string | null;
      organization: string | null;
      role: string | null;
    }>(CONFIRMED_CONTACT_SAMPLE_SQL, [input.workspaceId, id]);
    return result.rows.flatMap((row) => {
      const displayName = optionalText(row.display_name);
      return displayName
        ? [{ displayName, organization: optionalText(row.organization), role: optionalText(row.role) }]
        : [];
    });
  };
}

function configuredConfirmedContactSampler(): ConfirmedContactSampler {
  return async (actorId) => {
    const configured = createConfiguredPostgresLiveRecordStore();
    if (!configured) throw new Error("GUIDE_CONTACT_SAMPLE_UNCONFIGURED");
    resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "contacts" });
    return createPostgresConfirmedContactSampler({
      client: configured.client,
      workspaceId: configured.workspaceId,
    })(actorId);
  };
}

export interface StartGuideDependencies extends GuideStatusDependencies {
  sampleConfirmedContacts?: ConfirmedContactSampler;
}

export type StartGuideRead =
  | { kind: "disabled" }
  | { kind: "unavailable" }
  | { kind: "ready"; snapshot: StartGuideSnapshot };

/**
 * `/app/start` 的服务端读取：开关关闭返回 disabled（不做任何读取，页面重定向到
 * `/app/agent`）；引导记录、联系人计数、计划任一读不到返回 unavailable（页面显示稍后再试，
 * 不猜进度）。联系人示例读不到只是槽位不显示姓名。
 *
 * 与 `readGuideStatusForActor` 不同，D2 老用户也要读计数与计划：引导页要显示第 3 步。
 * 第一次看到前 3 步全部完成时写入 `completedAt`（同时清空 `currentStep`，页面显示完成卡片）。
 */
export async function readStartGuideForActor(
  input: {
    actorId: string;
    relationshipGoal: string | null | undefined;
    userId?: string | null;
  },
  dependencies: StartGuideDependencies = {},
): Promise<StartGuideRead> {
  const config = dependencies.config ?? readGuideDemoConfig();
  if (!config.enabled) return { kind: "disabled" };
  const actorId = input.actorId.trim();
  if (!actorId) return { kind: "unavailable" };

  let guideState = dependencies.guideState;
  if (guideState === undefined) {
    const resolution = resolveGuideStateService({ actorId });
    guideState = resolution.success ? resolution.service : null;
  }
  if (!guideState) return { kind: "unavailable" };
  const service = guideState;

  const state = await attempt(() => service.get());
  if (!state.ok) return { kind: "unavailable" };
  let current: GuideState = state.value;

  const countContacts = dependencies.countConfirmedContacts ?? configuredConfirmedContactCounter();
  const contacts = await attempt(() => countContacts(actorId));
  if (!contacts.ok) return { kind: "unavailable" };

  let grandfathered = current.grandfathered;
  if (grandfathered === null) {
    grandfathered = await decideAndPersistGrandfathered({
      actorId,
      config,
      confirmedContacts: contacts.value,
      dependencies,
      service,
      userId: input.userId ?? null,
    });
    if (grandfathered === null) return { kind: "unavailable" };
  }

  const plan = await attempt(() => (dependencies.hasActivePlan ?? configuredHasActivePlan)(actorId));
  if (!plan.ok) return { kind: "unavailable" };

  const samples = await attempt(() =>
    (dependencies.sampleConfirmedContacts ?? configuredConfirmedContactSampler())(actorId),
  );

  const flags = deriveStartGuideFlags({
    confirmedContacts: contacts.value,
    grandfathered,
    hasActivePlan: plan.value,
    relationshipGoal: input.relationshipGoal,
    step1Skipped: current.step1Skipped,
  });
  if (firstThreeStepsDone(flags) && !current.completedAt) {
    // 写不进去不影响本次显示（完成卡片照样由进度推导），下次进页面再写。
    const completed = await attempt(() => service.markCompleted());
    current = completed.ok ? completed.value : { ...current, currentStep: null };
  }

  return {
    kind: "ready",
    snapshot: {
      completedAt: current.completedAt,
      confirmedContacts: Math.max(0, Math.floor(contacts.value)),
      contactSamples: samples.ok ? samples.value.slice(0, START_REQUIRED_CONTACTS) : [],
      currentStep: current.currentStep,
      grandfathered,
      hasActivePlan: plan.value,
      step1Skipped: current.step1Skipped,
    },
  };
}
