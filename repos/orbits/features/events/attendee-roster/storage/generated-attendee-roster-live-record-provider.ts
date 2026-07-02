import type {
  ConnectionDTO,
  ContactDTO,
  EventDTO,
  EventParticipantIntentDTO,
  MatchRecommendationDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../../../shared/domain/contracts";
import {
  isMatchRecommendationType,
  isPreferredLanguage,
  isRelationshipStage,
  isRelationshipTrustLevel,
  isRelationshipValueType,
  isSourceType,
} from "../../../../shared/domain/source-types";
import type { LiveDatabaseEnv } from "../../../../shared/storage/live-database-config";
import { createConfiguredPostgresLiveRecordStore } from "../../../../shared/storage/configured-live-record-store";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../../shared/storage/live-record-store";
import type {
  EventAttendeeEventSummary,
  EventAttendeeKnownContactMarker,
  EventAttendeeRecommendationCandidate,
  EventAttendeeRecommendationEligibility,
  EventAttendeeRosterImportPayload,
  EventAttendeeRosterPayload,
  EventAttendeeRosterRecord,
  EventAttendeeSourceReference,
  EventAttendeeTag,
  EventAttendeeTagCode,
} from "../contract";
import {
  createEventCapabilityRecordProvider,
  EVENT_WORK_RECORD_COLLECTIONS,
  type EventCapabilityRecordProvider,
} from "../../storage/event-work-record-provider";

export const GENERATED_ATTENDEE_ROSTER_LIVE_RECORD_COLLECTIONS = {
  attendees: "attendees",
  connections: "connections",
  contacts: "contacts",
  eventParticipantIntents: "eventParticipantIntents",
  events: "events",
  evidence: "evidence",
  matchRecommendations: "matchRecommendations",
  networkPeople: "networkPeople",
} as const;

export interface GeneratedEventAttendeeRosterProviderOptions {
  now?: () => string;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredGeneratedEventAttendeeRosterProviderOptions {
  env?: LiveDatabaseEnv;
  now?: () => string;
  sourceLabel?: string;
}

interface GeneratedAttendeeRecordDTO {
  id: string;
  eventId: string;
  personId?: string;
  contactId?: string;
  displayName: string;
  organization?: string;
  role?: string;
  status: string;
  source: EventDTO["source"];
  evidenceIds: readonly [string, ...string[]];
  createdAt: string;
  updatedAt: string;
}

interface GeneratedEventAttendeeRosterGraph {
  attendees: readonly GeneratedAttendeeRecordDTO[];
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  event: EventDTO;
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  intents: readonly EventParticipantIntentDTO[];
  networkPeople: readonly NetworkPersonDTO[];
  recommendations: readonly MatchRecommendationDTO[];
}

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => nonEmptyString(item))
    : [];
}

function evidenceIds(value: unknown): readonly [string, ...string[]] | null {
  const ids = stringArray(value);

  return ids.length > 0 ? [ids[0], ...ids.slice(1)] : null;
}

function sourceReference(
  value: unknown,
): EventDTO["source"] | ContactDTO["source"] | ConnectionDTO["source"] | null {
  if (!isRecord(value) || !isSourceType(value.type) || !nonEmptyString(value.id)) {
    return null;
  }

  return {
    type: value.type,
    id: value.id,
    label: optionalString(value.label),
  };
}

function eventFromRecord(
  record: LiveRecord<Record<string, unknown>> | null,
): EventDTO | null {
  if (!record) {
    return null;
  }

  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.name) ||
    !nonEmptyString(payload.startsAt) ||
    !source ||
    !ids
  ) {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name,
    location: optionalString(payload.location),
    startsAt: payload.startsAt,
    endsAt: optionalString(payload.endsAt),
    source,
    evidenceIds: ids,
  };
}

function attendeeFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): GeneratedAttendeeRecordDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.eventId) ||
    !nonEmptyString(payload.displayName) ||
    !nonEmptyString(payload.status) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    eventId: payload.eventId,
    personId: optionalString(payload.personId),
    contactId: optionalString(payload.contactId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    status: payload.status,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function contactFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ContactDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.displayName) ||
    !isRelationshipStage(payload.stage) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    personId: optionalString(payload.personId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    location: optionalString(payload.location),
    primaryEmail: optionalString(payload.primaryEmail),
    primaryPhone: optionalString(payload.primaryPhone),
    profileSnippet: optionalString(payload.profileSnippet),
    stage: payload.stage,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function connectionFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ConnectionDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);
  const valueTypes = stringArray(payload.valueTypes).filter(isRelationshipValueType);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.accountId) ||
    !nonEmptyString(payload.contactId) ||
    !isRelationshipStage(payload.stage) ||
    !nonEmptyString(payload.summary) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    accountId: payload.accountId,
    contactId: payload.contactId,
    stage: payload.stage,
    valueTypes,
    summary: payload.summary,
    relationshipStrength:
      typeof payload.relationshipStrength === "number"
        ? payload.relationshipStrength
        : undefined,
    trustLevel: isRelationshipTrustLevel(payload.trustLevel)
      ? payload.trustLevel
      : undefined,
    businessRelevanceScore:
      typeof payload.businessRelevanceScore === "number"
        ? payload.businessRelevanceScore
        : undefined,
    sharedTopics: stringArray(payload.sharedTopics),
    suggestedActions: stringArray(payload.suggestedActions),
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function networkPersonFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): NetworkPersonDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !(payload.personKind === "platform_user" || payload.personKind === "external_contact") ||
    !nonEmptyString(payload.displayName) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    personKind: payload.personKind,
    platformUserId: optionalString(payload.platformUserId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    location: optionalString(payload.location),
    primaryEmail: optionalString(payload.primaryEmail),
    profileSnippet: optionalString(payload.profileSnippet),
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function intentFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): EventParticipantIntentDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.eventId) ||
    !nonEmptyString(payload.attendeeId) ||
    !isPreferredLanguage(payload.preferredLanguage) ||
    typeof payload.confidence !== "number" ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    eventId: payload.eventId,
    attendeeId: payload.attendeeId,
    personId: optionalString(payload.personId),
    contactId: optionalString(payload.contactId),
    lookingFor: stringArray(payload.lookingFor),
    canOffer: stringArray(payload.canOffer),
    preferredLanguage: payload.preferredLanguage,
    confidence: payload.confidence,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function recommendationFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): MatchRecommendationDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.eventId) ||
    !isMatchRecommendationType(payload.recommendationType) ||
    typeof payload.score !== "number" ||
    typeof payload.businessRelevanceScore !== "number" ||
    !nonEmptyString(payload.reason) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    eventId: payload.eventId,
    attendeeId: optionalString(payload.attendeeId),
    targetPersonId: optionalString(payload.targetPersonId),
    contactId: optionalString(payload.contactId),
    connectionId: optionalString(payload.connectionId),
    introducedByPersonId: optionalString(payload.introducedByPersonId),
    recommendationType: payload.recommendationType,
    score: payload.score,
    businessRelevanceScore: payload.businessRelevanceScore,
    sharedTopics: stringArray(payload.sharedTopics),
    suggestedActions: stringArray(payload.suggestedActions),
    reason: payload.reason,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function evidenceFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): RelationshipEvidenceDTO | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !isSourceType(payload.sourceType) ||
    !nonEmptyString(payload.sourceId) ||
    !nonEmptyString(payload.summary) ||
    !nonEmptyString(payload.occurredAt) ||
    typeof payload.confidence !== "number" ||
    !nonEmptyString(payload.createdBy)
  ) {
    return null;
  }

  return {
    id: payload.id,
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    summary: payload.summary,
    occurredAt: payload.occurredAt,
    confidence: payload.confidence,
    createdBy: payload.createdBy,
  };
}

function latestTimestamp(records: readonly LiveRecord<Record<string, unknown>>[]): string {
  return (
    records
      .map((record) => record.updatedAt)
      .filter(nonEmptyString)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => nonEmptyString(value))),
  );
}

function sourceFor(input: {
  attendeeId?: string;
  event: EventDTO;
  label: string;
}): EventAttendeeSourceReference {
  return {
    type: "event_import",
    id: input.event.source.id,
    label: input.label,
    eventId: input.event.id,
    attendeeId: input.attendeeId,
  };
}

