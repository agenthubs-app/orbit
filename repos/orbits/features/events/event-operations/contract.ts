import type { EventParticipantProfileAnswers } from "../registration/contract";

export const EVENT_OPERATIONS_COLLECTIONS = {
  configurations: "event_operations_configurations",
  contactRequests: "event_operations_contact_requests",
  generations: "event_operations_generations",
  publishedResults: "event_operations_published_results",
  tasks: "event_operations_generation_tasks",
  checkIns: "event_operations_check_ins",
} as const;

export type EventOperationsGenerationStatus =
  | "queued"
  | "running"
  | "failed"
  | "completed"
  | "published"
  | "superseded";

export type EventOperationsTaskStatus =
  | "queued"
  | "running"
  | "failed"
  | "completed";

export type EventOperationsTaskKind =
  | "recommendation_shard"
  | "grouping_feature_shard"
  | "grouping_reduce"
  | "table_content_shard";

export interface EventOperationsParticipant {
  actorId: string;
  company: string | null;
  displayName: string;
  energyStyle: string | null;
  evidenceIds: readonly string[];
  experienceHighlight: string | null;
  industry: string | null;
  languages: readonly string[];
  lateRegistration: boolean;
  needs: readonly string[];
  offers: readonly string[];
  participantId: string;
  profileCompleteness: "complete" | "partial" | "minimal";
  /** Complete typed event-profile facets. Optional only for persisted v2 snapshots. */
  profileAnswers?: EventParticipantProfileAnswers;
  role: string | null;
  seniority: string | null;
  topics: readonly string[];
}

export interface EventOperationsConfiguration {
  checkInOpensAt: string;
  eventEndsAt: string;
  eventId: string;
  eventStartsAt: string;
  maxAttemptsPerTask: number;
  organizerActorId: string;
  profileEditDeadlineAt: string;
  registrationCutoffAt: string;
  recommendationCount: number;
  resultsAvailableAt: string;
  roundOneStartsAt: string;
  roundTwoStartsAt: string;
  shardSize: number;
  tableSize: number;
  updatedAt: string;
}

export interface EventOperationsSnapshot {
  capturedAt: string;
  hash: string;
  participants: readonly EventOperationsParticipant[];
}

export interface EventOperationsSnapshotSourceVersion {
  actorId: string;
  membershipVersion: number;
  participantId: string;
  profileVersion: number;
  /** Present only for registrations submitted against a published question set. */
  questionSetHash?: string;
  questionSetVersion?: number;
}

export interface EventOperationsCapturedSnapshot {
  configuration: EventOperationsConfiguration;
  configurationHash: string;
  configurationVersion: number;
  snapshot: EventOperationsSnapshot;
  sourceVersions: readonly EventOperationsSnapshotSourceVersion[];
}

export interface EventOperationsRecommendation {
  icebreakers: readonly [string, string];
  memberHint: string;
  rank: number;
  reasons: readonly [string, ...string[]];
  score: number;
  targetParticipantId: string;
}

export interface EventOperationsParticipantRecommendations {
  noMatchReason: string | null;
  recommendations: readonly EventOperationsRecommendation[];
  sourceParticipantId: string;
}

export interface EventOperationsTableMember {
  participantId: string;
  seat: string;
}

export interface EventOperationsTable {
  icebreakers: readonly [string, string, string];
  memberPrompts: Readonly<Record<string, readonly [string, string]>>;
  memberRationales: Readonly<Record<string, string>>;
  members: readonly EventOperationsTableMember[];
  rationale: string;
  tableNumber: number;
  theme: string;
}

export interface EventOperationsGroupingResult {
  roundOne: readonly EventOperationsTable[];
  roundTwo: readonly EventOperationsTable[];
}

export interface EventOperationsCandidate {
  featurePayload: Readonly<Record<string, string | number | boolean>>;
  generationId: string;
  retrievalRank: number;
  retrievalScore: number;
  sourceParticipantId: string;
  targetParticipantId: string;
}

export interface EventOperationsGroupingFeature {
  affinityParticipantIds: readonly string[];
  facilitationHint: string;
  participantId: string;
  primaryTopic: string;
  secondaryTopic: string;
}

