/**
 * W0060（G-13）：联系人详情「为什么是 TA」里的计划关联只读视图。
 *
 * - 只经 `PlanService.getCurrent()` 读当前生效计划（只读事务）；不调 `getCurrentView()`（那条会在需要时
 *   写「进入新阶段」日志）、不调任何生成器——0 次写入、0 次生成器调用（W0050 R-6 同一守则）。
 * - `linkedNeeds`：已关联到该联系人的人脉需求（含所在阶段序号与标题）。
 * - `weekAction`：该联系人本周未完成的计划行动（`planWeekActions` 同一口径：建议周次 ≤ 本周、未完成，
 *   逾期的排在后面）——只认「关联联系人恰好只有此人」或 `meta.contactId` 为此人的行动，取第一条。
 *   「为什么现在」用它自己的 `detail`（W0060／W0061 同一顺序，见 `contact-value.ts` 的 `contactWhyNow`）。
 */
import type { PlanService, PlanSnapshot } from "./contract";
import { resolvePlanService } from "./service-factory";
import { planWeekActions, planWeekState } from "./week";

export interface ContactPlanNeedLink {
  needId: string;
  title: string;
  /** 所在阶段的序号（从 1 起）；条目没有阶段时为 null。 */
  phaseNo: number | null;
  phaseTitle: string | null;
}

export interface ContactPlanWeekAction {
  id: string;
  title: string;
  detail: string | null;
  phaseNo: number | null;
  phaseTitle: string | null;
}

export interface ContactPlanContext {
  linkedNeeds: ContactPlanNeedLink[];
  weekAction: ContactPlanWeekAction | null;
}

export const EMPTY_CONTACT_PLAN_CONTEXT: ContactPlanContext = { linkedNeeds: [], weekAction: null };

type SnapshotLike = Pick<PlanSnapshot, "plan" | "items">;

function phaseOf(snapshot: SnapshotLike, phaseKey: string | null): { phaseNo: number | null; phaseTitle: string | null } {
  if (!phaseKey) return { phaseNo: null, phaseTitle: null };
  const index = snapshot.plan.phases.findIndex((phase) => phase.key === phaseKey);
  if (index < 0) return { phaseNo: null, phaseTitle: null };
  return { phaseNo: index + 1, phaseTitle: snapshot.plan.phases[index]!.title };
}

function actionIsForContact(item: SnapshotLike["items"][number], contactId: string): boolean {
  if (item.linkedContactIds.length === 1 && item.linkedContactIds[0] === contactId) return true;
  const metaContactId = (item.meta as { contactId?: unknown } | null | undefined)?.contactId;
  return typeof metaContactId === "string" && metaContactId === contactId;
}

/** 纯函数：从生效计划快照算出该联系人的计划关联（没有计划 → 空）。 */
export function contactPlanContextFromSnapshot(snapshot: SnapshotLike | null, contactId: string, now: Date): ContactPlanContext {
  if (!snapshot || snapshot.plan.status !== "active") return EMPTY_CONTACT_PLAN_CONTEXT;
  const linkedNeeds = snapshot.items
    .filter((item) => item.kind === "network_need" && item.linkedContactIds.includes(contactId))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((item) => ({ needId: item.id, title: item.title, ...phaseOf(snapshot, item.phaseKey) }));
  const { currentWeek } = planWeekState(snapshot.plan, now);
  const action = planWeekActions(snapshot.items, currentWeek).find(({ item }) => actionIsForContact(item, contactId))?.item ?? null;
  const detail = action?.detail?.trim() || null;
  return {
    linkedNeeds,
    weekAction: action ? { detail, id: action.id, title: action.title, ...phaseOf(snapshot, action.phaseKey) } : null,
  };
}

/** 只读：本人当前生效计划（getCurrent）。计划服务不可用或计划表缺失时按无计划处理。 */
export async function readCurrentPlanReadOnly(actorId: string): Promise<SnapshotLike | null> {
  const resolution = resolvePlanService({ actorId });
  if (resolution.success === false) return null;
  try {
    return await resolution.service.getCurrent();
  } catch (error) {
    if ((error as { code?: unknown })?.code === "42P01") return null;
    throw error;
  }
}

export async function readContactPlanContext(input: {
  actorId: string;
  contactId: string;
  now?: Date;
  /** 测试注入：只会调用它的 `getCurrent()`。缺省按本人解析计划服务。 */
  plans?: Pick<PlanService, "getCurrent">;
}): Promise<ContactPlanContext> {
  const snapshot = input.plans ? await input.plans.getCurrent() : await readCurrentPlanReadOnly(input.actorId);
  return contactPlanContextFromSnapshot(snapshot, input.contactId, input.now ?? new Date());
}
