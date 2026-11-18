/**
 * To-do reads (设计稿 §4 Todo, 附录 B; agent-design AG05). Tasks of the account only (formal follow-ups
 * are tasks too); by id, by the related contact, by words in the title, open or completed, in a date
 * range of the due or planned date. Open ones come soonest due first (no date last); "newest" means
 * last updated first.
 */
import type { ReadInput } from "../../../orbit-ai/data-query/read-contract";
import { defined, objectAt, refsOf, str, strs, type RecordDomain } from "../record-adapter";
import type { RecordSpec } from "../source";

const TASK = (field: string) => ["task", field] as const;

export const TODO_DOMAIN: RecordDomain = {
  fieldsOf(row) {
    const task = objectAt(row.payload, "task");
    if (!task || typeof task.title !== "string") return null;
    return defined({
      category: str(task.category),
      completedAt: str(task.completedAt),
      contactId: str(task.relatedContactId),
      // AG13: every person and event (an older to-do's single fields read as one).
      contactIds: Array.isArray(task.relatedContactIds) ? strs(task.relatedContactIds) : str(task.relatedContactId) ? [str(task.relatedContactId)!] : undefined,
      eventRefs: refsOf(Array.isArray(task.relatedEventRefs) ? task.relatedEventRefs : str(task.relatedEventId) ? [{ id: task.relatedEventId, kind: "platform" }] : undefined),
      createdAt: str(task.createdAt),
      description: str(task.notes) ?? str(task.description),
      dueAt: str(task.dueAt),
      eventId: str(task.relatedEventId),
      plannedDate: str(task.plannedDate),
      // AG10: where the to-do came from — "contact" is a formal follow-up (the field list of tasks.query allows it).
      source: str(task.source),
      status: str(task.status),
      title: task.title,
      updatedAt: str(task.updatedAt),
    });
  },
  kind: "todo",
  specOf(input: ReadInput): RecordSpec {
    const order: RecordSpec["order"] = input.order === "newest"
      ? { direction: "desc", paths: [TASK("updatedAt")] }
      : input.order === "oldest"
        ? { direction: "asc", paths: [TASK("createdAt")] }
        : input.status === "completed"
          ? { direction: "desc", paths: [TASK("completedAt"), TASK("updatedAt")] }
          : { direction: "asc", paths: [TASK("dueAt"), TASK("plannedDate")] };
    const equals = [];
    if (input.contactId) equals.push({ paths: [TASK("relatedContactId")], value: input.contactId });
    if (input.eventId) equals.push({ paths: [TASK("relatedEventId")], value: input.eventId });
    if (input.status) equals.push({ paths: [TASK("status")], value: input.status });
    return {
      collection: "tasks",
      excludes: [{ path: TASK("status"), values: ["deleted"] }],
      order,
      ...(input.operation === "get" && input.id ? { ids: [input.id] } : {}),
      ...(equals.length ? { equals } : {}),
      ...(input.operation === "search" ? { text: { paths: "search_text" as const, value: input.query } } : {}),
      ...(input.from || input.to ? { range: { paths: [TASK("dueAt"), TASK("plannedDate")], ...(input.from ? { from: input.from } : {}), ...(input.to ? { to: input.to } : {}) } } : {}),
    };
  },
  updatedAtOf: (row) => str(objectAt(row.payload, "task")?.updatedAt) ?? row.updatedAt,
  versionOf: (row) => str(objectAt(row.payload, "task")?.updatedAt) ?? row.updatedAt,
};
