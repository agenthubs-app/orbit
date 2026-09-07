import {
  EventExperienceError,
  type EventExperienceConfiguration,
  type EventExperiencePublishedQuestionSet,
  type EventExperienceRepository,
  type EventExperienceService,
  type EventExperienceSnapshot,
  type EventExperienceVersion,
  type PublishEventExperienceInput,
  type SaveEventExperienceDraftInput,
} from "./contract";
import {
  configurationHash,
  normalizeExperienceConfiguration,
  publishedQuestionSetFromVersion,
} from "./validation";

function requiredEventId(eventId: string): string {
  const normalized = eventId.trim();
  if (!normalized) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_EVENT_ID_REQUIRED",
      "An event id is required.",
    );
  }
  return normalized;
}

function requiredActorId(actorId: string): string {
  const normalized = actorId.trim();
  if (!normalized) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "An actor id is required.",
    );
  }
  return normalized;
}

/**
 * Build an ephemeral preview only. This intentionally has no repository
 * dependency, so preview cannot create a head, version, participant, or
 * registration side effect.
 */
export function previewEventExperienceConfiguration(
  configuration: EventExperienceConfiguration,
  now = new Date().toISOString(),
): EventExperienceVersion {
  const normalized = normalizeExperienceConfiguration(configuration);
  return {
    configuration: normalized,
    createdAt: now,
    createdByActorId: "preview",
    eventId: "preview",
    hash: configurationHash(normalized),
    version: 0,
  };
}

export function createEventExperienceService(input: {
  now?: () => string;
  repository: EventExperienceRepository;
}): EventExperienceService {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    async get(eventId) {
      const normalizedEventId = requiredEventId(eventId);
      const snapshot = await input.repository.get(normalizedEventId);
      if (!snapshot) {
        throw new EventExperienceError(
          "EVENT_EXPERIENCE_NOT_FOUND",
          "The event experience has not been created.",
          { eventId: normalizedEventId },
        );
      }
      return snapshot;
    },

    async getPublishedQuestionSet(
      eventId,
    ): Promise<EventExperiencePublishedQuestionSet | null> {
      const normalizedEventId = requiredEventId(eventId);
      const snapshot = await input.repository.get(normalizedEventId);
      if (!snapshot?.published) return null;
      return publishedQuestionSetFromVersion(snapshot.published);
    },

    preview(configuration) {
      return previewEventExperienceConfiguration(configuration, now());
    },

    async publish(command: PublishEventExperienceInput) {
      const eventId = requiredEventId(command.eventId);
      const actorId = requiredActorId(command.actorId);
      if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
        throw new EventExperienceError(
          "EVENT_EXPERIENCE_INVALID",
          "expectedRevision must be a non-negative integer.",
          { eventId, expectedRevision: command.expectedRevision },
        );
      }
      return input.repository.publish({
        ...command,
        actorId,
        eventId,
      });
    },

    async saveDraft(command: SaveEventExperienceDraftInput) {
      const eventId = requiredEventId(command.eventId);
      const actorId = requiredActorId(command.actorId);
      if (
        command.expectedRevision !== null &&
        (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0)
      ) {
        throw new EventExperienceError(
          "EVENT_EXPERIENCE_INVALID",
          "expectedRevision must be a non-negative integer or null.",
          { eventId, expectedRevision: command.expectedRevision },
        );
      }
      return input.repository.saveDraft({
        ...command,
        actorId,
        configuration: normalizeExperienceConfiguration(command.configuration),
        eventId,
      });
    },
  };
}

export function publishedQuestionSetFromSnapshot(
  snapshot: EventExperienceSnapshot,
): EventExperiencePublishedQuestionSet | null {
  return snapshot.published
    ? publishedQuestionSetFromVersion(snapshot.published)
    : null;
}
