import assert from "node:assert/strict";
import test from "node:test";

import {
  createRegistrationInterviewPostHandler,
  createRegistrationPersonaPostHandler,
} from "../../app/api/events/[id]/registration/adaptive-handlers";

const routeContext = {
  params: Promise.resolve({ id: "demo-event-1" }),
};

const modelEnvironmentKeys = [
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "ORBIT_AGENT_PROVIDER",
  "ORBIT_FEATURE_MODE",
  "ORBIT_INTERVIEW_SIGNING_SECRET",
  "ORBIT_MODULE_MODE",
] as const;

async function withModelEnvironment<T>(
  values: Partial<Record<(typeof modelEnvironmentKeys)[number], string>>,
  fetchImplementation: typeof fetch,
  run: () => Promise<T>,
): Promise<T> {
  const previousEnvironment = new Map(
    modelEnvironmentKeys.map((key) => [key, process.env[key]]),
  );
  const previousFetch = globalThis.fetch;
  try {
    for (const key of modelEnvironmentKeys) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = fetchImplementation;
    return await run();
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of modelEnvironmentKeys) {
      const value = previousEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("adaptive registration generation rejects anonymous requests", async () => {
  const resolveAnonymous = async () => null;
  const interview = createRegistrationInterviewPostHandler(resolveAnonymous);
  const persona = createRegistrationPersonaPostHandler(resolveAnonymous);
  const requestFor = (path: string) =>
    new Request(`https://orbit.test${path}`, {
      body: JSON.stringify({
        transcript: [
          {
            answer: "Storage partnerships",
            field: "positioning",
            prompt: "What is your goal?",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

  const [interviewResponse, personaResponse] = await Promise.all([
    interview(
      requestFor("/api/events/demo-event-1/registration/interview"),
      routeContext,
    ),
    persona(
      requestFor("/api/events/demo-event-1/registration/persona"),
      routeContext,
    ),
  ]);

  assert.equal(interviewResponse.status, 401);
  assert.equal(personaResponse.status, 401);
});

test("authenticated participants can use adaptive registration generation", async () => {
  let providerCalls = 0;
  await withModelEnvironment(
    {
      GEMINI_API_KEY: "test-gemini-key",
      ORBIT_AGENT_PROVIDER: "gemini",
      ORBIT_FEATURE_MODE: "mock",
      ORBIT_INTERVIEW_SIGNING_SECRET: "test-interview-signing-secret",
      ORBIT_MODULE_MODE: "mock",
    },
    (async () => {
      providerCalls += 1;
      return Response.json({
        output_text:
          providerCalls === 1
            ? JSON.stringify({
                acknowledgment: "Your operator focus is clear.",
                field: "industry",
                options: ["Grid storage", "Industrial batteries"],
                prompt: "Which storage segment is most relevant to your goal?",
              })
            : JSON.stringify({
                energyStyle: "Focused one-to-one conversations",
                industryTags: ["Energy storage"],
                offering: "Shares concrete partnership requirements with storage operators.",
                openers: [
                  "Which storage partnerships are highest priority?",
                  "What makes an operator partnership actionable?",
                ],
                seeking: "Wants to meet storage operators for practical partnerships.",
                tagline: "Partnership builder seeking storage operators",
                tags: ["Partnerships", "Operators", "Storage"],
              }),
      });
    }) as typeof fetch,
    async () => {
      const resolveActor = async () => ({ id: "actor:participant" });
      const interview = createRegistrationInterviewPostHandler(resolveActor);
      const persona = createRegistrationPersonaPostHandler(resolveActor);
      const transcript = [
        {
          answer: "Meet storage operators",
          field: "positioning",
          prompt: "What is your goal?",
        },
      ];

      const interviewResponse = await interview(
        new Request(
          "https://orbit.test/api/events/demo-event-1/registration/interview",
          {
            body: JSON.stringify({ language: "en", transcript }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        ),
        routeContext,
      );
      const personaResponse = await persona(
        new Request(
          "https://orbit.test/api/events/demo-event-1/registration/persona",
          {
            body: JSON.stringify({ language: "en", transcript }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        ),
        routeContext,
      );

      assert.equal(interviewResponse.status, 200);
      assert.equal(personaResponse.status, 200);
      const interviewBody = await interviewResponse.json();
      const personaBody = await personaResponse.json();
      assert.equal(interviewBody.data.signedQuestion.question.provenance.generationMethod, "orbit-agent-model-adaptive");
      assert.equal(personaBody.data.persona.provenance.generationMethod, "orbit-agent-model-adaptive");
      assert.equal(interviewBody.data.signedQuestion.question.provenance.fallbackReason, null);
      assert.equal(personaBody.data.persona.provenance.fallbackReason, null);
    },
  );
  assert.equal(providerCalls, 2);
});

test("authenticated adaptive registration fails closed when AI is unconfigured", async () => {
  let providerCalls = 0;
  await withModelEnvironment(
    {
      ORBIT_FEATURE_MODE: "mock",
      ORBIT_MODULE_MODE: "mock",
    },
    (async () => {
      providerCalls += 1;
      throw new Error("an unconfigured provider must not be called");
    }) as typeof fetch,
    async () => {
      const resolveActor = async () => ({ id: "actor:participant" });
      const transcript = [{
        answer: "Meet storage operators",
        field: "positioning",
        prompt: "What is your goal?",
      }];
      const requestFor = (path: string) => new Request(
        `https://orbit.test${path}`,
        {
          body: JSON.stringify({ language: "en", transcript }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const interviewResponse = await createRegistrationInterviewPostHandler(
        resolveActor,
      )(
        requestFor("/api/events/demo-event-1/registration/interview"),
        routeContext,
      );
      const personaResponse = await createRegistrationPersonaPostHandler(
        resolveActor,
      )(
        requestFor("/api/events/demo-event-1/registration/persona"),
        routeContext,
      );

      assert.equal(interviewResponse.status, 503);
      assert.equal(personaResponse.status, 503);
      for (const response of [interviewResponse, personaResponse]) {
        const body = await response.json();
        assert.equal(body.success, false);
        assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
        assert.doesNotMatch(JSON.stringify(body), /deterministic-fallback/iu);
        assert.equal("data" in body, false);
      }
    },
  );
  assert.equal(providerCalls, 0);
});
