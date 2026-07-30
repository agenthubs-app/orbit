import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore } from "../../../shared/storage/live-record-store";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";

export type MatchmakingRequestStatus =
  | "awaiting_requester_confirmation"
  | "awaiting_target_consent"
  | "accepted"
  | "declined"
  | "scheduling"
  | "scheduled"
  | "met"
  | "followup_recorded";

export interface MatchmakingParticipant {
  participantId: string;
  actorId: string;
  displayName: string;
  organization?: string;
  role?: string;
  domains: readonly string[];
  goals: readonly string[];
  offers: readonly string[];
  needs: readonly string[];
  stage?: string;
  location?: string;
  availableSlots?: readonly string[];
  evidenceIds: readonly string[];
}

export interface ExplainableMatch {
  participantId: string;
  displayName: string;
  organization?: string;
  score: number;
  reasons: readonly string[];
  evidenceIds: readonly string[];
  contactDetailsDisclosed: false;
}

export interface MatchmakingIntroductionRequest {
  requestId: string;
  eventId: string;
  requesterParticipantId: string;
  requesterActorId: string;
  targetParticipantId: string;
  targetActorId: string;
  organizerActorId: string;
  status: MatchmakingRequestStatus;
  requesterConsentedAt: string;
  targetConsentedAt?: string;
  declinedAt?: string;
  proposedSlots: readonly string[];
  selectedSlot?: string;
  contactDetailsDisclosed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EventMatchmakingService {
  rank: (input: {
    eventId: string;
    requester: MatchmakingParticipant;
    candidates: readonly MatchmakingParticipant[];
    limit?: number;
  }) => readonly ExplainableMatch[];
  createIntroductionRequest: (input: {
    requestId: string;
    eventId: string;
    actorId: string;
    requesterParticipantId: string;
    requesterActorId: string;
    targetParticipantId: string;
    targetActorId: string;
    organizerActorId: string;
    proposedSlots?: readonly string[];
    now: string;
  }) => Promise<MatchmakingIntroductionRequest>;
  respondToIntroduction: (input: {
    requestId: string;
    actorId: string;
    accept: boolean;
    now: string;
  }) => Promise<MatchmakingIntroductionRequest>;
  proposeSlots: (input: {
    requestId: string;
    actorId: string;
    slots: readonly string[];
    now: string;
  }) => Promise<MatchmakingIntroductionRequest>;
  selectSlot: (input: {
    requestId: string;
    actorId: string;
    slot: string;
    now: string;
  }) => Promise<MatchmakingIntroductionRequest>;
  recordOutcome: (input: {
    requestId: string;
    actorId: string;
    outcome: "met" | "followup_recorded";
    now: string;
  }) => Promise<MatchmakingIntroductionRequest>;
  organizerMetrics: (input: { eventId: string; actorId: string }) => Promise<{
    eventId: string;
    suppressed: boolean;
    minimumCohort: 5;
    counts: Readonly<
      Record<
        | "requests"
        | "accepted"
        | "declined"
        | "scheduled"
        | "met"
        | "followups",
        number
      >
    >;
    privateMemoIncluded: false;
    relationshipHistoryIncluded: false;
    privateFollowupIncluded: false;
  }>;
  listRequests: (input: {
    eventId: string;
    actorId: string;
  }) => Promise<readonly MatchmakingIntroductionRequest[]>;
  getRequest: (input: {
    requestId: string;
    actorId: string;
  }) => Promise<MatchmakingIntroductionRequest | null>;
}

export class MatchmakingAccessError extends Error {
  readonly code = "MATCHMAKING_FORBIDDEN";

