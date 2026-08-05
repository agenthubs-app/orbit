import { createHash } from "node:crypto";

import {
  EventOperationsError,
  type EventContactRequest,
  type EventOperationsCandidate,
  type EventOperationsCheckIn,
  type EventOperationsConfiguration,
  type EventOperationsFailureCode,
  type EventOperationsGeneration,
  type EventOperationsGenerationTask,
  type EventOperationsPublishedResult,
} from "../contract";
import type { EventRegistration } from "../../registration/contract";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../registration/service";
import { EventRegistrationWindowError } from "../../registration/deadline-gated-service";
import { eventOperationsParticipantFromRegistration } from "../participant";
import type {
  CanonicalRegistrationMigrationOptions,
  CreateEventContactRequestInput,
  CreateEventOperationsCheckInInput,
  EventOperationsGenerationPublishAuthorization,
  EventOperationsGenerationRunAuthorization,
  EventOperationsTaskAttemptTelemetry,
  EventOperationsRepository,
  InitializeEventOperationsGenerationInput,
  ListEventOperationsLimitedCheckInRosterInput,
  RespondToEventContactRequestInput,
  SaveEventOperationsConfigurationAsOperatorInput,
  WithdrawEventContactRequestInput,
} from "../repository";

interface MemoryContactRequestRecord
  extends Omit<EventContactRequest, "contactId"> {
  contactIdsByActor: Readonly<Record<string, string>>;
  requesterActorId: string;
  targetActorId: string;
}

function clone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function checkInKey(eventId: string, actorId: string): string {
  return `${eventId}\u0000${actorId}`;
}

function taskAttemptKey(
  taskId: string,
  attempt: number,
  leaseEpoch: number,
): string {
  return `${taskId}\u0000${attempt}\u0000${leaseEpoch}`;
}

function digest(...values: readonly string[]): string {
  const hash = createHash("sha256");
  for (const value of values) hash.update(value).update("\u0000");
  return hash.digest("hex").slice(0, 28);
}

function contactRequestForViewer(
  value: MemoryContactRequestRecord,
  viewerActorId: string | null,
): EventContactRequest {
  return clone({
    acceptedAt: value.acceptedAt,
    contactId:
      value.status === "accepted" && viewerActorId
        ? value.contactIdsByActor[viewerActorId] ?? null
        : null,
    createdAt: value.createdAt,
    declinedAt: value.declinedAt,
    eventId: value.eventId,
    requestId: value.requestId,
    revision: value.revision,
    requesterParticipantId: value.requesterParticipantId,
    status: value.status,
    targetParticipantId: value.targetParticipantId,
    updatedAt: value.updatedAt,
    withdrawnAt: value.withdrawnAt,
  });
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function snapshotHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function assertTopology(input: InitializeEventOperationsGenerationInput): void {
  if (
    snapshotHash(input.capturedSnapshot.configuration) !==
      input.capturedSnapshot.configurationHash ||
    input.capturedSnapshot.configuration.eventId !==
      input.generation.eventId ||
    input.capturedSnapshot.snapshot.hash !== input.generation.snapshot.hash ||
    snapshotHash(input.capturedSnapshot.snapshot.participants) !==
      snapshotHash(input.generation.snapshot.participants) ||
    input.capturedSnapshot.sourceVersions.length !==
      input.generation.snapshot.participants.length
  ) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_CONFIGURATION_INVALID",
      "Generation topology must use the captured canonical snapshot unchanged.",
    );
  }
  if (
    input.generation.expectedTaskCount <= 0 ||
    input.generation.expectedTaskCount !== input.tasks.length
  ) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_CONFIGURATION_INVALID",
      "Generation initialization requires the exact expected task topology.",
    );
  }
  const ids = new Set(input.tasks.map((task) => task.taskId));
  if (ids.size !== input.tasks.length) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_CONFIGURATION_INVALID",
      "Generation task ids must be unique.",
    );
  }
  for (const task of input.tasks) {
    if (
      task.eventId !== input.generation.eventId ||
      task.generationId !== input.generation.generationId ||
      task.dependsOnTaskIds.some(
        (dependencyId) => dependencyId === task.taskId || !ids.has(dependencyId),
      )
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_CONFIGURATION_INVALID",
        "Generation tasks contain an invalid event, generation, or dependency.",
      );
    }
  }
  const participantIds = new Set(
    input.generation.snapshot.participants.map(
      (participant) => participant.participantId,
    ),
  );
  const candidateKeys = new Set<string>();
  for (const candidate of input.candidates) {
    const key = `${candidate.sourceParticipantId}\u0000${candidate.targetParticipantId}`;
    if (
      candidate.generationId !== input.generation.generationId ||
      candidate.sourceParticipantId === candidate.targetParticipantId ||
      !participantIds.has(candidate.sourceParticipantId) ||
      !participantIds.has(candidate.targetParticipantId) ||
      !Number.isInteger(candidate.retrievalRank) ||
      candidate.retrievalRank < 1 ||
      !Number.isFinite(candidate.retrievalScore) ||
      candidateKeys.has(key)
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_CONFIGURATION_INVALID",
        "The deterministic candidate topology is invalid.",
      );
    }
    candidateKeys.add(key);
  }
}

export interface MemoryEventOperationsRepository
  extends EventOperationsRepository {
  replaceGenerationForTest(
    value: EventOperationsGeneration,
  ): Promise<EventOperationsGeneration>;
  replaceTaskForTest(
    value: EventOperationsGenerationTask,
  ): Promise<EventOperationsGenerationTask>;
}

