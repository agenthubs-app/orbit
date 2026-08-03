import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  CancelEventRegistrationInput,
  EventRegistration,
  RegisterForEventInput,
} from "../registration/contract";
import type {
  EventContactRequest,
  EventOperationsCheckIn,
  EventOperationsCandidate,
  EventOperationsCapturedSnapshot,
  EventOperationsConfiguration,
  EventOperationsFailureCode,
  EventOperationsGeneration,
  EventOperationsGenerationTask,
  EventOperationsPublishedResult,
  EventOperationsTaskOutput,
} from "./contract";
import { createPostgresEventOperationsRepository } from "./storage/postgres-repository";
import { createConfiguredEventOperationsPostgresRuntime } from "./storage/postgres-client";

export interface InitializeEventOperationsGenerationInput {
  candidates: readonly EventOperationsCandidate[];
  capturedSnapshot: EventOperationsCapturedSnapshot;
  generation: EventOperationsGeneration;
  tasks: readonly EventOperationsGenerationTask[];
}

export interface ClaimEventOperationsTasksInput {
  aiRequestFingerprint: string;
  generationId: string;
  leaseMs: number;
  leaseTokenPrefix: string;
  limit: number;
  now: string;
  workerId: string;
}

export interface CompleteEventOperationsTaskInput {
  artifact: {
    evidenceMetadata: Readonly<Record<string, unknown>>;
    kind: string;
    model: string;
    provider: string;
    requestHash: string;
    responseHash: string;
    schemaVersion: number;
  };
  completedAt: string;
  leaseEpoch: number;
  leaseToken: string;
  output: EventOperationsTaskOutput;
  taskId: string;
}

export interface FailEventOperationsTaskInput {
  code: EventOperationsFailureCode;
  failedAt: string;
  leaseEpoch: number;
  leaseToken: string;
  message: string;
  retryable: boolean;
  taskId: string;
}

export interface HeartbeatEventOperationsTaskInput {
  heartbeatAt: string;
  leaseEpoch: number;
  leaseMs: number;
  leaseToken: string;
  taskId: string;
  workerId: string;
}

export interface CreateEventOperationsCheckInInput {
  actorId: string;
  eventId: string;
  participantId?: string;
}

export interface CreateEventContactRequestInput {
  eventId: string;
  requesterActorId: string;
  targetParticipantId: string;
}

export interface RespondToEventContactRequestInput {
  accept: boolean;
  eventId: string;
  requestId: string;
  targetActorId: string;
}

export interface EventOperationsRepository {
  activateCanonicalRegistrations(
    eventId: string,
    registrations: readonly EventRegistration[],
  ): Promise<{
    count: number;
    hash: string;
    state: "canonical";
  }>;
  cancelCanonicalRegistration(
    input: CancelEventRegistrationInput,
  ): Promise<EventRegistration | null>;
  captureGenerationSnapshot(
    eventId: string,
  ): Promise<EventOperationsCapturedSnapshot>;
  checkInAtomically(
    input: CreateEventOperationsCheckInInput,
  ): Promise<EventOperationsCheckIn>;
  claimTasks(
    input: ClaimEventOperationsTasksInput,
  ): Promise<readonly EventOperationsGenerationTask[]>;
  completeTask(input: CompleteEventOperationsTaskInput): Promise<boolean>;
  createContactRequestAtomically(
    input: CreateEventContactRequestInput,
  ): Promise<EventContactRequest>;
  failTask(input: FailEventOperationsTaskInput): Promise<boolean>;
  finalizeGeneration(
    generationId: string,
    finalizedAt: string,
  ): Promise<EventOperationsGeneration>;
  findGenerationByIdempotencyKey(
    eventId: string,
    idempotencyKey: string,
  ): Promise<EventOperationsGeneration | null>;
  getCheckIn(
    eventId: string,
    actorId: string,
  ): Promise<EventOperationsCheckIn | null>;
  getCanonicalRegistration(
    eventId: string,
    userId: string,
  ): Promise<EventRegistration | null>;
  getConfiguration(eventId: string): Promise<EventOperationsConfiguration | null>;
  getGeneration(generationId: string): Promise<EventOperationsGeneration | null>;
  getGenerationConfiguration(
    generationId: string,
  ): Promise<EventOperationsConfiguration | null>;
  getPublishedResult(eventId: string): Promise<EventOperationsPublishedResult | null>;
  getPublishedResultForAttendee(
    eventId: string,
  ): Promise<EventOperationsPublishedResult | null>;
  getTask(taskId: string): Promise<EventOperationsGenerationTask | null>;
  heartbeatTask(input: HeartbeatEventOperationsTaskInput): Promise<boolean>;
  initializeGeneration(
    input: InitializeEventOperationsGenerationInput,
  ): Promise<EventOperationsGeneration>;
  listCheckIns(eventId: string): Promise<readonly EventOperationsCheckIn[]>;
  listCandidates(
    generationId: string,
    sourceParticipantIds: readonly string[],
  ): Promise<readonly EventOperationsCandidate[]>;
  listCanonicalRegistrations(
    eventId: string,
  ): Promise<readonly EventRegistration[]>;
  listContactRequests(
    eventId: string,
    viewerActorId: string | null,
  ): Promise<readonly EventContactRequest[]>;
  listGenerations(eventId: string): Promise<readonly EventOperationsGeneration[]>;
  listTasks(generationId: string): Promise<readonly EventOperationsGenerationTask[]>;
  publishGenerationAtomically(
    value: EventOperationsPublishedResult,
    organizerActorId: string,
  ): Promise<EventOperationsPublishedResult>;
  resetEventForSeed(eventId: string): Promise<void>;
  registerCanonicalParticipant(
    input: RegisterForEventInput,
  ): Promise<EventRegistration>;
  respondToContactRequestAtomically(
    input: RespondToEventContactRequestInput,
  ): Promise<EventContactRequest>;
  retryFailedGeneration(
    generationId: string,
    retriedAt: string,
  ): Promise<EventOperationsGeneration>;
  saveConfiguration(
    value: EventOperationsConfiguration,
  ): Promise<EventOperationsConfiguration>;
  seedCanonicalRegistration(value: EventRegistration): Promise<EventRegistration>;
}

export interface ConfiguredEventOperationsRepositoryOptions {
  env?: LiveDatabaseEnv;
  max?: number;
}

export function createConfiguredEventOperationsRepository({
  env,
  max,
}: ConfiguredEventOperationsRepositoryOptions = {}): EventOperationsRepository | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime({ env, max });
  if (!runtime) return null;

  return createPostgresEventOperationsRepository(runtime);
}
