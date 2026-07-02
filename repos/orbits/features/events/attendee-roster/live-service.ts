import {
  EVENT_ATTENDEE_ROSTER_ERROR_DEFINITIONS,
  EVENT_ATTENDEE_TAG_CODES,
  type EventAttendeeRecommendationCandidate,
  type EventAttendeeRosterErrorCode,
  type EventAttendeeRosterFailure,
  type EventAttendeeRosterImportPayload,
  type EventAttendeeRosterImportResult,
  type EventAttendeeRosterInput,
  type EventAttendeeRosterPayload,
  type EventAttendeeRosterRecord,
  type EventAttendeeRosterResult,
  type EventAttendeeRosterService,
  type EventAttendeeTagCode,
} from "./contract";
import type { EventCapabilityRecordProvider } from "../storage/event-work-record-provider";

export interface LiveEventAttendeeRosterServiceOptions {
  now?: () => string;
  provider?:
    | EventCapabilityRecordProvider<
        EventAttendeeRosterPayload | EventAttendeeRosterImportPayload
      >
    | null;
}

const supportedTagFilters = new Set<EventAttendeeTagCode>(
  EVENT_ATTENDEE_TAG_CODES,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeEventId(eventId?: string | null): string {
  return eventId?.trim() ?? "";
}

function normalizeTagFilter(
  tagFilter?: EventAttendeeRosterInput["tagFilter"],
): EventAttendeeTagCode | null {
  return tagFilter && supportedTagFilters.has(tagFilter as EventAttendeeTagCode)
    ? (tagFilter as EventAttendeeTagCode)
    : null;
}

function normalizeBooleanFilter(value?: boolean | string | null): boolean {
  return value === true || value === "true";
}

function failure(
  code: EventAttendeeRosterErrorCode,
  input: {
    collectedAt: string;
    provider?: EventCapabilityRecordProvider<object> | null;
  },
): EventAttendeeRosterFailure {
  const definition = EVENT_ATTENDEE_ROSTER_ERROR_DEFINITIONS[code];
  const source = input.provider?.source ?? "live-store:attendee-roster:unconfigured";

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: {
        source,
        sourceLabel:
          input.provider?.sourceLabel ?? "Unconfigured attendee roster store",
        evidenceIds: [`evidence:${code.toLowerCase()}`],
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
      evidenceIds: [`evidence:${code.toLowerCase()}`],
    },
  };
}

function filteredPayload(
  payload: EventAttendeeRosterPayload,
  input: EventAttendeeRosterInput,
): EventAttendeeRosterPayload {
  const tagFilter = normalizeTagFilter(input.tagFilter);
  const knownContactOnly = normalizeBooleanFilter(input.knownContactOnly);
  const eligibleOnly = normalizeBooleanFilter(input.eligibleOnly);
  const attendees = payload.attendees.filter((attendee) => {
    const tagMatches = tagFilter
      ? attendee.attendeeTags.some((tag) => tag.code === tagFilter)
      : true;
    const knownMatches = knownContactOnly
      ? attendee.knownContactMarker.isKnownContact
      : true;
    const eligibleMatches = eligibleOnly
      ? attendee.eligibleRecommendation.isEligible
      : true;

    return tagMatches && knownMatches && eligibleMatches;
  });

  if (!tagFilter && !knownContactOnly && !eligibleOnly) {
    return clonePayload(payload);
  }

  const attendeeIds = new Set(attendees.map((attendee) => attendee.attendeeId));

  return {
    ...clonePayload(payload),
    state: attendees.length > 0 ? "success" : "empty",
    attendees,
    knownContactMarkers: payload.knownContactMarkers.filter((marker) =>
      attendeeIds.has(marker.attendeeId),
    ),
    eligibleRecommendationPool: payload.eligibleRecommendationPool.filter(
      (candidate) => attendeeIds.has(candidate.attendeeId),
    ),
    summary:
      attendees.length > 0
        ? "Live storage filtered attendees using roster tags and eligibility."
        : "No live storage attendees matched the roster filter.",
    nextAction:
      attendees.length > 0
        ? "Review the live attendee roster before importing it into event context."
        : "Clear the roster filter or check the live attendee source.",
  };
}

