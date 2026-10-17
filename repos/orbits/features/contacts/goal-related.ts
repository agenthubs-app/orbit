/**
 * R11a（PLANNER 契约 5）：和本人生效目标有关的联系人，带人物タイプ名与「話した」。
 * 读法与 `planGoalRelatedContactIds`（features/plans/v2/active-needs.ts，R22）相同：v1 当前计划 + v2 各目标的人物类型
 * （`mergeActivePlanNeeds`），只读计划、不写；只调用计划模块已导出的函数。计划读不到（未配置 / 未迁移）时为空。
 */
import type { PlanSnapshot } from "../plans/contract";
import type { ContactGoalRelatedIdsDTO, ContactGoalRelatedLinkDTO } from "../../shared/contract/contact-goal-related";
import { boundedGoalRelatedIds } from "./card-service";

export interface GoalRelatedSources {
  readV1(actorId: string): Promise<PlanSnapshot | null>;
  readV2: (actorId: string) => Promise<Awaited<ReturnType<typeof import("../plans/v2/active-needs").readActiveV2Needs>>>;
}

const LABEL_MAX = 120;

export const defaultGoalRelatedSources: GoalRelatedSources = {
  async readV1(actorId) {
    const { resolvePlanService } = await import("../plans/service-factory");
    const resolution = resolvePlanService({ actorId, mode: "live" });
    if (resolution.success === false) return null;
    try {
      return await resolution.service.getCurrent();
    } catch (error) {
      if ((error as { code?: unknown })?.code === "42P01") return null;
      throw error;
    }
  },
  async readV2(actorId) {
    const { readActiveV2Needs } = await import("../plans/v2/active-needs");
    return readActiveV2Needs(actorId, "live");
  },
};

/** Links from the merged snapshot: the first need (plan order) that links a contact names it; established anywhere = talked. */
export function goalRelatedLinks(snapshot: Pick<PlanSnapshot, "items"> | null): ContactGoalRelatedLinkDTO[] {
  if (!snapshot) return [];
  const byContact = new Map<string, ContactGoalRelatedLinkDTO>();
  for (const item of snapshot.items) {
    if (item.kind !== "network_need") continue;
    for (const link of item.contactLinks) {
      const existing = byContact.get(link.contactId);
      const talked = link.state === "established";
      if (existing) existing.talked ||= talked;
      else byContact.set(link.contactId, { contactId: link.contactId, label: [...(item.title ?? "")].slice(0, LABEL_MAX).join(""), talked });
    }
  }
  return [...byContact.values()];
}

export async function readContactGoalRelated(actorId: string, now: () => Date = () => new Date(), sources: GoalRelatedSources = defaultGoalRelatedSources): Promise<ContactGoalRelatedIdsDTO> {
  const { mergeActivePlanNeeds } = await import("../plans/v2/active-needs");
  const [v1, v2] = await Promise.all([sources.readV1(actorId), sources.readV2(actorId)]);
  const links = goalRelatedLinks(mergeActivePlanNeeds(v1, v2));
  const bounded = boundedGoalRelatedIds(links.map((link) => link.contactId));
  const byId = new Map(links.map((link) => [link.contactId, link]));
  return { ids: bounded.ids, truncated: bounded.truncated, asOf: now().toISOString(), links: bounded.ids.map((id) => byId.get(id)!) };
}
