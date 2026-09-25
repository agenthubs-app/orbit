import { z } from "zod";

const id = z.string().min(1).max(256).refine(value => value.trim() === value && !value.includes("\0"));
const instant = z.string().datetime({ offset: true });
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);
const status = z.enum(["open", "scheduled", "completed", "dismissed"]);
const identity = { actorId: id, connectionId: id, contactId: id, version, createdAt: instant, updatedAt: instant };
const nextTask = z.object({ taskId: id, title: z.string().trim().min(1).max(500), dueAt: instant }).strict();
export const relationshipCompletionSchema = z.object({
  taskId: id, expectedConnectionVersion: version, expectedTaskVersion: version, idempotencyKey: id,
  outcome: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("next_task"), nextTask }).strict(),
    z.object({ kind: z.literal("active"), activeGoal: z.string().trim().min(1).max(2000) }).strict(),
    z.object({ kind: z.literal("nurture"), nextTask }).strict(),
    z.object({ kind: z.literal("archived"), dismissTaskIds: z.array(id).max(1000), reason: z.string().max(2000).optional() }).strict(),
  ]),
}).strict();
export const relationshipLifecycleSnapshotSchema = z.object({
  connection: z.object({ ...identity, stage: z.enum(["needs_follow_up", "active", "nurture", "archived"]), activeGoal: z.string().nullable() }),
  tasks: z.array(z.object({ ...identity, taskId: id, title: z.string(), status, purpose: z.enum(["follow_up", "maintenance"]), dueAt: instant })),
});
export const relationshipLifecycleReadSchema = z.object({ snapshot: relationshipLifecycleSnapshotSchema });
export const relationshipLifecycleMutationSchema = relationshipLifecycleReadSchema.extend({ replayed: z.boolean() });
export const relationshipTaskListSchema = z.object({ tasks: z.array(z.object({ taskId: id, connectionId: id, contactId: id, contactName: z.string(), title: z.string(), status, dueAt: instant.nullable() })) });
export const relationshipTaskPageItemSchema = z.object({ itemKey: z.string().min(1).max(2048), taskId: id, connectionId: id, contactId: id,
  contactNamePreview: z.string().min(1).max(240), titlePreview: z.string().min(1).max(480), status, dueAt: instant.nullable() }).strict();
export const relationshipTaskPageSchema = z.object({
  actorId: id, mode: z.enum(["open", "completed"]),
  items: z.array(relationshipTaskPageItemSchema).max(50),
  total: z.number().int().nonnegative().safe(), hasMore: z.boolean(), nextCursor: z.string().max(18000).nullable(), asOf: instant,
}).strict().transform(page => ({ ...page, nextCursor: page.nextCursor ?? null,
  // Keep required nullable keys explicit under both Web's non-strict and App's
  // strict TypeScript settings. Missing keys still fail the object validation.
  items: page.items.map(item => ({ ...item, dueAt: item.dueAt ?? null })),
}));
