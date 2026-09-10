import assert from "node:assert/strict";
import test from "node:test";

import { createAiEmailDraftService } from "../../features/chat/ai-email-draft-service";
import {
  createGeminiOrbitAgentPlanner,
  resolveOrbitAgentModelProviderSelection,
  runOrbitAgentModelText,
} from "../../features/orbit-ai/gemini-provider";

// resolveProvider 读取 process.env，所以这里在每个用例内部临时覆盖相关变量并在
// finally 里恢复，避免影响同进程里的其他测试。
const PROVIDER_ENV_KEYS = [
  "ORBIT_AGENT_PROVIDER",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
] as const;

async function withProviderEnv<T>(
  env: Partial<Record<(typeof PROVIDER_ENV_KEYS)[number], string>>,
  run: () => Promise<T> | T,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of PROVIDER_ENV_KEYS) {
    previous.set(key, process.env[key]);
    const next = env[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    return await run();
  } finally {
    for (const key of PROVIDER_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const baseInput = {
  systemInstruction: "Return a short response.",
  userText: "hello",
};

function recordingFetch(requests: { url: string; authorization: string | null }[]) {
  return (async (url, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: String(url),
      authorization: headers.get("authorization"),
    });
    return Response.json({
      candidates: [{ content: { parts: [{ text: "ok" }] } }],
      choices: [{ finish_reason: "stop", message: { content: "ok" } }],
      output_text: "ok",
    });
  }) as typeof fetch;
}

test("provider selection auto-detects the only configured key when nothing is explicit", () => {
  assert.deepEqual(
    resolveOrbitAgentModelProviderSelection({ env: { DEEPSEEK_API_KEY: "dk" } }),
    { provider: "deepseek", selection: "auto" },
  );
  assert.deepEqual(
    resolveOrbitAgentModelProviderSelection({ env: { OPENAI_API_KEY: "ok" } }),
    { provider: "openai", selection: "auto" },
  );
  assert.deepEqual(
    resolveOrbitAgentModelProviderSelection({ env: { GEMINI_API_KEY: "gk" } }),
    { provider: "gemini", selection: "auto" },
  );
});

test("provider selection keeps gemini first when several keys are configured", () => {
  assert.deepEqual(
    resolveOrbitAgentModelProviderSelection({
      env: { DEEPSEEK_API_KEY: "dk", GEMINI_API_KEY: "gk", OPENAI_API_KEY: "ok" },
    }),
    { provider: "gemini", selection: "auto" },
  );
  assert.deepEqual(
    resolveOrbitAgentModelProviderSelection({
      env: { DEEPSEEK_API_KEY: "dk", OPENAI_API_KEY: "ok" },
    }),
    { provider: "deepseek", selection: "auto" },
  );
});

test("provider selection lets an explicit provider win even when only another key exists", () => {
  assert.deepEqual(
    resolveOrbitAgentModelProviderSelection({
      env: { DEEPSEEK_API_KEY: "dk", ORBIT_AGENT_PROVIDER: "gemini" },
    }),
    { provider: "gemini", selection: "explicit" },
  );
  assert.deepEqual(
    resolveOrbitAgentModelProviderSelection({
      configuredProvider: "gpt",
      env: { DEEPSEEK_API_KEY: "dk", GEMINI_API_KEY: "gk" },
    }),
    { provider: "openai", selection: "explicit" },
  );
  // 空白字符串等同未设置，仍走自动选择。
  assert.deepEqual(
    resolveOrbitAgentModelProviderSelection({
      env: { DEEPSEEK_API_KEY: "dk", ORBIT_AGENT_PROVIDER: "  " },
    }),
    { provider: "deepseek", selection: "auto" },
  );
});

test("provider selection falls back to gemini only when no key exists at all", () => {
  assert.deepEqual(resolveOrbitAgentModelProviderSelection({ env: {} }), {
    provider: "gemini",
    selection: "fallback",
  });
});

test("runOrbitAgentModelText uses DeepSeek automatically when only DEEPSEEK_API_KEY is configured", async () => {
  const requests: { url: string; authorization: string | null }[] = [];
  const result = await withProviderEnv({ DEEPSEEK_API_KEY: "test-deepseek-key" }, () =>
    runOrbitAgentModelText({
      ...baseInput,
      config: { fetchImplementation: recordingFetch(requests) },
    }),
  );

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.provider, "deepseek");
    assert.equal(result.source, "provider:deepseek-chat-completions-api");
    assert.equal(result.text, "ok");
  }
  assert.equal(requests[0]?.url, "https://api.deepseek.com/chat/completions");
  assert.equal(requests[0]?.authorization, "Bearer test-deepseek-key");
});

