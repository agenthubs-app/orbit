import assert from "node:assert/strict";
import test from "node:test";

import {
  AiSessionReferenceAuthorizationError,
  authorizeAiSessionContactReferences,
} from "../../features/orbit-ai/ai-session-reference-authorization";

const success = {
  success: true as const,
  data: { contact: { id: "contact:lin" } },
};

test("contact references are checked against the authenticated actor before use", async () => {
  const calls: unknown[] = [];
  await authorizeAiSessionContactReferences({
    actorId: "actor:one",
    references: [
      { id: "contact:lin", type: "contact" },
      { id: "contact:lin", type: "contact" },
      { id: "event:meetup", type: "event" },
    ],
    service: {
      getContactDetail(input: unknown) {
        calls.push(input);
        return success as never;
      },
    },
  });
  assert.deepEqual(calls, [{ actorId: "actor:one", contactId: "contact:lin", scenario: null }]);
});

test("deleted, unauthorized and cross-actor contact references fail without revealing which case", async () => {
  await assert.rejects(
    authorizeAiSessionContactReferences({
      actorId: "actor:other",
      references: [{ id: "contact:private", type: "contact" }],
      service: {
        getContactDetail: () => ({ success: false, error: { code: "CONTACT_DETAIL_NOT_FOUND" } }) as never,
      },
    }),
    (error: unknown) => error instanceof AiSessionReferenceAuthorizationError
      && error.code === "REFERENCE_NOT_ACCESSIBLE"
      && !error.message.includes("contact:private"),
  );
});

test("contact authorization service failures remain retryable and empty references need no service", async () => {
  let calls = 0;
  await authorizeAiSessionContactReferences({
    actorId: "actor:one",
    references: [],
    service: { getContactDetail: () => { calls += 1; return success as never; } },
  });
  assert.equal(calls, 0);

  await assert.rejects(
    authorizeAiSessionContactReferences({
      actorId: "actor:one",
      references: [{ id: "contact:lin", type: "contact" }],
      service: { getContactDetail: () => { throw new Error("database unavailable"); } },
    }),
    (error: unknown) => error instanceof AiSessionReferenceAuthorizationError
      && error.code === "REFERENCE_SERVICE_UNAVAILABLE",
  );

  await assert.rejects(
    authorizeAiSessionContactReferences({
      actorId: "actor:one",
      references: [{ id: "contact:lin", type: "contact" }],
      service: { getContactDetail: () => ({ success: false, error: { code: "CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED" } }) as never },
    }),
    (error: unknown) => error instanceof AiSessionReferenceAuthorizationError
      && error.code === "REFERENCE_SERVICE_UNAVAILABLE",
  );
});
