import assert from "node:assert/strict";
import test from "node:test";

import {
  __eventOperationsAiProviderTestExports,
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
  assert.match(json.requestFingerprint ?? "", /event-operations-tokenized-recommendations-v7-chinese-lexical-policy/u);
  assert.match(json.requestFingerprint ?? "", /event-operations-tokenized-recommendations-v1/u);
  assert.match(json.requestFingerprint ?? "", /deepseek-test/u);
  assert.match(json.requestFingerprint ?? "", /"jsonOutput":true/u);
  assert.match(json.requestFingerprint ?? "", /"outputLanguage":"zh-CN"/u);
  assert.notEqual(
    createEventOperationsAiProvider({ outputLanguage: "en" }).requestFingerprint,
    createEventOperationsAiProvider({ outputLanguage: "zh-CN" }).requestFingerprint,
  );
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
  const warmer = createEventOperationsAiProvider({
    config: { deepseekThinking: false, maxTokens: 8192, model: "deepseek-test", provider: "deepseek", temperature: 0.3 },
  });
  assert.notEqual(thinkingOff.requestFingerprint, thinkingOn.requestFingerprint);
  assert.notEqual(thinkingOff.requestFingerprint, warmer.requestFingerprint);
  for (const temperature of [0, 0.2, 2]) {
    assert.notEqual(
      createEventOperationsAiProvider({ config: { model: "deepseek-test", provider: "deepseek", temperature } }).requestFingerprint,
      baseline.requestFingerprint,
    );
  }
  for (const provider of ["openai", "gemini"] as const) {
    assert.equal(
      createEventOperationsAiProvider({ config: { model: "test", provider, temperature: 0.2 } }).requestFingerprint,
      createEventOperationsAiProvider({ config: { model: "test", provider } }).requestFingerprint,
    );
  }
  assert.match(createConfiguredEventOperationsAiProvider().requestFingerprint ?? "", /"maxTokens":8192/u);
  assert.match(createConfiguredEventOperationsAiProvider().requestFingerprint ?? "", /"thinking":false/u);
  assert.match(warmer.requestFingerprint ?? "", /"temperature":0.3/u);
  const previousProvider = process.env.ORBIT_AGENT_PROVIDER;
  try {
    process.env.ORBIT_AGENT_PROVIDER = "deepseek";
    const configuredFingerprint = JSON.parse(
      createConfiguredEventOperationsAiProvider().requestFingerprint ?? "{}",
    ) as Record<string, unknown>;
    assert.equal(configuredFingerprint.temperature, 0.2);
  } finally {
    if (previousProvider === undefined) delete process.env.ORBIT_AGENT_PROVIDER;
    else process.env.ORBIT_AGENT_PROVIDER = previousProvider;
  }
});

