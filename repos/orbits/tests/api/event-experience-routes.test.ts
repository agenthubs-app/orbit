import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventExperienceDraftPutHandler,
  createEventExperiencePreviewPostHandler,
  createEventExperiencePublishPostHandler,
} from "../../app/api/events/[id]/experience/handlers";
import type { EventAccessService } from "../../features/events/event-access/service";
import type { EventExperienceConfiguration } from "../../features/events/experience/contract";
import { createEventExperienceService } from "../../features/events/experience/service";
import { createMemoryEventExperienceRepository } from "../../features/events/experience/storage/memory-repository";
import { createEventRegistrationRouteHandlers } from "../../app/api/events/[id]/registration/route-handlers";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";

const eventId = "event:experience-api";
const actorId = "organizer:experience-api";
const context = { params: Promise.resolve({ id: eventId }) };

function accessService(): EventAccessService {
  return {
    async get(input) {
      const query = input as { eventId: string; subjectActorId: string };
      return {
        eventId: query.eventId,
        owner: true,
        revision: 1,
        role: null,
        state: null,
        subjectActorId: query.subjectActorId,
      };
    },
    async grant() {
      throw new Error("unused");
    },
    async revoke() {
      throw new Error("unused");
    },
  };
}

function configuration(): EventExperienceConfiguration {
  return {
    accentColor: "#2563eb",
    coverAssetId: null,
    introduction: "A practical room for useful introductions.",
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
    templateId: "default",
  };
}

function dependencies() {
  const service = createEventExperienceService({
    repository: createMemoryEventExperienceRepository(),
  });
  const common = {
    createAccessService: () => accessService(),
    createService: () => service,
    resolveActor: async () => ({ id: actorId }),
  };
  return { common, service };
}

async function json(response: Response): Promise<Record<string, any>> {
  return response.json() as Promise<Record<string, any>>;
}

test("experience API publishes an immutable question-set identity", async () => {
  const { common } = dependencies();
  const put = createEventExperienceDraftPutHandler(common);
  const publish = createEventExperiencePublishPostHandler(common);

  const draftResponse = await put(
    new Request("http://orbit.local", {
      body: JSON.stringify({ configuration: configuration(), expectedRevision: null }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    context,
  );
  assert.equal(draftResponse.status, 200);
  const draftBody = await json(draftResponse);
  assert.equal(draftBody.data.head.revision, 1);

  const publishResponse = await publish(
    new Request("http://orbit.local", {
      body: JSON.stringify({ expectedRevision: 1 }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  assert.equal(publishResponse.status, 200);
  const publishedBody = await json(publishResponse);
  assert.equal(publishedBody.data.head.revision, 2);
  assert.equal(publishedBody.data.published.version, 1);
  assert.equal(publishedBody.data.published.configuration.introduction, "A practical room for useful introductions.");
  assert.equal(publishedBody.data.published.configuration.accentColor, "#2563EB");
});

test("experience API maps a stale expectedRevision to 409", async () => {
  const { common } = dependencies();
  const put = createEventExperienceDraftPutHandler(common);
  const first = await put(
    new Request("http://orbit.local", {
      body: JSON.stringify({ configuration: configuration(), expectedRevision: null }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    context,
  );
  assert.equal(first.status, 200);

  const stale = await put(
    new Request("http://orbit.local", {
      body: JSON.stringify({ configuration: configuration(), expectedRevision: null }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    context,
  );
  const body = await json(stale);
  assert.equal(stale.status, 409);
  assert.equal(body.error.code, "CONFLICT");
});

test("preview API returns version zero without constructing or writing service storage", async () => {
  let serviceCalls = 0;
  const preview = createEventExperiencePreviewPostHandler({
    createAccessService: () => accessService(),
    createService: () => {
      serviceCalls += 1;
      throw new Error("preview must not need storage");
    },
    resolveActor: async () => ({ id: actorId }),
  });
  const response = await preview(
    new Request("http://orbit.local", {
      body: JSON.stringify({ configuration: configuration() }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  const body = await json(response);
  assert.equal(response.status, 200);
  assert.equal(body.data.version.version, 0);
  assert.equal(body.data.version.configuration.introduction, "A practical room for useful introductions.");
  assert.equal(body.data.version.configuration.accentColor, "#2563EB");
  assert.equal(serviceCalls, 0);
});

test("published V2 questions are served deterministically and require matching identity", async () => {
  const experienceService = createEventExperienceService({
    repository: createMemoryEventExperienceRepository(),
  });
  const draft = await experienceService.saveDraft({
    actorId,
    configuration: configuration(),
    eventId: "demo-event-1",
    expectedRevision: null,
  });
  const published = await experienceService.publish({
    actorId,
    eventId: "demo-event-1",
    expectedRevision: draft.head.revision,
  });
  const publishedQuestionSet = await experienceService.getPublishedQuestionSet(
    "demo-event-1",
  );
  assert.ok(publishedQuestionSet);

  const event = mockEventRecords.find((candidate) => candidate.id === "demo-event-1");
  assert.ok(event);
  const registrationService = createEventRegistrationService({
    provider: createMemoryEventRegistrationProvider(),
  });
  const handlers = createEventRegistrationRouteHandlers({
    getPublishedQuestionSet: async () => publishedQuestionSet,
    loadEvent: async () => event,
    now: () => new Date("2026-06-01T00:00:00.000Z"),
    registrationService,
    resolveActor: async () => ({ id: "participant:v2" }),
  });

  const missingIdentity = await handlers.POST(
    new Request("http://orbit.local/api/events/demo-event-1/registration", {
      body: JSON.stringify({ answers: {} }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ id: "demo-event-1" }) },
  );
  assert.equal(missingIdentity.status, 409);

  const accepted = await handlers.POST(
    new Request("http://orbit.local/api/events/demo-event-1/registration", {
      body: JSON.stringify({
        answers: {},
        questionSetHash: publishedQuestionSet.hash,
        questionSetVersion: publishedQuestionSet.questionSetVersion,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ id: "demo-event-1" }) },
  );
  assert.equal(accepted.status, 200);
  const acceptedBody = await json(accepted);
  assert.equal(
    acceptedBody.data.participantProfile.questionSetVersion,
    publishedQuestionSet.questionSetVersion,
  );

  const state = await handlers.GET(
    new Request("http://orbit.local/api/events/demo-event-1/registration"),
    { params: Promise.resolve({ id: "demo-event-1" }) },
  );
  const stateBody = await json(state);
  assert.equal(state.status, 200);
  assert.equal(stateBody.data.questionSet.questionSetHash, publishedQuestionSet.hash);
  assert.equal(stateBody.data.questionSet.provenance.aiProviderRequested, false);
  assert.equal(stateBody.data.questionSet.questions[0].required, false);
  assert.equal(published.head.publishedVersion, 1);
});
