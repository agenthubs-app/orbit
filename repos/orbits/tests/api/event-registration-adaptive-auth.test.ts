import assert from "node:assert/strict";
import test from "node:test";

import {
  createRegistrationInterviewPostHandler,
  createRegistrationPersonaPostHandler,
} from "../../app/api/events/[id]/registration/adaptive-handlers";

const routeContext = {
  params: Promise.resolve({ id: "demo-event-1" }),
};

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
});
