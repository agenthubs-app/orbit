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
      choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
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
  assert.equal("thinking" in requestBodies[0], false);
  assert.equal("max_tokens" in requestBodies[0], false);
  assert.deepEqual(requestBodies[1].response_format, { type: "json_object" });
});

test("DeepSeek thinking/maxTokens are opt-in and terminal responses fail closed", async () => {
  const requestBodies: Record<string, unknown>[] = [];
  const responseFor = (finish_reason: string, content = "{\"ok\":true}") =>
    (async (_url: unknown, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({
        choices: [{ finish_reason, message: { content } }],
        usage: {
          completion_tokens: 7,
          prompt_cache_hit_tokens: 2,
          prompt_tokens: 5,
          reasoning_tokens: 3,
        },
      });
    }) as typeof fetch;
  const successful = await runOrbitAgentModelText({
    ...baseInput,
    config: {
      apiKey: "test-deepseek-key",
      deepseekThinking: false,
      fetchImplementation: responseFor("stop"),
      maxTokens: 8192,
      provider: "deepseek",
    },
  });
  assert.equal(successful.success, true);
  if (successful.success) {
    assert.equal(successful.responseMetadata?.finishReason, "stop");
    assert.equal(successful.responseMetadata?.providerResponseBytes, 175);
    assert.deepEqual(successful.responseMetadata?.usage, {
      cacheHitTokens: 2, completionTokens: 7, promptTokens: 5, reasoningTokens: 3,
    });
  }
  assert.deepEqual(requestBodies[0]?.thinking, { type: "disabled" });
  assert.equal(requestBodies[0]?.max_tokens, 8192);

  for (const [finishReason, retryable] of [
    ["length", false], ["content_filter", false], ["tool_calls", false],
    ["unknown", false], ["insufficient_system_resource", true],
  ] as const) {
    const failed = await runOrbitAgentModelText({
      ...baseInput,
      config: {
        apiKey: "test-deepseek-key",
        fetchImplementation: responseFor(finishReason),
        provider: "deepseek",
      },
    });
    assert.equal(failed.success, false);
    if (failed.success === false) assert.equal(failed.retryable, retryable);
  }
});

test("DeepSeek temperature is bounded, sent alone, and leaves non-DeepSeek payloads unchanged", async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetchImplementation = (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({
      choices: [{ finish_reason: "stop", message: { content: "ok" } }],
      output_text: "ok",
    });
  }) as typeof fetch;
  const deepSeek = await runOrbitAgentModelText({
    ...baseInput,
    config: { apiKey: "key", fetchImplementation, provider: "deepseek", temperature: 0.2 },
  });
  assert.equal(deepSeek.success, true);
  assert.equal(bodies[0]?.temperature, 0.2);
  assert.equal("top_p" in bodies[0]!, false);
  const invalid = await runOrbitAgentModelText({
    ...baseInput,
    config: { apiKey: "key", fetchImplementation, provider: "deepseek", temperature: 2.1 },
  });
  assert.equal(invalid.success, false);
  if (invalid.success === false) assert.equal(invalid.retryable, false);
  const openAi = await runOrbitAgentModelText({
    ...baseInput,
    config: { apiKey: "key", fetchImplementation, provider: "openai", temperature: 0.2 },
  });
  assert.equal(openAi.success, true);
  assert.equal("temperature" in bodies[1]!, false);
  const gemini = await runOrbitAgentModelText({
    ...baseInput,
    config: { apiKey: "key", fetchImplementation, provider: "gemini", temperature: 0.2 },
  });
  assert.equal(gemini.success, true);
  assert.equal("temperature" in bodies[2]!, false);
});

test("DeepSeek temperature normalizes absent values and rejects invalid values before fetch", async () => {
  const bodies: Record<string, unknown>[] = [];
  let fetchCalls = 0;
  const fetchImplementation = (async (_url, init) => {
    fetchCalls += 1;
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "ok" } }], output_text: "ok" });
  }) as typeof fetch;
  for (const temperature of [0, 2]) {
    const result = await runOrbitAgentModelText({ ...baseInput, config: { apiKey: "key", fetchImplementation, provider: "deepseek", temperature } });
    assert.equal(result.success, true);
  }
  assert.equal(bodies[0]?.temperature, 0);
  assert.equal(bodies[1]?.temperature, 2);
  for (const temperature of [null, undefined]) {
    const result = await runOrbitAgentModelText({ ...baseInput, config: { apiKey: "key", fetchImplementation, provider: "deepseek", temperature } });
    assert.equal(result.success, true);
  }
  assert.equal("temperature" in bodies[2]!, false);
  assert.equal("temperature" in bodies[3]!, false);
  const beforeInvalid = fetchCalls;
  for (const temperature of [-0.1, 2.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const result = await runOrbitAgentModelText({ ...baseInput, config: { apiKey: "key", fetchImplementation, provider: "deepseek", temperature } });
    assert.equal(result.success, false);
    if (result.success === false) assert.equal(result.retryable, false);
  }
  assert.equal(fetchCalls, beforeInvalid);
});
