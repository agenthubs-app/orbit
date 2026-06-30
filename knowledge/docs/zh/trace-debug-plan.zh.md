# Orbit AI Trace Debug 计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/plans/2026-06-29-orbit-ai-trace-debug.md` |
| 中文镜像 | `knowledge/docs/zh/trace-debug-plan.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

实现 Orbit AI trace debug 页面和 API 的计划。

## 审计依据

已登记来源文档，后续变更通过 catalog 新鲜度状态追踪。

## 结构化阅读入口

- 第 1 节：Orbit AI Trace Debug 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：源标题：File Structure
- 第 4 节：任务 1: Trace 契约 和 API RED 测试
- 第 5 节：任务 2: Full Chain Trace Runner
- 第 6 节：任务 3: Development Trace API 路由
- 第 7 节：任务 4: Debug 页面 RED 测试 和 UI
- 第 8 节：任务 5: Lint Coverage 和 Full 验证
- 第 9 节：源标题：Self Review

## 保留的代码与命令证据

### 代码证据 1

```ts
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for Orbit AI trace debug`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function geminiTextResponse(text: string): Response {
  return jsonResponse({
    steps: [
      {
        content: [{ text, type: "text" }],
        type: "model_output",
      },
    ],
  });
}

test("development Orbit AI trace route returns full-chain trace and planner comparison", async () => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFetch = globalThis.fetch;
  const plannerOutput = JSON.stringify({
    assistantMessage: "我会先找适合的活动，并准备一个可复核的推荐视图。",
    intent: "event_recommendations",
    toolRequests: [
      {
        arguments: { topic: "interesting events" },
        requiresUserConfirmation: true,
        toolName: "events.recommend",
      },
    ],
  });
  const synthesisOutput =
    "我找到了一个适合复核的活动，并把来源、证据和下一步放在右侧面板。";
  const providerResponses = [plannerOutput, synthesisOutput];

  try {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.NODE_ENV = "development";
    globalThis.fetch = (async () => {
      const next = providerResponses.shift();
      assert.ok(next, "test provider response queue must not be empty");

      return geminiTextResponse(next);
    }) as typeof fetch;

    const route = await importProjectModule<{
      POST: (request: Request) => Promise<Response>;
    }>("app/api/dev/orbit-ai/trace/route.ts");
    const response = await route.POST(
      new Request("http://localhost/api/dev/orbit-ai/trace", {
        body: JSON.stringify({
          locale: "zh",
          maxLoopSteps: 3,
          message: "看下有什么有意思的活动",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = (await response.json()) as {
      data?: {
        fullChain: {
          chain: readonly { stageId: string; status: string }[];
          conversation: {
            assistantMessage: string;
            artifacts: readonly {
              result: {
                generatedView: { summary: string } | null;
                provenance: {
                  sourceModules: readonly string[];
                  toolCalls: readonly { toolName: string; status: string }[];
                };
              };
              task: { kind: string; artifactProducer: string };
            }[];
          };
          dataSources: readonly {
            evidenceIds: readonly string[];
            sourceModule: string;
          }[];
          runtimeSnapshot: {
            renderers: readonly { hint: string; renderer: string }[];
            artifactProducers: readonly { artifactProducer: string }[];
            tools: readonly { toolName: string; renderHint: string }[];
          };
          stages: readonly {
            id: string;
            outputSource?: { kind: string; value: unknown };
            renderHint: string;
            status: string;
          }[];
          toolCalls: readonly { toolName: string; status: string }[];
          traceSchemaVersion: string;
        };
        plannerOnly: {
          planner: {
            parsed: {
              intent: string;
              toolRequests: readonly { toolFamily: string; toolName: string }[];
            };
            rawOutputText: string;
          };
          toolTrace: { domainToolCallsWouldExecute: boolean };
        };
      };
      success: boolean;
    };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-orbit-dev-trace"), "orbit-ai-full-chain");
    assert.equal(body.success, true);
    assert.equal(body.data?.fullChain.traceSchemaVersion, "2026-06-29.v1");
    assert.deepEqual(
      body.data?.fullChain.chain.map((stage) => stage.stageId),
      [
        "input_received",
        "local_guardrails",
        "planner",
        "tool_mapping",
        "artifact_generation",
        "synthesis",
        "final_response",
      ],
    );
    assert.equal(
      body.data?.fullChain.stages.find((stage) => stage.id === "planner")
        ?.outputSource?.kind,
      "json",
    );
    assert.equal(
      body.data?.fullChain.stages.find((stage) => stage.id === "artifact_generation")
        ?.renderHint,
      "artifact_panel",
    );
    assert.equal(
      body.data?.fullChain.runtimeSnapshot.tools[0]?.toolName,
      "events.recommend",
    );
    assert.equal(
      body.data?.fullChain.runtimeSnapshot.tools[0]?.renderHint,
      "artifact_panel",
    );
    assert.equal(
      body.data?.fullChain.runtimeSnapshot.artifactProducers[0]?.artifactProducer,
      "event_recommendation_producer",
    );
    assert.equal(body.data?.fullChain.dataSources[0]?.sourceModule, "events");
    assert.equal(body.data?.fullChain.toolCalls[0]?.toolName, "events.recommend");
    assert.equal(
      body.data?.fullChain.conversation.artifacts[0]?.task.kind,
      "event_recommendations",
    );
    assert.equal(
      body.data?.plannerOnly.planner.parsed.intent,
      "event_recommendations",
    );
    assert.equal(
      body.data?.plannerOnly.planner.parsed.toolRequests[0]?.toolName,
      "events.recommend",
    );
    assert.equal(body.data?.plannerOnly.toolTrace.domainToolCallsWouldExecute, true);
    assert.equal(providerResponses.length, 0);
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousApiKey;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    globalThis.fetch = previousFetch;
  }
});
```

