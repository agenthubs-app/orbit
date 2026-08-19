import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { eventPilotDecision } from "../../shared/config/event-pilot-gate";
import type { EventOperationsPostgresRuntime } from "../events/event-operations/storage/postgres-client";
import type { NotificationDeliveryService } from "./delivery-service";

type Row = Record<string, unknown>;

export interface CanonicalPostEventReminderIntent {
  eventId: string;
  eventVersion: number;
  materialRevision: string;
  scheduledFor: string;
  sourceRef: SourceReferenceDTO & {
    label: "Canonical post-event follow-up";
    type: "event_import";
  };
}

export interface CanonicalPostEventReminderIntentMaterializer {
  materialize(input: {
    actorId: string;
    intent: CanonicalPostEventReminderIntent;
  }): Promise<{ created: boolean }>;
}

export function createCanonicalPostEventNotificationDeliveryMaterializer(input: {
  actorId: string;
  delivery: NotificationDeliveryService;
  env?: Readonly<Record<string, string | undefined>>;
}): CanonicalPostEventReminderIntentMaterializer {
  const actorId = required(input.actorId, "actorId");
  return {
    async materialize({ actorId: intentActorId, intent }) {
      if (required(intentActorId, "actorId") !== actorId) {
        throw new Error("Canonical post-event reminder actor scope mismatch.");
      }
      const decision = eventPilotDecision({
        capability: "proactive_reminders",
        env: input.env,
        eventId: intent.eventId,
      });
      if (!decision.enabled) return { created: false };
      const result = await input.delivery.materialize({
        body: "你有一条活动后跟进提醒，打开 Orbit 查看。",
        phase: "post_event",
        scheduledFor: intent.scheduledFor,
        signalId: `event_post:${intent.eventId}`,
        signalRevision: `${intent.eventVersion}:${intent.materialRevision}`,
        title: "Orbit 提醒",
      });
      return { created: result.created };
    },
  };
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512) {
    throw new Error(`Canonical post-event reminder has an invalid ${field}.`);
  }
  return normalized;
}

function timestamp(value: unknown, field: string): string {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Canonical post-event reminder has an invalid ${field}.`);
  }
  return new Date(parsed).toISOString();
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Canonical post-event reminder has an invalid ${field}.`);
  }
  return parsed;
}

function localParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find((part) => part.type === type)?.value;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      throw new Error("Canonical post-event reminder timezone conversion failed.");
    }
    return parsed;
  };
  return {
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    month: value("month"),
    second: value("second"),
    year: value("year"),
  };
}

function localDateAtEight(
  date: { day: number; month: number; year: number },
  timeZone: string,
): number {
  const targetAsUtc = Date.UTC(date.year, date.month - 1, date.day, 8);
  let candidate = targetAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const represented = localParts(candidate, timeZone);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    candidate -= representedAsUtc - targetAsUtc;
  }
  const verified = localParts(candidate, timeZone);
  if (
    verified.year !== date.year ||
    verified.month !== date.month ||
    verified.day !== date.day ||
    verified.hour !== 8 ||
    verified.minute !== 0 ||
    verified.second !== 0
  ) {
    throw new Error("Canonical post-event reminder local 08:00 is unavailable.");
  }
  return candidate;
}

/** Returns the first local 08:00 strictly after the event end. */
export function nextLocalMorningAtEight(input: {
  eventEndsAt: string;
  timeZone: string;
}): string {
  const eventEndsAt = Date.parse(input.eventEndsAt);
  if (!Number.isFinite(eventEndsAt)) {
    throw new Error("Canonical post-event reminder has an invalid eventEndsAt.");
  }
  const timeZone = required(input.timeZone, "timeZone");
  const localEnd = localParts(eventEndsAt, timeZone);
  let date = {
    day: localEnd.day,
    month: localEnd.month,
    year: localEnd.year,
  };
  let scheduled = localDateAtEight(date, timeZone);
  if (scheduled <= eventEndsAt) {
    const nextDate = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
    date = {
      day: nextDate.getUTCDate(),
      month: nextDate.getUTCMonth() + 1,
      year: nextDate.getUTCFullYear(),
    };
    scheduled = localDateAtEight(date, timeZone);
  }
  return new Date(scheduled).toISOString();
}

