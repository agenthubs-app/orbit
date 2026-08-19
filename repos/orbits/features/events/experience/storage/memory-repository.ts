import {
  EventExperienceError,
  type EventExperienceConfiguration,
  type EventExperienceHead,
  type EventExperienceQuestionSetInput,
  type EventExperienceRepository,
  type EventExperienceSnapshot,
  type EventExperienceVersion,
  type PublishEventExperienceInput,
  type SaveEventExperienceDraftInput,
} from "../contract";
import {
  configurationHash,
  normalizeExperienceConfiguration,
  questionSetHash,
} from "../validation";

interface MemoryRepositoryOptions {
  now?: () => string;
  profileEditDeadlineAt?: string | null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createMemoryEventExperienceRepository(
  options: MemoryRepositoryOptions = {},
): EventExperienceRepository {
  const now = options.now ?? (() => new Date().toISOString());
  const versions = new Map<string, EventExperienceVersion[]>();
  const heads = new Map<string, EventExperienceHead>();

  function headFor(eventId: string): EventExperienceHead {
    const current = heads.get(eventId);
    if (current) return current;
    const head: EventExperienceHead = {
      draftVersion: null,
      eventId,
      frozenAt: options.profileEditDeadlineAt ?? null,
      publishedAt: null,
      publishedVersion: null,
      revision: 0,
    };
    heads.set(eventId, head);
    return head;
  }

  function versionFor(
    eventId: string,
    version: number | null,
  ): EventExperienceVersion | null {
    if (version === null) return null;
    return clone(
      (versions.get(eventId) ?? []).find((item) => item.version === version) ??
        null,
    );
  }

  function ensureMutable(
    eventId: string,
    proposedQuestionSet?: EventExperienceQuestionSetInput,
  ): EventExperienceHead {
    const head = headFor(eventId);
    if (head.frozenAt && Date.parse(now()) >= Date.parse(head.frozenAt)) {
      const published = versionFor(eventId, head.publishedVersion);
      const questionSetUnchanged = Boolean(
        published &&
          proposedQuestionSet &&
          questionSetHash(proposedQuestionSet) ===
            questionSetHash(published.configuration.questionSet),
      );
      if (questionSetUnchanged) return head;
      throw new EventExperienceError(
        "EVENT_EXPERIENCE_FROZEN",
        published
          ? "The matching question set is frozen after the profile-edit deadline."
          : "The event experience needs a published question set before the profile-edit deadline.",
        { eventId, revision: head.revision },
      );
    }
    return head;
  }

  function snapshotFor(eventId: string): EventExperienceSnapshot {
    const head = headFor(eventId);
    return {
      draft: versionFor(eventId, head.draftVersion),
      head: clone(head),
      published: versionFor(eventId, head.publishedVersion),
    };
  }

  function checkRevision(
    eventId: string,
    expectedRevision: number | null,
    head: EventExperienceHead,
  ): void {
    if (
      (expectedRevision === null && head.revision !== 0) ||
      (expectedRevision !== null &&
        (!Number.isSafeInteger(expectedRevision) ||
          expectedRevision !== head.revision))
    ) {
      throw new EventExperienceError(
        "EVENT_EXPERIENCE_VERSION_CONFLICT",
        "The event experience changed. Refresh before saving again.",
        { eventId, expectedRevision, revision: head.revision },
      );
    }
  }

  return {
    async get(eventId) {
      return heads.has(eventId) ? snapshotFor(eventId) : null;
    },
    async saveDraft(input: SaveEventExperienceDraftInput) {
      const eventId = input.eventId.trim();
      if (!eventId) {
        throw new EventExperienceError(
          "EVENT_EXPERIENCE_EVENT_ID_REQUIRED",
          "An event id is required.",
        );
      }
      const configuration = normalizeExperienceConfiguration(
        input.configuration,
      );
      const head = ensureMutable(eventId, configuration.questionSet);
      checkRevision(eventId, input.expectedRevision, head);
      const version = (versions.get(eventId)?.length ?? 0) + 1;
      const record: EventExperienceVersion = {
        configuration,
        createdAt: now(),
        createdByActorId: input.actorId,
        eventId,
        hash: configurationHash(configuration),
        version,
      };
      versions.set(eventId, [...(versions.get(eventId) ?? []), record]);
      head.draftVersion = version;
      head.revision += 1;
      heads.set(eventId, head);
      return snapshotFor(eventId);
    },
    async publish(input: PublishEventExperienceInput) {
      const eventId = input.eventId.trim();
      const existingHead = headFor(eventId);
      const draft = versionFor(eventId, existingHead.draftVersion);
      const head = ensureMutable(eventId, draft?.configuration.questionSet);
      checkRevision(eventId, input.expectedRevision, head);
      if (head.draftVersion === null) {
        throw new EventExperienceError(
          "EVENT_EXPERIENCE_PUBLISH_REQUIRED",
          "Save an experience draft before publishing.",
          { eventId, revision: head.revision },
        );
      }
      head.publishedVersion = head.draftVersion;
      head.publishedAt = now();
      head.revision += 1;
      heads.set(eventId, head);
      return snapshotFor(eventId);
    },
  } satisfies EventExperienceRepository;
}
