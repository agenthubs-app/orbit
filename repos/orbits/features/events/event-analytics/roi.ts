import { createHash } from "node:crypto";

import type {
  EventAnalyticsRoiMetrics,
  EventAnalyticsRoiSourceWatermark,
} from "./contract";

type Row = Record<string, unknown>;

export const EVENT_ANALYTICS_ROI_METRIC_VERSION = "event-roi-v1";
export const EVENT_ANALYTICS_ROI_FORMULA = [
  "window=event_ends_at+7d",
  "mutual_connection_participation=distinct checked-in actors in accepted relationship pairs where both relationship sides checked in / distinct event check-ins",
  "strong_agent_action=completed save_message_draft or create_followup_reminder receipt joined by actionId+operationId to an operation with exact eventId+relationshipPairId+sourceActionId; receipt.updated_at is authoritative",
  "strong_human_encounter=canonical human_encounters record joined by owner actor+contact+event to a relationship side",
  "strong_appointment=non-cancelled appointment with exact eventId+relationshipPairId and matching relationship actors",
  "effective_connection=accepted relationship pair+both sides checked in+at least one strong action after accepted_at and by window end",
  "attribution_coverage=strongly attributed eligible agent operations / eligible agent operations declaring the exact eventId",
  "payload_eventOrigin.attributedAt=optional metadata ignored for metric time",
  "zero_denominator=null",
].join("\n");
export const EVENT_ANALYTICS_ROI_FORMULA_HASH = createHash("sha256")
  .update(EVENT_ANALYTICS_ROI_FORMULA)
  .digest("hex");

function nonNegativeInteger(row: Row, field: string): number {
  const parsed = Number(row[field]);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Event analytics ROI SQL row has an invalid ${field}.`);
  }
  return parsed;
}

function timestamp(row: Row, field: string): string {
  const value = row[field];
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Event analytics ROI SQL row has an invalid ${field}.`);
  }
  return new Date(parsed).toISOString();
}

function optionalTimestamp(row: Row, field: string): string | null {
  return row[field] === null || row[field] === undefined
    ? null
    : timestamp(row, field);
}