test("JSON failure classifier is envelope-aware without retaining response text", () => {
  const { classifyJsonFailureShape } = __eventOperationsAiProviderTestExports;
  const cases = [
    ["", "empty"],
    ["  \n\t", "empty"],
    ["```json\n{}", "fence_or_prefix"],
    ["prefix {\"x\":1}", "fence_or_prefix"],
    ["{\"text\":\"braces } ] and escaped quote \\\\\\\" remain text\"} trailing", "trailing_text"],
    ["{\"text\":\"unterminated } \\\\\\\"", "unterminated_envelope"],
    ["{\"x\":]}", "parse_syntax"],
  ] as const;
  for (const [text, expected] of cases) {
    assert.equal(classifyJsonFailureShape(text), expected);
  }
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
  let instruction = "";
  const provider = createEventOperationsAiProvider({
    async runModelText(input) {
      prompt = input.userText;
      instruction = input.systemInstruction;
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
                targetCandidateKey: "S1C1",
              },
            ],
            sourceKey: "S1",
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
  assert.match(instruction, /Simplified Chinese/u);
  assert.match(instruction, /reasons, hints, topics, themes, rationales, icebreakers, member prompts/u);
  assert.match(instruction, /Translate ordinary source wording into natural Chinese/u);
  assert.match(instruction, /translate copilot as 智能助手 and investment-ready as 具备投资条件/u);
  assert.doesNotMatch(prompt, /actor:a|actor:b|evidence:a|evidence:b/u);
  assert.match(prompt, /Aster Labs|Beacon Health|S1|C1/u);
  assert.doesNotMatch(prompt, /participant:a|participant:b/u);
  for (const canary of profileCanaries) {
    assert.match(prompt, new RegExp(canary, "u"));
  }
});

test("deduplicated recommendation prompt keeps one full profile per canonical participant", async () => {
  let prompt = "";
  const provider = createEventOperationsAiProvider({
    recommendationPromptEncoding: "deduplicated",
    async runModelText(input) {
      prompt = input.userText;
      return successfulText(JSON.stringify({ recommendations: [
        { noMatchReason: null, recommendations: [{ icebreakers: ["one", "two"], memberHint: "specific", rank: 1, reasons: ["bounded"], score: 90, targetCandidateKey: "S1C1" }], sourceKey: "S1" },
        { noMatchReason: null, recommendations: [{ icebreakers: ["one", "two"], memberHint: "specific", rank: 1, reasons: ["bounded"], score: 90, targetCandidateKey: "S2C1" }], sourceKey: "S2" },
      ] }))();
    },
  });
  const result = await provider.generateRecommendations({ eventId: "event:test", recommendationCount: 1, sources: [
    { candidateParticipants: [participants[1]!], sourceParticipant: participants[0]! },
    { candidateParticipants: [participants[1]!], sourceParticipant: participants[0]! },
  ] });
  assert.equal(result.success, true);
  assert.equal((prompt.match(/"profile":\{/gu) ?? []).length, 2);
  assert.match(prompt, /sourceProfileKey|profiles lookup/u);
  assert.match(prompt, /"sourceProfileKey":"P1"/u);
  assert.match(prompt, /"candidateKey":"S1C1"/u);
  assert.match(prompt, /"candidateKey":"S2C1"/u);
  assert.doesNotMatch(prompt, /participant:a|participant:b/u);
  for (const canary of profileCanaries) {
    assert.equal((prompt.match(new RegExp(canary, "gu")) ?? []).length, 1);
  }
  assert.match(provider.requestFingerprint ?? "", /deduplicated|v5/u);
  assert.equal(
    createEventOperationsAiProvider().requestFingerprint,
    createEventOperationsAiProvider({ recommendationPromptEncoding: "expanded" }).requestFingerprint,
  );
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
              affinityCandidateKeys: ["S1C1"],
              facilitationHint: "Start from the regulated pilot dependency.",
              primaryTopic: "Regulated AI pilots",
              secondaryTopic: "Evaluation evidence",
              sourceKey: "S1",
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
    assert.equal((prompt.match(new RegExp(canary, "gu")) ?? []).length, 1);
  }
  assert.doesNotMatch(prompt, /participant:a|participant:b/u);
  assert.match(prompt, /sourceProfileKey|affinityCandidateKeys/u);
});

test("grouping tokens map exactly and reject cross-source, duplicate, missing, and oversized rows", async () => {
  const thirdParticipant = {
    ...participants[1]!,
    actorId: "actor:c",
    participantId: "participant:c",
  };
  const sources = [
    { candidateParticipants: [participants[1]!, thirdParticipant], recommendations: { noMatchReason: null, recommendations: [], sourceParticipantId: participants[0]!.participantId }, sourceParticipant: participants[0]! },
    { candidateParticipants: [participants[0]!], recommendations: { noMatchReason: null, recommendations: [], sourceParticipantId: participants[1]!.participantId }, sourceParticipant: participants[1]! },
  ];
  const feature = (sourceKey: string, affinityCandidateKeys: string[]) => ({ affinityCandidateKeys, facilitationHint: "bounded", primaryTopic: "topic", secondaryTopic: "secondary", sourceKey });
  const run = async (features: unknown) => createEventOperationsAiProvider({ runModelText: successfulText(JSON.stringify({ features })) }).generateGroupingFeatures({ eventId: "event:test", maxAffinityCount: 1, sources });
  const valid = await run([feature("S2", ["S2C1"]), feature("S1", ["S1C1"])]);
  assert.equal(valid.success, true);
  if (valid.success) assert.deepEqual(valid.data.map((item) => item.participantId), ["participant:b", "participant:a"]);
  for (const features of [
    [feature("S1", ["S1C1"])],
    [feature("S1", ["S1C1"]), feature("S1", ["S1C1"])],
    [feature("S1", ["S2C1"]), feature("S2", ["S2C1"])],
    [feature("S1", ["unknown"]), feature("S2", ["S2C1"])],
    [feature("S1", ["S1C1", "S1C1"]), feature("S2", ["S2C1"])],
    [feature("S1", ["S1C1", "S1C2"]), feature("S2", ["S2C1"])],
  ]) {
    const result = await run(features);
    assert.equal(result.success, false);
    if (result.success === false) assert.equal(result.error.code, "AI_SCHEMA_INVALID");
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
        recommendations: sources.map((source, sourceIndex) => ({
          noMatchReason: null,
          recommendations: source.candidateParticipants.slice(0, 4).map((candidate, index) => ({
            icebreakers: [`Question ${index}a`, `Question ${index}b`],
            memberHint: `Bounded hint ${index}`,
            rank: index + 1,
            reasons: [`Reason ${index}`],
            score: 90 - index,
            targetCandidateKey: `S${sourceIndex + 1}C${index + 1}`,
          })),
          sourceKey: `S${sourceIndex + 1}`,
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
    assert.match(prompt, new RegExp(`"sourceKey":"S${sourceIndex + 1}"`, "u"));
    assert.match(prompt, new RegExp(`source-profile-answer-${sourceIndex}`, "u"));
    for (let candidateIndex = 0; candidateIndex < 16; candidateIndex += 1) {
      assert.match(prompt, new RegExp(`"candidateKey":"S${sourceIndex + 1}C${candidateIndex + 1}"`, "u"));
      assert.match(prompt, new RegExp(`candidate-profile-answer-${sourceIndex}-${candidateIndex}`, "u"));
    }
  }
  const candidateKeys = [...prompt.matchAll(/"candidateKey":"(S\d+C\d+)"/gu)].map(
    (match) => match[1],
  );
  assert.equal(candidateKeys.length, 96);
  assert.equal(new Set(candidateKeys).size, 96);
  for (const canary of profileCanaries) assert.match(prompt, new RegExp(canary, "u"));
  for (const source of sources) {
    assert.doesNotMatch(prompt, new RegExp(source.sourceParticipant.participantId, "u"));
    for (const candidate of source.candidateParticipants) {
      assert.doesNotMatch(prompt, new RegExp(candidate.participantId, "u"));
    }
  }
  assert.doesNotMatch(prompt, /fallback|summary|deduplicat/iu);
});

test("recommendation tokens map only exact source-local candidate keys without repair", async () => {
  const sharedTarget = { ...participants[1]!, participantId: "participant:shared-target" };
  const sourceA = { ...participants[0]!, participantId: "participant:source-a" };
  const sourceB = { ...participants[0]!, participantId: "participant:source-b" };
  const sourceBOnly = { ...participants[1]!, participantId: "participant:source-b-only" };
  const sources = [
    { candidateParticipants: [sharedTarget], sourceParticipant: sourceA },
    { candidateParticipants: [sharedTarget, sourceBOnly], sourceParticipant: sourceB },
  ];
  const recommendation = (targetCandidateKey: string, rank = 1) => ({
    icebreakers: ["one", "two"],
    memberHint: "specific",
    rank,
    reasons: ["bounded"],
    score: 90,
    targetCandidateKey,
  });
  const row = (sourceKey: string, targetCandidateKey: string) => ({
    noMatchReason: null,
    recommendations: [recommendation(targetCandidateKey)],
    sourceKey,
  });
  const run = async (recommendations: unknown) => {
    const provider = createEventOperationsAiProvider({
      runModelText: successfulText(JSON.stringify({ recommendations })),
    });
    return provider.generateRecommendations({
      eventId: "event:token-closure",
      recommendationCount: 2,
      sources,
    });
  };

  const reordered = await run([row("S2", "S2C1"), row("S1", "S1C1")]);
  assert.equal(reordered.success, true);
  if (reordered.success) {
    assert.deepEqual(
      reordered.data.map((item) => [item.sourceParticipantId, item.recommendations[0]?.targetParticipantId]),
      [["participant:source-b", "participant:shared-target"], ["participant:source-a", "participant:shared-target"]],
    );
  }

  for (const recommendations of [
    [row("S1", "S1C1")],
    [row("S1", "S1C1"), row("S1", "S1C1")],
    [row("S3", "S3C1"), row("S1", "S1C1")],
    [row("S1", "S2C1"), row("S2", "S2C1")],
    [{ ...row("S1", "S1C1"), recommendations: [recommendation("S1C1"), recommendation("S1C1", 2)] }, row("S2", "S2C1")],
    [row("participant:source-a", "S1C1"), row("S2", "S2C1")],
    [row("S1", "participant:shared-target"), row("S2", "S2C1")],
  ]) {
    const result = await run(recommendations);
    assert.equal(result.success, false);
    if (result.success === false) {
      assert.equal(result.error.code, "AI_SCHEMA_INVALID");
      assert.equal(result.retryable, false);
    }
  }
});

test("event operations AI adapter rejects fenced or malformed JSON without repair or fallback", async () => {
  for (const [text, shape] of [
    ['```json\n{"recommendations":[]}\n```', "fence_or_prefix"],
    ['{"recommendations":[}', "parse_syntax"],
  ] as const) {
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
    if (result.success === false) {
      assert.equal(result.error.code, "AI_JSON_INVALID");
      assert.equal(result.error.jsonFailureShape, shape);
      assert.equal(result.retryable, false);
    }
  }
});

test("JSON failure retry policy is opt-in, fingerprinted, and never enables fence or trailing text", async () => {
  const input = { eventId: "event:test", recommendationCount: 1, sources: [{ candidateParticipants: [participants[1]!], sourceParticipant: participants[0]! }] };
  const baseline = createEventOperationsAiProvider({ runModelText: successfulText("") });
  const optedIn = createEventOperationsAiProvider({ retryableJsonFailureShapes: ["unterminated_envelope", "empty", "parse_syntax", "empty"], runModelText: successfulText("") });
  assert.notEqual(baseline.requestFingerprint, optedIn.requestFingerprint);
  assert.equal(
    baseline.requestFingerprint,
    createEventOperationsAiProvider({
      retryableJsonFailureShapes: ["fence_or_prefix", "trailing_text"],
      runModelText: successfulText(""),
    }).requestFingerprint,
  );
  for (const [text, retryable] of [["", true], ["{", true], ["{\"x\":]}", true], ["```json\n{}", false], ["{} trailing", false]] as const) {
    const provider = createEventOperationsAiProvider({ retryableJsonFailureShapes: ["empty", "parse_syntax", "unterminated_envelope", "fence_or_prefix", "trailing_text"], runModelText: successfulText(text) });
    const result = await provider.generateRecommendations(input);
    assert.equal(result.success, false);
    if (result.success === false) assert.equal(result.retryable, retryable);
  }
  const invalidSchema = createEventOperationsAiProvider({
    retryableJsonFailureShapes: ["empty", "parse_syntax", "unterminated_envelope"],
    runModelText: successfulText('{"recommendations":[]}'),
  });
  const invalidSchemaResult = await invalidSchema.generateRecommendations(input);
  assert.equal(invalidSchemaResult.success, false);
  if (invalidSchemaResult.success === false) {
    assert.equal(invalidSchemaResult.error.code, "AI_SCHEMA_INVALID");
    assert.equal(invalidSchemaResult.retryable, false);
  }
  const configured = JSON.parse(createConfiguredEventOperationsAiProvider().requestFingerprint ?? "{}") as Record<string, unknown>;
  assert.equal(configured.recommendationPromptEncoding, "deduplicated");
  assert.deepEqual(configured.retryableJsonFailureShapes, ["empty", "parse_syntax", "unterminated_envelope"]);
});

test("grouping and table adapters share the bounded JSON retry policy", async () => {
  const provider = createEventOperationsAiProvider({
    retryableJsonFailureShapes: ["unterminated_envelope"],
    runModelText: successfulText("{"),
  });
  const grouping = await provider.generateGroupingFeatures({
    eventId: "event:test",
    maxAffinityCount: 1,
    sources: [{
      candidateParticipants: [participants[1]!],
      recommendations: {
        noMatchReason: null,
        recommendations: [],
        sourceParticipantId: "participant:a",
      },
      sourceParticipant: participants[0]!,
    }],
  });
  const table = await provider.generateTableContent({
    eventId: "event:test",
    features: [],
    members: participants,
    roundNumber: 1,
    tableNumber: 1,
  });
  for (const result of [grouping, table]) {
    assert.equal(result.success, false);
    if (result.success === false) {
      assert.equal(result.error.code, "AI_JSON_INVALID");
      assert.equal(result.retryable, true);
    }
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
