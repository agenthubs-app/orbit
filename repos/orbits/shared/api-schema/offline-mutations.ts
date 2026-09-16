import { z } from "zod";

const nonEmpty = z.string().refine((value) => value.trim().length > 0);
const instant = z.string().datetime({ offset: true });
const optionalText = z.string().max(10_000)
  .refine((value) => value.trim().length > 0).optional();
const nullableText = z.string().max(10_000).nullable().optional();
const idList = z.array(nonEmpty).max(100);
const mention = z.object({
  contactId: nonEmpty,
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  displayText: nonEmpty,
}).strict().refine((value) => value.end > value.start);

const notePatch = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(100_000)
    .refine((value) => value.trim().length > 0).optional(),
  manualContactIds: idList.optional(),
  mentions: z.array(mention).max(100).optional(),
  eventIds: idList.optional(),
}).strict();

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
});

const taskPatch = z.object({
  title: optionalText,
  notes: nullableText,
  location: nullableText,
  category: z.enum(["personal", "work", "other"]).optional(),
  plannedDate: dateOnly.nullable().optional(),
  dueAt: instant.nullable().optional(),
  priority: z.enum(["normal", "high"]).optional(),
  relatedContactId: nonEmpty.nullable().optional(),
  relatedConversationId: nonEmpty.nullable().optional(),
}).strict();

const followupPatch = taskPatch.omit({ category: true }).extend({
  relatedContactId: nonEmpty.optional(),
}).strict();

const schedulePatch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  startsAt: instant.optional(),
  endsAt: instant.nullable().optional(),
  location: z.string().trim().min(1).max(500).nullable().optional(),
}).strict();

const base = z.object({
  mutationId: nonEmpty,
  kind: z.enum(["note", "task", "relationship_followup", "personal_schedule"]),
  entityId: nonEmpty,
  operation: z.enum(["create", "update", "delete", "complete", "reopen", "cancel"]),
  baseRevision: z.string().nullable(),
  patch: z.record(z.string(), z.unknown()),
  createdAt: instant,
}).strict();

const localEntityId = /^local:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function parsePatch(kind: z.infer<typeof base>["kind"], operation: z.infer<typeof base>["operation"], patch: Record<string, unknown>) {
  if (["delete", "complete", "reopen", "cancel"].includes(operation)) {
    if (Object.keys(patch).length !== 0) throw new Error("mutation-patch-invalid");
    return patch;
  }
  if (kind === "note") {
    const parsed = notePatch.parse(patch);
    if (Object.keys(parsed).length === 0) throw new Error("mutation-patch-required");
    if (operation === "create" && (typeof parsed.body !== "string" || !parsed.body.trim())) throw new Error("note-body-required");
    if (parsed.body === "") throw new Error("note-body-required");
    if (parsed.body !== undefined && parsed.mentions !== undefined) {
      for (const item of parsed.mentions) {
        if (item.end > parsed.body.length || parsed.body.slice(item.start, item.end) !== item.displayText) {
          throw new Error("note-mention-invalid");
        }
      }
    }
    return parsed;
  }
  if (kind === "task") {
    const parsed = taskPatch.parse(patch);
    if (Object.keys(parsed).length === 0) throw new Error("mutation-patch-required");
    if (operation === "create" &&
        (typeof parsed.title !== "string" || !parsed.title.trim() || parsed.category === undefined)) {
      throw new Error("task-create-fields-required");
    }
    return parsed;
  }
  if (kind === "relationship_followup") {
    if (operation === "create") throw new Error("mutation-operation-denied");
    const parsed = followupPatch.parse(patch);
    if (Object.keys(parsed).length === 0) throw new Error("mutation-patch-required");
    return parsed;
  }
  const parsed = schedulePatch.parse(patch);
  if (Object.keys(parsed).length === 0) throw new Error("mutation-patch-required");
  if (operation === "create" && (parsed.title === undefined || parsed.startsAt === undefined)) {
    throw new Error("schedule-create-fields-required");
  }
  if (parsed.startsAt && parsed.endsAt && Date.parse(parsed.endsAt) <= Date.parse(parsed.startsAt)) {
    throw new Error("schedule-time-range-invalid");
  }
  return parsed;
}

export function parseOfflineMutation(input: unknown) {
  const mutation = base.parse(input);
  const allowed: Record<typeof mutation.kind, readonly typeof mutation.operation[]> = {
    note: ["create", "update", "delete"],
    task: ["create", "update", "complete", "reopen", "cancel", "delete"],
    relationship_followup: ["update", "complete", "reopen", "cancel", "delete"],
    personal_schedule: ["create", "update", "delete"],
  };
  if (!allowed[mutation.kind].includes(mutation.operation)) throw new Error("mutation-operation-denied");
  if (mutation.operation === "create") {
    if (mutation.baseRevision !== null || !localEntityId.test(mutation.entityId)) throw new Error("mutation-create-identity-invalid");
  } else if (mutation.baseRevision === null || mutation.baseRevision.trim().length === 0) {
    throw new Error("mutation-base-revision-required");
  }
  return { ...mutation, patch: parsePatch(mutation.kind, mutation.operation, mutation.patch) };
}