export interface EventOperationsGraphNode {
  company: string | null;
  displayName: string;
  participantId: string;
}

export interface EventOperationsGraphEdge {
  fromParticipantId: string;
  id: string;
  kind: "recommendation" | "round_one_table" | "round_two_topic";
  label: string;
  toParticipantId: string;
}

export interface EventOperationsRelationshipGraph {
  edges: readonly EventOperationsGraphEdge[];
  nodes: readonly EventOperationsGraphNode[];
}

export interface EventOperationsGeneration {
  aiRequestFingerprint: string;
  completedAt: string | null;
  createdAt: string;
  errorCode: EventOperationsFailureCode | null;
  errorMessage: string | null;
  eventId: string;
  expectedTaskCount: number;
  generationId: string;
  idempotencyKey: string;
  organizerActorId: string;
  publishedAt: string | null;
  snapshot: EventOperationsSnapshot;
  status: EventOperationsGenerationStatus;
  updatedAt: string;
}

export interface EventOperationsRecommendationTaskOutput {
  kind: "recommendation_shard";
  recommendations: readonly EventOperationsParticipantRecommendations[];
}

export interface EventOperationsGroupingTaskOutput {
  assignments: readonly {
    participantIds: readonly string[];
    roundNumber: 1 | 2;
    tableNumber: number;
  }[];
  kind: "grouping_reduce";
}

export interface EventOperationsGroupingFeatureTaskOutput {
  features: readonly EventOperationsGroupingFeature[];
  kind: "grouping_feature_shard";
}

export interface EventOperationsTableContentTaskOutput {
  kind: "table_content_shard";
  roundNumber: 1 | 2;
  table: EventOperationsTable;
}

export type EventOperationsTaskOutput =
  | EventOperationsRecommendationTaskOutput
  | EventOperationsGroupingFeatureTaskOutput
  | EventOperationsTableContentTaskOutput
  | EventOperationsGroupingTaskOutput;

export interface EventOperationsGenerationTask {
  attemptLimit: number;
  attempts: number;
  completedAt: string | null;
  createdAt: string;
  dependsOnTaskIds: readonly string[];
  errorCode: EventOperationsFailureCode | null;
  errorMessage: string | null;
  eventId: string;
  generationId: string;
  kind: EventOperationsTaskKind;
  leaseExpiresAt: string | null;
  leaseEpoch: number;
  leaseToken: string | null;
  output: EventOperationsTaskOutput | null;
  participantIds: readonly string[];
  retryRound: number;
  status: EventOperationsTaskStatus;
  taskId: string;
  updatedAt: string;
  workerId: string | null;
}

export interface EventOperationsPublishedResult {
  directory: readonly EventOperationsParticipant[];
  eventId: string;
  generationId: string;
  graph: EventOperationsRelationshipGraph;
  grouping: EventOperationsGroupingResult;
  profileEditDeadlineAt: string;
  publishedAt: string;
  recommendations: readonly EventOperationsParticipantRecommendations[];
  resultsAvailableAt: string;
  snapshotHash: string;
}

export interface EventOperationsCheckIn {
  actorId: string;
  checkedInAt: string;
  eventId: string;
  evidenceId: string;
  participantId: string;
}

export type EventContactRequestStatus =
  | "awaiting_target_consent"
  | "accepted"
  | "declined"
  | "withdrawn";

export interface EventContactRequest {
  acceptedAt: string | null;
  /**
   * The contact owned by the actor for whom this DTO was loaded. The other
   * participant's contact identity is deliberately never part of this DTO.
   */
  contactId: string | null;
  createdAt: string;
  declinedAt: string | null;
  eventId: string;
  requestId: string;
  revision: number;
  requesterParticipantId: string;
  status: EventContactRequestStatus;
  targetParticipantId: string;
  updatedAt: string;
  withdrawnAt: string | null;
}