function rate(numerator: number, denominator: number) {
  return {
    denominator,
    numerator,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

export interface EventAnalyticsLiveRoiRead {
  eventEndsAt: string;
  metrics: EventAnalyticsRoiMetrics;
  sourceWatermark: EventAnalyticsRoiSourceWatermark;
  windowEndsAt: string;
}

export function eventAnalyticsLiveRoiFromRow(row: Row): EventAnalyticsLiveRoiRead {
  const checkIns = nonNegativeInteger(row, "roi_distinct_checkins");
  const connectedCheckIns = nonNegativeInteger(
    row,
    "roi_distinct_connected_checkins",
  );
  const declaredOperations = nonNegativeInteger(
    row,
    "roi_declared_completed_operations",
  );
  const stronglyAttributedOperations = nonNegativeInteger(
    row,
    "roi_strongly_attributed_completed_operations",
  );
  const effectiveConnectionParticipants = nonNegativeInteger(
    row,
    "roi_effective_connection_participants",
  );

  return {
    eventEndsAt: timestamp(row, "roi_event_ends_at"),
    metrics: {
      attributionCoverage: {
        declaredCompletedOperations: declaredOperations,
        stronglyAttributedCompletedOperations: stronglyAttributedOperations,
        rate: rate(stronglyAttributedOperations, declaredOperations),
      },
      checkedInParticipants: checkIns,
      completedAttributedAgentOperations: stronglyAttributedOperations,
      effectiveConnectionPairs: nonNegativeInteger(
        row,
        "roi_effective_connection_pairs",
      ),
      effectiveConnectionParticipants,
      effectiveConnectionRate: rate(
        effectiveConnectionParticipants,
        checkIns,
      ),
      mutualConnections: {
        acceptedRelationshipPairs: nonNegativeInteger(
          row,
          "roi_accepted_relationship_pairs",
        ),
        mutuallyCheckedInPairs: nonNegativeInteger(
          row,
          "roi_mutually_checked_in_pairs",
        ),
        distinctConnectedCheckIns: connectedCheckIns,
        participationRate: rate(connectedCheckIns, checkIns),
      },
      strongActions: {
        appointments: nonNegativeInteger(
          row,
          "roi_strong_action_appointments",
        ),
        followupReminders: nonNegativeInteger(
          row,
          "roi_strong_action_followup_reminders",
        ),
        humanEncounterNotes: nonNegativeInteger(
          row,
          "roi_strong_action_human_encounter_notes",
        ),
        messageDrafts: nonNegativeInteger(
          row,
          "roi_strong_action_message_drafts",
        ),
      },
    },
    sourceWatermark: {
      appointmentCount: nonNegativeInteger(row, "roi_appointment_count"),
      appointmentUpdatedAt: optionalTimestamp(
        row,
        "roi_appointment_updated_at",
      ),
      checkInCount: nonNegativeInteger(row, "roi_checkin_count"),
      checkInRevision: nonNegativeInteger(row, "roi_checkin_revision"),
      completedAgentReceiptCount: nonNegativeInteger(
        row,
        "roi_completed_agent_receipt_count",
      ),
      completedAgentReceiptUpdatedAt: optionalTimestamp(
        row,
        "roi_completed_agent_receipt_updated_at",
      ),
      configurationVersion: nonNegativeInteger(
        row,
        "roi_configuration_version",
      ),
      membershipCount: nonNegativeInteger(row, "roi_membership_count"),
      membershipRevision: nonNegativeInteger(row, "roi_membership_revision"),
      relationshipPairCount: nonNegativeInteger(
        row,
        "roi_relationship_pair_count",
      ),
      relationshipAcceptedAt: optionalTimestamp(
        row,
        "roi_relationship_accepted_at",
      ),
    },
    windowEndsAt: timestamp(row, "roi_window_ends_at"),
  };
}

/**
 * Reads only aggregate evidence. `declared_completed_operations` deliberately
 * excludes operations without an exact eventOrigin.eventId: assigning those to
 * an event would be inference, not attribution.
 */
export const EVENT_ANALYTICS_ROI_SQL = `
  with event_configuration as (
    select
      configuration.configuration_version,
      configuration.event_ends_at,
      configuration.event_ends_at + interval '7 days' as window_ends_at
    from event_ops_configuration_heads head
    join event_ops_configurations configuration
      on configuration.workspace_id = head.workspace_id
      and configuration.event_id = head.event_id
      and configuration.configuration_version = head.configuration_version
    where head.workspace_id = $1 and head.event_id = $2
  ),
  accepted_pairs as (
    select pair.relationship_pair_id, pair.accepted_at
    from event_ops_relationship_pairs pair
    where pair.workspace_id = $1 and pair.event_id = $2
  ),
  mutual_pairs as (
    select pair.relationship_pair_id, pair.accepted_at
    from accepted_pairs pair
    join event_ops_relationship_sides side
      on side.workspace_id = $1
      and side.relationship_pair_id = pair.relationship_pair_id
    left join event_ops_checkins check_in
      on check_in.workspace_id = side.workspace_id
      and check_in.event_id = $2
      and check_in.actor_id = side.owner_actor_id
    group by pair.relationship_pair_id, pair.accepted_at
    having count(distinct side.owner_actor_id) = 2
      and count(distinct check_in.actor_id) = 2
  ),
  connected_checkins as (
    select distinct side.owner_actor_id
    from mutual_pairs pair
    join event_ops_relationship_sides side
      on side.workspace_id = $1
      and side.relationship_pair_id = pair.relationship_pair_id
  ),
  completed_operations as (
    select
      operation.value as operation,
      receipt.updated_at as receipt_updated_at
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
    ) as operation(value)
    cross join event_configuration configuration
    where receipt.workspace_id = $1
      and receipt.collection_name = 'agentExecutionReceipts'
      and receipt.lifecycle_state = 'active'
      and receipt.payload #>> '{entity,status}' = 'completed'
      and operation.value ->> 'operationId' =
        receipt.payload #>> '{entity,operationId}'
      and receipt.updated_at <= configuration.window_ends_at
  ),
  declared_operations as (
    select operation, receipt_updated_at
    from completed_operations
    where operation ->> 'operationType' in (
        'save_message_draft',
        'create_followup_reminder'
      )
      and jsonb_typeof(operation #> '{payload,eventOrigin}') = 'object'
      and operation #>> '{payload,eventOrigin,eventId}' = $2
  ),
  strong_operations as (
    select
      declared.operation,
      pair.relationship_pair_id,
      declared.receipt_updated_at
    from declared_operations declared
    join accepted_pairs pair
      on pair.relationship_pair_id =
        declared.operation #>> '{payload,eventOrigin,relationshipPairId}'
    where nullif(btrim(declared.operation #>> '{payload,eventOrigin,sourceActionId}'), '')
        is not null
      and declared.receipt_updated_at >= pair.accepted_at
  ),
  mutual_agent_actions as (
    select
      operation ->> 'operationType' as operation_type,
      pair.relationship_pair_id,
      operation ->> 'operationId' as strong_action_id
    from strong_operations action
    join mutual_pairs pair
      on pair.relationship_pair_id = action.relationship_pair_id
  ),
  mutual_encounter_actions as (
    select distinct
      pair.relationship_pair_id,
      encounter.record_id as strong_action_id
    from mutual_pairs pair
    join event_ops_relationship_sides side
      on side.workspace_id = $1
      and side.relationship_pair_id = pair.relationship_pair_id
    join orbit_records encounter
      on encounter.workspace_id = side.workspace_id
      and encounter.collection_name = 'human_encounters'
      and encounter.lifecycle_state = 'active'
      and encounter.user_id = side.owner_actor_id
      and encounter.target_type = 'contact'
      and encounter.target_id = side.contact_id
      and encounter.payload ->> 'actorId' = side.owner_actor_id
      and encounter.payload ->> 'contactId' = side.contact_id
      and encounter.payload ->> 'eventId' = $2
    cross join event_configuration configuration
    where encounter.occurred_at >= pair.accepted_at
      and encounter.occurred_at <= configuration.window_ends_at
  ),
  mutual_appointment_actions as (
    select
      pair.relationship_pair_id,
      appointment.appointment_id as strong_action_id
    from mutual_pairs pair
    join appointment_aggregates appointment
      on appointment.workspace_id = $1
      and appointment.event_id = $2
      and appointment.relationship_pair_id = pair.relationship_pair_id
      and appointment.status <> 'cancelled'
      and appointment.created_at >= pair.accepted_at
    cross join event_configuration configuration
    where appointment.created_at <= configuration.window_ends_at
      and exists (
        select 1
        from event_ops_relationship_sides side
        where side.workspace_id = $1
          and side.relationship_pair_id = pair.relationship_pair_id
          and side.owner_actor_id = appointment.owner_actor_id
          and side.other_actor_id = appointment.invitee_actor_id
      )
  ),
  effective_action_pairs as (
    select relationship_pair_id from mutual_agent_actions
    union
    select relationship_pair_id from mutual_encounter_actions
    union
    select relationship_pair_id from mutual_appointment_actions
  ),
  effective_pairs as (
    select distinct relationship_pair_id from effective_action_pairs
  ),
  effective_participants as (
    select distinct side.owner_actor_id
    from effective_pairs pair
    join event_ops_relationship_sides side
      on side.workspace_id = $1
      and side.relationship_pair_id = pair.relationship_pair_id
  )
  select
    configuration.event_ends_at as roi_event_ends_at,
    configuration.window_ends_at as roi_window_ends_at,
    configuration.configuration_version::text as roi_configuration_version,
    (select count(*) from accepted_pairs)::text
      as roi_accepted_relationship_pairs,
    (select count(*) from mutual_pairs)::text
      as roi_mutually_checked_in_pairs,
    (select count(*) from connected_checkins)::text
      as roi_distinct_connected_checkins,
    (
      select count(distinct check_in.actor_id)
      from event_ops_checkins check_in
      where check_in.workspace_id = $1 and check_in.event_id = $2
    )::text as roi_distinct_checkins,
    (select count(*) from declared_operations)::text
      as roi_declared_completed_operations,
    (select count(*) from strong_operations)::text
      as roi_strongly_attributed_completed_operations,
    (select count(*) from effective_pairs)::text
      as roi_effective_connection_pairs,
    (select count(*) from effective_participants)::text
      as roi_effective_connection_participants,
    (select count(*) from mutual_encounter_actions)::text
      as roi_strong_action_human_encounter_notes,
    (
      select count(*) from mutual_agent_actions
      where operation_type = 'save_message_draft'
    )::text as roi_strong_action_message_drafts,
    (
      select count(*) from mutual_agent_actions
      where operation_type = 'create_followup_reminder'
    )::text as roi_strong_action_followup_reminders,
    (select count(*) from mutual_appointment_actions)::text
      as roi_strong_action_appointments,
    coalesce((
      select max(membership.revision)
      from event_ops_membership_heads membership
      where membership.workspace_id = $1 and membership.event_id = $2
    ), 0)::text as roi_membership_revision,
    (
      select count(*)
      from event_ops_membership_heads membership
      where membership.workspace_id = $1 and membership.event_id = $2
    )::text as roi_membership_count,
    coalesce((
      select max(check_in.revision)
      from event_ops_checkins check_in
      where check_in.workspace_id = $1 and check_in.event_id = $2
    ), 0)::text as roi_checkin_revision,
    (
      select count(*)
      from event_ops_checkins check_in
      where check_in.workspace_id = $1 and check_in.event_id = $2
    )::text as roi_checkin_count,
    (select count(*) from accepted_pairs)::text as roi_relationship_pair_count,
    (
      select max(pair.accepted_at)
      from event_ops_relationship_pairs pair
      where pair.workspace_id = $1 and pair.event_id = $2
    ) as roi_relationship_accepted_at,
    (
      select max(appointment.updated_at)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and appointment.updated_at <= configuration.window_ends_at
    ) as roi_appointment_updated_at,
    (
      select count(*)
      from appointment_aggregates appointment
      where appointment.workspace_id = $1
        and appointment.event_id = $2
        and appointment.updated_at <= configuration.window_ends_at
    )::text as roi_appointment_count,
    (select max(receipt_updated_at) from declared_operations)
      as roi_completed_agent_receipt_updated_at,
    (select count(*) from declared_operations)::text
      as roi_completed_agent_receipt_count
  from event_configuration configuration
`;