export interface CreateMemoryEventOperationsRepositoryOptions {
  canAuthorizeGeneration?: (
    input:
      | EventOperationsGenerationPublishAuthorization
      | EventOperationsGenerationRunAuthorization,
  ) => boolean | Promise<boolean>;
  canConfigureEvent?: (
    input: SaveEventOperationsConfigurationAsOperatorInput,
  ) => boolean | Promise<boolean>;
  canReadLimitedCheckInRoster?: (
    input: ListEventOperationsLimitedCheckInRosterInput,
  ) => boolean | Promise<boolean>;
  canonicalRegistrations?: readonly EventRegistration[];
  configurations?: readonly EventOperationsConfiguration[];
  now?: () => string;
  publishedEventIds?: readonly string[];
}

function requireMemoryMigrationManifest(
  options: CanonicalRegistrationMigrationOptions | undefined,
): void {
  if (!options) {
    throw new EventRegistrationWindowError(
      "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
      "Canonical membership migration without an operations configuration requires an explicit operator manifest.",
    );
  }
  if (
    options.source !== "operator_manifest" ||
    typeof options.evidenceId !== "string" ||
    !options.evidenceId.trim()
  ) {
    throw new EventRegistrationWindowError(
      "EVENT_REGISTRATION_WINDOW_INVALID",
      "Canonical membership migration requires a valid operator manifest source and evidenceId.",
    );
  }
  const parsed = Date.parse(options.profileEditDeadlineAt);
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString() !== options.profileEditDeadlineAt
  ) {
    throw new EventRegistrationWindowError(
      "EVENT_REGISTRATION_WINDOW_INVALID",
      "Canonical membership migration requires profileEditDeadlineAt to be a canonical ISO timestamp.",
    );
  }
}