export const EVENT_OPERATIONS_FAILURE_CODES = [
  "EVENT_OPERATIONS_FORBIDDEN",
  "EVENT_OPERATIONS_CONFIGURATION_INVALID",
  "EVENT_OPERATIONS_NOT_CONFIGURED",
  "EVENT_OPERATIONS_GENERATION_NOT_FOUND",
  "EVENT_OPERATIONS_GENERATION_NOT_READY",
  "EVENT_OPERATIONS_AI_UNAVAILABLE",
  "EVENT_OPERATIONS_AI_TIMEOUT",
  "EVENT_OPERATIONS_AI_JSON_INVALID",
  "EVENT_OPERATIONS_AI_SCHEMA_INVALID",
  "EVENT_OPERATIONS_SHARD_FAILED",
  "EVENT_OPERATIONS_LEASE_LOST",
  "EVENT_OPERATIONS_RESULTS_LOCKED",
  "EVENT_OPERATIONS_CHECK_IN_CLOSED",
  "EVENT_OPERATIONS_PARTICIPANT_NOT_FOUND",
  "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
  "EVENT_OPERATIONS_CONTACT_WRITE_FAILED",
  "EVENT_OPERATIONS_DURABLE_WORKER_REQUIRED",
] as const;

export type EventOperationsFailureCode =
  (typeof EVENT_OPERATIONS_FAILURE_CODES)[number];

export class EventOperationsError extends Error {
  readonly code: EventOperationsFailureCode;

  constructor(code: EventOperationsFailureCode, message: string) {
    super(message);
    this.code = code;
    this.name = "EventOperationsError";
  }
}

export interface EventOperationsAiUsage {
  cacheHitTokens: number | null;
  completionTokens: number | null;
  promptTokens: number | null;
  reasoningTokens: number | null;
}

/** Provider-neutral response accounting owned by Event Operations. */
export interface EventOperationsAiResponseMetadata {
  finishReason: string | null;
  providerResponseBytes: number;
  usage: EventOperationsAiUsage | null;
}

export type EventOperationsJsonFailureShape =
  | "empty"
  | "fence_or_prefix"
  | "trailing_text"
  | "unterminated_envelope"
  | "parse_syntax";

export type EventOperationsAiResult<TValue> =
  | {
      data: TValue;
      model: string;
      responseMetadata?: EventOperationsAiResponseMetadata;
      provider: string;
      success: true;
    }
  | {
      error: {
        code:
          | "AI_UNAVAILABLE"
          | "AI_TIMEOUT"
          | "AI_JSON_INVALID"
          | "AI_SCHEMA_INVALID"
          | "AI_REQUEST_FAILED";
        message: string;
        jsonFailureShape?: EventOperationsJsonFailureShape;
      };
      responseMetadata?: EventOperationsAiResponseMetadata;
      retryable?: boolean;
      success: false;
    };

export interface EventOperationsAiProvider {
  readonly requestFingerprint?: string;
  generateGroupingFeatures(input: {
    eventId: string;
    maxAffinityCount: number;
    sources: readonly {
      candidateParticipants: readonly EventOperationsParticipant[];
      recommendations: EventOperationsParticipantRecommendations;
      sourceParticipant: EventOperationsParticipant;
    }[];
  }): Promise<
    EventOperationsAiResult<readonly EventOperationsGroupingFeature[]>
  >;
  generateRecommendations(input: {
    eventId: string;
    recommendationCount: number;
    sources: readonly {
      candidateParticipants: readonly EventOperationsParticipant[];
      sourceParticipant: EventOperationsParticipant;
    }[];
  }): Promise<
    EventOperationsAiResult<readonly EventOperationsParticipantRecommendations[]>
  >;
  generateTableContent(input: {
    eventId: string;
    features: readonly EventOperationsGroupingFeature[];
    members: readonly EventOperationsParticipant[];
    roundNumber: 1 | 2;
    tableNumber: number;
  }): Promise<EventOperationsAiResult<EventOperationsTable>>;
}

export interface EventOperationsProgress {
  claimedTasks: number;
  completedTasks: number;
  failedTasks: number;
  generationId: string;
  percent: number;
  queuedTasks: number;
  runningTasks: number;
  status: EventOperationsGenerationStatus;
  totalTasks: number;
}
