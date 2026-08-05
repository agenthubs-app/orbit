import assert from "node:assert/strict";
import test from "node:test";

import {
  createStrictSmokeRequest,
  DEEPSEEK_STRICT_TOOL_NAME,
  runStrictSmokeCall,
  validateStrictToolResponse,
} from "../../scripts/evaluate-deepseek-strict-tool-smoke";

const valid = {
  choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ function: { arguments: JSON.stringify({ recommendations: [{ recommendations: [{ score: 90, targetCandidateKey: "C1" }], sourceKey: "S1" }] }), name: DEEPSEEK_STRICT_TOOL_NAME }, type: "function" }] } }],
  usage: { completion_tokens: 3, prompt_tokens: 4 },
};

test("strict smoke request forces one strict closed tool", () => {
  const request = createStrictSmokeRequest("deepseek-v4-flash");
  assert.equal(request.tool_choice.function.name, DEEPSEEK_STRICT_TOOL_NAME);
  assert.equal(request.tools[0].function.strict, true);
  assert.equal(request.thinking.type, "disabled");
});

test("strict smoke accepts only the exact tool response", () => {
  assert.equal(validateStrictToolResponse(valid).success, true);
  for (const [value, expected] of [
    [{ ...valid, choices: [{ ...valid.choices[0], finish_reason: "stop" }] }, "finish_not_tool_calls"],
    [{ ...valid, choices: [{ ...valid.choices[0], message: { ...valid.choices[0].message, content: "normal content" } }] }, "content_not_empty"],
    [{ ...valid, choices: [{ ...valid.choices[0], message: { content: null, tool_calls: [] } }] }, "missing_tool_call"],
    [{ ...valid, choices: [{ ...valid.choices[0], message: { content: null, tool_calls: [{ ...valid.choices[0].message.tool_calls[0], type: "not_function" }] } }] }, "missing_tool_call"],
    [{ ...valid, choices: [{ ...valid.choices[0], message: { ...valid.choices[0].message, tool_calls: [valid.choices[0].message.tool_calls[0], valid.choices[0].message.tool_calls[0]] } }] }, "multiple_tool_calls"],
    [{ ...valid, choices: [{ ...valid.choices[0], message: { ...valid.choices[0].message, tool_calls: [{ function: { arguments: "{}", name: "wrong" }, type: "function" }] } }] }, "wrong_tool_name"],
    [{ ...valid, choices: [{ ...valid.choices[0], message: { ...valid.choices[0].message, tool_calls: [{ function: { arguments: "{", name: DEEPSEEK_STRICT_TOOL_NAME }, type: "function" }] } }] }, "bad_arguments"],
  ] as const) assert.equal(validateStrictToolResponse(value).errorCategory, expected);
});

test("strict smoke classifies HTTP schema rejections without response text", async () => {
  const result = await runStrictSmokeCall({
    apiKey: "secret",
    fetchImpl: async () => new Response("schema details participant:secret", { status: 400 }),
    model: "deepseek-v4-flash",
    requestTimeoutMs: 100,
  });
  assert.equal(result.errorCategory, "http_4xx_schema");
  assert.doesNotMatch(JSON.stringify(result), /participant:secret|schema details/u);
});

test("strict smoke distinguishes authentication and rate-limit responses", async () => {
  for (const [status, expected] of [[401, "http_auth"], [429, "http_rate_limit"]] as const) {
    const result = await runStrictSmokeCall({
      apiKey: "secret",
      fetchImpl: async () => new Response("private provider error", { status }),
      model: "deepseek-v4-flash",
      requestTimeoutMs: 100,
    });
    assert.equal(result.errorCategory, expected);
    assert.equal(result.success, false);
  }
});