### 代码证据 2

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

### 代码证据 3

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

### 代码证据 4

```bash
git add tests/capabilities/orbit-ai-trace-debug.test.ts features/orbit-ai/trace-contract.ts
git commit -m "test: specify orbit ai trace debug contract"
```

### 代码证据 5

```ts
test("development Orbit AI trace stops local guardrail prompts before planner and tools", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFetch = globalThis.fetch;

  try {
    process.env.NODE_ENV = "development";
    globalThis.fetch = (async () => {
      throw new Error("guardrail prompt must not call provider");
    }) as typeof fetch;

    const route = await importProjectModule<{
      POST: (request: Request) => Promise<Response>;
    }>("app/api/dev/orbit-ai/trace/route.ts");
    const response = await route.POST(
      new Request("http://localhost/api/dev/orbit-ai/trace", {
        body: JSON.stringify({
          message: "这段聊天不要给 AI 分析，也不要保存记录",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = (await response.json()) as {
      data?: {
        fullChain: {
          conversation: { provenance: { source: string } };
          stages: readonly { id: string; skipReason?: string; status: string }[];
        };
        plannerOnly: { skippedReason?: string; status: string };
      };
      success: boolean;
    };

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(
      body.data?.fullChain.conversation.provenance.source,
      "local:orbit-agent-privacy-boundary",
    );
    assert.equal(
      body.data?.fullChain.stages.find((stage) => stage.id === "local_guardrails")
        ?.status,
      "blocked",
    );
    assert.equal(
      body.data?.fullChain.stages.find((stage) => stage.id === "planner")?.status,
      "skipped",
    );
    assert.match(
      body.data?.fullChain.stages.find((stage) => stage.id === "planner")
        ?.skipReason ?? "",
      /privacy boundary/i,
    );
    assert.equal(body.data?.plannerOnly.status, "skipped");
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    globalThis.fetch = previousFetch;
  }
});
```

