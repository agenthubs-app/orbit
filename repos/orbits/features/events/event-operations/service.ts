import type { EventRegistrationService } from "../registration/service";
import {
  EventOperationsError,
  type EventContactRequest,
  type EventOperationsCheckIn,
  type EventOperationsConfiguration,
  type EventOperationsGeneration,
  type EventOperationsParticipant,
  type EventOperationsProgress,
  type EventOperationsPublishedResult,
  type EventOperationsRelationshipGraph,
  type EventOperationsTable,
} from "./contract";
import type { EventOperationsEngine } from "./engine";
import { eventOperationsParticipantFromRegistration } from "./participant";
import type { EventOperationsRepository } from "./repository";
import type { EventOperationsLimitedCheckInRoster } from "./check-in-roster";
import type { EventAccessCapability } from "../event-access/contract";

export interface EventOperationsAccessPolicy {
  requireCapability(input: {
    actorId: string;
    capability: EventAccessCapability;
    eventId: string;
  }): Promise<void>;
  isOrganizer(input: { actorId: string; eventId: string }): Promise<boolean>;
  isRegistered(input: { actorId: string; eventId: string }): Promise<boolean>;
}

export interface EventOperationsAttendeeWorkspace {
  checkIn: EventOperationsCheckIn | null;
  checkInAvailable: boolean;
  configuration: EventOperationsConfiguration;
  contactRequests: readonly EventContactRequest[];
  directory: readonly EventOperationsParticipant[];
  eventId: string;
  generationNotice: {
    errorCode: string | null;
    errorMessage: string | null;
    status: EventOperationsGeneration["status"];
  } | null;
  graph: EventOperationsRelationshipGraph | null;
  me: EventOperationsParticipant;
  profileEditable: boolean;
  publishedGenerationId: string | null;
  recommendations: EventOperationsPublishedResult["recommendations"][number] | null;
  resultsState: "locked" | "not_generated" | "processing" | "failed" | "ready";
  roundOneTable: EventOperationsTable | null;
  roundTwoTable: EventOperationsTable | null;
}

export interface EventOperationsAdminWorkspace {
  checkIns: readonly EventOperationsCheckIn[];
  configuration: EventOperationsConfiguration;
  contactRequests: readonly EventContactRequest[];
  eventId: string;
  generations: readonly {
    generation: EventOperationsGeneration;
    progress: EventOperationsProgress;
  }[];
  metrics: {
    acceptedContactRequests: number;
    checkedIn: number;
    contactRequests: number;
    participantCount: number;
    publishedGenerationId: string | null;
  };
  participants: readonly EventOperationsParticipant[];
  publishedResult: EventOperationsPublishedResult | null;
}

export interface EventOperationsService {
  attendeeWorkspace(input: {
    actorId: string;
    eventId: string;
  }): Promise<EventOperationsAttendeeWorkspace>;
  checkIn(input: { actorId: string; eventId: string }): Promise<EventOperationsCheckIn>;
  checkInParticipant(input: {
    actorId: string;
    eventId: string;
    participantId: string;
  }): Promise<EventOperationsCheckIn>;
  getLimitedCheckInRoster(input: {
    actorId: string;
    eventId: string;
  }): Promise<EventOperationsLimitedCheckInRoster>;
  configure(input: {
    actorId: string;
    configuration: Omit<EventOperationsConfiguration, "organizerActorId" | "updatedAt">;
  }): Promise<EventOperationsConfiguration>;
  createContactRequest(input: {
    actorId: string;
    eventId: string;
    targetParticipantId: string;
  }): Promise<EventContactRequest>;
  adminWorkspace(input: {
    actorId: string;
    eventId: string;
  }): Promise<EventOperationsAdminWorkspace>;
  publishGeneration(input: {
    actorId: string;
    eventId: string;
    generationId: string;
  }): Promise<EventOperationsPublishedResult>;
  respondToContactRequest(input: {
    accept: boolean;
    actorId: string;
    eventId: string;
    requestId: string;
  }): Promise<EventContactRequest>;
  retryGeneration(input: {
    actorId: string;
    eventId: string;
    generationId: string;
  }): Promise<EventOperationsGeneration>;
  runGeneration(input: {
    actorId: string;
    eventId: string;
    generationId: string;
    maxConcurrency?: number;
    workerId: string;
  }): Promise<EventOperationsProgress>;
  startGeneration(input: {
    actorId: string;
    eventId: string;
    idempotencyKey?: string | null;
  }): Promise<EventOperationsGeneration>;
}

