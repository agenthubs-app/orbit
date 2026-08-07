import assert from "node:assert/strict";
import test from "node:test";

import {
  ADAPTIVE_INTERVIEW_MAX_TURNS,
  AdaptiveInterviewGenerationError,
  generateEventPersona,
  nextAdaptiveInterviewQuestion,
  readInterviewTranscript,
  type AdaptiveInterviewTurn,
} from "../../features/events/registration/adaptive-interview-service";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import type { OrbitAgentModelTextResult } from "../../features/orbit-ai/gemini-provider";

const event = mockEventRecords[0];

function modelRunnerReturning(text: string) {
  return async (): Promise<OrbitAgentModelTextResult> => ({
    success: true,
    text,
    model: "test-model",
    provider: "deepseek",
    source: "provider:deepseek-chat-completions-api",
  });
}

const failingRunner = async (): Promise<OrbitAgentModelTextResult> => ({
  success: false,
  error: {
    code: "MODEL_API_KEY_MISSING",
    message: "no key",
    provider: "deepseek",
    source: "provider:deepseek-chat-completions-api",
  },
});

test("first question comes from the model with event context", async () => {
  const step = await nextAdaptiveInterviewQuestion({
    event,
    language: "zh",
    modelRunner: modelRunnerReturning(
      JSON.stringify({
        acknowledgment: "",
        // Only the two core fields are askable before registration
        // (EVENT_PROFILE_CORE_FIELDS), so a first question on any other field
        // is rejected as off-contract rather than asked.
        field: "targetAttendees",
        prompt: "这场活动里你最想认识什么样的人?",
        options: ["投资人", "潜在客户", "同行"],
      }),
    ),
    transcript: [],
  });

  assert.equal(step.done, false);
  assert.equal(step.question?.field, "targetAttendees");
  assert.equal(step.question?.provenance.generationMethod, "orbit-agent-model-adaptive");
});

test("next question rejects a model response that repeats an answered field", async () => {
  const transcript: AdaptiveInterviewTurn[] = [
    { answer: "做 AI 获客工具", field: "positioning", prompt: "你在做什么?" },
  ];
  await assert.rejects(
    nextAdaptiveInterviewQuestion({
      event,
      language: "zh",
      modelRunner: modelRunnerReturning(
        JSON.stringify({
          acknowledgment: "明白了",
          field: "positioning",
          prompt: "再说一次你在做什么?",
          options: ["A", "B"],
        }),
      ),
      transcript,
    }),
    (error) =>
      error instanceof AdaptiveInterviewGenerationError &&
      error.code === "MODEL_SCHEMA_INVALID",
  );
});

test("model failure is explicit and never publishes deterministic substitute content", async () => {
  await assert.rejects(
    nextAdaptiveInterviewQuestion({
      event,
      language: "zh",
      modelRunner: failingRunner,
      transcript: [],
    }),
    (error) =>
      error instanceof AdaptiveInterviewGenerationError &&
      error.code === "MODEL_REQUEST_FAILED",
  );
});

test("interview finishes after all fields are answered", async () => {
  const transcript: AdaptiveInterviewTurn[] = [
    { answer: "a", field: "positioning", prompt: "q1" },
    { answer: "b", field: "industry", prompt: "q2" },
    { answer: "c", field: "targetAttendees", prompt: "q3" },
    { answer: "d", field: "valueOffered", prompt: "q4" },
    { answer: "e", field: "desiredOutcome", prompt: "q5" },
    { answer: "f", field: "energyStyle", prompt: "q6" },
    { answer: "g", field: "experienceHighlight", prompt: "q7" },
    { answer: "h", field: "followUpPreference", prompt: "q8" },
  ];
  const step = await nextAdaptiveInterviewQuestion({
    event,
    language: "zh",
    modelRunner: failingRunner,
    transcript,
  });

  assert.equal(step.done, true);
  assert.equal(step.question, null);
  assert.equal(transcript.length, ADAPTIVE_INTERVIEW_MAX_TURNS);
});

test("transcript reader drops malformed turns and caps length", () => {
  const parsed = readInterviewTranscript([
    { answer: "ok", field: "positioning", prompt: "q" },
    { answer: "", field: "targetAttendees", prompt: "q" },
    { answer: "bad-field", field: "not_a_field", prompt: "q" },
    "not-an-object",
    { answer: "x".repeat(2000), field: "valueOffered", prompt: "y".repeat(500) },
  ]);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].answer.length, 1000);
  assert.equal(parsed[1].prompt.length, 240);
});

test("persona uses model output when it satisfies the contract", async () => {
  const persona = await generateEventPersona({
    event,
    language: "zh",
    modelRunner: modelRunnerReturning(
      JSON.stringify({
        tagline: "AI 获客工具创始人,正在找日本市场伙伴",
        tags: ["AI 获客", "早期创始人", "找渠道"],
        industryTags: ["AI / 软件"],
        energyStyle: "小圈子深聊型",
        seeking: "想认识做企业服务渠道的人,聊日本市场落地。",
        offering: "能分享 AI 获客的实操打法和数据。",
        openers: ["聊聊你们的获客渠道?", "对 AI 工具进日本市场怎么看?"],
      }),
    ),
    transcript: [
      { answer: "做 AI 获客工具", field: "positioning", prompt: "q1" },
    ],
  });

  assert.equal(persona.provenance.generationMethod, "orbit-agent-model-adaptive");
  assert.equal(persona.tags.length, 3);
});

test("persona model failure is explicit and has no fallback artifact", async () => {
  await assert.rejects(
    generateEventPersona({
      event,
      language: "zh",
      modelRunner: failingRunner,
      transcript: [
        { answer: "做 AI 获客工具", field: "positioning", prompt: "q1" },
        { answer: "企业服务渠道商", field: "targetAttendees", prompt: "q2" },
      ],
    }),
    (error) =>
      error instanceof AdaptiveInterviewGenerationError &&
      error.code === "MODEL_REQUEST_FAILED",
  );
});

test("persona rejects oversized model output without a substitute artifact", async () => {
  await assert.rejects(
    generateEventPersona({
      event,
      language: "zh",
      modelRunner: modelRunnerReturning(
        JSON.stringify({
          tagline: "x".repeat(100),
          tags: ["a", "b", "c"],
          industryTags: ["ai"],
          energyStyle: "listens first",
          seeking: "ok seeking",
          offering: "ok offering",
          openers: ["o1", "o2"],
        }),
      ),
      transcript: [{ answer: "a", field: "positioning", prompt: "q" }],
    }),
    (error) =>
      error instanceof AdaptiveInterviewGenerationError &&
      error.code === "MODEL_SCHEMA_INVALID",
  );
});
