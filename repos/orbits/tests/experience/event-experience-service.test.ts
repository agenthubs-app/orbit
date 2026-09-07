import assert from "node:assert/strict";
import test from "node:test";

import {
  EventExperienceError,
  type EventExperienceConfiguration,
} from "../../features/events/experience/contract";
import { createEventExperienceService } from "../../features/events/experience/service";
import { createMemoryEventExperienceRepository } from "../../features/events/experience/storage/memory-repository";
import {
  normalizeExperienceConfiguration,
  questionSetHash,
} from "../../features/events/experience/validation";

function configuration(
  overrides: Partial<EventExperienceConfiguration> = {},
): EventExperienceConfiguration {
  return {
    accentColor: "#6e56cf",
    coverAssetId: null,
    introduction: "A focused room for useful introductions.",
    questionSet: {
      questions: [
        {
          id: "target_attendees",
          intent: "target_attendees",
          options: ["Founders", "Operators"],
          participantProfileField: "targetAttendees",
          prompt: "Who would make this event useful for you?",
          required: true,
        },
        {
          id: "value_offered",
          intent: "value_offered",
          options: ["Introductions", "Experience"],
          participantProfileField: "valueOffered",
          prompt: "What could you offer people you meet here?",
          required: true,
        },
      ],
      track: "v1",
    },
    templateId: "default",
    ...overrides,
  };
}

test("V1 is exactly the required compatibility pair and V2 is optional", () => {
  assert.equal(normalizeExperienceConfiguration(configuration()).questionSet.questions.length, 2);
  const v2 = normalizeExperienceConfiguration(
    configuration({
      questionSet: {
        track: "v2",
        questions: [
          {
            id: "desired_outcome",
            intent: "desired_outcome",
            options: ["A pilot", "A useful introduction"],
            participantProfileField: "desiredOutcome",
            prompt: "What outcome would make this event worthwhile?",
            required: false,
          },
        ],
      },
    }),
  );
  assert.equal(v2.questionSet.track, "v2");
  assert.equal(v2.questionSet.questions[0]?.required, false);
  assert.equal(normalizeExperienceConfiguration(configuration()).accentColor, "#6E56CF");

  assert.throws(
    () =>
      normalizeExperienceConfiguration(
        configuration({
          coverAssetId: "asset:event-cover",
        }),
      ),
    (error: unknown) =>
      error instanceof EventExperienceError &&
      error.code === "EVENT_EXPERIENCE_INVALID",
  );
  assert.throws(
    () =>
      normalizeExperienceConfiguration(
        configuration({ introduction: "<script>alert(1)</script>" }),
      ),
    (error: unknown) =>
      error instanceof EventExperienceError &&
      error.code === "EVENT_EXPERIENCE_INVALID",
  );
  assert.throws(
    () =>
      normalizeExperienceConfiguration(
        configuration({ accentColor: "red" }),
      ),
    (error: unknown) =>
      error instanceof EventExperienceError &&
      error.code === "EVENT_EXPERIENCE_INVALID",
  );
  assert.throws(
    () =>
      normalizeExperienceConfiguration(
        configuration({
          questionSet: {
            track: "v2",
            questions: [
              {
                id: "desired_outcome",
                intent: "desired_outcome",
                options: ["A", "B"],
                participantProfileField: "desiredOutcome",
                prompt: "What outcome would help?",
                required: true,
              },
            ],
          },
        }),
      ),
    (error: unknown) =>
      error instanceof EventExperienceError &&
      error.code === "EVENT_EXPERIENCE_INVALID",
  );
});

