import { z } from "zod";

import type { OrbitApiClient } from "./client";

const demoView = z.object({
  bannerCollapsed: z.boolean(), completed: z.number().int().min(0).max(3),
  confirmedContacts: z.number().int().nonnegative(), nextStep: z.enum(["contacts", "goal", "plan"]).nullable(),
  steps: z.object({ contacts: z.boolean(), goal: z.boolean(), plan: z.boolean() }),
});
const demoStatus = z.discriminatedUnion("inDemo", [
  z.object({ inDemo: z.literal(true), view: demoView }),
  z.object({ inDemo: z.literal(false), view: z.null() }),
]);

export type TaskPlanDemoView = z.infer<typeof demoView>;
export type TaskPlanDemoResult = { kind: "ready"; view: TaskPlanDemoView } | { kind: "off" } | { kind: "unavailable" };

export const canWriteTaskPlan = (status: TaskPlanDemoResult): boolean => status.kind === "off";

export const TASK_PLAN_DEMO_PATH = "/api/tasks/demo-status";
export const isTaskPlanDemoStatus = (value: unknown): boolean => demoStatus.safeParse(value).success;
/** The server's decision (an answer or the LF9 page copy task-demo-status); anything malformed fails closed. */
export function taskPlanDemoOf(value: unknown): TaskPlanDemoResult {
  const parsed = demoStatus.safeParse(value);
  if (!parsed.success) return { kind: "unavailable" };
  return parsed.data.inDemo ? { kind: "ready", view: parsed.data.view } : { kind: "off" };
}


export async function saveTaskPlanDemoCollapse(client: OrbitApiClient, collapsed: boolean): Promise<boolean> {
  try {
    const result = await client.patch<unknown>("/api/guide/state", { body: { bannerCollapsed: collapsed } });
    return result.success;
  } catch { return false; }
}
