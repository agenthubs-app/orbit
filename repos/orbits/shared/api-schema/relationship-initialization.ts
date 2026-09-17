import { z } from "zod";
import { relationshipLifecycleSnapshotSchema } from "./relationship-lifecycle";

const id = z.string().min(1).max(256).refine(value => value.trim() === value && !value.includes("\0"));
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const nextTask = z.object({ taskId: id, title: z.string().trim().min(1).max(500), dueAt: z.string().datetime({ offset: true }) }).strict();
export const relationshipInitializationSchema = z.object({
  expectedRevision: revision,
  idempotencyKey: id,
  choice: z.discriminatedUnion("stage", [
    z.object({ stage: z.literal("active"), activeGoal: z.string().trim().min(1).max(2000) }).strict(),
    z.object({ stage: z.literal("needs_follow_up"), nextTask }).strict(),
    z.object({ stage: z.literal("nurture"), nextTask }).strict(),
    z.object({ stage: z.literal("archived") }).strict(),
  ]),
}).strict();
export const relationshipInitializationReadSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("pending"), revision, connectionId: id }),
  z.object({ state: z.literal("initialized"), snapshot: relationshipLifecycleSnapshotSchema }),
]);
