import type { AuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { validTimeZone } from "../tasks/local-date-time";
import { createConfiguredTaskSuggestionPageReader } from "../tasks/suggestion-page";
import { resolvePlanBackend } from "../plans/service-factory";
import { livePlanEventFacts } from "../plans/v2/event-facts";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import { createTodoFollowupReaders } from "./followups";
import { createTodoPlanReaders } from "./plan-sources";
import { createTodoRecordReaders } from "./record-sources";
import { createTodoPageService } from "./service";
import { createTodoSuggestionReader } from "./suggestions";
import { createTodoContactReaders, createTodoContactReadStore } from "./contact-sources";

export function createTodoLiveRuntime(actor: AuthenticatedApiActor) {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  if (actor.workspaceId && actor.workspaceId !== configured.workspaceId) throw Error("TODO_WORKSPACE_UNAVAILABLE");
  const { client, workspaceId } = configured;
  const assertAllowed = (collectionName: string) => resolveSharedReadBudgetGate()?.assertAllowed({ collectionName });
  const readers = { ...createTodoFollowupReaders({ client, workspaceId, assertAllowed }), ...createTodoRecordReaders({ client, workspaceId, assertAllowed }) };
  const suggestions = createConfiguredTaskSuggestionPageReader(workspaceId);
  const plans = resolvePlanBackend("live");
  return {
    service: createTodoPageService({ workspaceId, secret: process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
      readers: { ...readers, ...createTodoContactReaders({ workspaceId, store: createTodoContactReadStore({ client, workspaceId, actorId: actor.id, assertAllowed }) }),
        ...(suggestions ? { task_suggestion: createTodoSuggestionReader({ read: suggestions.read, async createdAt(actorId, ids) {
          if (!ids.length) return {};
          assertAllowed("taskSuggestions");
          const reply = await client.query<{ id: string; created: string }>(`select record_id as id,payload->'suggestion'->>'createdAt' as created from orbit_records
            where workspace_id=$1 and collection_name='taskSuggestions' and user_id=$2 and lifecycle_state<>'deleted' and record_id=any($3::text[]) limit 30`, [workspaceId, actorId, ids]);
          return Object.fromEntries(reply.rows.map(row => [row.id, row.created]));
        } }) } : {}),
        ...(plans.success && plans.service.pool && plans.service.workspaceId === workspaceId ? createTodoPlanReaders({ pool: plans.service.pool, workspaceId, assertAllowed,
          events: actorId => livePlanEventFacts({ actorId, workspaceId,
            sources: async () => (await import("../events/assessment/plan-sources")).createLivePlanEventSources(actorId),
          })(),
        }) : {}),
      } }),
    async accountTimeZone(): Promise<string> {
      assertAllowed("profiles");
      const reply = await client.query<{ timezone: string | null }>(`select payload->>'timezone' as timezone from orbit_records
        where workspace_id=$1 and collection_name='profiles' and lifecycle_state<>'deleted' and payload->>'accountId'=$2
          and (($3::text is not null and record_id=$3) or ($3::text is null and (user_id=$2 or user_id is null)))
        order by updated_at desc,record_id limit 1`, [workspaceId, actor.id, actor.profileId ?? null]);
      const zone = reply.rows[0]?.timezone;
      return validTimeZone(zone) ? zone : "UTC";
    },
  };
}
