import type { LiveDatabaseEnv } from "../../../../shared/storage/live-database-config";
import { createConfiguredPostgresLiveRecordStore } from "../../../../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../../../../shared/storage/live-record-store";
import {
  createGeneratedEventAttendeeRosterProvider,
} from "../../attendee-roster/storage/generated-attendee-roster-live-record-provider";
import type {
  EventAttendeeRosterPayload,
  EventAttendeeRosterRecord,
  EventAttendeeTagCode,
} from "../../attendee-roster/contract";
import type {
  EventGoalFocus,
  EventGoalReadinessEvent,
  EventGoalReadinessPayload,
  EventGoalReadinessSourceReference,
  EventGoalRecord,
  EventGoalSetPayload,
  EventGoalSuggestion,
  EventPreparationState,
  EventReadinessChecklistItem,
} from "../contract";
import {
  createEventCapabilityRecordProvider,
  EVENT_WORK_RECORD_COLLECTIONS,
  type EventCapabilityRecordProvider,
} from "../../storage/event-work-record-provider";

export interface GeneratedEventGoalReadinessProviderOptions {
  now?: () => string;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredGeneratedEventGoalReadinessProviderOptions {
  env?: LiveDatabaseEnv;
  now?: () => string;
  sourceLabel?: string;
}

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );
}

function sourceFor(input: {
  eventId: string;
  label: string;
  providerRecordId: string;
  sourceId: string;
}): EventGoalReadinessSourceReference {
  return {
    type: "event_import",
    id: input.sourceId,
    label: input.label,
    eventId: input.eventId,
    providerRecordId: input.providerRecordId,
    generatedBy: "mock-event-goal-readiness-service",
  };
}

function eventForRoster(roster: EventAttendeeRosterPayload): EventGoalReadinessEvent {
  return {
    id: roster.event.id,
    title: roster.event.name,
    venue: roster.event.venue,
    startsAt: roster.event.startsAt,
    endsAt: roster.event.startsAt,
    source: sourceFor({
      eventId: roster.event.id,
      label: roster.event.source.label,
      providerRecordId: roster.event.id,
      sourceId: roster.event.source.id,
    }),
    calendarProviderRequested: false,
    liveCalendarRequested: false,
    liveDatabaseWriteExecuted: false,
  };
}

function attendeesWithTag(
  roster: EventAttendeeRosterPayload,
  code: EventAttendeeTagCode,
): readonly EventAttendeeRosterRecord[] {
  return roster.attendees.filter((attendee) =>
    attendee.attendeeTags.some((tag) => tag.code === code),
  );
}

function evidenceFor(
  attendees: readonly EventAttendeeRosterRecord[],
  fallback: readonly string[],
): readonly string[] {
  const evidenceIds = uniqueStrings(attendees.flatMap((attendee) => attendee.evidenceIds));

  return evidenceIds.length > 0 ? evidenceIds.slice(0, 12) : fallback.slice(0, 12);
}

function suggestedGoal(input: {
  event: EventGoalReadinessEvent;
  evidenceIds: readonly string[];
  focus: EventGoalFocus;
  intent: string;
  label: string;
  rationale: string;
  suggestedPreparation: readonly string[];
}): EventGoalSuggestion {
  return {
    goalId: `goal:live:${input.event.id}:${input.focus}`,
    focus: input.focus,
    label: input.label,
    intent: input.intent,
    rationale: input.rationale,
    suggestedPreparation: input.suggestedPreparation,
    source: {
      ...input.event.source,
      providerRecordId: `goal:live:${input.event.id}:${input.focus}`,
    },
    evidenceIds: input.evidenceIds,
    generatedBy: "mock-goal-rule",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  };
}

function suggestedGoalsFor(
  roster: EventAttendeeRosterPayload,
  event: EventGoalReadinessEvent,
): readonly EventGoalSuggestion[] {
  const fallbackEvidenceIds = roster.provenance.evidenceIds;
  const storagePilotAttendees = attendeesWithTag(roster, "storage_pilot");
  const operatorIntroAttendees = [
    ...attendeesWithTag(roster, "partner_path"),
    ...attendeesWithTag(roster, "known_contact"),
  ];
  const investorAttendees = attendeesWithTag(roster, "investor_context");

  return [
    suggestedGoal({
      event,
      evidenceIds: evidenceFor(storagePilotAttendees, fallbackEvidenceIds),
      focus: "storage_pilot",
      label: "Find live pilot partners",
      intent:
        "Find two AI workflow PoC or restaurant CRM pilot partners from generated attendees.",
      rationale:
        "Generated attendee intents include PoC, workflow, pilot, and CRM signals.",
      suggestedPreparation: [
        "Review eligible attendees tagged as pilot opportunities.",
        "Prepare one question about current CRM or workflow bottlenecks.",
        "Keep evidence ids attached before drafting any follow-up.",
      ],
    }),
    suggestedGoal({
      event,
      evidenceIds: evidenceFor(operatorIntroAttendees, fallbackEvidenceIds),
      focus: "operator_intros",
      label: "Map warm operator paths",
      intent:
        "Identify warm operator introduction paths among known contacts and partner-channel attendees.",
      rationale:
        "Generated roster tags include known-contact and partner-path signals.",
      suggestedPreparation: [
        "Review the known-contact subset before approaching new attendees.",
        "Pick one partner-path attendee as the secondary route.",
        "Avoid creating contacts until the post-event review confirms them.",
      ],
    }),
    suggestedGoal({
      event,
      evidenceIds: evidenceFor(investorAttendees, fallbackEvidenceIds),
      focus: "investor_context",
      label: "Capture investor context",
      intent:
        "Collect investor-context feedback on the strongest generated relationship opportunities.",
      rationale:
        "Generated relationship records include investor, seed, or founder feedback context.",
      suggestedPreparation: [
        "Review investor-context attendees and related evidence.",
        "Prepare one question about pilot qualification criteria.",
        "Keep investment context as relationship notes, not outbound claims.",
      ],
    }),
  ];
}

