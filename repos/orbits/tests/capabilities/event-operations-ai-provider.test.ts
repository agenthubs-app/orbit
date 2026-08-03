import assert from "node:assert/strict";
import test from "node:test";

import {
  createConfiguredEventOperationsAiProvider,
  createEventOperationsAiProvider,
} from "../../features/events/event-operations/ai-provider";
import type { EventOperationsParticipant } from "../../features/events/event-operations/contract";

const participants: EventOperationsParticipant[] = [
  {
    actorId: "actor:a",
    company: "Aster Labs",
    displayName: "Aiko",
    energyStyle: "focused",
    evidenceIds: ["evidence:a"],
    experienceHighlight: "Built a regulated AI product",
    industry: "AI",
    languages: ["ja", "en"],
    lateRegistration: false,
    needs: ["health system pilot"],
    offers: ["model evaluation"],
    participantId: "participant:a",
    profileCompleteness: "complete",
    role: "Founder",
    seniority: "founder",
    topics: ["AI safety"],
  },
  {
    actorId: "actor:b",
    company: "Beacon Health",
    displayName: "Bo",
    energyStyle: "exploratory",
    evidenceIds: ["evidence:b"],
    experienceHighlight: "Runs hospital procurement pilots",
    industry: "Healthcare",
    languages: ["zh", "en"],
    lateRegistration: false,
    needs: ["model evaluation"],
    offers: ["health system pilot"],
    participantId: "participant:b",
    profileCompleteness: "complete",
    role: "Director",
    seniority: "director",
    topics: ["clinical procurement"],
  },
];

test("event operations request fingerprint versions prompt, provider, model, and JSON mode", () => {
  const baseline = createEventOperationsAiProvider({
    config: { model: "deepseek-test", provider: "deepseek" },
  });
  const json = createEventOperationsAiProvider({
    config: {
      jsonOutput: true,
      model: "deepseek-test",
      provider: "deepseek",
    },
  });
  assert.notEqual(baseline.requestFingerprint, json.requestFingerprint);
  assert.match(json.requestFingerprint ?? "", /event-operations-compact-closed-json-v2/u);
  assert.match(json.requestFingerprint ?? "", /deepseek-test/u);
  assert.match(json.requestFingerprint ?? "", /"jsonOutput":true/u);
  assert.match(
    createConfiguredEventOperationsAiProvider().requestFingerprint ?? "",
    /"jsonOutput":true/u,
  );
});

function successfulText(text: string) {
  return async () => ({
    model: "test-model",
    provider: "openai" as const,
    source: "provider:openai-responses-api" as const,
    success: true as const,
    text,
  });
}

test("event operations AI adapter accepts one strict recommendation JSON document", async () => {
  let prompt = "";
  const provider = createEventOperationsAiProvider({
    async runModelText(input) {
      prompt = input.userText;
      return successfulText(
        JSON.stringify({
        recommendations: [
          {
            noMatchReason: null,
            recommendations: [
              {
                icebreakers: ["Compare pilot constraints", "Discuss evaluation evidence"],
                memberHint: "Start with the procurement/evaluation dependency.",
                rank: 1,
                reasons: ["Aiko offers evaluation Bo needs", "Bo offers the pilot Aiko needs"],
                score: 96,
                targetParticipantId: "participant:b",
              },
            ],
            sourceParticipantId: "participant:a",
          },
        ],
        }),
      )();
    },
  });
  const result = await provider.generateRecommendations({
    eventId: "event:test",
    recommendationCount: 3,
    sources: [
      {
        candidateParticipants: [participants[1]],
        sourceParticipant: participants[0],
      },
    ],
  });
  assert.equal(result.success, true);
  assert.doesNotMatch(prompt, /actor:a|actor:b|evidence:a|evidence:b/u);
  assert.match(prompt, /Aster Labs|Beacon Health|participant:a|participant:b/u);
});

test("event operations AI adapter rejects fenced or malformed JSON without repair or fallback", async () => {
  for (const text of [
    '```json\n{"recommendations":[]}\n```',
    '{"recommendations":[}',
  ]) {
    const provider = createEventOperationsAiProvider({
      runModelText: successfulText(text),
    });
    const result = await provider.generateRecommendations({
      eventId: "event:test",
      recommendationCount: 3,
      sources: [
        {
          candidateParticipants: [participants[1]],
          sourceParticipant: participants[0],
        },
      ],
    });
    assert.equal(result.success, false);
    if (result.success === false) assert.equal(result.error.code, "AI_JSON_INVALID");
  }
});