### 代码证据 6

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

### 代码证据 7

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

### 代码证据 8

```bash
git add features/orbit-ai/live-conversation-trace.ts features/orbit-ai/trace-contract.ts tests/capabilities/orbit-ai-trace-debug.test.ts
git commit -m "feat: add orbit ai full chain trace runner"
```

### 代码证据 9

```ts
test("development Orbit AI trace route is unavailable in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "production";
    const route = await importProjectModule<{
      POST: (request: Request) => Promise<Response>;
    }>("app/api/dev/orbit-ai/trace/route.ts");
    const response = await route.POST(
      new Request("http://localhost/api/dev/orbit-ai/trace", {
        body: JSON.stringify({ message: "看下有什么活动" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = (await response.json()) as {
      error?: { code: string; message: string };
      success: boolean;
    };

    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error?.code, "NOT_FOUND");
    assert.match(body.error?.message ?? "", /development/i);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
```

### 代码证据 10

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

### 代码证据 11

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

### 代码证据 12

```bash
npm test -- tests/capabilities/orbit-agent-gemini-live.test.ts
```

### 代码证据 13

```bash
git add app/api/dev/orbit-ai/trace/route.ts tests/capabilities/orbit-ai-trace-debug.test.ts
git commit -m "feat: expose orbit ai full chain trace api"
```

### 代码证据 14

```tsx
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(existsSync(absolutePath), true, `${pathFromRoot} must exist`);

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("/dev/orbit-ai/trace renders the Orbit AI trace debugger shell", async () => {
  const page = await importProjectModule<{ default: () => React.ReactElement }>(
    "app/dev/orbit-ai/trace/page.tsx",
  );
  const html = renderToStaticMarkup(React.createElement(page.default));

  assert.match(html, /Orbit AI trace debugger/);
  assert.match(html, /data-orbit-ai-trace-debugger="true"/);
  assert.match(html, /data-trace-timeline="true"/);
  assert.match(html, /data-stage-output-source="true"/);
  assert.match(html, /data-planner-only-comparison="true"/);
  assert.match(html, /data-runtime-snapshot="true"/);
  assert.match(html, /developer-debug-prompt-visible/);
});

test("Orbit AI trace debugger posts prompts to the full-chain trace API", () => {
  const source = readFileSync(
    join(projectRoot, "app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx"),
    "utf8",
  );

  assert.match(source, /fetch\(["']\/api\/dev\/orbit-ai\/trace["']/);
  assert.match(source, /method:\s*["']POST["']/);
  assert.match(source, /JSON\.stringify\(.*null,\s*2\)/s);
  assert.match(source, /<details[^>]*data-stage-output-source="true"/);
  assert.match(source, /disabled=\{[^}]*!prompt\.trim\(\)/);
  assert.match(source, /runtimeSnapshot/);
  assert.match(source, /plannerOnly/);
});
```

### 代码证据 15

```bash
npm test -- tests/pages/orbit-ai-trace-debug-page.test.tsx
```

### 代码证据 16

```bash
npm test -- tests/pages/orbit-ai-trace-debug-page.test.tsx
```

### 代码证据 17

```bash
git add app/dev/orbit-ai/trace/page.tsx app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx tests/pages/orbit-ai-trace-debug-page.test.tsx
git commit -m "feat: add orbit ai trace debugger page"
```

### 代码证据 18

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts tests/pages/orbit-ai-trace-debug-page.test.tsx tests/capabilities/orbit-agent-gemini-live.test.ts
```

### 代码证据 19

```bash
npm test
```

### 代码证据 20

```bash
npm run lint
```

### 代码证据 21

```bash
npm run build
```

### 代码证据 22

```bash
npm run dev
```

### 代码证据 23

```text
http://localhost:3000/dev/orbit-ai/trace
```

### 代码证据 24

```bash
git add package.json
git commit -m "chore: include orbit ai trace debug in checks"
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