test("runOrbitAgentModelText uses Gemini automatically when only GEMINI_API_KEY is configured", async () => {
  const requests: { url: string; authorization: string | null }[] = [];
  const result = await withProviderEnv({ GEMINI_API_KEY: "test-gemini-key" }, () =>
    runOrbitAgentModelText({
      ...baseInput,
      config: { fetchImplementation: recordingFetch(requests) },
    }),
  );

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.provider, "gemini");
    assert.equal(result.source, "provider:gemini-interactions-api");
  }
  assert.match(requests[0]?.url ?? "", /generativelanguage\.googleapis\.com/u);
});

test("runOrbitAgentModelText prefers Gemini when both Gemini and DeepSeek keys are configured", async () => {
  const requests: { url: string; authorization: string | null }[] = [];
  const result = await withProviderEnv(
    { DEEPSEEK_API_KEY: "test-deepseek-key", GEMINI_API_KEY: "test-gemini-key" },
    () =>
      runOrbitAgentModelText({
        ...baseInput,
        config: { fetchImplementation: recordingFetch(requests) },
      }),
  );

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.provider, "gemini");
  assert.match(requests[0]?.url ?? "", /generativelanguage\.googleapis\.com/u);
});

test("explicit ORBIT_AGENT_PROVIDER=gemini still fails closed when only DEEPSEEK_API_KEY exists", async () => {
  let fetchCalls = 0;
  const result = await withProviderEnv(
    { DEEPSEEK_API_KEY: "test-deepseek-key", ORBIT_AGENT_PROVIDER: "gemini" },
    () =>
      runOrbitAgentModelText({
        ...baseInput,
        config: {
          fetchImplementation: (async () => {
            fetchCalls += 1;
            return Response.json({ output_text: "should not run" });
          }) as typeof fetch,
        },
      }),
  );

  assert.equal(result.success, false);
  if (result.success === false) {
    assert.equal(result.error.code, "MODEL_API_KEY_MISSING");
    assert.equal(result.error.provider, "gemini");
    assert.equal(result.error.source, "provider:gemini-interactions-api");
    assert.match(result.error.message, /gemini API key is not configured/u);
    assert.equal(result.retryable, false);
  }
  assert.equal(fetchCalls, 0);
});

test("runOrbitAgentModelText fails closed with MODEL_API_KEY_MISSING when no key exists at all", async () => {
  let fetchCalls = 0;
  const result = await withProviderEnv({}, () =>
    runOrbitAgentModelText({
      ...baseInput,
      config: {
        fetchImplementation: (async () => {
          fetchCalls += 1;
          return Response.json({ output_text: "should not run" });
        }) as typeof fetch,
      },
    }),
  );

  assert.equal(result.success, false);
  if (result.success === false) {
    assert.equal(result.error.code, "MODEL_API_KEY_MISSING");
    assert.equal(result.error.provider, "gemini");
    assert.match(
      result.error.message,
      /GEMINI_API_KEY, DEEPSEEK_API_KEY, or OPENAI_API_KEY/u,
    );
  }
  assert.equal(fetchCalls, 0);
});

test("an explicit config.apiKey without a provider stays on Gemini regardless of env keys", async () => {
  const requests: { url: string; authorization: string | null }[] = [];
  const result = await withProviderEnv({ DEEPSEEK_API_KEY: "env-deepseek-key" }, () =>
    runOrbitAgentModelText({
      ...baseInput,
      config: { apiKey: "caller-gemini-key", fetchImplementation: recordingFetch(requests) },
    }),
  );

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.provider, "gemini");
  assert.match(requests[0]?.url ?? "", /generativelanguage\.googleapis\.com/u);
  assert.equal(requests[0]?.authorization, null);
});