export function createMemoryEventOperationsRepository(
  options: CreateMemoryEventOperationsRepositoryOptions = {},
): MemoryEventOperationsRepository {
  const canonicalRegistrationProvider = createMemoryEventRegistrationProvider(
    options.canonicalRegistrations,
  );
  const canonicalRegistrationService = createEventRegistrationService({
    now: options.now,
    provider: canonicalRegistrationProvider,
  });
  const checkIns = new Map<string, EventOperationsCheckIn>();
  const candidates = new Map<string, EventOperationsCandidate>();
  const configurations = new Map<string, EventOperationsConfiguration>();
  const configurationVersions = new Map<string, number>();
  const contactRequests = new Map<string, MemoryContactRequestRecord>();
  const registrationMigrationStates = new Map<
    string,
    { count: number; hash: string; state: "canonical" | "importing" }
  >();
  const generations = new Map<string, EventOperationsGeneration>();
  const artifactFingerprints = new Map<string, string>();
  const generationConfigurations = new Map<
    string,
    EventOperationsConfiguration
  >();
  const publishedResults = new Map<string, EventOperationsPublishedResult>();
  const explicitlyPublishedEventIds = new Set(options.publishedEventIds ?? []);
  const legacyActiveConfigurationEventIds = new Set<string>();
  const tasks = new Map<string, EventOperationsGenerationTask>();
  const taskAttempts = new Map<string, EventOperationsTaskAttemptTelemetry>();
  const repositoryNow = () => options.now?.() ?? new Date().toISOString();

  async function storeConfiguration(value: EventOperationsConfiguration) {
    const existing = configurations.get(value.eventId);
    if (existing && existing.organizerActorId !== value.organizerActorId) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_FORBIDDEN",
        "The configured organizer cannot replace another event owner.",
      );
    }
    configurations.set(value.eventId, clone(value));
    legacyActiveConfigurationEventIds.add(value.eventId);
    configurationVersions.set(
      value.eventId,
      (configurationVersions.get(value.eventId) ?? 0) + 1,
    );
    if (!registrationMigrationStates.has(value.eventId)) {
      registrationMigrationStates.set(value.eventId, {
        count: 0,
        hash: "",
        state: "importing",
      });
    }
    return clone(value);
  }
  for (const configuration of options.configurations ?? []) {
    const seededRegistrations =
      options.canonicalRegistrations?.filter(
        (registration) => registration.eventId === configuration.eventId,
      ) ?? [];
    configurations.set(configuration.eventId, clone(configuration));
    configurationVersions.set(configuration.eventId, 1);
    registrationMigrationStates.set(configuration.eventId, {
      count: seededRegistrations.length,
      hash: snapshotHash(
        [...seededRegistrations].sort(
          (left, right) =>
            left.userId.localeCompare(right.userId) ||
            left.id.localeCompare(right.id),
        ),
      ),
      state: "canonical",
    });
    legacyActiveConfigurationEventIds.add(configuration.eventId);
  }

  function requireGeneration(generationId: string): EventOperationsGeneration {
    const generation = generations.get(generationId);
    if (!generation) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_GENERATION_NOT_FOUND",
        "The event operations generation does not exist.",
      );
    }
    return generation;
  }

  async function requireGenerationAuthorization(
    authorization:
      | EventOperationsGenerationPublishAuthorization
      | EventOperationsGenerationRunAuthorization,
  ): Promise<void> {
    const configuration = configurations.get(authorization.eventId);
    const authorized =
      configuration?.organizerActorId ===
        authorization.ownerOrganizerActorId &&
      (authorization.actingActorId === authorization.ownerOrganizerActorId ||
        (options.canAuthorizeGeneration
          ? await options.canAuthorizeGeneration(authorization)
          : false));
    if (!authorized) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_FORBIDDEN",
        "Event generation access is denied.",
      );
    }
  }

  const repository: MemoryEventOperationsRepository = {
    async activateCanonicalRegistrations(
      eventId,
      registrations,
      registrationMigrationOptions,
    ) {
      const current = registrationMigrationStates.get(eventId);
      if (current?.state === "canonical") {
        return { ...current, state: "canonical" as const };
      }
      if (!configurations.has(eventId)) {
        requireMemoryMigrationManifest(registrationMigrationOptions);
      }
      const ordered = [...registrations].sort(
        (left, right) =>
          left.userId.localeCompare(right.userId) || left.id.localeCompare(right.id),
      );
      for (const registration of ordered) {
        await canonicalRegistrationProvider.saveRegistration(registration);
      }
      const hash = snapshotHash(ordered);
      const activated = {
        count: ordered.length,
        hash,
        state: "canonical" as const,
      };
      registrationMigrationStates.set(eventId, activated);
      return activated;
    },

    cancelCanonicalRegistration(input) {
      return canonicalRegistrationService.cancel(input);
    },

    async captureGenerationSnapshot(eventId) {
      const configuration = configurations.get(eventId);
      if (!configuration) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_NOT_CONFIGURED",
          "Event operations must be configured before snapshot capture.",
        );
      }
      const capturedAt = options.now?.() ?? new Date().toISOString();
      if (
        Date.parse(capturedAt) < Date.parse(configuration.registrationCutoffAt)
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_GENERATION_NOT_READY",
          "The registration cutoff must pass before snapshot capture.",
        );
      }
      const registrations = (
        await canonicalRegistrationService.list({ eventId })
      ).filter(
        (registration) =>
          registration.status === "rsvped" &&
          Date.parse(registration.registeredAt) <
            Date.parse(configuration.profileEditDeadlineAt),
      );
      const participants = registrations
        .map((registration) =>
          eventOperationsParticipantFromRegistration(
            registration,
            configuration,
          ),
        )
        .sort((left, right) =>
          left.participantId.localeCompare(right.participantId),
        );
      return {
        configuration: clone(configuration),
        configurationHash: snapshotHash(configuration),
        configurationVersion: configurationVersions.get(eventId) ?? 1,
        snapshot: {
          capturedAt,
          hash: snapshotHash(participants),
          participants,
        },
        sourceVersions: participants.map((participant) => ({
          actorId: participant.actorId,
          membershipVersion: 1,
          participantId: participant.participantId,
          profileVersion: 1,
        })),
      };
    },

    async captureGenerationSnapshotAsOperator(authorization) {
      await requireGenerationAuthorization(authorization);
      return repository.captureGenerationSnapshot(authorization.eventId);
    },

    async checkInAtomically(input: CreateEventOperationsCheckInInput) {
      const configuration = configurations.get(input.eventId);
      const migration = registrationMigrationStates.get(input.eventId);
      if (!configuration || migration?.state !== "canonical") {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_NOT_CONFIGURED",
          "Canonical event operations are not configured for check-in.",
        );
      }
      const registrations = await canonicalRegistrationService.list({
        eventId: input.eventId,
      });
      const registration = input.kind === "staff"
        ? registrations.find(
            (value) => value.participantProfileId === input.participantId,
          ) ?? null
        : await canonicalRegistrationService.get({
            eventId: input.eventId,
            userId: input.actorId,
          });
      if (!registration || registration.status !== "rsvped") {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_FORBIDDEN",
          "An active canonical registration is required for check-in.",
        );
      }
      const participantActorId = registration.userId;
      const key = checkInKey(input.eventId, participantActorId);
      const existing = checkIns.get(key);
      if (existing) return clone(existing);
      const checkedInAt = options.now?.() ?? new Date().toISOString();
      if (
        Date.parse(checkedInAt) < Date.parse(configuration.checkInOpensAt) ||
        Date.parse(checkedInAt) > Date.parse(configuration.eventEndsAt)
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CHECK_IN_CLOSED",
          "Event check-in is outside its configured time window according to the database clock.",
        );
      }
      const value: EventOperationsCheckIn = {
        actorId: participantActorId,
        checkedInAt,
        eventId: input.eventId,
        evidenceId: `evidence:event-check-in:${digest(
          input.eventId,
          participantActorId,
        )}`,
        participantId: registration.participantProfileId,
      };
      checkIns.set(key, clone(value));
      return clone(value);
    },
    async claimTasks(input) {
      const generation = requireGeneration(input.generationId);
      if (generation.aiRequestFingerprint !== input.aiRequestFingerprint) {
        return [];
      }
      if (!(["queued", "running"] as const).includes(generation.status as never)) {
        return [];
      }
      const claimedAt = repositoryNow();
      const nowMs = Date.parse(claimedAt);
      for (const [taskId, task] of tasks) {
        if (
          task.generationId !== input.generationId ||
          task.status !== "running"
        ) {
          continue;
        }
        const expiresAt = Date.parse(task.leaseExpiresAt ?? "");
        if (Number.isFinite(expiresAt) && expiresAt > nowMs) continue;
        const exhausted = task.attempts >= task.attemptLimit;
        const attemptKey = taskAttemptKey(
          task.taskId,
          task.attempts,
          task.leaseEpoch,
        );
        const attempt = taskAttempts.get(attemptKey);
        if (attempt && attempt.outcome === null) {
          taskAttempts.set(attemptKey, {
            ...attempt,
            failureCode: "EVENT_OPERATIONS_LEASE_LOST",
            finishedAt: claimedAt,
            outcome: "lease_lost",
          });
        }
        tasks.set(taskId, {
          ...task,
          errorCode: exhausted ? "EVENT_OPERATIONS_LEASE_LOST" : null,
          errorMessage: exhausted
            ? "The worker lease expired after its retry budget was exhausted."
            : null,
          leaseExpiresAt: null,
          leaseToken: null,
          status: exhausted ? "failed" : "queued",
          updatedAt: claimedAt,
          workerId: null,
        });
      }
      const completed = new Set(
        [...tasks.values()]
          .filter(
            (task) =>
              task.generationId === input.generationId &&
              task.status === "completed",
          )
          .map((task) => task.taskId),
      );
      const eligible = [...tasks.values()]
        .filter(
          (task) =>
            task.generationId === input.generationId &&
            (task.status === "queued" ||
              (task.status === "failed" && task.attempts < task.attemptLimit)) &&
            task.dependsOnTaskIds.every((dependencyId) =>
              completed.has(dependencyId),
            ),
        )
        .sort(
          (left, right) =>
            (left.kind === "recommendation_shard" ? 0 : 1) -
              (right.kind === "recommendation_shard" ? 0 : 1) ||
            left.createdAt.localeCompare(right.createdAt) ||
            left.taskId.localeCompare(right.taskId),
        )
        .slice(0, Math.max(1, Math.min(32, Math.floor(input.limit))));
      const claimed = eligible.map((task) => {
        const leaseEpoch = task.leaseEpoch + 1;
        const attempt = task.attempts + 1;
        const dependencyCompletedAt = task.dependsOnTaskIds.map(
          (dependencyId) => tasks.get(dependencyId)?.completedAt,
        );
        const eligibleAt = task.retryRound > 0 || task.attempts > 0
          ? task.updatedAt
          : dependencyCompletedAt.length === 0
          ? task.createdAt
          : dependencyCompletedAt.reduce<string>((latest, completedAt) => {
              if (!completedAt) {
                throw new EventOperationsError(
                  "EVENT_OPERATIONS_GENERATION_NOT_READY",
                  "A claimed task dependency has no completion timestamp.",
                );
              }
              return completedAt > latest ? completedAt : latest;
            }, dependencyCompletedAt[0] ?? task.createdAt);
        const value: EventOperationsGenerationTask = {
          ...task,
          attempts: attempt,
          errorCode: null,
          errorMessage: null,
          leaseEpoch,
          leaseExpiresAt: new Date(nowMs + input.leaseMs).toISOString(),
          leaseToken: `${input.leaseTokenPrefix}:${task.taskId}:${leaseEpoch}`,
          status: "running",
          updatedAt: claimedAt,
          workerId: input.workerId,
        };
        tasks.set(task.taskId, value);
        taskAttempts.set(taskAttemptKey(task.taskId, attempt, leaseEpoch), {
          attempt,
          claimedAt,
          dependencyCount: task.dependsOnTaskIds.length,
          domainValidationDurationMs: null,
          eligibleAt,
          failureCode: null,
          finishReason: null,
          finishedAt: null,
          generationId: task.generationId,
          kind: task.kind,
          leaseEpoch,
          model: null,
          outcome: null,
          participantCount: task.participantIds.length,
          provider: null,
          providerAdapterDurationMs: null,
          promptTokens: null,
          completionTokens: null,
          reasoningTokens: null,
          cacheHitTokens: null,
          requestBytes: null,
          responseBytes: null,
          retryRound: task.retryRound,
          taskId: task.taskId,
          workerId: input.workerId,
        });
        return clone(value);
      });
      if (claimed.length > 0 && generation.status === "queued") {
        generations.set(generation.generationId, {
          ...generation,
          status: "running",
          updatedAt: claimedAt,
        });
      }
      return claimed;
    },

    async completeTask(input) {
      const completedAt = repositoryNow();
      const task = tasks.get(input.taskId);
      if (
        !task ||
        task.status !== "running" ||
        task.leaseToken !== input.leaseToken ||
        task.leaseEpoch !== input.leaseEpoch ||
        Date.parse(task.leaseExpiresAt ?? "") <= Date.parse(completedAt)
      ) {
        return false;
      }
      const attemptKey = taskAttemptKey(
        task.taskId,
        task.attempts,
        task.leaseEpoch,
      );
      const attempt = taskAttempts.get(attemptKey);
      if (!attempt || attempt.outcome !== null) return false;
      taskAttempts.set(attemptKey, {
        ...attempt,
        ...(input.telemetry ?? {}),
        cacheHitTokens: input.telemetry?.responseMetadata?.usage?.cacheHitTokens ?? null,
        completionTokens: input.telemetry?.responseMetadata?.usage?.completionTokens ?? null,
        failureCode: null,
        finishReason: input.telemetry?.responseMetadata?.finishReason ?? null,
        promptTokens: input.telemetry?.responseMetadata?.usage?.promptTokens ?? null,
        reasoningTokens: input.telemetry?.responseMetadata?.usage?.reasoningTokens ?? null,
        finishedAt: completedAt,
        outcome: "completed",
      });
      tasks.set(input.taskId, {
        ...task,
        completedAt,
        errorCode: null,
        errorMessage: null,
        leaseExpiresAt: null,
        leaseToken: null,
        output: clone(input.output),
        status: "completed",
        updatedAt: completedAt,
        workerId: null,
      });
      const artifactFingerprint = input.artifact.evidenceMetadata.aiRequestFingerprint;
      if (typeof artifactFingerprint === "string") {
        artifactFingerprints.set(input.taskId, artifactFingerprint);
      }
      return true;
    },

    async createContactRequestAtomically(
      input: CreateEventContactRequestInput,
    ) {
      const migration = registrationMigrationStates.get(input.eventId);
      if (migration?.state !== "canonical") {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_NOT_CONFIGURED",
          "Canonical event registration is required for onsite operations.",
        );
      }
      const active = (await canonicalRegistrationService.list({
        eventId: input.eventId,
      })).filter((registration) => registration.status === "rsvped");
      const requester = active.find(
        (registration) => registration.userId === input.requesterActorId,
      );
      const target = active.find(
        (registration) =>
          registration.participantProfileId === input.targetParticipantId,
      );
      if (!requester || !target || requester.userId === target.userId) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "A business-card request requires two distinct active event registrations.",
        );
      }
      const participantPairKey = digest(
        "participant-pair",
        ...[
          requester.participantProfileId,
          target.participantProfileId,
        ].sort(),
      );
      const existing = [...contactRequests.values()].find(
        (value) =>
          value.eventId === input.eventId &&
          digest(
            "participant-pair",
            ...[
              value.requesterParticipantId,
              value.targetParticipantId,
            ].sort(),
          ) === participantPairKey,
      );
      if (!existing && input.expectedRevision !== null) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "The contact request lifecycle changed before it could be created.",
        );
      }
      if (existing && existing.status !== "withdrawn") {
        const isInitialRetry =
          input.expectedRevision === null && existing.revision === 1;
        const isReopenRetry =
          input.expectedRevision !== null &&
          existing.status === "awaiting_target_consent" &&
          existing.revision === input.expectedRevision + 1;
        if (isInitialRetry || isReopenRetry) {
          return contactRequestForViewer(existing, input.requesterActorId);
        }
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "The contact request lifecycle changed before it could be created.",
        );
      }
      if (
        existing &&
        input.expectedRevision !== existing.revision
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "The contact request lifecycle changed before it could be reopened.",
        );
      }
      const createdAt = options.now?.() ?? new Date().toISOString();
      const requestId = `event-contact-request:${digest(
        input.eventId,
        participantPairKey,
      )}`;
      const value: MemoryContactRequestRecord = {
        acceptedAt: null,
        contactIdsByActor: {},
        createdAt,
        declinedAt: null,
        eventId: input.eventId,
        requestId,
        revision: existing ? existing.revision + 1 : 1,
        requesterActorId: requester.userId,
        requesterParticipantId: requester.participantProfileId,
        status: "awaiting_target_consent",
        targetActorId: target.userId,
        targetParticipantId: target.participantProfileId,
        updatedAt: createdAt,
        withdrawnAt: null,
      };
      contactRequests.set(requestId, clone(value));
      return contactRequestForViewer(value, input.requesterActorId);
    },

    async failTask(input) {
      const failedAt = repositoryNow();
      const task = tasks.get(input.taskId);
      if (
        !task ||
        task.status !== "running" ||
        task.leaseToken !== input.leaseToken ||
        task.leaseEpoch !== input.leaseEpoch ||
        Date.parse(task.leaseExpiresAt ?? "") <= Date.parse(failedAt)
      ) {
        return false;
      }
      const attemptKey = taskAttemptKey(
        task.taskId,
        task.attempts,
        task.leaseEpoch,
      );
      const attempt = taskAttempts.get(attemptKey);
      if (!attempt || attempt.outcome !== null) return false;
      const retryable = input.retryable && task.attempts < task.attemptLimit;
      taskAttempts.set(attemptKey, {
        ...attempt,
        ...(input.telemetry ?? {}),
        cacheHitTokens: input.telemetry?.responseMetadata?.usage?.cacheHitTokens ?? null,
        completionTokens: input.telemetry?.responseMetadata?.usage?.completionTokens ?? null,
        failureCode: input.code,
        finishReason: input.telemetry?.responseMetadata?.finishReason ?? null,
        promptTokens: input.telemetry?.responseMetadata?.usage?.promptTokens ?? null,
        reasoningTokens: input.telemetry?.responseMetadata?.usage?.reasoningTokens ?? null,
        finishedAt: failedAt,
        outcome: retryable ? "retryable_failed" : "terminal_failed",
      });
      tasks.set(input.taskId, {
        ...task,
        attempts: input.retryable ? task.attempts : task.attemptLimit,
        completedAt: null,
        errorCode: input.code,
        errorMessage: input.message,
        leaseExpiresAt: null,
        leaseToken: null,
        output: null,
        status: "failed",
        updatedAt: failedAt,
        workerId: null,
      });
      return true;
    },

    async heartbeatTask(input) {
      const heartbeatAt = repositoryNow();
      const task = tasks.get(input.taskId);
      if (
        !task ||
        task.status !== "running" ||
        task.leaseToken !== input.leaseToken ||
        task.leaseEpoch !== input.leaseEpoch ||
        task.workerId !== input.workerId ||
        Date.parse(task.leaseExpiresAt ?? "") <= Date.parse(heartbeatAt)
      ) {
        return false;
      }
      tasks.set(input.taskId, {
        ...task,
        leaseExpiresAt: new Date(
          Date.parse(heartbeatAt) + input.leaseMs,
        ).toISOString(),
        updatedAt: heartbeatAt,
      });
      return true;
    },

    async finalizeGeneration(generationId, finalizedAt) {
      const generation = requireGeneration(generationId);
      if (generation.status === "published") return clone(generation);
      const generationTasks = [...tasks.values()].filter(
        (task) => task.generationId === generationId,
      );
      let next: EventOperationsGeneration;
      if (generationTasks.length !== generation.expectedTaskCount) {
        next = {
          ...generation,
          completedAt: null,
          errorCode: "EVENT_OPERATIONS_SHARD_FAILED",
          errorMessage: "The persisted generation task topology is incomplete.",
          status: "failed",
          updatedAt: finalizedAt,
        };
      } else if (generationTasks.every((task) => task.status === "completed")) {
        next = {
          ...generation,
          completedAt: finalizedAt,
          errorCode: null,
          errorMessage: null,
          status: "completed",
          updatedAt: finalizedAt,
        };
      } else {
        const exhausted = generationTasks.find(
          (task) => task.status === "failed" && task.attempts >= task.attemptLimit,
        );
        next = exhausted
          ? {
              ...generation,
              completedAt: null,
              errorCode:
                exhausted.errorCode ?? "EVENT_OPERATIONS_SHARD_FAILED",
              errorMessage:
                exhausted.errorMessage ??
                "At least one AI task exhausted its retry budget.",
              status: "failed",
              updatedAt: finalizedAt,
            }
          : {
              ...generation,
              completedAt: null,
              errorCode: null,
              errorMessage: null,
              status: "running",
              updatedAt: finalizedAt,
            };
      }
      generations.set(generationId, next);
      return clone(next);
    },

    async findGenerationByIdempotencyKey(eventId, idempotencyKey) {
      const generation = [...generations.values()].find(
        (value) =>
          value.eventId === eventId && value.idempotencyKey === idempotencyKey,
      );
      return generation ? clone(generation) : null;
    },

    async getCheckIn(eventId, actorId) {
      const value = checkIns.get(checkInKey(eventId, actorId));
      return value ? clone(value) : null;
    },

    getCanonicalRegistration(eventId, userId) {
      return canonicalRegistrationService.get({ eventId, userId });
    },

    async getConfiguration(eventId) {
      const value = configurations.get(eventId);
      return value ? clone(value) : null;
    },

    async getGeneration(generationId) {
      const value = generations.get(generationId);
      return value ? clone(value) : null;
    },

    async getGenerationConfiguration(generationId) {
      const value = generationConfigurations.get(generationId);
      return value ? clone(value) : null;
    },

    async getPublishedResult(eventId) {
      const value = publishedResults.get(eventId);
      return value ? clone(value) : null;
    },

    async getPublishedResultForAttendee(eventId) {
      const value = publishedResults.get(eventId);
      const databaseNow = options.now?.() ?? new Date().toISOString();
      return value &&
        Date.parse(value.resultsAvailableAt) <= Date.parse(databaseNow)
        ? clone(value)
        : null;
    },

    async getTask(taskId) {
      const value = tasks.get(taskId);
      return value ? clone(value) : null;
    },

    async initializeGeneration(input) {
      await requireGenerationAuthorization(input.authorization);
      if (
        input.authorization.eventId !== input.generation.eventId ||
        input.authorization.ownerOrganizerActorId !==
          input.generation.organizerActorId
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_FORBIDDEN",
          "The generation authorization does not match its event owner.",
        );
      }
      assertTopology(input);
      const existing = [...generations.values()].find(
        (value) =>
          value.eventId === input.generation.eventId &&
          value.idempotencyKey === input.generation.idempotencyKey,
      );
      if (existing) {
        const persistedTaskCount = [...tasks.values()].filter(
          (task) => task.generationId === existing.generationId,
        ).length;
        if (
          existing.aiRequestFingerprint !== input.generation.aiRequestFingerprint ||
          existing.snapshot.hash !== input.generation.snapshot.hash ||
          existing.expectedTaskCount !== input.generation.expectedTaskCount ||
          persistedTaskCount !== existing.expectedTaskCount ||
          [...candidates.values()].filter(
            (candidate) => candidate.generationId === existing.generationId,
          ).length !== input.candidates.length
        ) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_CONFIGURATION_INVALID",
            "The idempotency key belongs to a different or incomplete generation topology.",
          );
        }
        return clone(existing);
      }
      if (!configurations.has(input.generation.eventId)) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_NOT_CONFIGURED",
          "Event operations must be configured before generation initialization.",
        );
      }
      generations.set(input.generation.generationId, clone(input.generation));
      generationConfigurations.set(
        input.generation.generationId,
        clone(configurations.get(input.generation.eventId)!),
      );
      for (const candidate of input.candidates) {
        candidates.set(
          `${candidate.generationId}\u0000${candidate.sourceParticipantId}\u0000${candidate.targetParticipantId}`,
          clone(candidate),
        );
      }
      const persistedAt = repositoryNow();
      for (const task of input.tasks) {
        tasks.set(task.taskId, {
          ...clone(task),
          createdAt: persistedAt,
          updatedAt: persistedAt,
        });
      }
      return clone(input.generation);
    },

    async listCheckIns(eventId) {
      return [...checkIns.values()]
        .filter((value) => value.eventId === eventId)
        .sort(
          (left, right) =>
            left.checkedInAt.localeCompare(right.checkedInAt) ||
            left.participantId.localeCompare(right.participantId),
        )
        .map(clone);
    },

    async listLimitedCheckInRoster(input) {
      const eventId = input.eventId;
      const authorized = options.canReadLimitedCheckInRoster
        ? await options.canReadLimitedCheckInRoster(input)
        : configurations.get(eventId)?.organizerActorId === input.actorId;
      if (!authorized) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_FORBIDDEN",
          "Event check-in roster access is denied.",
        );
      }
      const registrations = await canonicalRegistrationService.list({ eventId });
      const checkInsByParticipant = new Map(
        [...checkIns.values()]
          .filter((checkIn) => checkIn.eventId === eventId)
          .map((checkIn) => [checkIn.participantId, checkIn] as const),
      );
      return registrations
        .filter((registration) => registration.status === "rsvped")
        .map((registration) => {
          const checkIn = checkInsByParticipant.get(
            registration.participantProfileId,
          );
          return {
            checkedIn: Boolean(checkIn),
            checkedInAt: checkIn?.checkedInAt ?? null,
            displayName:
              registration.participantProfile.displayName ??
              registration.participantProfileId,
            participantId: registration.participantProfileId,
          };
        })
        .sort(
          (left, right) =>
            left.displayName.localeCompare(right.displayName) ||
            left.participantId.localeCompare(right.participantId),
        )
        .map(clone);
    },

    async listCandidates(generationId, sourceParticipantIds) {
      const sources = new Set(sourceParticipantIds);
      return [...candidates.values()]
        .filter(
          (candidate) =>
            candidate.generationId === generationId &&
            sources.has(candidate.sourceParticipantId),
        )
        .sort(
          (left, right) =>
            left.sourceParticipantId.localeCompare(
              right.sourceParticipantId,
            ) || left.retrievalRank - right.retrievalRank,
        )
        .map(clone);
    },

    listCanonicalRegistrations(eventId) {
      return canonicalRegistrationService.list({ eventId });
    },

    listCanonicalRegistrationsForUser(userId, eventIds) {
      return canonicalRegistrationProvider.listRegistrationsForUser(
        userId,
        eventIds,
      );
    },

    async listCatalogueSummaries(eventIds) {
      const summaries = [];
      for (const eventId of [...new Set(eventIds.filter(Boolean))].sort()) {
        if (
          registrationMigrationStates.get(eventId)?.state !== "canonical" ||
          (!explicitlyPublishedEventIds.has(eventId) &&
            !legacyActiveConfigurationEventIds.has(eventId))
        ) {
          continue;
        }
        const registrations = await canonicalRegistrationService.list({ eventId });
        const publication = publishedResults.get(eventId) ?? null;
        summaries.push({
          activeRegistrationCount: registrations.filter(
            (registration) => registration.status === "rsvped",
          ).length,
          attendeeResultsAvailable: Boolean(
            publication &&
              Date.parse(publication.resultsAvailableAt) <=
                Date.parse(repositoryNow()),
          ),
          eventId,
          hasPublishedResults: Boolean(publication),
        });
      }
      return summaries;
    },

    async listContactRequests(eventId, viewerActorId) {
      return [...contactRequests.values()]
        .filter(
          (value) =>
            value.eventId === eventId &&
            (viewerActorId === null ||
              value.requesterActorId === viewerActorId ||
              value.targetActorId === viewerActorId),
        )
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.requestId.localeCompare(right.requestId),
        )
        .map((value) => contactRequestForViewer(value, viewerActorId));
    },

    async listGenerations(eventId) {
      return [...generations.values()]
        .filter((value) => value.eventId === eventId)
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            right.generationId.localeCompare(left.generationId),
        )
        .map(clone);
    },

    async listTasks(generationId) {
      return [...tasks.values()]
        .filter((value) => value.generationId === generationId)
        .sort((left, right) => left.taskId.localeCompare(right.taskId))
        .map(clone);
    },

    async listTaskAttempts(generationId) {
      return [...taskAttempts.values()]
        .filter((value) => value.generationId === generationId)
        .sort(
          (left, right) =>
            left.claimedAt.localeCompare(right.claimedAt) ||
            left.taskId.localeCompare(right.taskId) ||
            left.attempt - right.attempt ||
            left.leaseEpoch - right.leaseEpoch,
        )
        .map(clone);
    },

    async publishGenerationAtomically(
      value,
      organizerActorId,
      authorization,
    ) {
      await requireGenerationAuthorization(authorization);
      const generation = requireGeneration(value.generationId);
      const existing = publishedResults.get(value.eventId);
      if (
        existing?.generationId === value.generationId &&
        generation.status === "published"
      ) {
        return clone(existing);
      }
      if (
        generation.eventId !== value.eventId ||
        generation.organizerActorId !== organizerActorId ||
        authorization.eventId !== value.eventId ||
        authorization.ownerOrganizerActorId !== organizerActorId
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_FORBIDDEN",
          "This actor cannot publish this event generation.",
        );
      }
      const generationTasks = [...tasks.values()].filter(
        (task) => task.generationId === value.generationId,
      );
      if (
        generation.status !== "completed" ||
        generationTasks.length !== generation.expectedTaskCount ||
        generationTasks.some(
          (task) =>
            task.status !== "completed" ||
            artifactFingerprints.get(task.taskId) !==
              generation.aiRequestFingerprint,
        )
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_GENERATION_NOT_READY",
          "Every expected generation task must complete before publication.",
        );
      }
      publishedResults.set(value.eventId, clone(value));
      if (existing && existing.generationId !== value.generationId) {
        const previous = generations.get(existing.generationId);
        if (!previous || previous.status !== "published") {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_GENERATION_NOT_READY",
            "The previous publication did not reference one published generation.",
          );
        }
        generations.set(previous.generationId, {
          ...previous,
          status: "superseded",
          updatedAt: value.publishedAt,
        });
      }
      generations.set(value.generationId, {
        ...generation,
        publishedAt: value.publishedAt,
        status: "published",
        updatedAt: value.publishedAt,
      });
      return clone(value);
    },

    async replaceGenerationForTest(value) {
      generations.set(value.generationId, clone(value));
      return clone(value);
    },

    async replaceTaskForTest(value) {
      tasks.set(value.taskId, clone(value));
      return clone(value);
    },

    async resetEventForSeed(eventId) {
      configurations.delete(eventId);
      configurationVersions.delete(eventId);
      legacyActiveConfigurationEventIds.delete(eventId);
      registrationMigrationStates.delete(eventId);
      publishedResults.delete(eventId);
      for (const [key, value] of checkIns) {
        if (value.eventId === eventId) checkIns.delete(key);
      }
      for (const [key, value] of contactRequests) {
        if (value.eventId === eventId) contactRequests.delete(key);
      }
      const generationIds = new Set(
        [...generations.values()]
          .filter((generation) => generation.eventId === eventId)
          .map((generation) => generation.generationId),
      );
      for (const generationId of generationIds) {
        generations.delete(generationId);
        generationConfigurations.delete(generationId);
      }
      for (const [key, value] of tasks) {
        if (generationIds.has(value.generationId)) {
          tasks.delete(key);
          artifactFingerprints.delete(key);
        }
      }
      for (const [key, value] of taskAttempts) {
        if (generationIds.has(value.generationId)) taskAttempts.delete(key);
      }
      for (const [key, value] of candidates) {
        if (generationIds.has(value.generationId)) candidates.delete(key);
      }
    },

    registerCanonicalParticipant(input) {
      return canonicalRegistrationService.register(input);
    },

    async respondToContactRequestAtomically(
      input: RespondToEventContactRequestInput,
    ) {
      const current = contactRequests.get(input.requestId);
      if (
        !current ||
        current.eventId !== input.eventId ||
        current.targetActorId !== input.targetActorId
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_FORBIDDEN",
          "Only the target participant can respond to this business-card request.",
        );
      }
      if (
        (current.status === "accepted" && input.accept) ||
        (current.status === "declined" && !input.accept)
      ) {
        if (current.revision !== input.expectedRevision + 1) {
          throw new EventOperationsError(
            "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
            "The contact request lifecycle changed before this response could be applied.",
          );
        }
        return contactRequestForViewer(current, input.targetActorId);
      }
      if (
        current.status !== "awaiting_target_consent" ||
        current.revision !== input.expectedRevision
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "The contact request lifecycle changed before this response could be applied.",
        );
      }
      const active = (await canonicalRegistrationService.list({
        eventId: input.eventId,
      })).filter((registration) => registration.status === "rsvped");
      const requester = active.find(
        (registration) =>
          registration.userId === current.requesterActorId &&
          registration.participantProfileId ===
            current.requesterParticipantId,
      );
      const target = active.find(
        (registration) =>
          registration.userId === current.targetActorId &&
          registration.participantProfileId === current.targetParticipantId,
      );
      if (!requester || !target) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_PARTICIPANT_NOT_FOUND",
          "Both participants must have active registrations when consent is recorded.",
        );
      }
      const respondedAt = options.now?.() ?? new Date().toISOString();
      const latest = contactRequests.get(input.requestId)!;
      if (
        latest.status !== "awaiting_target_consent" ||
        latest.revision !== input.expectedRevision
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "The contact request lifecycle changed before this response could be applied.",
        );
      }
      const next: MemoryContactRequestRecord = input.accept
        ? {
            ...latest,
            acceptedAt: respondedAt,
            contactIdsByActor: {
              [requester.userId]: `contact:event-consent:${digest(
                input.eventId,
                requester.userId,
                target.userId,
              )}`,
              [target.userId]: `contact:event-consent:${digest(
                input.eventId,
                target.userId,
                requester.userId,
              )}`,
            },
            status: "accepted",
            revision: latest.revision + 1,
            updatedAt: respondedAt,
          }
        : {
            ...latest,
            declinedAt: respondedAt,
            status: "declined",
            revision: latest.revision + 1,
            updatedAt: respondedAt,
          };
      contactRequests.set(input.requestId, clone(next));
      return contactRequestForViewer(next, input.targetActorId);
    },

    async withdrawContactRequestAtomically(
      input: WithdrawEventContactRequestInput,
    ) {
      const current = contactRequests.get(input.requestId);
      if (
        !current ||
        current.eventId !== input.eventId ||
        current.requesterActorId !== input.requesterActorId
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_FORBIDDEN",
          "Only the requester can withdraw this business-card request.",
        );
      }
      if (
        current.status === "withdrawn" &&
        current.revision === input.expectedRevision + 1
      ) {
        return contactRequestForViewer(current, input.requesterActorId);
      }
      if (
        current.status !== "awaiting_target_consent" ||
        current.revision !== input.expectedRevision
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "Only a pending business-card request can be withdrawn.",
        );
      }
      const withdrawnAt = options.now?.() ?? new Date().toISOString();
      const latest = contactRequests.get(input.requestId)!;
      if (
        latest.status !== "awaiting_target_consent" ||
        latest.revision !== input.expectedRevision
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "The business-card request changed before it could be withdrawn.",
        );
      }
      const next: MemoryContactRequestRecord = {
        ...latest,
        status: "withdrawn",
        revision: latest.revision + 1,
        updatedAt: withdrawnAt,
        withdrawnAt,
      };
      contactRequests.set(input.requestId, clone(next));
      return contactRequestForViewer(next, input.requesterActorId);
    },

    async retryFailedGeneration(generationId, retriedAt, authorization) {
      await requireGenerationAuthorization(authorization);
      const requeuedAt = repositoryNow();
      const generation = requireGeneration(generationId);
      if (
        generation.eventId !== authorization.eventId ||
        generation.organizerActorId !==
          authorization.ownerOrganizerActorId
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_FORBIDDEN",
          "The retry authorization does not match this event generation.",
        );
      }
      if (generation.status !== "failed") return clone(generation);
      if (
        [...tasks.values()].some(
          (task) =>
            task.generationId === generationId && task.status === "running",
        )
      ) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_GENERATION_NOT_READY",
          "Retry is unavailable until every in-flight task from the failed run has settled.",
        );
      }
      for (const [taskId, task] of tasks) {
        if (task.generationId !== generationId || task.status !== "failed") {
          continue;
        }
        tasks.set(taskId, {
          ...task,
          attempts: 0,
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          leaseExpiresAt: null,
          leaseToken: null,
          output: null,
          retryRound: task.retryRound + 1,
          status: "queued",
          updatedAt: requeuedAt,
          workerId: null,
        });
      }
      const updated: EventOperationsGeneration = {
        ...generation,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        status: "queued",
        updatedAt: requeuedAt,
      };
      generations.set(generationId, updated);
      return clone(updated);
    },

    async saveConfiguration(value) {
      return storeConfiguration(value);
    },

    async saveConfigurationAsOperator(input) {
      const authorized = options.canConfigureEvent
        ? await options.canConfigureEvent(input)
        : configurations.get(input.configuration.eventId)?.organizerActorId ===
          input.actorId;
      if (!authorized) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_FORBIDDEN",
          "Event configuration access is denied.",
        );
      }
      return storeConfiguration(input.configuration);
    },

    async seedCanonicalRegistration(value) {
      return canonicalRegistrationProvider.saveRegistration(value);
    },
  };

  return repository;
}
