/**
 * W0051：洞察的只读入口（列表、详情、洞察标签、待唤醒）。只读 `contact_insights` 一条按主键的语句；
 * 不 import 生成器、不预留配额（易错边界 1：开页面 0 次模型调用）。未配置数据库或表未迁移时返回空表。
 */
import { resolveModuleMode } from "../../../shared/services/module-mode";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { USER_POOL_DAILY_LIMIT } from "../../ai-quota/constants";
import type { ContactInsightText } from "../../../shared/contract/contact-insight";
import { createPostgresContactInsightRepository, type ContactInsightRow, type ContactInsightRowStatus } from "./repository";
import { contactInsightView } from "./view";

export async function readContactInsightRows(actorId: string, contactIds: readonly string[]): Promise<Map<string, ContactInsightRow>> {
  if (!contactIds.length || resolveModuleMode() !== "live") return new Map();
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return new Map();
  return createPostgresContactInsightRepository({ client: runtime.client, workspaceId: runtime.workspaceId }).readRows(actorId, contactIds);
}

function configuredRepository() {
  if (resolveModuleMode() !== "live") return null;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  return runtime ? createPostgresContactInsightRepository({ client: runtime.client, workspaceId: runtime.workspaceId }) : null;
}

/** 列表：本页联系人的「和你目标的关系」（窄读：中英各前 61 字）。 */
export async function readContactInsightPreviewTexts(actorId: string, contactIds: readonly string[]): Promise<Map<string, ContactInsightText>> {
  if (!contactIds.length) return new Map();
  return (await configuredRepository()?.readPreviews(actorId, contactIds)) ?? new Map();
}

/** 待唤醒：≤5 位联系人的状态与下一步（窄读）。 */
export async function readContactInsightNextSteps(actorId: string, contactIds: readonly string[]): Promise<Map<string, { status: ContactInsightRowStatus; nextStep: ContactInsightText | null }>> {
  if (!contactIds.length) return new Map();
  return (await configuredRepository()?.readNextSteps(actorId, contactIds)) ?? new Map();
}

export interface ContactInsightDetailRead {
  row: ContactInsightRow | null;
  goal: string | null;
  /** false = 读失败、目标未知（视图按「暂无洞察」显示，不判定未设目标）。W0057 起没有行时也读目标。 */
  goalKnown: boolean;
  /** 用户主动池当日 10 次操作是否已用满（只在可能显示「重新生成」时读）。 */
  quotaExhausted: boolean;
}

/**
 * 详情弹窗：按 (actor, contactId) 读一行洞察 + 当前目标；行可重新生成时再读一次当日用户池用量（只读计数，不预留）。
 * 读失败按「没有洞察」处理，不影响详情页。
 */
export async function readContactInsightDetail(
  input: { actorId: string; contactId: string; now: Date },
  deps: {
    readRows?: typeof readContactInsightRows;
    readGoal?: (actorId: string) => Promise<string | null>;
    readUserPoolUsed?: (actorId: string, now: Date) => Promise<number>;
  } = {},
): Promise<ContactInsightDetailRead> {
  const readGoal = deps.readGoal ?? (async (actorId: string) => (await import("../../network-analysis/runtime")).readSnapshotProfile(actorId).then((profile) => profile.goal));
  const rows = await (deps.readRows ?? readContactInsightRows)(input.actorId, [input.contactId]).catch(() => new Map<string, ContactInsightRow>());
  const row = rows.get(input.contactId) ?? null;
  // W0057（G-7）：没有洞察行时也读目标——无目标显示设目标引导，有目标显示「正在生成」（确认后的即时生成还没写行／刚写行）。
  const goal = await readGoal(input.actorId).catch(() => null);
  if (!row) return { goal, goalKnown: true, quotaExhausted: false, row: null };
  const view = contactInsightView(row, { contactId: input.contactId, goal, now: input.now });
  let quotaExhausted = false;
  if (view.canRegenerate) {
    const used = await (deps.readUserPoolUsed ?? readConfiguredUserPoolUsed)(input.actorId, input.now).catch(() => 0);
    quotaExhausted = used >= USER_POOL_DAILY_LIMIT;
  }
  return { goal, goalKnown: true, quotaExhausted, row };
}

async function readConfiguredUserPoolUsed(actorId: string, now: Date): Promise<number> {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return 0;
  const { createPostgresAiUsageLedger } = await import("../../ai-quota/ledger");
  // W0057（D62）：账本的 `user` 已排除即时洞察生成（独立计数），按钮不会被即时生成误置灰。
  return (await createPostgresAiUsageLedger({ client: runtime.client, workspaceId: runtime.workspaceId }).readUsageToday(actorId, now)).user;
}

/**
 * W0057（SC-02）：详情面板轮询用的只读状态——本人一行洞察 + 当前目标 + 当日用户池用量（同详情口径）。
 * 联系人不是本人的已确认联系人 → null（接口 404）。只读，0 次模型调用、0 次预留。
 */
export async function readContactInsightStatus(
  input: { actorId: string; contactId: string; now: Date },
  deps: Parameters<typeof readContactInsightDetail>[1] & { ownsContact?: (actorId: string, contactId: string) => Promise<boolean> } = {},
): Promise<ContactInsightDetailRead | null> {
  const detail = await readContactInsightDetail(input, deps);
  if (detail.row) return detail;
  const owns = deps.ownsContact ?? (async (actorId: string, contactId: string) => (await configuredRepository()?.ownsContact(actorId, contactId)) ?? false);
  return (await owns(input.actorId, input.contactId).catch(() => false)) ? detail : null;
}
