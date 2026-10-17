import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import { z } from "zod";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { relationshipTaskPageItemSchema } from "../../../shared/api-schema/relationship-lifecycle";
import { relationshipLifecycleFactsCtes } from "../../followups/storage/relationship-lifecycle-facts-reader";
import { lifecycleTaskClassifiedCtes } from "../../followups/storage/lifecycle-task-pages";
import { resolveSharedReadBudgetGate } from "../../sync/read-budget-gate";

export interface RelationshipTaskMapping { taskId: string; connectionId: string; contactId: string }
export interface RelationshipTaskResolver { read(actorId: string, taskId: string): Promise<RelationshipTaskMapping | null> }
const mapping = relationshipTaskPageItemSchema.pick({ taskId: true, connectionId: true, contactId: true });
const result = z.object({ ok: z.boolean(), ambiguous: z.boolean(), mismatch: z.boolean(), items: z.array(mapping).max(1) });
const SQL = `${lifecycleTaskClassifiedCtes(relationshipLifecycleFactsCtes("exact-task"))}
select jsonb_build_object('ok', integrity.ok,
  'ambiguous', exists(select 1 from projected group by v->>'kind',v->>'id' having count(*)>1),
  'mismatch', exists(select 1 from linked where direct_contact is not null and connection is not null
    and direct_contact->>'id' <> connection->>'contactId'),
  'items', coalesce((select jsonb_agg(jsonb_build_object('taskId', id, 'connectionId', task->>'connectionId', 'contactId', contact->>'id'))
    from (select * from classified where issue is null and connection is not null limit 1) selected), '[]'::jsonb)) as result from integrity`;
const validId = (id: string) => id.length > 0 && id.length <= 256 && id.trim() === id && !/[\u0000-\u001f\u007f]/u.test(id);

export function createRelationshipTaskResolver(input: { client: LiveRecordSqlClient; workspaceId: string; assertAllowed: (collection: string) => void }): RelationshipTaskResolver {
  return { async read(actorId, taskId) {
    if (![input.workspaceId, actorId, taskId].every(validId)) throw Error("RELATIONSHIP_TASK_RESOLVE_INPUT_INVALID");
    for (const collection of ["tasks", "connections", "contacts"]) input.assertAllowed(collection);
    const response = await input.client.query<{ result: unknown }>(SQL, [input.workspaceId, actorId, taskId]);
    const row = result.parse(response.rows[0]?.result);
    if (!row.ok || row.ambiguous || row.mismatch) throw Error("RELATIONSHIP_TASK_MAPPING_CONFLICT");
    const selected = row.items[0] ?? null;
    if (selected && selected.taskId !== taskId) throw Error("RELATIONSHIP_TASK_RESPONSE_INVALID");
    return selected;
  } };
}

export function createConfiguredRelationshipTaskResolver(expectedWorkspaceId: string): RelationshipTaskResolver | null {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  if (configured.workspaceId !== expectedWorkspaceId) throw Error("RELATIONSHIP_TASK_STORAGE_UNAVAILABLE");
  return createRelationshipTaskResolver({ client: configured.client, workspaceId: configured.workspaceId,
    assertAllowed: collectionName => resolveSharedReadBudgetGate()?.assertAllowed({ collectionName }) });
}
