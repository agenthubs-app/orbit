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

export async function readTaskPlanDemo(client: OrbitApiClient): Promise<TaskPlanDemoResult> {
  try {
    const result = await client.get<unknown>("/api/tasks/demo-status");
    if (!result.success) return { kind: "unavailable" };
    const parsed = demoStatus.safeParse(result.data);
    if (!parsed.success) return { kind: "unavailable" };
    return parsed.data.inDemo ? { kind: "ready", view: parsed.data.view } : { kind: "off" };
  } catch { return { kind: "unavailable" }; }
}

export async function saveTaskPlanDemoCollapse(client: OrbitApiClient, collapsed: boolean): Promise<boolean> {
  try {
    const result = await client.patch<unknown>("/api/guide/state", { body: { bannerCollapsed: collapsed } });
    return result.success;
  } catch { return false; }
}