test("draft, publish, and profile deadline freeze only the published question set", async () => {
  let now = "2026-08-19T10:00:00.000Z";
  const service = createEventExperienceService({
    now: () => now,
    repository: createMemoryEventExperienceRepository({
      now: () => now,
      profileEditDeadlineAt: "2026-08-19T12:00:00.000Z",
    }),
  });

  const first = await service.saveDraft({
    actorId: "organizer:1",
    configuration: configuration(),
    eventId: "event:1",
    expectedRevision: null,
  });
  assert.equal(first.head.revision, 1);
  assert.equal(first.draft?.version, 1);

  await assert.rejects(
    () =>
      service.saveDraft({
        actorId: "organizer:1",
        configuration: configuration(),
        eventId: "event:1",
        expectedRevision: null,
      }),
    (error: unknown) =>
      error instanceof EventExperienceError &&
      error.code === "EVENT_EXPERIENCE_VERSION_CONFLICT",
  );

  const published = await service.publish({
    actorId: "organizer:1",
    eventId: "event:1",
    expectedRevision: 1,
  });
  assert.equal(published.head.revision, 2);
  assert.equal(published.published?.version, 1);
  const firstPublishedQuestionSet = await service.getPublishedQuestionSet("event:1");
  assert.equal(firstPublishedQuestionSet?.questionSetVersion, 1);
  assert.equal(firstPublishedQuestionSet?.hash, questionSetHash(configuration().questionSet));

  now = "2026-08-19T12:00:00.000Z";
  const displayOnly = await service.saveDraft({
    actorId: "organizer:1",
    configuration: configuration({
      accentColor: "#f97316",
      introduction: "A refreshed introduction after the deadline.",
    }),
    eventId: "event:1",
    expectedRevision: 2,
  });
  assert.equal(displayOnly.head.revision, 3);
  assert.equal(displayOnly.draft?.version, 2);
  assert.equal(displayOnly.draft?.configuration.accentColor, "#F97316");
  assert.equal(
    displayOnly.draft?.configuration.introduction,
    "A refreshed introduction after the deadline.",
  );

  const displayPublished = await service.publish({
    actorId: "organizer:1",
    eventId: "event:1",
    expectedRevision: 3,
  });
  assert.equal(displayPublished.head.revision, 4);
  assert.equal(displayPublished.published?.version, 2);
  const displayPublishedQuestionSet = await service.getPublishedQuestionSet("event:1");
  assert.equal(displayPublishedQuestionSet?.hash, firstPublishedQuestionSet?.hash);

  const changedQuestionSet = {
    ...configuration().questionSet,
    questions: configuration().questionSet.questions.map((question, index) =>
      index === 0 ? { ...question, prompt: "A different immutable question" } : question,
    ),
  };
  await assert.rejects(
    () =>
      service.saveDraft({
        actorId: "organizer:1",
        configuration: configuration({ questionSet: changedQuestionSet }),
        eventId: "event:1",
        expectedRevision: 4,
      }),
    (error: unknown) =>
      error instanceof EventExperienceError &&
      error.code === "EVENT_EXPERIENCE_FROZEN",
  );

  const lateService = createEventExperienceService({
    now: () => "2026-08-19T13:00:00.000Z",
    repository: createMemoryEventExperienceRepository({
      now: () => "2026-08-19T13:00:00.000Z",
      profileEditDeadlineAt: "2026-08-19T12:00:00.000Z",
    }),
  });
  await assert.rejects(
    () =>
      lateService.saveDraft({
        actorId: "organizer:late",
        configuration: configuration(),
        eventId: "event:late",
        expectedRevision: null,
      }),
    (error: unknown) =>
      error instanceof EventExperienceError &&
      error.code === "EVENT_EXPERIENCE_FROZEN",
  );
});

test("preview is ephemeral and does not create a repository head", async () => {
  let repositoryReads = 0;
  const repository = createMemoryEventExperienceRepository();
  const service = createEventExperienceService({
    repository: {
      ...repository,
      async get(eventId) {
        repositoryReads += 1;
        return repository.get(eventId);
      },
    },
  });

  const preview = service.preview(configuration());
  assert.equal(preview?.version, 0);
  assert.equal(preview?.createdByActorId, "preview");
  assert.equal(preview?.configuration.introduction, "A focused room for useful introductions.");
  assert.equal(preview?.configuration.accentColor, "#6E56CF");
  assert.equal(repositoryReads, 0);
  assert.equal(await repository.get("event:preview"), null);
});
