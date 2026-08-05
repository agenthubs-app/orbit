import assert from "node:assert/strict";
import test from "node:test";

import {
  createScopedStrictSchema,
  createStrictTaskRunner,
  STRICT_TOOL,
} from "../../scripts/evaluate-deepseek-strict-recommendation-gate";
import type { BuiltRecommendationTask } from "../../scripts/evaluate-event-operations-recommendations";

const task = {
  request: {
    eventId: "event:private",
    recommendationCount: 1,
    sources: [{
      candidateParticipants: [{ participantId: "participant:target", profileAnswers: { canary: "candidate-profile-canary" } }],
      sourceParticipant: { participantId: "participant:source", profileAnswers: { canary: "source-profile-canary" } },
    }],
  },
} as unknown as BuiltRecommendationTask;

function recommendation(targetCandidateKey: string, rank = 1) {
  return {
    icebreakers: ["AI question one", "AI question two"],
    memberHint: "AI hint",
    rank,
    reasons: ["AI reason"],
    score: 90,
    targetCandidateKey,
  };
}

function response(argumentsText: string, toolName: string = STRICT_TOOL) {
  return new Response(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ function: { arguments: argumentsText, name: toolName }, type: "function" }] } }], usage: { completion_tokens: 2, prompt_tokens: 3 } }), { status: 200 });
}

test("strict recommendation schema scopes tokens and runner preserves production prompt profiles", async () => {
  const schema = createScopedStrictSchema(task);
  assert.deepEqual(schema.properties.recommendations.items.anyOf[0].properties.sourceKey.enum, ["S1"]);
  assert.deepEqual(schema.properties.recommendations.items.anyOf[0].properties.recommendations.items.properties.targetCandidateKey.enum, ["S1C1"]);
  let body = "";
  const telemetry: Parameters<typeof createStrictTaskRunner>[0]["telemetry"] = { bytes: null, category: null, finish: null, timingMs: null, tokens: null };
  const runner = createStrictTaskRunner({
    apiKey: "secret",
    fetchImpl: async (_url, init) => {
      body = String(init?.body);
      return response(JSON.stringify({ recommendations: [{ noMatchReason: "", recommendations: [recommendation("S1C1")], sourceKey: "S1" }] }));
    },
    model: "deepseek-v4-flash",
    task,
    telemetry,
  });
  const result = await runner({ systemInstruction: "system", userText: "source-profile-canary candidate-profile-canary" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.match(result.text, /AI question one|AI hint|AI reason/u);
    assert.doesNotMatch(result.text, /Strict tool recommendation/u);
  }
  assert.match(body, /source-profile-canary|candidate-profile-canary/u);
  assert.doesNotMatch(body, /participant:source|participant:target/u);
});

test("strict runner rejects wrong tools and scoped-wire violations without fallback", async () => {
  for (const [argumentsText, expected] of [
    [JSON.stringify({ recommendations: [{ noMatchReason: "", recommendations: [recommendation("S1C2")], sourceKey: "S1" }] }), "unknown_target"],
    [JSON.stringify({ recommendations: [{ noMatchReason: "", recommendations: [recommendation("S1C1"), recommendation("S1C1", 2)], sourceKey: "S1" }] }), "duplicate_target"],
    [JSON.stringify({ recommendations: [{ noMatchReason: "", recommendations: [recommendation("S1C1")], sourceKey: "S2" }] }), "unknown_source"],
    [JSON.stringify({ recommendations: [{ noMatchReason: "unexpected", recommendations: [recommendation("S1C1")], sourceKey: "S1" }] }), "no_match_contract"],
    [JSON.stringify({ recommendations: [{ noMatchReason: "", recommendations: [{ ...recommendation("S1C1"), icebreakers: ["only one"] }], sourceKey: "S1" }] }), "icebreakers_contract"],
  ] as const) {
    const telemetry: Parameters<typeof createStrictTaskRunner>[0]["telemetry"] = { bytes: null, category: null, finish: null, timingMs: null, tokens: null };
    const runner = createStrictTaskRunner({ apiKey: "secret", fetchImpl: async () => response(argumentsText), model: "deepseek-v4-flash", task, telemetry });
    const result = await runner({ systemInstruction: "system", userText: "prompt" });
    assert.equal(result.success, false);
    assert.equal(telemetry.category, expected);
  }
  const wrongToolTelemetry: Parameters<typeof createStrictTaskRunner>[0]["telemetry"] = { bytes: null, category: null, finish: null, timingMs: null, tokens: null };
  const wrongToolRunner = createStrictTaskRunner({ apiKey: "secret", fetchImpl: async () => response("{}", "wrong_tool"), model: "deepseek-v4-flash", task, telemetry: wrongToolTelemetry });
  assert.equal((await wrongToolRunner({ systemInstruction: "system", userText: "prompt" })).success, false);
  assert.equal(wrongToolTelemetry.category, "bad_tool");
  const telemetry: Parameters<typeof createStrictTaskRunner>[0]["telemetry"] = { bytes: null, category: null, finish: null, timingMs: null, tokens: null };
  const runner = createStrictTaskRunner({ apiKey: "secret", fetchImpl: async () => new Response("nope", { status: 400 }), model: "deepseek-v4-flash", task, telemetry });
  assert.equal((await runner({ systemInstruction: "system", userText: "prompt" })).success, false);
  assert.equal(telemetry.category, "http");
});

test("strict runner rejects duplicate sources, missing sources, and cross-source targets", async () => {
  const twoSourceTask = {
    ...task,
    request: {
      ...task.request,
      sources: [
        task.request.sources[0],
        {
          candidateParticipants: [{ participantId: "participant:target-two", profileAnswers: { canary: "candidate-two" } }],
          sourceParticipant: { participantId: "participant:source-two", profileAnswers: { canary: "source-two" } },
        },
      ],
    },
  } as unknown as BuiltRecommendationTask;
  const cases = [
    [
      { recommendations: [
        { noMatchReason: "", recommendations: [recommendation("S1C1")], sourceKey: "S1" },
        { noMatchReason: "", recommendations: [recommendation("S1C1")], sourceKey: "S1" },
      ] },
      "duplicate_source",
    ],
    [
      { recommendations: [{ noMatchReason: "", recommendations: [recommendation("S1C1")], sourceKey: "S1" }] },
      "missing_source",
    ],
    [
      { recommendations: [
        { noMatchReason: "", recommendations: [recommendation("S2C1")], sourceKey: "S1" },
        { noMatchReason: "", recommendations: [recommendation("S2C1")], sourceKey: "S2" },
      ] },
      "unknown_target",
    ],
  ] as const;
  for (const [wireValue, expected] of cases) {
    const telemetry: Parameters<typeof createStrictTaskRunner>[0]["telemetry"] = { bytes: null, category: null, finish: null, timingMs: null, tokens: null };
    const runner = createStrictTaskRunner({ apiKey: "secret", fetchImpl: async () => response(JSON.stringify(wireValue)), model: "deepseek-v4-flash", task: twoSourceTask, telemetry });
    assert.equal((await runner({ systemInstruction: "system", userText: "prompt" })).success, false);
    assert.equal(telemetry.category, expected);
  }
});
