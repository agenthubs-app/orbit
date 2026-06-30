# Orbit AI Trace Debug Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/dev/orbit-ai/trace`, a development-only visual debugger that accepts a prompt and shows full-chain Orbit Agent execution beside planner-only comparison.

**Architecture:** Add a typed trace contract and full-chain trace runner under `features/orbit-ai/`, then expose it through `POST /api/dev/orbit-ai/trace` and a client debugger page. The runner records input, local guardrails, planner output, tool mapping, local-remote database context, artifact generation, synthesis, final response, source panels, and architecture snapshot metadata without executing external side effects.

**Tech Stack:** Next.js App Router, React 18, TypeScript, Node `node:test`, existing Orbit workbench primitives, existing Gemini/DeepSeek/OpenAI provider adapter.

## Global Constraints

- Use TDD: write each behavior test first, run it and observe the expected failure, then implement.
- Do not expose `.env`, API keys, provider credentials, or secret-like values in trace payloads or UI.
- `NODE_ENV=production` must return 404 for `/api/dev/orbit-ai/trace`.
- Existing `/api/dev/orbit-agent/trace` planner-only contract must remain compatible.
- The full-chain trace must include `traceSchemaVersion`, `runtimeSnapshot`, ordered `stages`, `outputSource`, `renderHint`, `toolCalls`, `databaseInteractions`, `dataSources`, final conversation, and planner-only comparison.
- Stage source panels must be collapsed by default in UI and pretty print JSON when expanded.
- Unknown sub-agents/tools/renderers must be detected and shown through a generic source fallback instead of dropping data.
- Do not execute email, calendar, notification, database writes, live storage mutations, or external side effects.
- The only external network calls allowed are the existing model provider planner/synthesis calls used by Orbit Agent.
- Work in `/Users/xzhao/Projects/orbit/repos/orbits`.

---

## File Structure

- Create `features/orbit-ai/trace-contract.ts`
  - Owns serializable trace payload types, stage ids/statuses, render hints, runtime snapshot, source view, tool call summary, and data source summary.
- Create `features/orbit-ai/live-conversation-trace.ts`
  - Runs the Orbit Agent chain in trace mode and returns `OrbitAiTracePayload`.
  - Mirrors the live conversation service decision order: scenario, message validation, local guardrails, planner, tool mapping, local-remote database context, artifact generation, synthesis, final response.
  - Builds stage `outputSource`, `runtimeSnapshot`, `toolCalls`, `databaseInteractions`, `dataSources`, and planner-only comparison from the same run.
- Create `app/api/dev/orbit-ai/trace/route.ts`
  - Development-only API envelope for GET/POST.
  - Parses `message`/`prompt`, `locale`, and `maxLoopSteps`.
  - Returns `X-Orbit-Dev-Trace: orbit-ai-full-chain`.
- Create `app/dev/orbit-ai/trace/page.tsx`
  - Server shell for the debug route.
- Create `app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx`
  - Client debugger UI with prompt controls, timeline, stage detail, output source `<details>`, planner comparison, runtime snapshot, and error state.
- Test `tests/capabilities/orbit-ai-trace-debug.test.ts`
  - API and trace-runner behavior.
- Test `tests/pages/orbit-ai-trace-debug-page.test.tsx`
  - Page/client source and static render behavior.
- Modify `package.json`
  - Add new trace files and page files to `lint` command's explicit TypeScript file list.

## Task 1: Trace Contract And API RED Tests

**Files:**
- Create: `tests/capabilities/orbit-ai-trace-debug.test.ts`
- Create: `features/orbit-ai/trace-contract.ts`
- Later tasks create: `features/orbit-ai/live-conversation-trace.ts`
- Later tasks create: `app/api/dev/orbit-ai/trace/route.ts`