function candidateIds(
  candidates: readonly EventAttendeeRecommendationCandidate[],
): readonly string[] {
  return candidates.map((candidate) => candidate.recommendationCandidateId);
}

function withLiveProvenance(
  payload: EventAttendeeRosterPayload,
  input: {
    generationMethod: EventAttendeeRosterPayload["provenance"]["generationMethod"];
    provider: EventCapabilityRecordProvider<object>;
    writeExecuted: boolean;
  },
): EventAttendeeRosterPayload {
  return {
    ...payload,
    event: {
      ...payload.event,
      liveDatabaseWriteExecuted: input.writeExecuted,
    },
    provenance: {
      ...payload.provenance,
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      generationMethod: input.generationMethod,
      liveDatabaseWriteExecuted: input.writeExecuted,
    },
  };
}

function toImportPayload(
  payload: EventAttendeeRosterPayload,
  now: string,
): EventAttendeeRosterImportPayload {
  const attendees = payload.attendees.map(
    (attendee): EventAttendeeRosterRecord => ({
      ...attendee,
      databaseWriteExecuted: true,
    }),
  );

  return {
    ...payload,
    attendees,
    importBatch: {
      id: `import-batch:live:${payload.event.id}`,
      eventId: payload.event.id,
      stagedAt: now,
      attendeeIds: attendees.map((attendee) => attendee.attendeeId),
      recommendationCandidateIds: candidateIds(
        payload.eligibleRecommendationPool,
      ),
      organizerFeedRequested: false,
      privacyRosterAccessRequested: false,
      liveDatabaseWriteExecuted: true,
      externalNetworkRequested: false,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
    },
  };
}

export function createLiveEventAttendeeRosterService({
  now = () => new Date().toISOString(),
  provider,
}: LiveEventAttendeeRosterServiceOptions = {}): EventAttendeeRosterService {
  return {
    async getAttendeeRoster(input = {}): Promise<EventAttendeeRosterResult> {
      const collectedAt = now();
      const eventId = normalizeEventId(input.eventId);

      if (!eventId) {
        return failure("EVENT_ATTENDEE_ROSTER_EVENT_ID_REQUIRED", {
          collectedAt,
          provider,
        });
      }

      if (!provider) {
        return failure("EVENT_ATTENDEE_ROSTER_LIVE_STORE_UNCONFIGURED", {
          collectedAt,
          provider,
        });
      }

      const payload = await provider.getPayload(eventId);

      if (!payload) {
        return failure("EVENT_ATTENDEE_ROSTER_EVENT_NOT_FOUND", {
          collectedAt,
          provider,
        });
      }

      return {
        success: true,
        data: withLiveProvenance(
          filteredPayload(payload, input),
          {
            generationMethod: "live-store-query",
            provider,
            writeExecuted: false,
          },
        ),
      };
    },
    async importAttendeeRoster(
      input = {},
    ): Promise<EventAttendeeRosterImportResult> {
      const roster = await this.getAttendeeRoster(input);

      if (roster.success === false) {
        return roster;
      }

      if (!provider) {
        return failure("EVENT_ATTENDEE_ROSTER_LIVE_STORE_UNCONFIGURED", {
          collectedAt: now(),
          provider,
        });
      }

      const importPayload = toImportPayload(
        withLiveProvenance(roster.data, {
          generationMethod: "live-store-import",
          provider,
          writeExecuted: true,
        }),
        now(),
      );

      await provider.upsertPayload(importPayload.event.id, importPayload, {
        evidenceIds: importPayload.provenance.evidenceIds,
      });

      return {
        success: true,
        data: clonePayload(importPayload),
      };
    },
  };
}