function eventSummaryFor(
  graph: GeneratedEventAttendeeRosterGraph,
  attendeeCount: number,
): EventAttendeeEventSummary {
  return {
    id: graph.event.id,
    name: graph.event.name,
    organizer: graph.event.source.label ?? graph.event.source.id,
    venue: graph.event.location ?? "Live event venue",
    startsAt: graph.event.startsAt,
    rosterAccessStatus: attendeeCount > 0 ? "available" : "empty",
    source: sourceFor({
      event: graph.event,
      label: graph.event.source.label ?? "Live event attendee roster",
    }),
    organizerFeedRequested: false,
    privacyRosterAccessRequested: false,
    liveDatabaseWriteExecuted: false,
  };
}

function checkInStatusFor(
  attendee: GeneratedAttendeeRecordDTO,
): EventAttendeeRosterRecord["checkInStatus"] {
  if (attendee.status === "reviewed") {
    return "checked_in";
  }

  if (attendee.status === "skipped") {
    return "pending";
  }

  return "registered";
}

function eventRoleFor(
  attendee: GeneratedAttendeeRecordDTO,
): EventAttendeeRosterRecord["eventRole"] {
  const role = attendee.role?.toLowerCase() ?? "";

  if (role.includes("organizer")) {
    return "organizer";
  }

  if (role.includes("speaker")) {
    return "speaker";
  }

  return "attendee";
}

function contactFor(input: {
  attendee: GeneratedAttendeeRecordDTO;
  contactsById: ReadonlyMap<string, ContactDTO>;
  contactsByPersonId: ReadonlyMap<string, ContactDTO>;
}): ContactDTO | null {
  if (input.attendee.contactId) {
    return input.contactsById.get(input.attendee.contactId) ?? null;
  }

  if (input.attendee.personId) {
    return input.contactsByPersonId.get(input.attendee.personId) ?? null;
  }

  return null;
}

function personFor(input: {
  attendee: GeneratedAttendeeRecordDTO;
  peopleById: ReadonlyMap<string, NetworkPersonDTO>;
}): NetworkPersonDTO | null {
  return input.attendee.personId
    ? input.peopleById.get(input.attendee.personId) ?? null
    : null;
}

function intentFor(input: {
  attendee: GeneratedAttendeeRecordDTO;
  intentsByAttendeeId: ReadonlyMap<string, EventParticipantIntentDTO>;
}): EventParticipantIntentDTO | null {
  return input.intentsByAttendeeId.get(input.attendee.id) ?? null;
}

function recommendationFor(input: {
  attendee: GeneratedAttendeeRecordDTO;
  recommendationsByAttendeeId: ReadonlyMap<string, MatchRecommendationDTO>;
}): MatchRecommendationDTO | null {
  return input.recommendationsByAttendeeId.get(input.attendee.id) ?? null;
}

function connectionFor(input: {
  connectionByContactId: ReadonlyMap<string, ConnectionDTO>;
  connectionById: ReadonlyMap<string, ConnectionDTO>;
  contact: ContactDTO | null;
  recommendation: MatchRecommendationDTO | null;
}): ConnectionDTO | null {
  if (input.recommendation?.connectionId) {
    return input.connectionById.get(input.recommendation.connectionId) ?? null;
  }

  if (input.contact) {
    return input.connectionByContactId.get(input.contact.id) ?? null;
  }

  return null;
}

function knownContactMarkerFor(input: {
  attendee: GeneratedAttendeeRecordDTO;
  contact: ContactDTO | null;
}): EventAttendeeKnownContactMarker {
  if (input.contact) {
    return {
      attendeeId: input.attendee.id,
      isKnownContact: true,
      contactId: input.contact.id,
      matchSource: "existing-contact-fixture",
      confidence: "high",
      rationale:
        "This generated attendee maps to an existing source-backed contact.",
    };
  }

  return {
    attendeeId: input.attendee.id,
    isKnownContact: false,
    contactId: null,
    matchSource: "no-known-contact-match",
    confidence: "none",
    rationale:
      "No existing source-backed contact matched this generated attendee.",
  };
}

function tag(input: {
  code: EventAttendeeTagCode;
  label: string;
  rationale: string;
}): EventAttendeeTag {
  return input;
}