  constructor(message = "This matchmaking request is not accessible.") {
    super(message);
    this.name = "MatchmakingAccessError";
  }
}

function overlap(left: readonly string[], right: readonly string[]): string[] {
  const rightValues = new Set(right.map((item) => item.toLowerCase()));
  return left.filter((item) => rightValues.has(item.toLowerCase()));
}

function sameValues(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function recordFor(
  workspaceId: string,
  request: MatchmakingIntroductionRequest,
) {
  return {
    workspaceId,
    collectionName: "matchmakingIntroductionRequests",
    recordId: request.requestId,
    sourceType: "agent_action",
    sourceId: request.requestId,
    sourceLabel: "Orbit event matchmaking consent",
    evidenceIds: [],
    targetType: "event",
    targetId: request.eventId,
    occurredAt: request.createdAt,
    lifecycleState: "active" as const,
    searchText: `${request.eventId} ${request.requesterParticipantId} ${request.targetParticipantId} ${request.status}`,
    payload: request as unknown as Record<string, unknown>,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

export function createEventMatchmakingService(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): EventMatchmakingService {
  async function getRequestRecord(
    requestId: string,
  ): Promise<MatchmakingIntroductionRequest | null> {
    const record = await input.store.getRecord({
      workspaceId: input.workspaceId,
      collectionName: "matchmakingIntroductionRequests",
      recordId: requestId,
    });
    if (!record) return null;
    const payload = record.payload;
    return typeof payload.requestId === "string"
      ? (payload as unknown as MatchmakingIntroductionRequest)
      : null;
  }

  async function requireRequest(
    requestId: string,
  ): Promise<MatchmakingIntroductionRequest> {
    const request = await getRequestRecord(requestId);
    if (!request) throw new Error(`Introduction request ${requestId} not found.`);
    return request;
  }

  function requireActor(
    request: MatchmakingIntroductionRequest,
    actorId: string,
    allowedActorIds: readonly string[],
  ): void {
    if (!actorId.trim() || !allowedActorIds.includes(actorId)) {
      throw new MatchmakingAccessError();
    }
  }

  async function save(
    request: MatchmakingIntroductionRequest,
  ): Promise<MatchmakingIntroductionRequest> {
    await input.store.upsertRecord(recordFor(input.workspaceId, request));
    return request;
  }

  const service: EventMatchmakingService = {
    rank({ requester, candidates, limit = 3 }) {
      return candidates
        .filter(
          (candidate) => candidate.participantId !== requester.participantId,
        )
        .map((candidate): ExplainableMatch => {
          const domainMatches = overlap(requester.domains, candidate.domains);
          const candidateMeetsNeeds = overlap(
            requester.needs,
            candidate.offers,
          );
          const requesterMeetsNeeds = overlap(
            requester.offers,
            candidate.needs,
          );
          const goalMatches = overlap(requester.goals, candidate.goals);
          const sameLocation =
            Boolean(requester.location) &&
            requester.location === candidate.location;
          const sharedSlots = overlap(
            requester.availableSlots ?? [],
            candidate.availableSlots ?? [],
          );
          const reasons = [
            ...domainMatches.map((value) => `共同领域：${value}`),
            ...candidateMeetsNeeds.map(
              (value) => `对方可提供你需要的：${value}`,
            ),
            ...requesterMeetsNeeds.map(
              (value) => `你可提供对方需要的：${value}`,
            ),
            ...goalMatches.map((value) => `共同目标：${value}`),
            ...(sameLocation ? ["地点匹配"] : []),
            ...(sharedSlots.length ? ["有重叠可用时间"] : []),
          ];
          const score = Math.min(
            100,
            domainMatches.length * 15 +
              candidateMeetsNeeds.length * 25 +
              requesterMeetsNeeds.length * 20 +
              goalMatches.length * 15 +
              (sameLocation ? 5 : 0) +
              (sharedSlots.length ? 10 : 0),
          );
          return {
            participantId: candidate.participantId,
            displayName: candidate.displayName,
            organization: candidate.organization,
            score,
            reasons:
              reasons.length > 0
                ? reasons
                : ["活动画像存在弱相关，需要你进一步判断。"],
            evidenceIds: candidate.evidenceIds,
            contactDetailsDisclosed: false,
          };
        })
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.min(3, Math.max(1, limit)));
    },
    async createIntroductionRequest(request) {
      if (
        !request.actorId.trim() ||
        request.actorId !== request.requesterActorId ||
        !request.targetActorId.trim() ||
        !request.organizerActorId.trim() ||
        request.requesterActorId === request.targetActorId
      ) {
        throw new MatchmakingAccessError(
          "Only the requester can create an introduction request.",
        );
      }
      const existing = await getRequestRecord(request.requestId);
      if (existing) {
        requireActor(existing, request.actorId, [existing.requesterActorId]);
        return existing;
      }
      return save({
        requestId: request.requestId,
        eventId: request.eventId,
        requesterParticipantId: request.requesterParticipantId,
        requesterActorId: request.requesterActorId,
        targetParticipantId: request.targetParticipantId,
        targetActorId: request.targetActorId,
        organizerActorId: request.organizerActorId,
        status: "awaiting_target_consent",
        requesterConsentedAt: request.now,
        proposedSlots: request.proposedSlots?.slice(0, 5) ?? [],
        contactDetailsDisclosed: false,
        createdAt: request.now,
        updatedAt: request.now,
      });
    },
    async respondToIntroduction(response) {
      const request = await requireRequest(response.requestId);
      requireActor(request, response.actorId, [request.targetActorId]);
      if (request.status !== "awaiting_target_consent") {
        return request;
      }
      return save({
        ...request,
        status: response.accept
          ? request.proposedSlots.length > 0
            ? "scheduling"
            : "accepted"
          : "declined",
        targetConsentedAt: response.accept ? response.now : undefined,
        declinedAt: response.accept ? undefined : response.now,
        contactDetailsDisclosed: response.accept,
        updatedAt: response.now,
      });
    },
    async proposeSlots(proposal) {
      const request = await requireRequest(proposal.requestId);
      requireActor(request, proposal.actorId, [request.requesterActorId]);
      if (!request.targetConsentedAt) {
        throw new Error("Both participants must consent before scheduling.");
      }
      const proposedSlots = proposal.slots.slice(0, 5);
      if (
        request.status === "scheduling" &&
        sameValues(request.proposedSlots, proposedSlots)
      ) {
        return request;
      }
      if (request.status !== "accepted" && request.status !== "scheduling") {
        throw new Error(
          "Only an accepted or actively scheduling introduction can propose times.",
        );
      }
      return save({
        ...request,
        proposedSlots,
        status: "scheduling",
        updatedAt: proposal.now,
      });
    },
    async selectSlot(selection) {
      const request = await requireRequest(selection.requestId);
      requireActor(request, selection.actorId, [request.targetActorId]);
      if (request.status === "scheduled") {
        if (request.selectedSlot === selection.slot) return request;
        throw new Error(
          "This introduction is already scheduled; use an explicit rescheduling flow to change it.",
        );
      }
      if (
        request.status !== "scheduling" ||
        !request.targetConsentedAt ||
        !request.proposedSlots.includes(selection.slot)
      ) {
        throw new Error(
          "A mutually consented request and proposed slot are required.",
        );
      }
      return save({
        ...request,
        selectedSlot: selection.slot,
        status: "scheduled",
        contactDetailsDisclosed: true,
        updatedAt: selection.now,
      });
    },
    async recordOutcome(outcome) {
      const request = await requireRequest(outcome.requestId);
      requireActor(request, outcome.actorId, [
        request.requesterActorId,
        request.targetActorId,
      ]);
      if (outcome.outcome === "met") {
        if (request.status === "met" || request.status === "followup_recorded") {
          return request;
        }
        if (request.status !== "scheduled") {
          throw new Error(
            "A scheduled introduction is required before recording a meeting.",
          );
        }
      } else if (request.status === "followup_recorded") {
        return request;
      } else if (request.status !== "met") {
        throw new Error(
          "A completed meeting is required before recording follow-up.",
        );
      }
      return save({
        ...request,
        status: outcome.outcome,
        updatedAt: outcome.now,
      });
    },
    async organizerMetrics({ eventId, actorId }) {
      const records = await input.store.listRecords({
        workspaceId: input.workspaceId,
        collectionName: "matchmakingIntroductionRequests",
      });
      const requests = records.flatMap((record) => {
        const payload = record.payload;
        return payload.eventId === eventId &&
          typeof payload.status === "string"
          ? [payload as unknown as MatchmakingIntroductionRequest]
          : [];
      });
      if (
        requests.some(
          (request) =>
            !request.organizerActorId ||
            request.organizerActorId !== actorId,
        )
      ) {
        throw new MatchmakingAccessError(
          "Only the event organizer can view matchmaking metrics.",
        );
      }
      const independentParticipants = new Set(
        requests.map((request) => request.requesterActorId),
      );
      const suppressed = independentParticipants.size < 5;
      const counts = suppressed
        ? {
            requests: 0,
            accepted: 0,
            declined: 0,
            scheduled: 0,
            met: 0,
            followups: 0,
          }
        : {
            requests: requests.length,
            accepted: requests.filter((request) =>
              [
                "accepted",
                "scheduling",
                "scheduled",
                "met",
                "followup_recorded",
              ].includes(request.status),
            ).length,
            declined: requests.filter(
              (request) => request.status === "declined",
            ).length,
            scheduled: requests.filter((request) =>
              ["scheduled", "met", "followup_recorded"].includes(
                request.status,
              ),
            ).length,
            met: requests.filter((request) =>
              ["met", "followup_recorded"].includes(request.status),
            ).length,
            followups: requests.filter(
              (request) => request.status === "followup_recorded",
            ).length,
          };
      return {
        eventId,
        suppressed,
        minimumCohort: 5,
        counts,
        privateMemoIncluded: false,
        relationshipHistoryIncluded: false,
        privateFollowupIncluded: false,
      };
    },
    async listRequests({ eventId, actorId }) {
      const records = await input.store.listRecords({
        workspaceId: input.workspaceId,
        collectionName: "matchmakingIntroductionRequests",
        targetId: eventId,
        targetType: "event",
      });
      return records.flatMap((record) => {
        const payload = record.payload;
        if (
          typeof payload.requestId !== "string" ||
          payload.eventId !== eventId
        ) {
          return [];
        }
        const request =
          payload as unknown as MatchmakingIntroductionRequest;
        return request.requesterActorId === actorId ||
          request.targetActorId === actorId
          ? [request]
          : [];
      });
    },
    async getRequest({ requestId, actorId }) {
      const request = await getRequestRecord(requestId);
      if (!request) return null;
      requireActor(request, actorId, [
        request.requesterActorId,
        request.targetActorId,
        request.organizerActorId,
      ]);
      return request;
    },
  };

  return service;
}

interface EventMatchmakingRuntimeGlobal {
  __orbitEventMatchmakingServices?: Map<string, EventMatchmakingService>;
}

export function createConfiguredEventMatchmakingService(): EventMatchmakingService {
  const runtimeGlobal = globalThis as typeof globalThis &
    EventMatchmakingRuntimeGlobal;
  const services =
    runtimeGlobal.__orbitEventMatchmakingServices ??
    new Map<string, EventMatchmakingService>();
  runtimeGlobal.__orbitEventMatchmakingServices = services;
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Event matchmaking requires ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL.",
      );
    }
    const developmentWorkspaceId = "development-event-matchmaking";
    const developmentCached = services.get(developmentWorkspaceId);
    if (developmentCached) return developmentCached;
    const developmentService = createEventMatchmakingService({
      store: createMemoryLiveRecordStore(),
      workspaceId: developmentWorkspaceId,
    });
    services.set(developmentWorkspaceId, developmentService);
    return developmentService;
  }
  const workspaceId = configured.workspaceId;
  const cached = services.get(workspaceId);
  if (cached) return cached;
  const service = createEventMatchmakingService({
    store: configured.store,
    workspaceId,
  });
  services.set(workspaceId, service);
  return service;
}
