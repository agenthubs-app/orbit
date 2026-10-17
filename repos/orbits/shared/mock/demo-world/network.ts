// R11a 人脈（演示世界）：人只从 index.ts 取（RD-22）。「目標に関係」= 示例计划里已关联的人（DEMO_PLAN.personTypes.personIds）。
import type { ContactGoalRelatedIdsDTO } from "../../contract/contact-goal-related";
import { DEMO_PLAN, DEMO_TODOS } from "./index";

const links = DEMO_PLAN.personTypes
  .filter((type) => !type.skipped)
  .flatMap((type) => type.personIds.map((contactId) => ({ contactId, label: type.label, talked: true })));
const unique = [...new Map(links.map((link) => [link.contactId, link])).values()].sort((left, right) => (left.contactId < right.contactId ? -1 : 1));

/** GET /api/contacts/goal-related-ids in mock mode (asOf is set per response). */
export const DEMO_GOAL_RELATED: Omit<ContactGoalRelatedIdsDTO, "asOf"> & { sample: true } = {
  ids: unique.map((link) => link.contactId),
  truncated: false,
  links: unique,
  // 要フォロー：示例 To-do 里挂着人的那几条。
  followUpContactIds: [...new Set(DEMO_TODOS.flatMap((todo) => (todo.personId ? [todo.personId] : [])))].sort(),
  sample: true,
};