function searchableText(input: {
  attendee: GeneratedAttendeeRecordDTO;
  connection: ConnectionDTO | null;
  contact: ContactDTO | null;
  intent: EventParticipantIntentDTO | null;
  person: NetworkPersonDTO | null;
  recommendation: MatchRecommendationDTO | null;
}): string {
  return [
    input.attendee.displayName,
    input.attendee.organization,
    input.attendee.role,
    input.contact?.profileSnippet,
    input.person?.profileSnippet,
    input.connection?.summary,
    input.recommendation?.reason,
    ...(input.recommendation?.sharedTopics ?? []),
    ...(input.intent?.lookingFor ?? []),
    ...(input.intent?.canOffer ?? []),
  ]
    .filter((value): value is string => nonEmptyString(value))
    .join(" ")
    .toLowerCase();
}

function tagsFor(input: {
  attendee: GeneratedAttendeeRecordDTO;
  connection: ConnectionDTO | null;
  contact: ContactDTO | null;
  eventRole: EventAttendeeRosterRecord["eventRole"];
  intent: EventParticipantIntentDTO | null;
  knownContactMarker: EventAttendeeKnownContactMarker;
  person: NetworkPersonDTO | null;
  recommendation: MatchRecommendationDTO | null;
}): readonly EventAttendeeTag[] {
  const text = searchableText(input);
  const tags: EventAttendeeTag[] = [];

  if (input.knownContactMarker.isKnownContact) {
    tags.push(
      tag({
        code: "known_contact",
        label: "Known contact",
        rationale: "The attendee is already present in the contact graph.",
      }),
    );
  }

  if (input.eventRole === "speaker") {
    tags.push(
      tag({
        code: "speaker",
        label: "Speaker",
        rationale: "The attendee role indicates speaker context.",
      }),
    );
  }

  if (/\b(investor|seed|vc|venture|fund)\b/i.test(text)) {
    tags.push(
      tag({
        code: "investor_context",
        label: "Investor context",
        rationale: "The attendee context mentions investor or funding signals.",
      }),
    );
  }

  if (/(referral|intro|partner|channel|community|sponsor|warm_intro)/i.test(text)) {
    tags.push(
      tag({
        code: "partner_path",
        label: "Partner path",
        rationale:
          "The attendee context includes referral, partner, or channel signals.",
      }),
    );
  }

  if (/(ai|poc|pilot|workflow|crm|automation|storage)/i.test(text)) {
    tags.push(
      tag({
        code: "storage_pilot",
        label: "Pilot opportunity",
        rationale:
          "The attendee context includes PoC, pilot, workflow, or CRM signals.",
      }),
    );
  }

  if (/(climate|carbon|sustainability|energy)/i.test(text)) {
    tags.push(
      tag({
        code: "climate_operator",
        label: "Climate operator",
        rationale:
          "The attendee context includes climate, carbon, or energy signals.",
      }),
    );
  }

  return tags.length > 0
    ? tags
    : [
        tag({
          code: "partner_path",
          label: "Review path",
          rationale:
            "The attendee has generated event context that should be reviewed.",
        }),
      ];
}

function relationshipContextFor(input: {
  attendee: GeneratedAttendeeRecordDTO;
  connection: ConnectionDTO | null;
  contact: ContactDTO | null;
  intent: EventParticipantIntentDTO | null;
  person: NetworkPersonDTO | null;
  recommendation: MatchRecommendationDTO | null;
}): string {
  const lookingFor = input.intent?.lookingFor.join("; ");
  const canOffer = input.intent?.canOffer.join("; ");

  return [
    input.connection?.summary,
    input.recommendation?.reason,
    lookingFor ? `Looking for: ${lookingFor}.` : null,
    canOffer ? `Can offer: ${canOffer}.` : null,
    input.contact?.profileSnippet ?? input.person?.profileSnippet,
    input.attendee.role,
  ]
    .filter((value): value is string => nonEmptyString(value))
    .join(" ");
}