**Interfaces:**
- Produces failing tests that expect `POST /api/dev/orbit-ai/trace`.
- Produces type names later code must satisfy:
  - `OrbitAiTracePayload`
  - `OrbitAiTraceStage`
  - `OrbitAiTraceStageStatus`
  - `OrbitAiTraceRenderHint`

- [ ] **Step 1: Write the failing API test file**

Create `tests/capabilities/orbit-ai-trace-debug.test.ts` with:

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
              task: { kind: string; subAgent: string };
            }[];
          };
          dataSources: readonly {
            evidenceIds: readonly string[];
            sourceModule: string;
          }[];
          runtimeSnapshot: {
            renderers: readonly { hint: string; renderer: string }[];
            subAgents: readonly { subAgent: string }[];
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
      body.data?.fullChain.runtimeSnapshot.subAgents[0]?.subAgent,
      "event_recommendation_agent",
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

- [ ] **Step 2: Run RED test**

Run:

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

Expected: FAIL because `app/api/dev/orbit-ai/trace/route.ts` does not exist.

- [ ] **Step 3: Add trace contract skeleton**

Create `features/orbit-ai/trace-contract.ts` with exported literal unions and interfaces matching the test names. Keep this file serializable-only; no provider calls.

- [ ] **Step 4: Run RED test again**

Run:

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

Expected: still FAIL because route and runner are missing. This confirms the test still guards the endpoint, not just type presence.

- [ ] **Step 5: Commit**

Commit only if Task 1 stops at test+contract skeleton:

```bash
git add tests/capabilities/orbit-ai-trace-debug.test.ts features/orbit-ai/trace-contract.ts
git commit -m "test: specify orbit ai trace debug contract"
```

## Task 2: Full-Chain Trace Runner

**Files:**
- Create: `features/orbit-ai/live-conversation-trace.ts`
- Modify: `features/orbit-ai/trace-contract.ts`
- Test: `tests/capabilities/orbit-ai-trace-debug.test.ts`

**Interfaces:**
- Consumes:
  - `GeminiOrbitAgentProviderConfig` from `features/orbit-ai/gemini-provider.ts`
  - `OrbitAgentSendMessageInput` from `features/orbit-ai/conversation-contract.ts`
- Produces:
  - `createLiveOrbitAgentTrace(config?: LiveOrbitAgentTraceConfig): OrbitAgentTraceRunner`
  - `OrbitAgentTraceRunner.traceMessage(input: OrbitAgentSendMessageInput): Promise<OrbitAiTraceResult>`

- [ ] **Step 1: Extend the failing test for guardrail stop**

Append to `tests/capabilities/orbit-ai-trace-debug.test.ts`:

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

- [ ] **Step 2: Run RED tests**

Run:

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

Expected: FAIL because trace runner and route are missing.

- [ ] **Step 3: Implement trace runner**

Create `features/orbit-ai/live-conversation-trace.ts`.

Implementation requirements:

- Define `createLiveOrbitAgentTrace(config = {})`.
- Use `createGeminiOrbitAgentPlanner(config)`.
- Use the same guardrail ordering as `createLiveOrbitAgentConversationService`.
- Build baseline stages in this order:
  `input_received`, `local_guardrails`, `planner`, `tool_mapping`,
  `artifact_generation`, `synthesis`, `final_response`.
- For guardrail payloads, mark `local_guardrails` as `blocked` and model/tool
  stages as `skipped`.
- For successful provider runs, build artifacts with
  `createMockOrbitAgentArtifactTaskService()`, flatten artifact provenance, and
  synthesize only when `maxLoopSteps >= 3 && artifacts.length > 0`.
- Build `plannerOnly` from the same planner result to avoid duplicate provider
  calls.
- Build `outputSource` values with redacted object/string payloads.

- [ ] **Step 4: Run GREEN tests for API behavior after route exists**

This step depends on Task 3 route. If Task 2 is implemented before route,
run a direct runner test instead:

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

Expected after Task 3: PASS for full-chain and guardrail tests.

- [ ] **Step 5: Commit**

```bash
git add features/orbit-ai/live-conversation-trace.ts features/orbit-ai/trace-contract.ts tests/capabilities/orbit-ai-trace-debug.test.ts
git commit -m "feat: add orbit ai full chain trace runner"
```

## Task 3: Development Trace API Route

**Files:**
- Create: `app/api/dev/orbit-ai/trace/route.ts`
- Test: `tests/capabilities/orbit-ai-trace-debug.test.ts`

**Interfaces:**
- Consumes `createLiveOrbitAgentTrace()` from Task 2.
- Produces:
  - `GET(request: Request): Promise<Response>`
  - `POST(request: Request): Promise<Response>`

- [ ] **Step 1: Add production 404 RED test**

Append to `tests/capabilities/orbit-ai-trace-debug.test.ts`:

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

- [ ] **Step 2: Run RED tests**

Run:

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

Expected: FAIL because route is missing.

- [ ] **Step 3: Implement route**

Create `app/api/dev/orbit-ai/trace/route.ts`.

Implementation requirements:

- Export `dynamic = "force-dynamic"`.
- Parse body using a safe `readJsonBody`.
- Accept `message` or `prompt`.
- Accept `locale`.
- Clamp `maxLoopSteps` to 1..3.
- In production, return 404 JSON with headers:
  - `Cache-Control: no-store`
  - `X-Orbit-Dev-Trace: orbit-ai-full-chain`
  - `X-Orbit-Privacy: developer-debug-prompt-visible`
  - `X-Orbit-Runtime-Boundary: developer-admin`
- For validation failure, return 400.
- For trace runner provider failure, return 503 with structured error.
- On success, return `success(tracePayload)` from `shared/api/envelope`.

- [ ] **Step 4: Run GREEN tests**

Run:

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts
```

Expected: PASS for the new trace API tests.

- [ ] **Step 5: Run existing planner-only route test**

Run:

```bash
npm test -- tests/capabilities/orbit-agent-gemini-live.test.ts
```

Expected: PASS, including "development Orbit Agent trace route exposes raw planner output".

- [ ] **Step 6: Commit**

```bash
git add app/api/dev/orbit-ai/trace/route.ts tests/capabilities/orbit-ai-trace-debug.test.ts
git commit -m "feat: expose orbit ai full chain trace api"
```

## Task 4: Debug Page RED Tests And UI

**Files:**
- Create: `tests/pages/orbit-ai-trace-debug-page.test.tsx`
- Create: `app/dev/orbit-ai/trace/page.tsx`
- Create: `app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx`

**Interfaces:**
- Consumes `/api/dev/orbit-ai/trace`.
- Produces static/debug UI markers:
  - `data-orbit-ai-trace-debugger="true"`
  - `data-trace-timeline`
  - `data-stage-output-source`
  - `data-planner-only-comparison`
  - `data-runtime-snapshot`

- [ ] **Step 1: Write page RED tests**

Create `tests/pages/orbit-ai-trace-debug-page.test.tsx` with:

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

- [ ] **Step 2: Run RED tests**

Run:

```bash
npm test -- tests/pages/orbit-ai-trace-debug-page.test.tsx
```

Expected: FAIL because page and component do not exist.

- [ ] **Step 3: Frontend design plan before code**

Use this compact visual direction:

- Subject: Orbit Agent execution debugger for developers.
- Palette: `ink #111827`, `paper #F8FAFC`, `trace blue #2563EB`,
  `source green #047857`, `guard amber #B45309`, `failure red #B91C1C`.
- Type: system sans for UI, monospaced system font for source panels.
- Layout: three-column debugger workbench with a thin stage spine in the center.
- Signature: "chain spine" timeline where each stage row exposes tool/source
  counts and stops at blocked/failed phases.

- [ ] **Step 4: Implement page and client component**

Implementation requirements:

- `page.tsx` imports and renders `OrbitAiTraceDebugger`.
- `orbit-ai-trace-debugger.tsx` starts with `"use client";`.
- Initial prompt can be `"看下有什么有意思的活动"`.
- Form fields: prompt textarea, locale select, max loop steps select.
- Button label: `Run trace`.
- Submit disabled only when `!prompt.trim()` or request status is loading.
- On submit, POST JSON to `/api/dev/orbit-ai/trace`.
- Render empty state before response.
- Render timeline from `fullChain.stages`.
- Render selected stage detail.
- Render `outputSource` with `<details data-stage-output-source="true">` and
  `JSON.stringify(value, null, 2)`.
- Render planner-only comparison from `plannerOnly`.
- Render runtime snapshot from `runtimeSnapshot`; auto-open when unknown
  renderer warnings exist.
- Keep CSS scoped inside the component with stable responsive dimensions.

- [ ] **Step 5: Run GREEN page tests**

Run:

```bash
npm test -- tests/pages/orbit-ai-trace-debug-page.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/dev/orbit-ai/trace/page.tsx app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx tests/pages/orbit-ai-trace-debug-page.test.tsx
git commit -m "feat: add orbit ai trace debugger page"
```

## Task 5: Lint Coverage And Full Verification

**Files:**
- Modify: `package.json`
- Verify generated Next files if build mutates `next-env.d.ts`.

**Interfaces:**
- Consumes all previous tasks.
- Produces repo-level verification evidence.

- [ ] **Step 1: Add lint file coverage**

Modify the `lint` script in `package.json` to include:

- `features/orbit-ai/trace-contract.ts`
- `features/orbit-ai/live-conversation-trace.ts`
- `app/api/dev/orbit-ai/trace/route.ts`
- `app/dev/orbit-ai/trace/page.tsx`
- `app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx`
- `tests/capabilities/orbit-ai-trace-debug.test.ts`
- `tests/pages/orbit-ai-trace-debug-page.test.tsx`

- [ ] **Step 2: Run targeted tests**

Run:

```bash
npm test -- tests/capabilities/orbit-ai-trace-debug.test.ts tests/pages/orbit-ai-trace-debug-page.test.tsx tests/capabilities/orbit-agent-gemini-live.test.ts
```

Expected: PASS with 0 failures.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS with 0 failures.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: exit 0. If `next-env.d.ts` changes only between `.next/dev/types` and `.next/types`, restore the pre-build path before committing.

- [ ] **Step 6: Browser verification**

Start the dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/dev/orbit-ai/trace
```

Verify:

- Prompt form is visible.
- `Run trace` is disabled for empty input.
- Event prompt renders all baseline stages.
- Planner-only comparison is visible.
- Stage output source panels start collapsed.
- Expanding a source panel shows indented JSON.
- Runtime snapshot shows detected tool and sub-agent.
- No text overlaps on desktop and mobile viewport.

- [ ] **Step 7: Commit verification coverage**

```bash
git add package.json
git commit -m "chore: include orbit ai trace debug in checks"
```

## Self-Review

Spec coverage:

- Full-chain trace and planner-only comparison: Tasks 1-3.
- Source panels default collapsed and pretty printed: Tasks 1 and 4.
- Runtime detection for new tools/sub-agents and fallback renderer: Tasks 1, 2, and 4.
- Development-only API and production 404: Task 3.
- Existing planner-only endpoint compatibility: Task 3.
- Visual debug page with prompt input and timeline: Task 4.
- Tests, lint, build, browser verification: Task 5.

Placeholder scan:

- No `TBD`, `TODO`, `fill in later`, or unspecified edge handling remains in this plan.

Type consistency:

- `OrbitAiTracePayload`, `fullChain`, `plannerOnly`, `runtimeSnapshot`, `outputSource`, and `renderHint` names are used consistently across tasks.