test("the planner shares the same auto-selection as text calls", async () => {
  const requests: { url: string; authorization: string | null }[] = [];
  const result = await withProviderEnv({ DEEPSEEK_API_KEY: "test-deepseek-key" }, () =>
    createGeminiOrbitAgentPlanner({
      fetchImplementation: recordingFetch(requests),
    }).synthesize({
      artifacts: [],
      assistantMessage: "hello",
      intent: "general_chat",
      message: "hello",
      toolRequests: [],
    }),
  );

  assert.equal(requests[0]?.url, "https://api.deepseek.com/chat/completions");
  if (result.success === false) {
    assert.equal(result.error.provider, "deepseek");
    assert.notEqual(result.error.code, "MODEL_API_KEY_MISSING");
  } else {
    assert.equal(result.data.provider, "deepseek");
  }
});

// 邮件起草服务只经过 runOrbitAgentModelText 拿纯文本再解析 JSON，没有 Gemini 特定的
// 模型名或响应结构；这里验证 DeepSeek-only 环境下整条链路能产出可复核草稿。
function linMeiDraftServices() {
  return {
    contactsService: {
      listContacts() {
        return {
          success: true,
          data: {
            contacts: [{ id: "contact:lin-mei", displayName: "林玫" }],
            provenance: { evidenceIds: ["evidence:lin-mei:1"] },
          },
        };
      },
    } as never,
    contactDetailService: {
      async getContactDetail() {
        return {
          success: true,
          data: {
            contact: {
              id: "contact:lin-mei",
              displayName: "林玫",
              role: "投资合伙人",
              organization: "港湾创投",
              relationshipContext: "双方已有多次有效交流。",
              evidence: [
                {
                  evidenceId: "evidence:lin-mei:1",
                  capturedAt: "2026-07-25T09:00:00.000Z",
                  excerpt: "电话复盘了三家人工智能项目。",
                  source: { label: "Calendar signal" },
                },
              ],
              lastInteraction: {
                occurredAt: "2026-07-25T09:00:00.000Z",
                summary: "电话复盘了三家人工智能项目。",
                evidenceIds: ["evidence:lin-mei:1"],
              },
              publicProfile: { evidenceIds: ["evidence:lin-mei:1"] },
              nextAction: "发送适合其基金阶段的三家公司清单。",
            },
          },
        };
      },
    } as never,
  };
}

test("AI email draft service drafts through DeepSeek when only DEEPSEEK_API_KEY is configured", async () => {
  const requests: string[] = [];
  const result = await withProviderEnv({ DEEPSEEK_API_KEY: "test-deepseek-key" }, () =>
    createAiEmailDraftService({
      ...linMeiDraftServices(),
      modelConfig: {
        fetchImplementation: (async (url) => {
          requests.push(String(url));
          return Response.json({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    subject: "三家公司清单跟进",
                    body: "林玫您好，接着上次电话复盘，这里整理了三家公司的清单供您参考。",
                  }),
                },
              },
            ],
          });
        }) as typeof fetch,
      },
    }).createDraft({
      actorId: "user:demo",
      contactId: "contact:lin-mei",
      language: "zh",
    }),
  );

  assert.deepEqual(requests, ["https://api.deepseek.com/chat/completions"]);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.provider, "deepseek");
    assert.equal(result.data.source, "provider:deepseek-chat-completions-api");
    assert.equal(result.data.subject, "三家公司清单跟进");
    assert.equal(result.data.safety.externalSendRequested, false);
  }
});

test("AI email draft service reports MODEL_API_KEY_MISSING when no provider key exists", async () => {
  const result = await withProviderEnv({}, () =>
    createAiEmailDraftService({
      ...linMeiDraftServices(),
      modelConfig: {
        fetchImplementation: (async () => {
          throw new Error("fetch must not run without a key");
        }) as typeof fetch,
      },
    }).createDraft({
      actorId: "user:demo",
      contactId: "contact:lin-mei",
      language: "zh",
    }),
  );

  assert.equal(result.success, false);
  if (result.success === false) {
    assert.equal(result.error.code, "MODEL_API_KEY_MISSING");
  }
});