function defaultGoal(input: {
  collectedAt: string;
  event: EventGoalReadinessEvent;
  suggestion: EventGoalSuggestion;
}): EventGoalRecord {
  return {
    goalId: `goal:live:${input.event.id}`,
    eventId: input.event.id,
    intent: input.suggestion.intent,
    selectedSuggestionId: input.suggestion.goalId,
    priority: "primary",
    source: input.suggestion.source,
    evidenceIds: input.suggestion.evidenceIds,
    createdAt: input.collectedAt,
    updatedAt: input.collectedAt,
    generatedBy: "mock-goal-rule",
    aiProviderRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
  };
}

function checklistItem(input: {
  event: EventGoalReadinessEvent;
  evidenceIds: readonly string[];
  itemId: string;
  label: string;
  rationale: string;
  status: EventReadinessChecklistItem["status"];
}): EventReadinessChecklistItem {
  return {
    itemId: input.itemId,
    label: input.label,
    status: input.status,
    owner: "operator",
    rationale: input.rationale,
    evidenceIds: input.evidenceIds,
    source: {
      ...input.event.source,
      providerRecordId: input.itemId,
    },
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    liveDatabaseWriteExecuted: false,
  };
}

function readinessChecklistFor(input: {
  event: EventGoalReadinessEvent;
  goal: EventGoalRecord | null;
  roster: EventAttendeeRosterPayload;
}): readonly EventReadinessChecklistItem[] {
  const knownAttendees = input.roster.attendees.filter(
    (attendee) => attendee.knownContactMarker.isKnownContact,
  );
  const eligibleAttendees = input.roster.eligibleRecommendationPool;
  const evidenceIds = input.roster.provenance.evidenceIds.slice(0, 12);

  return [
    checklistItem({
      event: input.event,
      evidenceIds,
      itemId: `checklist:live:${input.event.id}:review-intents`,
      label: "Review generated attendee intents",
      rationale: `${input.roster.attendees.length} generated attendee records are available for goal planning.`,
      status: input.roster.attendees.length > 0 ? "ready" : "pending",
    }),
    checklistItem({
      event: input.event,
      evidenceIds: evidenceFor(knownAttendees, evidenceIds),
      itemId: `checklist:live:${input.event.id}:known-paths`,
      label: "Check known-contact paths first",
      rationale: `${knownAttendees.length} generated attendees already map to known contacts.`,
      status: knownAttendees.length > 0 ? "ready" : "pending",
    }),
    checklistItem({
      event: input.event,
      evidenceIds: uniqueStrings(
        eligibleAttendees.flatMap((candidate) => candidate.evidenceIds),
      ).slice(0, 12),
      itemId: `checklist:live:${input.event.id}:eligible-pool`,
      label: "Review eligible recommendation pool",
      rationale: `${eligibleAttendees.length} attendees are eligible for follow-up review.`,
      status: eligibleAttendees.length > 0 ? "ready" : "pending",
    }),
    checklistItem({
      event: input.event,
      evidenceIds: input.goal?.evidenceIds ?? evidenceIds,
      itemId: `checklist:live:${input.event.id}:confirm-goal`,
      label: "Confirm the primary event goal",
      rationale: input.goal
        ? "A source-backed goal is ready for operator review."
        : "No event goal has been selected yet.",
      status: input.goal ? "ready" : "pending",
    }),
  ];
}

