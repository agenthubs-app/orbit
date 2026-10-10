/** R22 深链的两端共用用例（服务端 `tests/domain/plan-href.test.ts`，App `tests/plan-href-compute.test.ts`）。 */
export interface PlanHrefCase {
  name: string;
  call: "flow" | "draftEdit" | "overview" | "type" | "review" | "done" | "legacy" | "taskSegment";
  args: Array<string | null>;
  web: string;
  app: string;
}

export const PLAN_HREF_CASES: PlanHrefCase[] = [
  { app: "/plans/flow/intake_1", args: ["intake_1"], call: "flow", name: "generation flow", web: "/app/plans/flow/intake_1" },
  { app: "/plans/drafts/draft_1/edit", args: ["draft_1"], call: "draftEdit", name: "draft edit", web: "/app/plans/drafts/draft_1/edit" },
  { app: "/plans/plan_1", args: ["plan_1"], call: "overview", name: "overview", web: "/app/plans/plan_1" },
  { app: "/plans/plan_1/types/item_9", args: ["plan_1", "item_9"], call: "type", name: "person type", web: "/app/plans/plan_1/types/item_9" },
  { app: "/plans/plan_1/review", args: ["plan_1"], call: "review", name: "review", web: "/app/plans/plan_1/review" },
  { app: "/plans/plan_1/done", args: ["plan_1"], call: "done", name: "done", web: "/app/plans/plan_1/done" },
  { app: "/plans/legacy/plan_0", args: ["plan_0"], call: "legacy", name: "legacy v1", web: "/app/plans/legacy/plan_0" },
  { app: "/task?seg=plan&plan=plan_1", args: ["plan_1"], call: "taskSegment", name: "task segment with a plan", web: "/app/tasks?tab=plan&plan=plan_1" },
  { app: "/task?seg=plan", args: [null], call: "taskSegment", name: "task segment, last opened plan", web: "/app/tasks?tab=plan" },
  { app: "/plans/a%2Fb/types/x%3Fy", args: ["a/b", "x?y"], call: "type", name: "ids are encoded", web: "/app/plans/a%2Fb/types/x%3Fy" },
];