test("event operations AI adapter rejects valid JSON with an incomplete schema", async () => {
  const provider = createEventOperationsAiProvider({
    runModelText: successfulText(
      JSON.stringify({
        recommendations: [
          { sourceParticipantId: "participant:a", recommendations: [{ score: 99 }] },
        ],
      }),
    ),
  });
  const result = await provider.generateRecommendations({
    eventId: "event:test",
    recommendationCount: 3,
    sources: [
      {
        candidateParticipants: [participants[1]],
        sourceParticipant: participants[0],
      },
    ],
  });
  assert.equal(result.success, false);
  if (result.success === false) assert.equal(result.error.code, "AI_SCHEMA_INVALID");
});

test("table content requires one non-empty member rationale for every exact assigned member", async () => {
  const baseTable = {
    icebreakers: [
      "Compare the evidence behind each current priority",
      "Identify one dependency the table can unblock",
      "Agree on one concrete post-event introduction",
    ],
    memberPrompts: {
      "participant:a": ["Ask about model evaluation evidence", "Compare deployment constraints"],
      "participant:b": ["Ask about procurement ownership", "Compare pilot success criteria"],
    },
    memberRationales: {
      "participant:a": "Aiko contributes regulated model evaluation experience needed by this table.",
      "participant:b": "Bo contributes hospital procurement access that complements the table's evaluation expertise.",
    },
    members: [
      { participantId: "participant:a", seat: "R1-T1-S1" },
      { participantId: "participant:b", seat: "R1-T1-S2" },
    ],
    rationale: "The assigned members have a concrete evaluation-to-procurement dependency.",
    tableNumber: 1,
    theme: "From evaluation evidence to clinical pilot",
  };
  let prompt = "";
  const valid = createEventOperationsAiProvider({
    async runModelText(input) {
      prompt = input.userText;
      return successfulText(JSON.stringify(baseTable))();
    },
  });
  const input = {
    eventId: "event:test",
    features: [],
    members: participants,
    roundNumber: 1 as const,
    tableNumber: 1,
  };
  const validResult = await valid.generateTableContent(input);
  assert.equal(validResult.success, true);
  assert.match(prompt, /memberRationales/u);
  assert.match(prompt, /no missing, duplicate, unknown, or extra member id/u);

  const invalidRationales = [
    {
      "participant:a": baseTable.memberRationales["participant:a"],
    },
    {
      ...baseTable.memberRationales,
      "participant:unknown": "Unknown attendee must be rejected.",
    },
    {
      "participant:a": baseTable.memberRationales["participant:a"],
      "participant:unknown": "Replacement of an assigned member must be rejected.",
    },
    {
      ...baseTable.memberRationales,
      "participant:b": "   ",
    },
  ];
  for (const memberRationales of invalidRationales) {
    const provider = createEventOperationsAiProvider({
      runModelText: successfulText(
        JSON.stringify({ ...baseTable, memberRationales }),
      ),
    });
    const result = await provider.generateTableContent(input);
    assert.equal(result.success, false);
    if (result.success === false) {
      assert.equal(result.error.code, "AI_SCHEMA_INVALID");
    }
  }
});

test("event operations AI adapter maps missing keys and timeouts to explicit fail-closed states", async () => {
  const missing = createEventOperationsAiProvider({
    runModelText: async () => ({
      error: {
        code: "MODEL_API_KEY_MISSING",
        message: "openai API key is not configured.",
        provider: "openai",
        source: "provider:openai-responses-api",
      },
      success: false,
    }),
  });
  const timedOut = createEventOperationsAiProvider({
    runModelText: async () => ({
      error: {
        code: "MODEL_REQUEST_FAILED",
        message: "openai request timed out after 20000ms.",
        provider: "openai",
        source: "provider:openai-responses-api",
      },
      success: false,
    }),
  });
  for (const [provider, code] of [
    [missing, "AI_UNAVAILABLE"],
    [timedOut, "AI_TIMEOUT"],
  ] as const) {
    const result = await provider.generateRecommendations({
      eventId: "event:test",
      recommendationCount: 3,
      sources: [
        {
          candidateParticipants: [participants[1]],
          sourceParticipant: participants[0],
        },
      ],
    });
    assert.equal(result.success, false);
    if (result.success === false) assert.equal(result.error.code, code);
  }
});