const READ_CANONICAL_POST_EVENT_REMINDERS_SQL = `
  with eligible_events as (
    select
      event_row.event_id,
      event_row.event_version,
      version.content_hash as material_revision,
      event_row.ends_at,
      event_row.timezone,
      event_row.ends_at + interval '7 days' as action_window_ends_at,
      (
        date_trunc('day', event_row.ends_at at time zone event_row.timezone)
        + case
            when (event_row.ends_at at time zone event_row.timezone)::time
              < time '08:00'
              then interval '8 hours'
            else interval '1 day 8 hours'
          end
      ) at time zone event_row.timezone as scheduled_at
    from event_ops_events event_row
    join event_event_versions version
      on version.workspace_id = event_row.workspace_id
      and version.event_id = event_row.event_id
      and version.event_version = event_row.event_version
      and version.lifecycle_state_v2 = 'published'
    where event_row.workspace_id = $1
      and event_row.lifecycle_state_v2 = 'published'
      and event_row.ends_at is not null
      and event_row.timezone is not null
      and event_row.ends_at <= $3::timestamptz
  ),
  owned_pairs as (
    select
      pair.accepted_at,
      pair.event_id,
      pair.relationship_pair_id
    from event_ops_relationship_pairs pair
    join event_ops_relationship_sides side
      on side.workspace_id = pair.workspace_id
      and side.relationship_pair_id = pair.relationship_pair_id
      and side.owner_actor_id = $2
    where pair.workspace_id = $1
  )
  select distinct
    event.ends_at,
    event.event_id,
    event.event_version::text as event_version,
    event.material_revision,
    event.scheduled_at,
    event.timezone
  from eligible_events event
  where event.scheduled_at >= $3::timestamptz - interval '24 hours'
    and exists (
      select 1
      from owned_pairs pair
      where pair.event_id = event.event_id
        and not (
          exists (
            select 1
            from event_ops_relationship_sides pair_side
            join orbit_records encounter
              on encounter.workspace_id = pair_side.workspace_id
              and encounter.collection_name = 'human_encounters'
              and encounter.lifecycle_state = 'active'
              and encounter.user_id = pair_side.owner_actor_id
              and encounter.target_type = 'contact'
              and encounter.target_id = pair_side.contact_id
              and encounter.payload ->> 'actorId' = pair_side.owner_actor_id
              and encounter.payload ->> 'contactId' = pair_side.contact_id
              and encounter.payload ->> 'eventId' = pair.event_id
            where pair_side.workspace_id = $1
              and pair_side.relationship_pair_id = pair.relationship_pair_id
              and encounter.occurred_at >= pair.accepted_at
              and encounter.occurred_at <= event.action_window_ends_at
          )
          or exists (
            select 1
            from orbit_records receipt
            join orbit_records action
              on action.workspace_id = receipt.workspace_id
              and action.collection_name = 'agentActionsV2'
              and action.lifecycle_state = 'active'
              and action.payload #>> '{entity,actionId}' =
                receipt.payload #>> '{entity,actionId}'
            cross join lateral jsonb_array_elements(
              case
                when jsonb_typeof(action.payload #> '{entity,operations}') = 'array'
                  then action.payload #> '{entity,operations}'
                else '[]'::jsonb
              end
            ) operation(value)
            where receipt.workspace_id = $1
              and receipt.collection_name = 'agentExecutionReceipts'
              and receipt.lifecycle_state = 'active'
              and receipt.payload #>> '{entity,status}' = 'completed'
              and operation.value ->> 'operationId' =
                receipt.payload #>> '{entity,operationId}'
              and operation.value ->> 'operationType' in (
                'save_message_draft',
                'create_followup_reminder'
              )
              and operation.value #>> '{payload,eventOrigin,eventId}' = pair.event_id
              and operation.value #>> '{payload,eventOrigin,relationshipPairId}' =
                pair.relationship_pair_id
              and nullif(btrim(
                operation.value #>> '{payload,eventOrigin,sourceActionId}'
              ), '') is not null
              and receipt.updated_at >= pair.accepted_at
              and receipt.updated_at <= event.action_window_ends_at
          )
          or exists (
            select 1
            from appointment_aggregates appointment
            where appointment.workspace_id = $1
              and appointment.event_id = pair.event_id
              and appointment.relationship_pair_id = pair.relationship_pair_id
              and appointment.status <> 'cancelled'
              and appointment.created_at >= pair.accepted_at
              and appointment.created_at <= event.action_window_ends_at
              and exists (
                select 1
                from event_ops_relationship_sides appointment_side
                where appointment_side.workspace_id = $1
                  and appointment_side.relationship_pair_id =
                    pair.relationship_pair_id
                  and appointment_side.owner_actor_id =
                    appointment.owner_actor_id
                  and appointment_side.other_actor_id =
                    appointment.invitee_actor_id
              )
          )
        )
    )
  order by event.scheduled_at, event.event_id
`;

export async function readCanonicalPostEventReminderIntents(input: {
  actorId: string;
  now: string;
  runtime: EventOperationsPostgresRuntime;
}): Promise<readonly CanonicalPostEventReminderIntent[]> {
  const actorId = required(input.actorId, "actorId");
  const now = timestamp(input.now, "now");
  const result = await input.runtime.client.query<Row>(
    READ_CANONICAL_POST_EVENT_REMINDERS_SQL,
    [input.runtime.workspaceId, actorId, now],
  );
  return result.rows.map((row) => {
    const eventId = required(String(row.event_id ?? ""), "eventId");
    const materialRevision = required(
      String(row.material_revision ?? ""),
      "materialRevision",
    );
    const scheduledFor = nextLocalMorningAtEight({
      eventEndsAt: timestamp(row.ends_at, "eventEndsAt"),
      timeZone: required(String(row.timezone ?? ""), "timeZone"),
    });
    if (scheduledFor !== timestamp(row.scheduled_at, "scheduledAt")) {
      throw new Error(
        "Canonical post-event reminder database and runtime schedules disagree.",
      );
    }
    return {
      eventId,
      eventVersion: positiveInteger(row.event_version, "eventVersion"),
      materialRevision,
      scheduledFor,
      sourceRef: {
        id: eventId,
        label: "Canonical post-event follow-up",
        type: "event_import",
      },
    };
  });
}

export async function materializeCanonicalPostEventReminderIntents(input: {
  actorId: string;
  intents: readonly CanonicalPostEventReminderIntent[];
  materializer: CanonicalPostEventReminderIntentMaterializer;
}): Promise<{ created: number; skipped: number }> {
  const actorId = required(input.actorId, "actorId");
  let created = 0;
  let skipped = 0;
  for (const intent of input.intents) {
    const result = await input.materializer.materialize({ actorId, intent });
    if (result.created) created += 1;
    else skipped += 1;
  }
  return { created, skipped };
}
