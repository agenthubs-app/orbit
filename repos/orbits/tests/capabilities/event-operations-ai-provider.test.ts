import assert from "node:assert/strict";
import test from "node:test";

import {
  createConfiguredEventOperationsAiProvider,
  createEventOperationsAiProvider,
} from "../../features/events/event-operations/ai-provider";
import type { EventOperationsParticipant } from "../../features/events/event-operations/contract";

const profileCanaries = [
  "canary-desired-outcome",
  "canary-energy-style",
  "canary-experience-highlight",
  "canary-follow-up-preference",
  "canary-industry",
  "canary-positioning",
  "canary-target-attendees",
  "canary-value-offered",
] as const;

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
    profileAnswers: {
      desiredOutcome: "canary-desired-outcome",
      energyStyle: "canary-energy-style",
      experienceHighlight: "canary-experience-highlight",
      followUpPreference: "canary-follow-up-preference",
      industry: "canary-industry",
      positioning: "canary-positioning",
      targetAttendees: "canary-target-attendees",
      valueOffered: "canary-value-offered",
    },
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

test("event operations request fingerprint versions provider behavior as well as prompt/model/schema", () => {
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
  assert.match(json.requestFingerprint ?? "", /event-operations-compact-closed-json-v3-full-profile/u);
  assert.match(json.requestFingerprint ?? "", /deepseek-test/u);
  assert.match(json.requestFingerprint ?? "", /"jsonOutput":true/u);
  assert.match(
    createConfiguredEventOperationsAiProvider().requestFingerprint ?? "",
    /"jsonOutput":true/u,
  );
  const thinkingOff = createEventOperationsAiProvider({
    config: { deepseekThinking: false, maxTokens: 8192, model: "deepseek-test", provider: "deepseek" },
  });
  const thinkingOn = createEventOperationsAiProvider({
    config: { deepseekThinking: true, maxTokens: 8192, model: "deepseek-test", provider: "deepseek" },
  });
  assert.notEqual(thinkingOff.requestFingerprint, thinkingOn.requestFingerprint);
  assert.match(createConfiguredEventOperationsAiProvider().requestFingerprint ?? "", /"maxTokens":8192/u);
  assert.match(createConfiguredEventOperationsAiProvider().requestFingerprint ?? "", /"thinking":false/u);
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
  for (const canary of profileCanaries) {
    assert.match(prompt, new RegExp(canary, "u"));
  }
});

test("grouping feature prompt includes every typed event-profile answer", async () => {
  let prompt = "";
  const provider = createEventOperationsAiProvider({
    async runModelText(input) {
      prompt = input.userText;
      return successfulText(
        JSON.stringify({
          features: [
            {
              affinityParticipantIds: ["participant:b"],
              facilitationHint: "Start from the regulated pilot dependency.",
              participantId: "participant:a",
              primaryTopic: "Regulated AI pilots",
              secondaryTopic: "Evaluation evidence",
            },
          ],
        }),
      )();
    },
  });

  const result = await provider.generateGroupingFeatures({
    eventId: "event:test",
    maxAffinityCount: 3,
    sources: [
      {
        candidateParticipants: [participants[1]],
        recommendations: {
          noMatchReason: null,
          recommendations: [],
          sourceParticipantId: "participant:a",
        },
        sourceParticipant: participants[0],
      },
    ],
  });

  assert.equal(result.success, true);
  for (const canary of profileCanaries) {
    assert.match(prompt, new RegExp(canary, "u"));
  }
});

test("recommendation prompt retains six full profiles and sixteen candidates per source without fallback", async () => {
  const sources = Array.from({ length: 6 }, (_, sourceIndex) => {
    const source = {
      ...participants[0]!,
      actorId: `actor:source:${sourceIndex}`,
      displayName: `Source ${sourceIndex}`,
      participantId: `participant:source:${sourceIndex}`,
      profileAnswers: {
        ...participants[0]!.profileAnswers,
        canary: `source-profile-answer-${sourceIndex}`,
      },
    };
    const candidateParticipants = Array.from({ length: 16 }, (_, candidateIndex) => ({
      ...participants[1]!,
      actorId: `actor:candidate:${sourceIndex}:${candidateIndex}`,
      displayName: `Candidate ${sourceIndex}/${candidateIndex}`,
      participantId: `participant:candidate:${sourceIndex}:${candidateIndex}`,
      profileAnswers: {
        ...participants[1]!.profileAnswers,
        canary: `candidate-profile-answer-${sourceIndex}-${candidateIndex}`,
      },
    }));
    return { candidateParticipants, sourceParticipant: source };
  });
  let prompt = "";
  const provider = createEventOperationsAiProvider({
    async runModelText(input) {
      prompt = input.userText;
      return successfulText(JSON.stringify({
        recommendations: sources.map((source) => ({
          noMatchReason: null,
          recommendations: source.candidateParticipants.slice(0, 4).map((candidate, index) => ({
            icebreakers: [`Question ${index}a`, `Question ${index}b`],
            memberHint: `Bounded hint ${index}`,
            rank: index + 1,
            reasons: [`Reason ${index}`],
            score: 90 - index,
            targetParticipantId: candidate.participantId,
          })),
          sourceParticipantId: source.sourceParticipant.participantId,
        })),
      }))();
    },
  });
  const result = await provider.generateRecommendations({
    eventId: "event:prompt-scale",
    recommendationCount: 4,
    sources,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.length, 6);
    assert.equal(result.data.flatMap((row) => row.recommendations).length, 24);
  }
  for (let sourceIndex = 0; sourceIndex < 6; sourceIndex += 1) {
    assert.match(prompt, new RegExp(`source-profile-answer-${sourceIndex}`, "u"));
    for (let candidateIndex = 0; candidateIndex < 16; candidateIndex += 1) {
      assert.match(prompt, new RegExp(`candidate-profile-answer-${sourceIndex}-${candidateIndex}`, "u"));
    }
  }
  for (const canary of profileCanaries) assert.match(prompt, new RegExp(canary, "u"));
  assert.doesNotMatch(prompt, /fallback|summary|deduplicat/iu);
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
  for (const canary of profileCanaries) {
    assert.match(prompt, new RegExp(canary, "u"));
  }

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
      retryable: false,
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
      retryable: true,
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

test("event operations preserves provider retryability for terminal DeepSeek reasons", async () => {
  for (const [finishReason, retryable] of [
    ["length", false], ["content_filter", false], ["tool_calls", false],
    ["unknown", false], ["insufficient_system_resource", true],
  ] as const) {
    const provider = createEventOperationsAiProvider({
      runModelText: async () => ({
        error: { code: "MODEL_REQUEST_FAILED", message: finishReason, provider: "deepseek", source: "provider:deepseek-chat-completions-api" },
        responseMetadata: { finishReason, providerResponseBytes: 10, usage: null },
        retryable,
        success: false as const,
      }),
    });
    const result = await provider.generateRecommendations({
      eventId: "event:test", recommendationCount: 1,
      sources: [{ candidateParticipants: [participants[1]!], sourceParticipant: participants[0]! }],
    });
    assert.equal(result.success, false);
    if (result.success === false) assert.equal(result.retryable, retryable);
  }
});