function eligibilityFor(input: {
  attendee: GeneratedAttendeeRecordDTO;
  intent: EventParticipantIntentDTO | null;
  knownContactMarker: EventAttendeeKnownContactMarker;
  recommendation: MatchRecommendationDTO | null;
}): EventAttendeeRecommendationEligibility {
  if (input.knownContactMarker.isKnownContact) {
    return {
      attendeeId: input.attendee.id,
      isEligible: false,
      recommendationCandidateId: null,
      reasons: ["The attendee is already a known contact."],
      blockedByKnownContact: true,
      generatedBy: "mock-attendee-roster-rules",
    };
  }

  if (!input.intent && !input.recommendation) {
    return {
      attendeeId: input.attendee.id,
      isEligible: false,
      recommendationCandidateId: null,
      reasons: ["No generated participant intent or recommendation is available."],
      blockedByKnownContact: false,
      generatedBy: "mock-attendee-roster-rules",
    };
  }

  return {
    attendeeId: input.attendee.id,
    isEligible: true,
    recommendationCandidateId:
      input.recommendation?.id ?? `candidate:live:${input.attendee.eventId}:${input.attendee.id}`,
    reasons: [
      input.recommendation?.reason ??
        "The attendee has generated participant intent for this event.",
    ],
    blockedByKnownContact: false,
    generatedBy: "mock-attendee-roster-rules",
  };
}

function suggestedNextActionFor(input: {
  eligibility: EventAttendeeRecommendationEligibility;
  knownContactMarker: EventAttendeeKnownContactMarker;
  recommendation: MatchRecommendationDTO | null;
}): string {
  if (input.recommendation?.suggestedActions[0]) {
    return input.recommendation.suggestedActions[0];
  }

  if (input.knownContactMarker.isKnownContact) {
    return "Review the existing contact before staging a follow-up.";
  }

  if (input.eligibility.isEligible) {
    return "Review the generated attendee intent before confirming a follow-up.";
  }

  return "Collect more event context before recommending this attendee.";
}