function preparationStateFor(input: {
  event: EventGoalReadinessEvent;
  goal: EventGoalRecord | null;
  roster: EventAttendeeRosterPayload;
}): EventPreparationState {
  const knownCount = input.roster.attendees.filter(
    (attendee) => attendee.knownContactMarker.isKnownContact,
  ).length;
  const score = Math.min(
    95,
    45 +
      Math.min(25, input.roster.eligibleRecommendationPool.length) +
      Math.min(15, knownCount) +
      (input.goal ? 10 : 0),
  );

  return {
    readinessScore: score,
    relationshipBriefStatus: input.roster.attendees.length > 0 ? "ready" : "pending",
    calendarConflictCheck: {
      hasConflict: false,
      checkedWindow: `${input.event.startsAt}/${input.event.endsAt}`,
      checkedBy: "mock-calendar-rule",
      rationale:
        "The generated live readiness provider does not request a live calendar.",
      liveCalendarRequested: false,
      calendarProviderRequested: false,
      externalNetworkRequested: false,
    },
    preEventBriefReady: score >= 70,
    nextPreparationStep: input.goal
      ? "Review the generated attendee evidence attached to the primary goal."
      : "Select one generated goal before preparing a pre-event brief.",
    source: input.event.source,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function payloadFor(input: {
  collectedAt: string;
  providerSource: string;
  providerSourceLabel: string;
  roster: EventAttendeeRosterPayload;
}): EventGoalReadinessPayload {
  const event = eventForRoster(input.roster);
  const suggestedGoals = suggestedGoalsFor(input.roster, event);
  const primarySuggestion =
    suggestedGoals.find((goal) => goal.focus === "storage_pilot") ??
    suggestedGoals[0] ??
    null;
  const goal = primarySuggestion
    ? defaultGoal({
        collectedAt: input.collectedAt,
        event,
        suggestion: primarySuggestion,
      })
    : null;
  const readinessChecklist = readinessChecklistFor({
    event,
    goal,
    roster: input.roster,
  });
  const preparationState = preparationStateFor({
    event,
    goal,
    roster: input.roster,
  });
  const evidenceIds = uniqueStrings([
    ...input.roster.provenance.evidenceIds,
    ...suggestedGoals.flatMap((suggestion) => suggestion.evidenceIds),
    ...(goal?.evidenceIds ?? []),
  ]);

  return {
    state: input.roster.attendees.length > 0 ? "success" : "empty",
    event,
    goal,
    suggestedGoals,
    readinessChecklist,
    preparationState,
    summary:
      input.roster.attendees.length > 0
        ? "Generated live attendee context was mapped into event goal readiness."
        : "No generated live attendees are available for event goal readiness.",
    provenance: {
      source: input.providerSource,
      sourceLabel: input.providerSourceLabel,
      evidenceIds,
      collectedAt: input.collectedAt,
      privacy: "demo-event-goal-readiness-only",
      generationMethod: "live-store-query",
      aiProviderRequested: false,
      calendarProviderRequested: false,
      liveCalendarRequested: false,
      liveDatabaseWriteExecuted: false,
      externalNetworkRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
    },
    nextAction:
      input.roster.attendees.length > 0
        ? "Review the generated goal and readiness checklist before the event."
        : "Verify generated attendee records before setting an event goal.",
  };
}

export function createGeneratedEventGoalReadinessProvider({
  now = () => new Date().toISOString(),
  source,
  sourceLabel = "Generated event goal readiness shared live storage",
  store,
  workspaceId,
}: GeneratedEventGoalReadinessProviderOptions): EventCapabilityRecordProvider<
  EventGoalReadinessPayload | EventGoalSetPayload
> {
  const providerSource = source ?? `live-record-store:event-goal-readiness:${workspaceId}`;
  const workRecordProvider = createEventCapabilityRecordProvider<
    EventGoalReadinessPayload | EventGoalSetPayload
  >({
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.goalReadiness,
    now,
    source: providerSource,
    sourceLabel,
    store,
    workspaceId,
  });
  const attendeeRosterProvider = createGeneratedEventAttendeeRosterProvider({
    now,
    store,
    workspaceId,
  });

  return {
    source: providerSource,
    sourceLabel,
    async getPayload(eventId) {
      const storedPayload = await workRecordProvider.getPayload(eventId);

      if (storedPayload) {
        return clonePayload(storedPayload);
      }

      const roster = await attendeeRosterProvider.getPayload(eventId);

      if (!roster) {
        return null;
      }

      return clonePayload(
        payloadFor({
          collectedAt: now(),
          providerSource,
          providerSourceLabel: sourceLabel,
          roster,
        }),
      );
    },
    upsertPayload: workRecordProvider.upsertPayload,
  };
}

export function createConfiguredGeneratedEventGoalReadinessProvider({
  env,
  now,
  sourceLabel = "Generated event goal readiness Postgres live storage",
}: ConfiguredGeneratedEventGoalReadinessProviderOptions = {}): EventCapabilityRecordProvider<
  EventGoalReadinessPayload | EventGoalSetPayload
> | null {
  const configured = createConfiguredPostgresLiveRecordStore<
    Record<string, unknown>
  >({ env });

  if (!configured) {
    return null;
  }

  return createGeneratedEventGoalReadinessProvider({
    now,
    source: `postgres-live-record-store:event-goal-readiness:${configured.workspaceId}`,
    sourceLabel,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
}
