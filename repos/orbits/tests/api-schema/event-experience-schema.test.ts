import assert from "node:assert/strict";
import test from "node:test";

import { createEventExperiencePreviewPostHandler } from "../../app/api/events/[id]/experience/handlers";
import type { EventExperienceConfiguration } from "../../features/events/experience/contract";
import { createEventExperienceService } from "../../features/events/experience/service";
import { createMemoryEventExperienceRepository } from "../../features/events/experience/storage/memory-repository";
import {
  eventExperiencePreviewResponseSchema,
  eventExperienceSnapshotSchema,
} from "../../shared/api-schema/event-experience";

const configuration: EventExperienceConfiguration = {
  accentColor: "#2563EB",
  coverAssetId: null,
  introduction: "Useful introductions.",
  questionSet: {
    questions: [{
      id: "desired_outcome",
      intent: "desired_outcome",
      options: ["A pilot", "An introduction"],
      participantProfileField: "desiredOutcome",
      prompt: "What outcome would be useful?",
      required: false,
    }],
    track: "v2",
  },
  templateId: "default",
};
const version = {
  configuration,
  createdAt: "2026-09-10T00:00:00.000Z",
  createdByActorId: "actor:organizer",
  eventId: "event:experience-schema",
  hash: "a".repeat(64),
  version: 2,
};
const snapshot = {
  draft: version,
  head: {
    draftVersion: 2,
    eventId: version.eventId,
    frozenAt: "2026-09-09T00:00:00.000Z",
    publishedAt: "2026-09-08T00:00:00.000Z",
    publishedVersion: 1,
    revision: 3,
  },
  published: { ...version, version: 1 },
};
const preview = {
  version: { ...version, eventId: "preview", createdByActorId: "preview", version: 0 },
};

test("snapshot accepts complete server data without rewriting display text", () => {
  const parsed = eventExperienceSnapshotSchema.parse(snapshot);
  assert.deepEqual(parsed, snapshot);
});

test("snapshot accepts unpublished, absent and published-only versions", () => {
  for (const value of [
    { ...snapshot, published: null, head: { ...snapshot.head, publishedVersion: null, publishedAt: null } },
    { ...snapshot, draft: null, head: { ...snapshot.head, draftVersion: null } },
    { draft: null, published: null, head: { ...snapshot.head, draftVersion: null, publishedVersion: null, publishedAt: null, frozenAt: null, revision: 0 } },
  ]) {
    assert.equal(eventExperienceSnapshotSchema.safeParse(value).success, true);
  }
});

test("snapshot accepts real in-memory service save and publish responses", async () => {
  const service = createEventExperienceService({ repository: createMemoryEventExperienceRepository() });
  const draft = await service.saveDraft({ actorId: "actor:organizer", configuration, eventId: version.eventId, expectedRevision: null });
  assert.deepEqual(eventExperienceSnapshotSchema.parse(draft), draft);
  const published = await service.publish({ actorId: "actor:organizer", eventId: version.eventId, expectedRevision: draft.head.revision });
  assert.deepEqual(eventExperienceSnapshotSchema.parse(published), published);
});

test("snapshot requires every response field, including nullable fields", () => {
  const cases: unknown[] = [null, {}, [], { ...snapshot, head: null }];
  for (const key of Object.keys(snapshot)) cases.push({ ...snapshot, [key]: undefined });
  for (const key of Object.keys(snapshot.head)) cases.push({ ...snapshot, head: { ...snapshot.head, [key]: undefined } });
  for (const key of Object.keys(version)) cases.push({ ...snapshot, draft: { ...version, [key]: undefined } });
  for (const value of cases) assert.equal(eventExperienceSnapshotSchema.safeParse(value).success, false, JSON.stringify(value));
});

test("snapshot rejects invalid revisions and persisted version numbers", () => {
  for (const revision of [-1, 0.5, NaN, Infinity, -Infinity, "3", null]) {
    assert.equal(eventExperienceSnapshotSchema.safeParse({ ...snapshot, head: { ...snapshot.head, revision } }).success, false);
  }
  for (const number of [-1, 0, 1.5, NaN, Infinity, "2"]) {
    for (const slot of ["draft", "published"] as const) {
      assert.equal(eventExperienceSnapshotSchema.safeParse({ ...snapshot, [slot]: { ...version, version: number }, head: { ...snapshot.head, [`${slot}Version`]: number } }).success, false);
    }
  }
});

test("snapshot rejects broken pointers, omitted versions and mixed-event identities", () => {
  for (const slot of ["draft", "published"] as const) {
    for (const value of [
      { ...snapshot, [slot]: null },
      { ...snapshot, head: { ...snapshot.head, [`${slot}Version`]: null } },
      { ...snapshot, head: { ...snapshot.head, [`${slot}Version`]: 99 } },
      { ...snapshot, [slot]: { ...snapshot[slot], eventId: "event:other" } },
    ]) assert.equal(eventExperienceSnapshotSchema.safeParse(value).success, false);
  }
  assert.equal(eventExperienceSnapshotSchema.safeParse({ ...snapshot, head: { ...snapshot.head, eventId: "event:other" } }).success, false);
  assert.equal(eventExperienceSnapshotSchema.safeParse({ ...snapshot, draft: preview.version, head: { ...snapshot.head, draftVersion: 0 } }).success, false);
});

