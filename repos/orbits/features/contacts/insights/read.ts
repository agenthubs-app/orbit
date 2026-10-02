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
  /** false = 没有洞察行，没读目标（视图按「暂无洞察」显示，不判定未设目标）。 */
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
  // 没有洞察行时不读资料（详情页每次打开省一次资料读取）：显示「暂无洞察」；未设目标的人在第一次标记后由后台置为 blocked_no_goal，
  // 之后有行再按当前目标判定「设置关系目标后生成」。
  if (!row) return { goal: null, quotaExhausted: false, row: null, goalKnown: false };
  const goal = await readGoal(input.actorId).catch(() => null);
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
  return (await createPostgresAiUsageLedger({ client: runtime.client, workspaceId: runtime.workspaceId }).readUsageToday(actorId, now)).user;
}
