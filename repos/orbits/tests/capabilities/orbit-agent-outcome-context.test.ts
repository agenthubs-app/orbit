import assert from "node:assert/strict";
import test from "node:test";

import { createGeminiOrbitAgentPlanner } from "../../features/orbit-ai/gemini-provider";

test("provider receives user-recorded outcomes as bounded weak context", async () => {
  const requests: Array<{
    messages?: readonly { content?: string; role?: string }[];
  }> = [];
  const planner = createGeminiOrbitAgentPlanner({
    apiKey: "test-deepseek-key",
    fetchImplementation: (async (_url, init) => {
      requests.push(
        JSON.parse(String(init?.body)) as {
          messages?: readonly { content?: string; role?: string }[];
        },
      );
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  assistantMessage: "我会优先解释与过往有效结果相近的选项。",
                  intent: "general_chat",
                  toolRequests: [],
                }),
              },
            },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    }) as typeof fetch,
    model: "deepseek-chat",
    provider: "deepseek",
  });

  const outcomes = Array.from({ length: 15 }, (_, index) => ({
    summary: `Recorded result ${index + 1}`,
  }));
  const result = await planner.plan({
    message: "推荐时参考我过去明确标记的结果。",
    outcomes,
  });
  const systemMessage = requests[0]?.messages?.find(
    (message) => message.role === "system",
  )?.content;
  const userMessage = requests[0]?.messages?.find(
    (message) => message.role === "user",
  )?.content;
  const parsedInput = JSON.parse(userMessage ?? "{}") as {
    userRecordedOutcomes?: readonly { summary: string }[];
  };

  assert.equal(result.success, true);
  assert.match(
    systemMessage ?? "",
    /weak personalization signal/,
  );
  assert.equal(parsedInput.userRecordedOutcomes?.length, 12);
  assert.deepEqual(parsedInput.userRecordedOutcomes?.[0], outcomes[0]);
  assert.deepEqual(parsedInput.userRecordedOutcomes?.[11], outcomes[11]);
});
