import type { LiveDatabaseEnv } from "../../../../shared/storage/live-database-config";
import { createConfiguredPostgresLiveRecordStore } from "../../../../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../../../../shared/storage/live-record-store";
import {
  createGeneratedEventAttendeeRosterProvider,
} from "../../attendee-roster/storage/generated-attendee-roster-live-record-provider";
import type {
  EventAttendeeRosterPayload,
  EventAttendeeRosterRecord,
} from "../../attendee-roster/contract";
import {
  createEventCapabilityRecordProvider,
  EVENT_WORK_RECORD_COLLECTIONS,
  type EventCapabilityRecordProvider,
} from "../../storage/event-work-record-provider";
import type {
  WantConnectEventSummary,
  WantConnectMatchesPayload,
  WantConnectMatchNotice,
  WantConnectMutualInterest,
  WantConnectParticipant,
  WantConnectPayload,
  WantConnectSourceReference,
} from "../contract";

export interface GeneratedWantConnectProviderOptions {
  now?: () => string;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredGeneratedWantConnectProviderOptions {
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

function selectedTarget(
  roster: EventAttendeeRosterPayload,
): EventAttendeeRosterRecord | null {
  return (
    roster.attendees.find(
      (attendee) => attendee.knownContactMarker.contactId !== null,
    ) ??
    roster.attendees[0] ??
    null
  );
}

function contactIdFor(attendee: EventAttendeeRosterRecord): string {
  return attendee.knownContactMarker.contactId ?? `contact:generated:${attendee.attendeeId}`;
}

function sourceFor(input: {
  contactId?: string;
  eventId: string;
  label: string;
  sourceId: string;
}): WantConnectSourceReference {
  return {
    type: "event_import",
    id: input.sourceId,
    label: input.label,
    eventId: input.eventId,
    contactId: input.contactId,
    generatedBy: "mock-want-connect-service",
  };
}

function eventForRoster(roster: EventAttendeeRosterPayload): WantConnectEventSummary {
  return {
    id: roster.event.id,
    name: roster.event.name,
    venue: roster.event.venue,
    startsAt: roster.event.startsAt,
    source: sourceFor({
      eventId: roster.event.id,
      label: roster.event.source.label,
      sourceId: roster.event.source.id,
    }),
    realtimePresenceRequested: false,
    liveDatabaseWriteExecuted: false,
  };
}

function operatorParticipantFor(input: {
  event: WantConnectEventSummary;
  targetName: string;
}): WantConnectParticipant {
  return {
    contactId: "contact:operator",
    displayName: "Orbit operator",
    organization: "Orbit workspace",
    role: "Relationship manager",
    onSiteContext: `The operator wants an in-room introduction to ${input.targetName}.`,
    source: sourceFor({
      contactId: "contact:operator",
      eventId: input.event.id,
      label: "Generated live want-connect operator intent",
      sourceId: `source:want-connect:operator:${input.event.id}`,
    }),
    evidenceIds: [`evidence:want-connect:operator:${input.event.id}`],
    realtimePresenceRequested: false,
    peerNotificationDelivered: false,
    externalMessageSent: false,
  };
}

function targetParticipantFor(input: {
  attendee: EventAttendeeRosterRecord;
  contactId: string;
  event: WantConnectEventSummary;
}): WantConnectParticipant {
  return {
    contactId: input.contactId,
    displayName: input.attendee.displayName,
    organization: input.attendee.organization,
    role: input.attendee.role,
    onSiteContext: input.attendee.relationshipContext,
    source: sourceFor({
      contactId: input.contactId,
      eventId: input.event.id,
      label: input.attendee.source.label,
      sourceId: input.attendee.source.id,
    }),
    evidenceIds: input.attendee.evidenceIds,
    realtimePresenceRequested: false,
    peerNotificationDelivered: false,
    externalMessageSent: false,
  };
}

function mutualInterestFor(input: {
  evidenceIds: readonly string[];
  targetName: string;
}): WantConnectMutualInterest {
  return {
    state: "mutual",
    actorWantsToConnect: true,
    targetWantsToConnect: true,
    rule: `generated attendee context marks ${input.targetName} as an on-site introduction candidate`,
    evidenceIds: input.evidenceIds,
    realtimePresenceRequested: false,
    peerNotificationDelivered: false,
    externalMessageSent: false,
  };
}

function emptyMutualInterestFor(eventId: string): WantConnectMutualInterest {
  return {
    state: "none",
    actorWantsToConnect: false,
    targetWantsToConnect: false,
    rule: "generated attendee context has no on-site introduction candidate",
    evidenceIds: [`evidence:want-connect:empty:${eventId}`],
    realtimePresenceRequested: false,
    peerNotificationDelivered: false,
    externalMessageSent: false,
  };
}

function matchNoticeFor(input: {
  eventName: string;
  evidenceIds: readonly string[];
  targetName: string;
}): WantConnectMatchNotice {
  return {
    state: "ready",
    title: "Generated mutual interest ready",
    message: `${input.targetName} is a generated attendee match for ${input.eventName}. Keep the introduction on-site and require confirmation before any external message is sent.`,
    nextAction:
      "Review the on-site introduction context before taking any external action.",
    evidenceIds: input.evidenceIds,
    notificationProviderRequested: false,
    peerNotificationDelivered: false,
    externalMessageSent: false,
  };
}

function payloadFor(input: {
  collectedAt: string;
  providerSource: string;
  providerSourceLabel: string;
  roster: EventAttendeeRosterPayload;
}): WantConnectPayload {
  const event = eventForRoster(input.roster);
  const target = selectedTarget(input.roster);

  if (!target) {
    return {
      state: "empty",
      event,
      participants: [],
      intent: null,
      mutualInterest: emptyMutualInterestFor(event.id),
      matchNotice: null,
      summary:
        "Generated live attendee context has no on-site want-connect candidate.",
      provenance: {
        source: input.providerSource,
        sourceLabel: input.providerSourceLabel,
        evidenceIds: input.roster.provenance.evidenceIds,
        collectedAt: input.collectedAt,
        privacy: "demo-on-site-want-connect-only",
        generationMethod: "live-store-query",
        realtimePresenceRequested: false,
        peerNotificationDelivered: false,
        externalMessageSent: false,
        externalNetworkRequested: false,
        liveDatabaseWriteExecuted: false,
        calendarProviderRequested: false,
        emailProviderRequested: false,
        notificationProviderRequested: false,
        modelProviderRequested: false,
      },
      nextAction: "Wait for a generated attendee candidate before matching.",
    };
  }

  const targetContactId = contactIdFor(target);
  const evidenceIds = uniqueStrings([
    ...input.roster.provenance.evidenceIds,
    ...target.evidenceIds,
    `evidence:want-connect:operator:${event.id}`,
    `evidence:want-connect:mutual:${event.id}:${targetContactId}`,
  ]);
  const targetParticipant = targetParticipantFor({
    attendee: target,
    contactId: targetContactId,
    event,
  });
  const operatorParticipant = operatorParticipantFor({
    event,
    targetName: targetParticipant.displayName,
  });
  const mutualInterest = mutualInterestFor({
    evidenceIds,
    targetName: targetParticipant.displayName,
  });

  return {
    state: "success",
    event,
    participants: [operatorParticipant, targetParticipant],
    intent: null,
    mutualInterest,
    matchNotice: matchNoticeFor({
      eventName: event.name,
      evidenceIds,
      targetName: targetParticipant.displayName,
    }),
    summary:
      "Generated live attendee context is ready for on-site want-connect review.",
    provenance: {
      source: input.providerSource,
      sourceLabel: input.providerSourceLabel,
      evidenceIds,
      collectedAt: input.collectedAt,
      privacy: "demo-on-site-want-connect-only",
      generationMethod: "live-store-query",
      realtimePresenceRequested: false,
      peerNotificationDelivered: false,
      externalMessageSent: false,
      externalNetworkRequested: false,
      liveDatabaseWriteExecuted: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationProviderRequested: false,
      modelProviderRequested: false,
    },
    nextAction:
      "Record the operator intent before showing any external follow-up action.",
  };
}

export function createGeneratedWantConnectProvider({
  now = () => new Date().toISOString(),
  source,
  sourceLabel = "Generated want-connect shared live storage",
  store,
  workspaceId,
}: GeneratedWantConnectProviderOptions): EventCapabilityRecordProvider<
  WantConnectPayload | WantConnectMatchesPayload
> {
  const providerSource = source ?? `live-record-store:want-connect:${workspaceId}`;
  const workRecordProvider = createEventCapabilityRecordProvider<
    WantConnectPayload | WantConnectMatchesPayload
  >({
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.wantConnect,
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

export function createConfiguredGeneratedWantConnectProvider({
  env,
  now,
  sourceLabel = "Generated want-connect Postgres live storage",
}: ConfiguredGeneratedWantConnectProviderOptions = {}): EventCapabilityRecordProvider<
  WantConnectPayload | WantConnectMatchesPayload
> | null {
  const configured = createConfiguredPostgresLiveRecordStore<
    Record<string, unknown>
  >({ env });

  if (!configured) {
    return null;
  }

  return createGeneratedWantConnectProvider({
    now,
    source: `postgres-live-record-store:want-connect:${configured.workspaceId}`,
    sourceLabel,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
}