function attendeeRecordFor(input: {
  attendee: GeneratedAttendeeRecordDTO;
  connection: ConnectionDTO | null;
  contact: ContactDTO | null;
  event: EventDTO;
  intent: EventParticipantIntentDTO | null;
  person: NetworkPersonDTO | null;
  recommendation: MatchRecommendationDTO | null;
}): EventAttendeeRosterRecord {
  const eventRole = eventRoleFor(input.attendee);
  const knownContactMarker = knownContactMarkerFor({
    attendee: input.attendee,
    contact: input.contact,
  });
  const eligibility = eligibilityFor({
    attendee: input.attendee,
    intent: input.intent,
    knownContactMarker,
    recommendation: input.recommendation,
  });
  const tags = tagsFor({
    attendee: input.attendee,
    connection: input.connection,
    contact: input.contact,
    eventRole,
    intent: input.intent,
    knownContactMarker,
    person: input.person,
    recommendation: input.recommendation,
  });

  return {
    attendeeId: input.attendee.id,
    displayName: input.attendee.displayName,
    role: input.attendee.role ?? input.person?.role ?? input.contact?.role ?? "",
    organization:
      input.attendee.organization ??
      input.person?.organization ??
      input.contact?.organization ??
      "",
    email: input.contact?.primaryEmail ?? input.person?.primaryEmail ?? "",
    eventRole,
    checkInStatus: checkInStatusFor(input.attendee),
    attendeeTags: tags,
    knownContactMarker,
    eligibleRecommendation: eligibility,
    relationshipContext: relationshipContextFor(input),
    suggestedNextAction: suggestedNextActionFor({
      eligibility,
      knownContactMarker,
      recommendation: input.recommendation,
    }),
    source: sourceFor({
      attendeeId: input.attendee.id,
      event: input.event,
      label: input.attendee.source.label ?? input.attendee.displayName,
    }),
    evidenceIds: uniqueStrings([
      ...input.attendee.evidenceIds,
      ...(input.intent?.evidenceIds ?? []),
      ...(input.recommendation?.evidenceIds ?? []),
      ...(input.connection?.evidenceIds ?? []),
      ...(input.contact?.evidenceIds ?? []),
    ]),
    organizerFeedRequested: false,
    privacyRosterAccessRequested: false,
    externalLookupExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function uniqueTags(
  attendees: readonly EventAttendeeRosterRecord[],
): readonly EventAttendeeTag[] {
  const tags = new Map<EventAttendeeTagCode, EventAttendeeTag>();

  for (const attendee of attendees) {
    for (const tagItem of attendee.attendeeTags) {
      if (!tags.has(tagItem.code)) {
        tags.set(tagItem.code, tagItem);
      }
    }
  }

  return Array.from(tags.values());
}

function eligibleRecommendationPool(
  attendees: readonly EventAttendeeRosterRecord[],
): readonly EventAttendeeRecommendationCandidate[] {
  return attendees
    .filter((attendee) => attendee.eligibleRecommendation.isEligible)
    .map((attendee) => ({
      attendeeId: attendee.attendeeId,
      recommendationCandidateId:
        attendee.eligibleRecommendation.recommendationCandidateId ??
        `candidate:live:${attendee.source.eventId}:${attendee.attendeeId}`,
      displayName: attendee.displayName,
      organization: attendee.organization,
      tags: attendee.attendeeTags,
      reasons: attendee.eligibleRecommendation.reasons,
      source: attendee.source,
      evidenceIds: attendee.evidenceIds,
      aiProviderRequested: false,
      liveDatabaseWriteExecuted: false,
    }));
}

function sortedRecommendations(
  recommendations: readonly MatchRecommendationDTO[],
): readonly MatchRecommendationDTO[] {
  return [...recommendations].sort((left, right) => {
    return (
      right.score - left.score ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
    );
  });
}

function payloadFor(input: {
  collectedAt: string;
  graph: GeneratedEventAttendeeRosterGraph;
  providerSource: string;
  providerSourceLabel: string;
}): EventAttendeeRosterPayload {
  const contactsById = new Map(input.graph.contacts.map((contact) => [contact.id, contact]));
  const contactsByPersonId = new Map(
    input.graph.contacts
      .filter((contact) => contact.personId)
      .map((contact) => [contact.personId as string, contact]),
  );
  const peopleById = new Map(input.graph.networkPeople.map((person) => [person.id, person]));
  const intentsByAttendeeId = new Map(
    input.graph.intents.map((intent) => [intent.attendeeId, intent]),
  );
  const connectionById = new Map(
    input.graph.connections.map((connection) => [connection.id, connection]),
  );
  const connectionByContactId = new Map(
    input.graph.connections.map((connection) => [connection.contactId, connection]),
  );
  const recommendationsByAttendeeId = new Map(
    sortedRecommendations(input.graph.recommendations)
      .filter((recommendation) => recommendation.attendeeId)
      .map((recommendation) => [recommendation.attendeeId as string, recommendation]),
  );
  const attendees = [...input.graph.attendees]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((attendee) => {
      const contact = contactFor({
        attendee,
        contactsById,
        contactsByPersonId,
      });
      const recommendation = recommendationFor({
        attendee,
        recommendationsByAttendeeId,
      });

      return attendeeRecordFor({
        attendee,
        connection: connectionFor({
          connectionByContactId,
          connectionById,
          contact,
          recommendation,
        }),
        contact,
        event: input.graph.event,
        intent: intentFor({
          attendee,
          intentsByAttendeeId,
        }),
        person: personFor({
          attendee,
          peopleById,
        }),
        recommendation,
      });
    });
  const candidates = eligibleRecommendationPool(attendees);
  const state = attendees.length > 0 ? "success" : "empty";
  const evidenceIdList = uniqueStrings([
    ...input.graph.event.evidenceIds,
    ...attendees.flatMap((attendee) => attendee.evidenceIds),
  ]);

  return {
    state,
    event: eventSummaryFor(input.graph, attendees.length),
    attendees,
    attendeeTags: uniqueTags(attendees),
    knownContactMarkers: attendees.map((attendee) => attendee.knownContactMarker),
    eligibleRecommendationPool: candidates,
    summary:
      state === "success"
        ? `${attendees.length} generated live attendee(s) were loaded from shared storage.`
        : "No generated live attendees were available for this event.",
    provenance: {
      source: input.providerSource,
      sourceLabel: input.providerSourceLabel,
      evidenceIds: evidenceIdList,
      collectedAt: input.collectedAt,
      privacy: "demo-event-attendee-roster-only",
      generationMethod: "live-store-query",
      organizerFeedRequested: false,
      privacyRosterAccessRequested: false,
      liveDatabaseWriteExecuted: false,
      externalNetworkRequested: false,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
    },
    nextAction:
      state === "success"
        ? "Review the generated live attendee roster before importing it into event context."
        : "Verify the generated fixture seed or choose another event.",
  };
}

async function readGeneratedGraph(input: {
  eventId: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<GeneratedEventAttendeeRosterGraph | null> {
  const eventRecord = await input.store.getRecord({
    workspaceId: input.workspaceId,
    collectionName: GENERATED_ATTENDEE_ROSTER_LIVE_RECORD_COLLECTIONS.events,
    recordId: input.eventId,
  });
  const event = eventFromRecord(eventRecord);

  if (!event) {
    return null;
  }

  const [
    attendeeRecords,
    contactRecords,
    connectionRecords,
    intentRecords,
    personRecords,
    recommendationRecords,
  ] = await Promise.all([
    input.store.listRecords({
      workspaceId: input.workspaceId,
      collectionName: GENERATED_ATTENDEE_ROSTER_LIVE_RECORD_COLLECTIONS.attendees,
    }),
    input.store.listRecords({
      workspaceId: input.workspaceId,
      collectionName: GENERATED_ATTENDEE_ROSTER_LIVE_RECORD_COLLECTIONS.contacts,
    }),
    input.store.listRecords({
      workspaceId: input.workspaceId,
      collectionName: GENERATED_ATTENDEE_ROSTER_LIVE_RECORD_COLLECTIONS.connections,
    }),
    input.store.listRecords({
      workspaceId: input.workspaceId,
      collectionName:
        GENERATED_ATTENDEE_ROSTER_LIVE_RECORD_COLLECTIONS.eventParticipantIntents,
      targetId: input.eventId,
      targetType: "event",
    }),
    input.store.listRecords({
      workspaceId: input.workspaceId,
      collectionName: GENERATED_ATTENDEE_ROSTER_LIVE_RECORD_COLLECTIONS.networkPeople,
    }),
    input.store.listRecords({
      workspaceId: input.workspaceId,
      collectionName:
        GENERATED_ATTENDEE_ROSTER_LIVE_RECORD_COLLECTIONS.matchRecommendations,
      targetId: input.eventId,
      targetType: "event",
    }),
  ]);
  const attendees = attendeeRecords
    .map(attendeeFromRecord)
    .filter(
      (attendee): attendee is GeneratedAttendeeRecordDTO =>
        attendee !== null && attendee.eventId === input.eventId,
    );
  const attendeeIds = new Set(attendees.map((attendee) => attendee.id));
  const personIds = new Set(
    attendees
      .map((attendee) => attendee.personId)
      .filter((personId): personId is string => personId !== undefined),
  );
  const contactIds = new Set(
    attendees
      .map((attendee) => attendee.contactId)
      .filter((contactId): contactId is string => contactId !== undefined),
  );
  const intents = intentRecords
    .map(intentFromRecord)
    .filter(
      (intent): intent is EventParticipantIntentDTO =>
        intent !== null &&
        intent.eventId === input.eventId &&
        attendeeIds.has(intent.attendeeId),
    );
  const recommendations = recommendationRecords
    .map(recommendationFromRecord)
    .filter(
      (recommendation): recommendation is MatchRecommendationDTO =>
        recommendation !== null &&
        recommendation.eventId === input.eventId &&
        (recommendation.attendeeId
          ? attendeeIds.has(recommendation.attendeeId)
          : true),
    );

  for (const intent of intents) {
    if (intent.personId) {
      personIds.add(intent.personId);
    }

    if (intent.contactId) {
      contactIds.add(intent.contactId);
    }
  }

  for (const recommendation of recommendations) {
    if (recommendation.targetPersonId) {
      personIds.add(recommendation.targetPersonId);
    }

    if (recommendation.contactId) {
      contactIds.add(recommendation.contactId);
    }
  }

  const contacts = contactRecords
    .map(contactFromRecord)
    .filter(
      (contact): contact is ContactDTO =>
        contact !== null &&
        (contactIds.has(contact.id) ||
          (contact.personId ? personIds.has(contact.personId) : false)),
    );

  for (const contact of contacts) {
    if (contact.personId) {
      personIds.add(contact.personId);
    }
  }

  const connectionIds = new Set(
    recommendations
      .map((recommendation) => recommendation.connectionId)
      .filter((connectionId): connectionId is string => connectionId !== undefined),
  );
  const connections = connectionRecords
    .map(connectionFromRecord)
    .filter(
      (connection): connection is ConnectionDTO =>
        connection !== null &&
        (connectionIds.has(connection.id) || contactIds.has(connection.contactId)),
    );
  const networkPeople = personRecords
    .map(networkPersonFromRecord)
    .filter(
      (person): person is NetworkPersonDTO =>
        person !== null && personIds.has(person.id),
    );
  const graphEvidenceIds = uniqueStrings([
    ...event.evidenceIds,
    ...attendees.flatMap((attendee) => attendee.evidenceIds),
    ...contacts.flatMap((contact) => contact.evidenceIds),
    ...connections.flatMap((connection) => connection.evidenceIds),
    ...intents.flatMap((intent) => intent.evidenceIds),
    ...networkPeople.flatMap((person) => person.evidenceIds),
    ...recommendations.flatMap((recommendation) => recommendation.evidenceIds),
  ]);
  const evidenceRecords =
    graphEvidenceIds.length > 0
      ? await input.store.listRecords({
          workspaceId: input.workspaceId,
          collectionName: GENERATED_ATTENDEE_ROSTER_LIVE_RECORD_COLLECTIONS.evidence,
          recordIds: graphEvidenceIds,
        })
      : [];

  return {
    attendees,
    connections,
    contacts,
    event,
    evidence: evidenceRecords
      .map(evidenceFromRecord)
      .filter((evidence): evidence is RelationshipEvidenceDTO => evidence !== null),
    generatedAt: latestTimestamp([
      eventRecord,
      ...attendeeRecords,
      ...contactRecords,
      ...connectionRecords,
      ...intentRecords,
      ...personRecords,
      ...recommendationRecords,
      ...evidenceRecords,
    ].filter((record): record is LiveRecord<Record<string, unknown>> => record !== null)),
    intents,
    networkPeople,
    recommendations,
  };
}

export function createGeneratedEventAttendeeRosterProvider({
  now = () => new Date().toISOString(),
  source,
  sourceLabel = "Generated event attendee shared live storage",
  store,
  workspaceId,
}: GeneratedEventAttendeeRosterProviderOptions): EventCapabilityRecordProvider<
  EventAttendeeRosterPayload | EventAttendeeRosterImportPayload
> {
  const providerSource = source ?? `live-record-store:event-attendee-roster:${workspaceId}`;
  const workRecordProvider = createEventCapabilityRecordProvider<
    EventAttendeeRosterPayload | EventAttendeeRosterImportPayload
  >({
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.attendeeRoster,
    now,
    source: providerSource,
    sourceLabel,
    store,
    workspaceId,
  });

  return {
    source: providerSource,
    sourceLabel,
    async getPayload(eventId) {
      const graph = await readGeneratedGraph({
        eventId,
        store,
        workspaceId,
      });

      if (!graph) {
        return null;
      }

      return clonePayload(
        payloadFor({
          collectedAt: now(),
          graph,
          providerSource,
          providerSourceLabel: sourceLabel,
        }),
      );
    },
    upsertPayload: workRecordProvider.upsertPayload,
  };
}

export function createConfiguredGeneratedEventAttendeeRosterProvider({
  env,
  now,
  sourceLabel = "Generated event attendee Postgres live storage",
}: ConfiguredGeneratedEventAttendeeRosterProviderOptions = {}): EventCapabilityRecordProvider<
  EventAttendeeRosterPayload | EventAttendeeRosterImportPayload
> | null {
  const configured = createConfiguredPostgresLiveRecordStore<
    Record<string, unknown>
  >({ env });

  if (!configured) {
    return null;
  }

  return createGeneratedEventAttendeeRosterProvider({
    now,
    source: `postgres-live-record-store:event-attendee-roster:${configured.workspaceId}`,
    sourceLabel,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
}
