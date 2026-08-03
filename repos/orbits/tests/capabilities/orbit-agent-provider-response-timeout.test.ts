import assert from "node:assert/strict";
import test from "node:test";

import { runOrbitAgentModelText } from "../../features/orbit-ai/gemini-provider";

const baseInput = {
  systemInstruction: "Return a short response.",
  userText: "hello",
};

test("provider deadline covers a body that hangs after headers and aborts the request signal", async () => {
  let requestSignal: AbortSignal | null = null;
  const result = await Promise.race([
    runOrbitAgentModelText({
      ...baseInput,
      config: {
        apiKey: "test-openai-key",
        fetchImplementation: (async (_url, init) => {
          requestSignal = init?.signal as AbortSignal;
          return {
            json: () => new Promise<never>(() => undefined),
            ok: true,
            status: 200,
          } as unknown as Response;
        }) as typeof fetch,
        provider: "openai",
        requestTimeoutMs: 5,
      },
    }),
    new Promise<"still-hanging">((resolve) => {
      setTimeout(() => resolve("still-hanging"), 100);
    }),
  ]);

  if (result === "still-hanging") assert.fail("Provider body deadline did not fire.");
  assert.equal(result.success, false);
  if (result.success === false) {
    assert.match(result.error.message, /timed out after 5ms/iu);
  }
  assert.equal(requestSignal?.aborted, true);
});

test("provider deadline keeps normal complete bodies successful", async () => {
  const result = await runOrbitAgentModelText({
    ...baseInput,
    config: {
      apiKey: "test-openai-key",
      fetchImplementation: (async () =>
        Response.json({ output_text: "complete response" })) as typeof fetch,
      provider: "openai",
      requestTimeoutMs: 100,
    },
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.text, "complete response");
});

test("provider body JSON failures remain fail-closed request failures", async () => {
  const result = await runOrbitAgentModelText({
    ...baseInput,
    config: {
      apiKey: "test-openai-key",
      fetchImplementation: (async () =>
        new Response("{not-json", {
          headers: { "content-type": "application/json" },
          status: 200,
        })) as typeof fetch,
      provider: "openai",
      requestTimeoutMs: 100,
    },
  });

  assert.equal(result.success, false);
  if (result.success === false) assert.equal(result.error.code, "MODEL_REQUEST_FAILED");
});

test("provider HTTP error bodies retain their source message", async () => {
  const result = await runOrbitAgentModelText({
    ...baseInput,
    config: {
      apiKey: "test-openai-key",
      fetchImplementation: (async () =>
        Response.json(
          { error: { message: "provider quota exhausted" } },
          { status: 429 },
        )) as typeof fetch,
      provider: "openai",
      requestTimeoutMs: 100,
    },
  });

  assert.equal(result.success, false);
  if (result.success === false) {
    assert.equal(result.error.code, "MODEL_REQUEST_FAILED");
    assert.equal(result.error.message, "provider quota exhausted");
  }
});

test("DeepSeek JSON output mode is explicit and leaves the default request body unchanged", async () => {
  const requestBodies: Record<string, unknown>[] = [];
  const fetchImplementation = (async (_url, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      choices: [{ message: { content: '{"ok":true}' } }],
    });
  }) as typeof fetch;

  for (const jsonOutput of [undefined, true]) {
    const result = await runOrbitAgentModelText({
      ...baseInput,
      config: {
        apiKey: "test-deepseek-key",
        fetchImplementation,
        jsonOutput,
        provider: "deepseek",
        requestTimeoutMs: 100,
      },
    });
    assert.equal(result.success, true);
  }

  assert.equal("response_format" in requestBodies[0], false);
  assert.deepEqual(requestBodies[1].response_format, { type: "json_object" });
});
