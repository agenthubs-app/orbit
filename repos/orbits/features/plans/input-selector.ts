/**
 * 生成器输入裁剪（W0008，RW-08 / Q28A）。
 *
 * - 只取本人的联系人：`ownerId` 必须等于当前 actor（读取层已按 actor 过滤，这里再挡一次）；
 * - 本人联系人 ≤ 200 位：全部带上；
 * - 超过 200 位：只保留两类——近 90 天有互动的（最后互动或交换名片在 90 天内），
 *   以及与目标相关的（`goal-signals.ts`：行业一致或职位关键词命中）；
 * - 输出顺序确定：与目标相关的在前，其次按最近互动倒序，再按名字、id。
 */
import type { PlanInputContact } from "./generator";
import { goalArchetype, isGoalRelatedContact } from "./goal-signals";

export const PLAN_INPUT_CONTACT_LIMIT = 200;
export const PLAN_INPUT_RECENT_DAYS = 90;

export interface PlanContactSelection {
  contacts: PlanInputContact[];
  /** 本人联系人的总数（裁剪前）。 */
  total: number;
  trimmed: boolean;
}

function lastActivityMs(contact: PlanInputContact): number {
  const values = [contact.lastInteractionAt, contact.createdAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : Number.NEGATIVE_INFINITY;
}

export function selectPlanContacts(input: {
  actorId: string;
  contacts: readonly PlanInputContact[];
  goalText: string;
  now: Date;
  /** 本人联系人总数：读取层已在 SQL 里按同样的规则先筛过时传入（筛过的列表比总数少）。 */
  total?: number;
}): PlanContactSelection {
  const own = input.contacts.filter((contact) => contact.ownerId === input.actorId);
  const total = Math.max(input.total ?? 0, own.length);
  const archetype = goalArchetype(input.goalText);
  const related = (contact: PlanInputContact) => isGoalRelatedContact(contact, archetype);
  const recentSince = input.now.getTime() - PLAN_INPUT_RECENT_DAYS * 86_400_000;
  const trimmed = total > PLAN_INPUT_CONTACT_LIMIT;
  const kept = trimmed ? own.filter((contact) => lastActivityMs(contact) >= recentSince || related(contact)) : own;
  const contacts = [...kept].sort(
    (a, b) =>
      Number(related(b)) - Number(related(a)) ||
      lastActivityMs(b) - lastActivityMs(a) ||
      a.displayName.localeCompare(b.displayName) ||
      a.id.localeCompare(b.id),
  );
  return { contacts, total, trimmed };
}
