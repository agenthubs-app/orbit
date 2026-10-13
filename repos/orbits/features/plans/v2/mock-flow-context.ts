/** R23 mock：生成流程的输入来源用演示世界（不写库）。 */
import { DEMO_PEOPLE } from "../../../shared/mock/demo-world";
import { looksLikeTeamMember, PLAN_TEAM_CANDIDATE_LIMIT, type PlanFlowContact, type PlanFlowContextSource } from "./flow-context";
import type { PlanV2ContactView } from "./types";

/** 演示世界里当作共同創業者的人（联系人卡没有标签字段，mock 按 id 给标签）。 */
const DEMO_COFOUNDER_ID = "demo-person-aoki";

const DEMO_CONTACTS: readonly Pick<PlanV2ContactView, "id" | "name" | "organization" | "role">[] = DEMO_PEOPLE.map((person) => ({ id: person.id, name: person.name, organization: person.company, role: person.role }));

/**
 * mock：联系人默认是演示世界（Kanade AI の CTO を共同創業者として扱う）。
 * `readContacts`（复核 REWORK-REVIEW-web 问题 7）：mock 服务器传 mock 仓储里本人的联系人，这样设计稿 fixture 换了联系人，
 * 「人脈から選ぶ」的候补也跟着换；不传时（测试）仍用演示世界。
 */
export function createMockPlanFlowContext(readContacts?: (actorId: string) => Promise<readonly Pick<PlanV2ContactView, "id" | "name" | "organization" | "role">[]>): PlanFlowContextSource {
  const people = async (actorId: string): Promise<PlanFlowContact[]> => (readContacts ? await readContacts(actorId) : DEMO_CONTACTS).map((contact) => ({
    id: contact.id,
    industry: null,
    name: contact.name,
    notes: null,
    organization: contact.organization,
    role: contact.role,
    tags: contact.id === DEMO_COFOUNDER_ID ? ["共同創業者"] : [],
  }));
  return {
    async addContact() { return null; },
    async contacts(actorId, ids) { return (await people(actorId)).filter((person) => ids.includes(person.id)); },
    async draftContacts(actorId) { return people(actorId); },
    async profile() { return { headline: "代表 · サンプル株式会社", name: "Orbit デモ" }; },
    async teamCandidates(actorId) { return (await people(actorId)).filter(looksLikeTeamMember).slice(0, PLAN_TEAM_CANDIDATE_LIMIT); },
  };
}