export interface EventOperationsServiceOptions {
  access: EventOperationsAccessPolicy;
  engine: EventOperationsEngine;
  now?: () => string;
  registrationService: Pick<EventRegistrationService, "list">;
  repository: EventOperationsRepository;
}

function tableFor(
  round: readonly EventOperationsTable[],
  participantId: string,
): EventOperationsTable | null {
  return (
    round.find((table) =>
      table.members.some((member) => member.participantId === participantId),
    ) ?? null
  );
}

function requireConfiguration(
  configuration: EventOperationsConfiguration | null,
): EventOperationsConfiguration {
  if (!configuration) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_NOT_CONFIGURED",
      "Event operations are not configured for this event.",
    );
  }
  return configuration;
}

function validateConfiguration(
  configuration: Omit<
    EventOperationsConfiguration,
    "organizerActorId" | "updatedAt"
  >,
): void {
  const times = {
    checkInOpensAt: Date.parse(configuration.checkInOpensAt),
    eventEndsAt: Date.parse(configuration.eventEndsAt),
    eventStartsAt: Date.parse(configuration.eventStartsAt),
    profileEditDeadlineAt: Date.parse(configuration.profileEditDeadlineAt),
    registrationCutoffAt: Date.parse(configuration.registrationCutoffAt),
    resultsAvailableAt: Date.parse(configuration.resultsAvailableAt),
    roundOneStartsAt: Date.parse(configuration.roundOneStartsAt),
    roundTwoStartsAt: Date.parse(configuration.roundTwoStartsAt),
  };
  const positiveIntegers = [
    configuration.maxAttemptsPerTask,
    configuration.recommendationCount,
    configuration.shardSize,
    configuration.tableSize,
  ];
  const valid =
    Object.values(times).every(Number.isFinite) &&
    positiveIntegers.every((value) => Number.isInteger(value) && value > 0) &&
    configuration.tableSize >= 2 &&
    times.eventStartsAt < times.eventEndsAt &&
    times.checkInOpensAt <= times.eventEndsAt &&
    times.profileEditDeadlineAt <= times.registrationCutoffAt &&
    times.registrationCutoffAt <= times.resultsAvailableAt &&
    times.resultsAvailableAt <= times.roundOneStartsAt &&
    times.eventStartsAt <= times.roundOneStartsAt &&
    times.roundOneStartsAt < times.roundTwoStartsAt &&
    times.roundTwoStartsAt <= times.eventEndsAt;
  if (!valid) {
    throw new EventOperationsError(
      "EVENT_OPERATIONS_CONFIGURATION_INVALID",
      "Event operations time gates or positive-integer policies are invalid.",
    );
  }
}

