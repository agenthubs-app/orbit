import {
  WANT_CONNECT_ERROR_DEFINITIONS,
  type WantConnectErrorCode,
  type WantConnectFailure,
  type WantConnectIntent,
  type WantConnectIntentInput,
  type WantConnectMatch,
  type WantConnectMatchesPayload,
  type WantConnectMatchesResult,
  type WantConnectPayload,
  type WantConnectResult,
  type WantConnectService,
} from "./contract";
import type { EventCapabilityRecordProvider } from "../storage/event-work-record-provider";

export interface LiveWantConnectServiceOptions {
  now?: () => string;
  provider?:
    | EventCapabilityRecordProvider<WantConnectPayload | WantConnectMatchesPayload>
    | null;
}

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeEventId(eventId?: string | null): string {
  return eventId?.trim() ?? "";
}

function failure(
  code: WantConnectErrorCode,
  input: {
    collectedAt: string;
    provider?: EventCapabilityRecordProvider<object> | null;
  },
): WantConnectFailure {
  const definition = WANT_CONNECT_ERROR_DEFINITIONS[code];
  const evidenceIds = [`evidence:${code.toLowerCase()}`];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: {
        source: input.provider?.source ?? "live-store:want-connect:unconfigured",
        sourceLabel: input.provider?.sourceLabel ?? "Unconfigured want-connect store",
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
      evidenceIds,
    },
  };
}

function isWantConnectPayload(
  payload: WantConnectPayload | WantConnectMatchesPayload,
): payload is WantConnectPayload {
  return "participants" in payload;
}

function nextIntent(input: {
  actorContactId: string;
  baseIntent: WantConnectIntent | null;
  eventId: string;
  now: string;
  payload: WantConnectPayload;
  targetContactId: string;
}): WantConnectIntent {
  const targetParticipant = input.payload.participants.find(
    (participant) => participant.contactId === input.targetContactId,
  );

  return {
    ...(input.baseIntent ?? {
      intentId: `want-connect:intent:live:${input.eventId}:${input.actorContactId}:${input.targetContactId}`,
      eventId: input.eventId,
      status: "recorded" as const,
      source:
        targetParticipant?.source ??
        input.payload.event.source,
      evidenceIds: input.payload.provenance.evidenceIds,
      realtimePresenceRequested: false,
      peerNotificationDelivered: false,
      externalMessageSent: false,
    }),
    actorContactId: input.actorContactId,
    targetContactId: input.targetContactId,
    recordedAt: input.now,
  };
}

function withIntent(
  payload: WantConnectPayload,
  input: {
    actorContactId: string;
    now: string;
    provider: EventCapabilityRecordProvider<object>;
    targetContactId: string;
  },
): WantConnectPayload {
  const intent = nextIntent({
    actorContactId: input.actorContactId,
    baseIntent: payload.intent,
    eventId: payload.event.id,
    now: input.now,
    payload,
    targetContactId: input.targetContactId,
  });

  return {
    ...payload,
    state: "success",
    event: {
      ...payload.event,
      liveDatabaseWriteExecuted: true,
    },
    intent,
    summary: "Live storage recorded want-to-connect intent.",
    provenance: {
      ...payload.provenance,
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      collectedAt: input.now,
      generationMethod: "live-store-intent",
      liveDatabaseWriteExecuted: true,
    },
    nextAction:
      "Review live mutual-interest state before taking any external action.",
  };
}

export function createLiveWantConnectService({
  now = () => new Date().toISOString(),
  provider,
}: LiveWantConnectServiceOptions = {}): WantConnectService {
  async function loadPayload(eventId: string): Promise<WantConnectPayload | null> {
    const payload = provider ? await provider.getPayload(eventId) : null;

    return payload && isWantConnectPayload(payload) ? payload : null;
  }

  return {
    async createWantToConnectIntent(input = {}): Promise<WantConnectResult> {
      const collectedAt = now();
      const eventId = normalizeEventId(input.eventId);
      const targetContactId = input.targetContactId?.trim() ?? "";
      const actorContactId = input.actorContactId?.trim() || "contact:operator";

      if (!eventId) {
        return failure("WANT_CONNECT_EVENT_ID_REQUIRED", {
          collectedAt,
          provider,
        });
      }

      if (!targetContactId) {
        return failure("WANT_CONNECT_TARGET_REQUIRED", {
          collectedAt,
          provider,
        });
      }

      if (!provider) {
        return failure("WANT_CONNECT_LIVE_STORE_UNCONFIGURED", {
          collectedAt,
          provider,
        });
      }

      const payload = await loadPayload(eventId);

      if (!payload) {
        return failure("WANT_CONNECT_EVENT_NOT_FOUND", {
          collectedAt,
          provider,
        });
      }

      const data = withIntent(payload, {
        actorContactId,
        now: collectedAt,
        provider,
        targetContactId,
      });

      await provider.upsertPayload(eventId, data, {
        evidenceIds: data.provenance.evidenceIds,
      });

      return {
        success: true,
        data: clonePayload(data),
      };
    },
    async listMatches(input = {}): Promise<WantConnectMatchesResult> {
      const collectedAt = now();
      const eventId = normalizeEventId(input.eventId);

      if (!eventId) {
        return failure("WANT_CONNECT_EVENT_ID_REQUIRED", {
          collectedAt,
          provider,
        });
      }

      if (!provider) {
        return failure("WANT_CONNECT_LIVE_STORE_UNCONFIGURED", {
          collectedAt,
          provider,
        });
      }

      const payload = await loadPayload(eventId);

      if (!payload) {
        return failure("WANT_CONNECT_EVENT_NOT_FOUND", {
          collectedAt,
          provider,
        });
      }

      const matches: readonly WantConnectMatch[] = payload.matchNotice
        ? [
            {
              matchId: `want-connect:match:live:${eventId}`,
              eventId,
              participantContactIds: payload.participants.map(
                (participant) => participant.contactId,
              ),
              participantNames: payload.participants.map(
                (participant) => participant.displayName,
              ),
              mutualInterest: payload.mutualInterest,
              successNotice: payload.matchNotice,
              source: payload.event.source,
              evidenceIds: payload.provenance.evidenceIds,
              realtimePresenceRequested: false,
              peerNotificationDelivered: false,
              externalMessageSent: false,
            },
          ]
        : [];
      const data: WantConnectMatchesPayload = {
        state: matches.length > 0 ? "success" : "empty",
        event: payload.event,
        matches,
        summary:
          matches.length > 0
            ? "Live storage returned want-connect matches."
            : "No live want-connect matches are ready for this event.",
        provenance: {
          ...payload.provenance,
          source: provider.source,
          sourceLabel: provider.sourceLabel,
          collectedAt,
          generationMethod: "live-store-query",
          liveDatabaseWriteExecuted: false,
        },
        nextAction:
          matches.length > 0
            ? "Review the live match before taking action."
            : "Wait for reciprocal interest before showing a match notice.",
      };

      return {
        success: true,
        data: clonePayload(data),
      };
    },
  };
}
