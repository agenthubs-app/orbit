import assert from "node:assert/strict";
import test from "node:test";

import {
  createContactIntroductionsGetHandler,
  createContactIntroductionsPostHandler,
} from "../../app/api/contacts/introductions/handler";
import type {
  ContactIntroductionRepository,
} from "../../features/contacts/introduction-records";

const introduction = {
  id: "intro-test",
  contactAId: "contact-a",
  contactBId: "contact-b",
  labelA: "Aiko Tanaka",
  labelB: "Mei Lin",
  blurb: "A sourced introduction note.",
  status: "draft" as const,
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};

test("contact introduction routes require an authenticated actor", async () => {
  const response = await createContactIntroductionsGetHandler({
    resolveActor: async () => null,
  })();

  assert.equal(response.status, 401);
});

test("contact introduction POST forwards only the authenticated actor id", async () => {
  let receivedActor = "";
  const repository: ContactIntroductionRepository = {
    async list() {
      return [];
    },
    async create(actorId) {
      receivedActor = actorId;
      return introduction;
    },
  };
  const response = await createContactIntroductionsPostHandler({
    repository,
    resolveActor: async () => ({ id: "actor-a" }),
  })(
    new Request("http://localhost/api/contacts/introductions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorId: "actor-b",
        contactAId: "contact-a",
        contactBId: "contact-b",
        blurb: "A sourced introduction note.",
        requestId: "route-request-1",
      }),
    }),
  );
  const envelope = (await response.json()) as {
    success: boolean;
    data: { introduction: typeof introduction };
  };

  assert.equal(response.status, 201);
  assert.equal(receivedActor, "actor-a");
  assert.equal(envelope.success, true);
  assert.equal(envelope.data.introduction.id, introduction.id);
});