export function createEventOperationsService({
  access,
  engine,
  now = () => new Date().toISOString(),
  registrationService,
  repository,
}: EventOperationsServiceOptions): EventOperationsService {
  async function requireOrganizer(eventId: string, actorId: string) {
    const configuration = await repository.getConfiguration(eventId);
    const authorized = await access.isOrganizer({ actorId, eventId });
    if (
      !authorized ||
      (configuration && configuration.organizerActorId !== actorId.trim())
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_FORBIDDEN",
        "This actor cannot operate this event.",
      );
    }
    return configuration;
  }

  async function requireConfigurationOwner(eventId: string, actorId: string) {
    const configuration = await repository.getConfiguration(eventId);
    if (configuration) {
      return configuration;
    }
    if (!(await access.isOrganizer({ actorId, eventId }))) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_FORBIDDEN",
        "Only the event owner can configure an unconfigured event.",
      );
    }
    return null;
  }

  async function requireRegistered(eventId: string, actorId: string) {
    if (!(await access.isRegistered({ actorId, eventId }))) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_FORBIDDEN",
        "An active registration is required for this event operation.",
      );
    }
  }

  async function currentParticipantsFor(
    eventId: string,
    configuration: EventOperationsConfiguration,
  ) {
    return (await repository.listCanonicalRegistrations(eventId))
      .filter((registration) => registration.status === "rsvped")
      .map((registration) =>
        eventOperationsParticipantFromRegistration(
          registration,
          configuration,
        ),
      )
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async function participantContext(
    eventId: string,
    actorId: string,
    published: EventOperationsPublishedResult | null,
  ) {
    const currentConfiguration = requireConfiguration(
      await repository.getConfiguration(eventId),
    );
    const configuration = published
      ? {
          ...currentConfiguration,
          profileEditDeadlineAt: published.profileEditDeadlineAt,
          resultsAvailableAt: published.resultsAvailableAt,
        }
      : currentConfiguration;
    const participants = published
      ? published.directory.map((participant) => ({ ...participant }))
      : await currentParticipantsFor(eventId, configuration);
    const participant = participants.find((value) => value.actorId === actorId);
    if (!participant) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_PARTICIPANT_NOT_FOUND",
        "The actor has no active participant profile for this event.",
      );
    }
    return { configuration, participant, participants };
  }

  async function requireGenerationScope(input: {
    actorId: string;
    capability: "generation.publish" | "generation.run";
    eventId: string;
    generationId: string;
  }) {
    await access.requireCapability({
      actorId: input.actorId,
      capability: input.capability,
      eventId: input.eventId,
    });
    const generation = await repository.getGeneration(input.generationId);
    if (!generation) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_GENERATION_NOT_FOUND",
        "The event operations generation does not exist.",
      );
    }
    if (
      generation.eventId !== input.eventId
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_FORBIDDEN",
        "The generation does not belong to this event.",
      );
    }
    const configuration = requireConfiguration(
      await repository.getGenerationConfiguration(input.generationId),
    );
    if (
      configuration.eventId !== input.eventId ||
      configuration.organizerActorId !== generation.organizerActorId
    ) {
      throw new EventOperationsError(
        "EVENT_OPERATIONS_CONFIGURATION_INVALID",
        "The generation owner does not match its frozen event configuration.",
      );
    }
    return generation;
  }

  return {
    async attendeeWorkspace({ actorId, eventId }) {
      await requireRegistered(eventId, actorId);
      const [published, databaseVisiblePublished] = await Promise.all([
        repository.getPublishedResult(eventId),
        repository.getPublishedResultForAttendee(eventId),
      ]);
      const visiblePublished =
        published?.generationId === databaseVisiblePublished?.generationId
          ? databaseVisiblePublished
          : null;
      const { configuration, participant, participants } =
        await participantContext(eventId, actorId, published);
      const [generations, checkIn, requests] = await Promise.all([
        repository.listGenerations(eventId),
        repository.getCheckIn(eventId, actorId),
        repository.listContactRequests(eventId, actorId),
      ]);
      const timestamp = now();
      const currentMs = Date.parse(timestamp);
      const resultsLocked = published
        ? visiblePublished === null
        : currentMs < Date.parse(configuration.resultsAvailableAt);
      const latest = generations[0] ?? null;
      const recommendations =
        visiblePublished?.recommendations.find(
          (row) => row.sourceParticipantId === participant.participantId,
        ) ?? null;

      return {
        checkIn,
        checkInAvailable:
          currentMs >= Date.parse(configuration.checkInOpensAt) &&
          currentMs <= Date.parse(configuration.eventEndsAt),
        configuration,
        contactRequests: requests,
        directory: participants,
        eventId,
        generationNotice: latest
          ? {
              errorCode: latest.errorCode,
              errorMessage:
                latest.status === "failed"
                  ? "Event matching did not complete. The organizer can retry it."
                  : null,
              status: latest.status,
            }
          : null,
        graph: visiblePublished?.graph ?? null,
        me: participant,
        profileEditable:
          currentMs < Date.parse(configuration.profileEditDeadlineAt),
        publishedGenerationId: visiblePublished?.generationId ?? null,
        recommendations,
        resultsState: resultsLocked
          ? "locked"
          : visiblePublished
            ? "ready"
            : latest?.status === "failed"
              ? "failed"
              : latest?.status === "queued" || latest?.status === "running"
                ? "processing"
                : "not_generated",
        roundOneTable: visiblePublished
          ? tableFor(visiblePublished.grouping.roundOne, participant.participantId)
          : null,
        roundTwoTable: visiblePublished
          ? tableFor(visiblePublished.grouping.roundTwo, participant.participantId)
          : null,
      };
    },

    async checkIn({ actorId, eventId }) {
      await requireRegistered(eventId, actorId);
      return repository.checkInAtomically({ actorId, eventId, kind: "self" });
    },

    async getLimitedCheckInRoster({ actorId, eventId }) {
      await access.requireCapability({
        actorId,
        capability: "check_in.roster.read_limited",
        eventId,
      });
      const participants = await repository.listLimitedCheckInRoster({
        actorId,
        capability: "check_in.roster.read_limited",
        eventId,
      });
      return Object.freeze({
        eventId,
        participants: Object.freeze(
          participants.map((participant) =>
            Object.freeze({
              checkedIn: participant.checkedIn,
              checkedInAt: participant.checkedInAt,
              displayName: participant.displayName,
              participantId: participant.participantId,
            }),
          ),
        ),
      });
    },

    async checkInParticipant({ actorId, eventId, participantId }) {
      await access.requireCapability({
        actorId,
        capability: "check_in.roster.write",
        eventId,
      });
      return repository.checkInAtomically({
        actorId,
        capability: "check_in.roster.write",
        eventId,
        kind: "staff",
        participantId,
      });
    },

    async configure({ actorId, configuration }) {
      await access.requireCapability({
        actorId,
        capability: "operations.configure",
        eventId: configuration.eventId,
      });
      const existingConfiguration = await requireConfigurationOwner(
        configuration.eventId,
        actorId,
      );
      validateConfiguration(configuration);
      const timestamp = now();
      const value = {
        ...configuration,
        organizerActorId:
          existingConfiguration?.organizerActorId ?? actorId.trim(),
        updatedAt: timestamp,
      };
      const saved = await repository.saveConfigurationAsOperator({
        actorId,
        capability: "operations.configure",
        configuration: value,
      });
      const shadowRegistrations = await registrationService.list({
        eventId: configuration.eventId,
      });
      await repository.activateCanonicalRegistrations(
        configuration.eventId,
        shadowRegistrations,
      );
      return saved;
    },

    async createContactRequest({ actorId, eventId, targetParticipantId }) {
      await requireRegistered(eventId, actorId);
      const published = await repository.getPublishedResult(eventId);
      const { participants } = await participantContext(
        eventId,
        actorId,
        published,
      );
      const target = participants.find(
        (value) => value.participantId === targetParticipantId,
      );
      if (!target || target.actorId === actorId) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_CONTACT_REQUEST_INVALID",
          "A business-card request must target one other registered participant.",
        );
      }
      return repository.createContactRequestAtomically({
        eventId,
        requesterActorId: actorId,
        targetParticipantId: target.participantId,
      });
    },

    async adminWorkspace({ actorId, eventId }) {
      await access.requireCapability({
        actorId,
        capability: "operations.read_sensitive",
        eventId,
      });
      const configuration = requireConfiguration(
        await repository.getConfiguration(eventId),
      );
      const [participants, generations, publishedResult, checkIns, contactRequests] =
        await Promise.all([
          currentParticipantsFor(eventId, configuration),
          repository.listGenerations(eventId),
          repository.getPublishedResult(eventId),
          repository.listCheckIns(eventId),
          repository.listContactRequests(eventId, null),
        ]);
      const generationViews = await Promise.all(
        generations.map(async (generation) => ({
          generation,
          progress: await engine.getProgress(generation.generationId),
        })),
      );
      return {
        checkIns,
        configuration,
        contactRequests,
        eventId,
        generations: generationViews,
        metrics: {
          acceptedContactRequests: contactRequests.filter(
            (request) => request.status === "accepted",
          ).length,
          checkedIn: checkIns.length,
          contactRequests: contactRequests.length,
          participantCount: participants.length,
          publishedGenerationId: publishedResult?.generationId ?? null,
        },
        participants,
        publishedResult,
      };
    },

    async publishGeneration({ actorId, eventId, generationId }) {
      await requireGenerationScope({
        actorId,
        capability: "generation.publish",
        eventId,
        generationId,
      });
      return engine.publishGeneration({ actorId, generationId });
    },

    async respondToContactRequest({ accept, actorId, eventId, requestId }) {
      await requireRegistered(eventId, actorId);
      return repository.respondToContactRequestAtomically({
        accept,
        eventId,
        requestId,
        targetActorId: actorId,
      });
    },

    async retryGeneration({ actorId, eventId, generationId }) {
      await requireGenerationScope({
        actorId,
        capability: "generation.run",
        eventId,
        generationId,
      });
      return engine.retryGeneration({ actorId, generationId });
    },

    async runGeneration({
      actorId,
      eventId,
      generationId,
      maxConcurrency,
      workerId,
    }) {
      await requireGenerationScope({
        actorId,
        capability: "generation.run",
        eventId,
        generationId,
      });
      return engine.runGeneration({
        actorId,
        generationId,
        maxConcurrency,
        workerId,
      });
    },

    async startGeneration({ actorId, eventId, idempotencyKey }) {
      await access.requireCapability({
        actorId,
        capability: "generation.run",
        eventId,
      });
      const configuration = requireConfiguration(
        await repository.getConfiguration(eventId),
      );
      const capturedSnapshot =
        await repository.captureGenerationSnapshotAsOperator({
          actingActorId: actorId.trim(),
          capability: "generation.run",
          eventId,
          ownerOrganizerActorId: configuration.organizerActorId,
        });
      return engine.createGeneration({
        actorId,
        capturedSnapshot,
        idempotencyKey,
      });
    },
  };
}
