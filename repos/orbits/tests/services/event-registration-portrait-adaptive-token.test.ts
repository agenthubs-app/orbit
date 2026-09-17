import assert from "node:assert/strict";
import test from "node:test";
import { signAdaptiveInterviewQuestion, verifyInterviewResponseSubmissions } from "../../features/events/registration/interview-question-token.server";
import { signPortraitAdaptiveQuestion, verifyPortraitAdaptiveQuestion } from "../../features/events/registration/portrait/adaptive-question-token.server";
import { PortraitTokenError } from "../../features/events/registration/portrait/generation-token.server";

const scope = { workspaceId: "legal-workspace-A", actorId: "self", eventId: "event" };
const secret = "synthetic-workspace-proof-not-production";
const issuedAt = Date.parse("2026-09-17T10:00:00.000Z");
const question = { acknowledgment: "Understood.", field: "targetAttendees" as const, options: ["Builders", "Operators"], prompt: "Who would you like to meet?", provenance: { generationMethod: "orbit-agent-model-adaptive" as const, fallbackReason: null, provider: "synthetic", model: "synthetic" } };

test("adaptive portrait binding accepts its workspace and rejects another legal workspace with the same actor/event/secret", () => {
  const questionToken = signAdaptiveInterviewQuestion({ ...scope, language: "en", question, secret, now: () => issuedAt });
  const portraitAdaptiveToken = signPortraitAdaptiveQuestion({ ...scope, questionToken, secret, now: () => issuedAt + 1000 });
  assert.doesNotThrow(() => verifyPortraitAdaptiveQuestion({ ...scope, questionToken, portraitAdaptiveToken, secret, now: () => issuedAt + 2000 }));
  assert.throws(() => verifyPortraitAdaptiveQuestion({ ...scope, workspaceId: "legal-workspace-B", questionToken, portraitAdaptiveToken, secret, now: () => issuedAt + 2000 }), (error: unknown) => error instanceof PortraitTokenError && error.code === "PORTRAIT_GENERATION_INVALID");
  assert.equal(verifyInterviewResponseSubmissions({ ...scope, responses: [{ questionToken, answer: "Builders" }], secret, now: () => issuedAt + 2000 }).length, 1);
});

test("adaptive binding preserves original expiry and rejects another original token or missing binding", () => {
  const questionToken = signAdaptiveInterviewQuestion({ ...scope, language: "en", question, secret, ttlMs: 60000, now: () => issuedAt });
  const portraitAdaptiveToken = signPortraitAdaptiveQuestion({ ...scope, questionToken, secret, now: () => issuedAt + 59000 });
  const payload = JSON.parse(Buffer.from(portraitAdaptiveToken.split(".")[0], "base64url").toString());
  assert.equal(payload.issuedAt, issuedAt);
  assert.equal(payload.expiresAt, issuedAt + 60000);
  assert.throws(() => verifyPortraitAdaptiveQuestion({ ...scope, questionToken, portraitAdaptiveToken, secret, now: () => issuedAt + 60000 }), (error: unknown) => error instanceof PortraitTokenError && error.code === "PORTRAIT_GENERATION_EXPIRED");
  const otherToken = signAdaptiveInterviewQuestion({ ...scope, language: "en", question, secret, now: () => issuedAt });
  for (const invalid of [{ questionToken: otherToken, portraitAdaptiveToken }, { questionToken, portraitAdaptiveToken: "" }]) {
    assert.throws(() => verifyPortraitAdaptiveQuestion({ ...scope, ...invalid, secret, now: () => issuedAt + 59000 }), (error: unknown) => error instanceof PortraitTokenError && error.code === "PORTRAIT_GENERATION_INVALID");
  }
});
