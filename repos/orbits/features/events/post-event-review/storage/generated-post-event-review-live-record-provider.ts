import type { LiveDatabaseEnv } from "../../../../shared/storage/live-database-config";
import { createConfiguredPostgresLiveRecordStore } from "../../../../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../../../../shared/storage/live-record-store";
import {
  createGeneratedEventAttendeeRosterProvider,
} from "../../attendee-roster/storage/generated-attendee-roster-live-record-provider";
import type {
  EventAttendeeRecommendationCandidate,
  EventAttendeeRosterPayload,
  EventAttendeeRosterRecord,
} from "../../attendee-roster/contract";
import {
  createEventCapabilityRecordProvider,
  EVENT_WORK_RECORD_COLLECTIONS,
  type EventCapabilityRecordProvider,
} from "../../storage/event-work-record-provider";
import type {
  PostEventContactSummary,
  PostEventFollowUpSuggestion,
  PostEventReviewConfirmPayload,
  PostEventReviewContact,
  PostEventReviewEventSummary,
  PostEventReviewPayload,
  PostEventReviewSourceReference,
  PostEventReviewTag,
} from "../contract";

export interface GeneratedPostEventContactReviewProviderOptions {
  now?: () => string;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredGeneratedPostEventContactReviewProviderOptions {
  env?: LiveDatabaseEnv;
  now?: () => string;
  sourceLabel?: string;
}

interface ReviewCandidate {
  attendee: EventAttendeeRosterRecord;
  recommendation?: EventAttendeeRecommendationCandidate;
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

function slugFor(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sourceFor(input: {
  eventId: string;
  label: string;
  sourceId: string;
}): PostEventReviewSourceReference {
  return {
    type: "event_import",
    id: input.sourceId,
    label: input.label,
    eventId: input.eventId,
    generatedBy: "mock-post-event-review-service",
  };
}

function eventForRoster(
  roster: EventAttendeeRosterPayload,
): PostEventReviewEventSummary {
  return {
    id: roster.event.id,
    title: roster.event.name,
    venue: roster.event.venue,
    endedAt: roster.event.startsAt,
    source: sourceFor({
      eventId: roster.event.id,
      label: roster.event.source.label,
      sourceId: roster.event.source.id,
    }),
    calendarProviderRequested: false,
    liveDatabaseReadExecuted: false,
  };
}

function candidateEvidenceIds(candidate: ReviewCandidate): string[] {
  return uniqueStrings([
    ...candidate.attendee.evidenceIds,
    ...(candidate.recommendation?.evidenceIds ?? []),
  ]);
}

function selectCandidates(
  roster: EventAttendeeRosterPayload,
): ReviewCandidate[] {
  const attendeesById = new Map(
    roster.attendees.map((attendee) => [attendee.attendeeId, attendee]),
  );
  const recommended = roster.eligibleRecommendationPool
    .map((recommendation): ReviewCandidate | null => {
      const attendee = attendeesById.get(recommendation.attendeeId);

      return attendee ? { attendee, recommendation } : null;
    })
    .filter((candidate): candidate is ReviewCandidate => candidate !== null);

  if (recommended.length > 0) {
    return recommended.slice(0, 2);
  }

  return roster.attendees.slice(0, 2).map((attendee) => ({ attendee }));
}

function tagFor(input: {
  candidate: ReviewCandidate;
  event: PostEventReviewEventSummary;
  index: number;
  source: PostEventReviewSourceReference;
}): PostEventReviewTag {
  const sourceTag = input.candidate.attendee.attendeeTags[input.index];
  const label =
    sourceTag?.label ??
    input.candidate.recommendation?.tags[input.index]?.label ??
    "post-event review";
  const reason =
    sourceTag?.rationale ??
    input.candidate.recommendation?.reasons[input.index] ??
    "Generated from live attendee context.";

  return {
    tagId: `tag:post-event:live:${input.event.id}:${slugFor(input.candidate.attendee.attendeeId)}:${input.index + 1}`,
    label,
    reason,
    source: input.source,
    evidenceIds: candidateEvidenceIds(input.candidate),
    generatedBy: "mock-post-event-rules",
    aiProviderRequested: false,
    liveDatabaseWriteExecuted: false,
  };
}

function summaryFor(input: {
  candidate: ReviewCandidate;
  event: PostEventReviewEventSummary;
  source: PostEventReviewSourceReference;
}): PostEventContactSummary {
  const evidenceIds = candidateEvidenceIds(input.candidate);
  const attendee = input.candidate.attendee;

  return {
    summaryId: `summary:post-event:live:${input.event.id}:${slugFor(attendee.attendeeId)}`,
    headline: `${attendee.displayName} is ready for post-event review.`,
    context: attendee.relationshipContext,
    whyNow: `The ${input.event.title} context is fresh enough to review before follow-up.`,
    source: input.source,
    evidenceIds,
    generatedBy: "mock-post-event-rules",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  };
}

function followUpFor(input: {
  candidate: ReviewCandidate;
  event: PostEventReviewEventSummary;
  index: number;
  source: PostEventReviewSourceReference;
}): PostEventFollowUpSuggestion {
  const attendee = input.candidate.attendee;
  const evidenceIds = candidateEvidenceIds(input.candidate);

  return {
    suggestionId: `follow-up:post-event:live:${input.event.id}:${slugFor(attendee.attendeeId)}`,
    channel: "email",
    urgency: input.index === 0 ? "today" : "this_week",
    messageDraft: `${attendee.displayName}, good meeting you at ${input.event.title}. I can follow up on ${attendee.suggestedNextAction.toLowerCase()}.`,
    rationale:
      "Generated from live attendee context and left as an editable draft.",
    source: input.source,
    evidenceIds,
    generatedBy: "mock-post-event-rules",
    externalMessageSendRequested: false,
    notificationDelivered: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    aiProviderRequested: false,
  };
}

function contactFor(input: {
  candidate: ReviewCandidate;
  event: PostEventReviewEventSummary;
  index: number;
}): PostEventReviewContact {
  const attendee = input.candidate.attendee;
  const source = sourceFor({
    eventId: input.event.id,
    label: attendee.source.label,
    sourceId: attendee.source.id,
  });
  const evidenceIds = candidateEvidenceIds(input.candidate);

  return {
    contactDraftId: `draft:post-event:live:${input.event.id}:${slugFor(attendee.attendeeId)}`,
    displayName: attendee.displayName,
    organization: attendee.organization,
    role: attendee.role,
    metAt: input.event.title,
    relationshipContext: attendee.relationshipContext,
    status: "needs_review",
    source,
    evidenceIds,
    summary: summaryFor({
      candidate: input.candidate,
      event: input.event,
      source,
    }),
    tags: [
      tagFor({
        candidate: input.candidate,
        event: input.event,
        index: 0,
        source,
      }),
      tagFor({
        candidate: input.candidate,
        event: input.event,
        index: 1,
        source,
      }),
    ],
    followUpSuggestion: followUpFor({
      candidate: input.candidate,
      event: input.event,
      index: input.index,
      source,
    }),
    liveDatabaseWriteExecuted: false,
    batchPersistenceExecuted: false,
  };
}

function payloadFor(input: {
  collectedAt: string;
  providerSource: string;
  providerSourceLabel: string;
  roster: EventAttendeeRosterPayload;
}): PostEventReviewPayload {
  const event = eventForRoster(input.roster);
  const contacts = selectCandidates(input.roster).map((candidate, index) =>
    contactFor({
      candidate,
      event,
      index,
    }),
  );
  const evidenceIds = uniqueStrings([
    ...input.roster.provenance.evidenceIds,
    ...contacts.flatMap((contact) => contact.evidenceIds),
  ]);

  return {
    state: contacts.length > 0 ? "success" : "empty",
    event,
    reviewId: `post-event-review:live:${event.id}`,
    contacts,
    summary:
      contacts.length > 0
        ? "Generated live attendee context is ready for post-event contact review."
        : "Generated live attendee context has no contacts ready for post-event review.",
    provenance: {
      source: input.providerSource,
      sourceLabel: input.providerSourceLabel,
      evidenceIds,
      collectedAt: input.collectedAt,
      privacy: "demo-post-event-review-only",
      generationMethod: "live-store-query",
      aiProviderRequested: false,
      externalNetworkRequested: false,
      liveDatabaseReadExecuted: false,
      liveDatabaseWriteExecuted: false,
      batchPersistenceExecuted: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
    },
    nextAction:
      contacts.length > 0
        ? "Review generated contact drafts before confirming any records."
        : "Import or capture event contacts before post-event review.",
  };
}

export function createGeneratedPostEventContactReviewProvider({
  now = () => new Date().toISOString(),
  source,
  sourceLabel = "Generated post-event review shared live storage",
  store,
  workspaceId,
}: GeneratedPostEventContactReviewProviderOptions): EventCapabilityRecordProvider<
  PostEventReviewPayload | PostEventReviewConfirmPayload
> {
  const providerSource =
    source ?? `live-record-store:post-event-review:${workspaceId}`;
  const workRecordProvider = createEventCapabilityRecordProvider<
    PostEventReviewPayload | PostEventReviewConfirmPayload
  >({
    collectionName: EVENT_WORK_RECORD_COLLECTIONS.postEventReview,
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

export function createConfiguredGeneratedPostEventContactReviewProvider({
  env,
  now,
  sourceLabel = "Generated post-event review Postgres live storage",
}: ConfiguredGeneratedPostEventContactReviewProviderOptions = {}): EventCapabilityRecordProvider<
  PostEventReviewPayload | PostEventReviewConfirmPayload
> | null {
  const configured = createConfiguredPostgresLiveRecordStore<
    Record<string, unknown>
  >({ env });

  if (!configured) {
    return null;
  }

  return createGeneratedPostEventContactReviewProvider({
    now,
    source: `postgres-live-record-store:post-event-review:${configured.workspaceId}`,
    sourceLabel,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
}
