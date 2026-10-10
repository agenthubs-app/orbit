/** R23 mock：生成流程的输入来源用演示世界（不写库）。 */
import { DEMO_PEOPLE } from "../../../shared/mock/demo-world";
import { looksLikeTeamMember, PLAN_TEAM_CANDIDATE_LIMIT, type PlanFlowContact, type PlanFlowContextSource } from "./flow-context";

/** mock：演示世界（Kanade AI の CTO を共同創業者として扱う）。 */
export function createMockPlanFlowContext(): PlanFlowContextSource {
  const people: PlanFlowContact[] = DEMO_PEOPLE.map((person) => ({
    id: person.id,
    industry: null,
    name: person.name,
    notes: null,
    organization: person.company,
    role: person.role,
    tags: person.id === "demo-person-aoki" ? ["共同創業者"] : [],
  }));
  return {
    async addContact() { return null; },
    async contacts(_actorId, ids) { return people.filter((person) => ids.includes(person.id)); },
    async draftContacts() { return people; },
    async profile() { return { headline: "代表 · サンプル株式会社", name: "Orbit デモ" }; },
    async teamCandidates() { return people.filter(looksLikeTeamMember).slice(0, PLAN_TEAM_CANDIDATE_LIMIT); },
  };
}