test("snapshot rejects blank identity strings and malformed timestamps", () => {
  for (const key of ["createdByActorId", "eventId", "hash"] as const) {
    for (const value of ["", "  ", null, 42]) {
      assert.equal(eventExperienceSnapshotSchema.safeParse({ ...snapshot, draft: { ...version, [key]: value } }).success, false);
    }
  }
  for (const value of ["", "yesterday", "2026-02-30T00:00:00Z", null, 42]) {
    assert.equal(eventExperienceSnapshotSchema.safeParse({ ...snapshot, draft: { ...version, createdAt: value } }).success, false);
    if (value !== null) {
      for (const key of ["frozenAt", "publishedAt"]) {
        assert.equal(eventExperienceSnapshotSchema.safeParse({ ...snapshot, head: { ...snapshot.head, [key]: value } }).success, false);
      }
    }
  }
});

test("snapshot rejects malformed configuration and unknown question dimensions", () => {
  const question = configuration.questionSet.questions[0];
  const cases: unknown[] = [null, {}, { ...configuration, templateId: "custom" }, { ...configuration, coverAssetId: "asset:custom" }, { ...configuration, introduction: 42 }, { ...configuration, accentColor: "red" }, { ...configuration, questionSet: null }, { ...configuration, questionSet: { ...configuration.questionSet, track: "v3" } }, { ...configuration, questionSet: { track: "v2", questions: null } }];
  for (const key of Object.keys(configuration)) cases.push({ ...configuration, [key]: undefined });
  for (const invalid of [
    null,
    ...Object.keys(question).map((key) => ({ ...question, [key]: undefined })),
    { ...question, id: "custom" },
    { ...question, intent: "custom" },
    { ...question, participantProfileField: "custom" },
    { ...question, id: "positioning" },
    { ...question, participantProfileField: "positioning" },
    { ...question, options: [42] },
    { ...question, options: [""] },
    { ...question, prompt: "  " },
    { ...question, required: "false" },
  ]) cases.push({ ...configuration, questionSet: { track: "v2", questions: [invalid] } });
  for (const value of cases) assert.equal(eventExperienceSnapshotSchema.safeParse({ ...snapshot, draft: { ...version, configuration: value } }).success, false, JSON.stringify(value));
});

test("schema retains all fixed question dimensions and both tracks", () => {
  for (const [id, participantProfileField] of [
    ["target_attendees", "targetAttendees"],
    ["value_offered", "valueOffered"],
    ["desired_outcome", "desiredOutcome"],
    ["follow_up_preference", "followUpPreference"],
    ["positioning", "positioning"],
  ]) {
    const value = { ...preview, version: { ...preview.version, configuration: { ...configuration, introduction: null, accentColor: null, questionSet: { track: "v2", questions: [{ ...configuration.questionSet.questions[0], id, intent: id, participantProfileField }] } } } };
    assert.equal(eventExperiencePreviewResponseSchema.safeParse(value).success, true);
  }
  const v1 = { ...configuration, questionSet: { track: "v1", questions: [
    { ...configuration.questionSet.questions[0], id: "target_attendees", intent: "target_attendees", participantProfileField: "targetAttendees", required: true },
    { ...configuration.questionSet.questions[0], id: "value_offered", intent: "value_offered", participantProfileField: "valueOffered", required: true },
  ] } };
  assert.equal(eventExperiencePreviewResponseSchema.safeParse({ version: { ...preview.version, configuration: v1 } }).success, true);
});

test("preview requires the ephemeral identity and complete version wrapper", () => {
  assert.deepEqual(eventExperiencePreviewResponseSchema.parse(preview), preview);
  for (const value of [null, {}, preview.version, { version: null }, { version }, { version: { ...preview.version, eventId: version.eventId } }, { version: { ...preview.version, createdByActorId: "actor:organizer" } }, ...[-1, 1, 0.5, Infinity, "0"].map((number) => ({ version: { ...preview.version, version: number } }))]) {
    assert.equal(eventExperiencePreviewResponseSchema.safeParse(value).success, false);
  }
  for (const key of Object.keys(preview.version)) {
    assert.equal(eventExperiencePreviewResponseSchema.safeParse({ version: { ...preview.version, [key]: undefined } }).success, false);
  }
});

test("unchanged preview handler returns the schema wrapper with no storage access", async () => {
  const handler = createEventExperiencePreviewPostHandler({
    pilotEnabled: () => true,
    resolveActor: async () => ({ id: "actor:organizer" }),
    createAccessService: () => ({
      async get(input) {
        const query = input as { eventId: string; subjectActorId: string };
        return { eventId: query.eventId, subjectActorId: query.subjectActorId, owner: true, revision: 1, role: null, state: null };
      },
      async grant() { throw new Error("unused"); },
      async revoke() { throw new Error("unused"); },
    }),
    createService: () => { throw new Error("preview must not access storage"); },
  });
  const response = await handler(new Request("http://orbit.local/api/events/event:experience-schema/experience/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ configuration }),
  }), { params: Promise.resolve({ id: version.eventId }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(Object.keys(body.data), ["version"]);
  const parsed = eventExperiencePreviewResponseSchema.parse(body.data);
  assert.deepEqual(parsed, body.data);
  assert.equal(parsed.version.eventId, "preview");
  assert.equal(parsed.version.createdByActorId, "preview");
  assert.equal(parsed.version.version, 0);
  assert.deepEqual(parsed.version.configuration, configuration);
});
