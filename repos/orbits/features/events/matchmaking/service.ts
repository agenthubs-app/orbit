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
  targetParticipantId: string;
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
    requesterParticipantId: string;
    targetParticipantId: string;
    proposedSlots?: readonly string[];
    now: string;
  }) => Promise<MatchmakingIntroductionRequest>;
  respondToIntroduction: (input: {
    requestId: string;
    accept: boolean;
    now: string;
  }) => Promise<MatchmakingIntroductionRequest>;
  proposeSlots: (input: {
    requestId: string;
    slots: readonly string[];
    now: string;
  }) => Promise<MatchmakingIntroductionRequest>;
  selectSlot: (input: {
    requestId: string;
    slot: string;
    now: string;
  }) => Promise<MatchmakingIntroductionRequest>;
  recordOutcome: (input: {
    requestId: string;
    outcome: "met" | "followup_recorded";
    now: string;
  }) => Promise<MatchmakingIntroductionRequest>;
  organizerMetrics: (eventId: string) => Promise<{
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
  getRequest: (
    requestId: string,
  ) => Promise<MatchmakingIntroductionRequest | null>;
}

function overlap(left: readonly string[], right: readonly string[]): string[] {
  const rightValues = new Set(right.map((item) => item.toLowerCase()));
  return left.filter((item) => rightValues.has(item.toLowerCase()));
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
  async function requireRequest(
    requestId: string,
  ): Promise<MatchmakingIntroductionRequest> {
    const request = await service.getRequest(requestId);
    if (!request) throw new Error(`Introduction request ${requestId} not found.`);
    return request;
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
      const existing = await service.getRequest(request.requestId);
      if (existing) return existing;
      return save({
        requestId: request.requestId,
        eventId: request.eventId,
        requesterParticipantId: request.requesterParticipantId,
        targetParticipantId: request.targetParticipantId,
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
      if (!request.targetConsentedAt) {
        throw new Error("Both participants must consent before scheduling.");
      }
      return save({
        ...request,
        proposedSlots: proposal.slots.slice(0, 5),
        status: "scheduling",
        updatedAt: proposal.now,
      });
    },
    async selectSlot(selection) {
      const request = await requireRequest(selection.requestId);
      if (
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
    async organizerMetrics(eventId) {
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
      const suppressed = requests.length < 5;
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
    async getRequest(requestId) {
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
    },
  };

  return service;
}

let cachedDefault: EventMatchmakingService | null = null;

export function createConfiguredEventMatchmakingService(): EventMatchmakingService {
  if (cachedDefault) return cachedDefault;
  const configured = createConfiguredPostgresLiveRecordStore();
  cachedDefault = configured
    ? createEventMatchmakingService({
        store: configured.store,
        workspaceId: configured.workspaceId,
      })
    : createEventMatchmakingService({
        store: createMemoryLiveRecordStore(),
        workspaceId: "mock-event-matchmaking",
      });
  return cachedDefault;
}
