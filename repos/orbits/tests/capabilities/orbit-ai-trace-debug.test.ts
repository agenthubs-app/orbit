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
          databaseInteractions: readonly {
            collections: readonly {
              collectionName: string;
              recordCount: number;
            }[];
            operation: string;
            role: string;
            storageKey: string;
          }[];
          dataSources: readonly {
            evidenceIds: readonly string[];
            sourceModule: string;
          }[];
          graph: {
            edges: readonly {
              from: string;
              kind: string;
              to: string;
            }[];
            nodes: readonly {
              id: string;
              kind: string;
              loopIndex: number;
              stageId?: string;
            }[];
          };
          runtimeSnapshot: {
            renderers: readonly { hint: string; renderer: string }[];
            subAgents: readonly { subAgent: string }[];
            tools: readonly {
              descriptionZh: string;
              inputSpecZh: string;
              outputSpecZh: string;
              renderHint: string;
              requiresConfirmation: boolean;
              riskLevel: string;
              selectedInCurrentRun: boolean;
              specificationZh: string;
              toolName: string;
            }[];
          };
          loopSummary: {
            loopCount: number;
            maxSupportedLoops: number;
            mode: string;
            reason: string;
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
        "database_context",
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
      body.data?.fullChain.stages.find((stage) => stage.id === "database_context")
        ?.renderHint,
      "database_table",
    );
    assert.equal(
      body.data?.fullChain.stages.find((stage) => stage.id === "database_context")
        ?.outputSource?.kind,
      "json",
    );
    assert.equal(
      body.data?.fullChain.databaseInteractions[0]?.storageKey,
      "orbit.local-remote-database.v2",
    );
    assert.equal(
      body.data?.fullChain.databaseInteractions[0]?.operation,
      "read",
    );
    assert.equal(body.data?.fullChain.databaseInteractions[0]?.role, "data");
    assert.equal(body.data?.fullChain.loopSummary.loopCount, 1);
    assert.equal(body.data?.fullChain.loopSummary.maxSupportedLoops, 3);
    assert.equal(body.data?.fullChain.loopSummary.mode, "single_live_loop");
    assert.match(body.data?.fullChain.loopSummary.reason ?? "", /one live loop/i);
    assert.equal(
      body.data?.fullChain.graph.nodes.some(
        (node) =>
          node.loopIndex === 1 &&
          node.kind === "subagent" &&
          node.id.includes("event_recommendation_agent"),
      ),
      true,
    );
    assert.equal(
      body.data?.fullChain.graph.edges.some(
        (edge) =>
          edge.kind === "subagent" &&
          edge.from.includes("events.recommend") &&
          edge.to.includes("event_recommendation_agent"),
      ),
      true,
    );
    assert.equal(
      body.data?.fullChain.graph.edges.some((edge) => edge.kind === "synthesis"),
      true,
    );
    assert.equal(
      body.data?.fullChain.databaseInteractions[0]?.collections.some(
        (collection) => collection.collectionName === "events",
      ),
      true,
    );
    assert.equal(
      body.data?.fullChain.runtimeSnapshot.tools[0]?.toolName,
      "events.recommend",
    );
    assert.equal(
      body.data?.fullChain.runtimeSnapshot.tools[0]?.renderHint,
      "artifact_panel",
    );
    const tools = body.data?.fullChain.runtimeSnapshot.tools ?? [];

    assert.deepEqual(
      tools.map((tool) => tool.toolName),
      [
        "events.recommend",
        "contacts.recommend",
        "followups.reviewQueue",
        "chat.context",
      ],
    );

    const eventTool = tools.find((tool) => tool.toolName === "events.recommend");
    const contactTool = tools.find((tool) => tool.toolName === "contacts.recommend");
    const followupTool = tools.find(
      (tool) => tool.toolName === "followups.reviewQueue",
    );
    const chatTool = tools.find((tool) => tool.toolName === "chat.context");

    assert.equal(eventTool?.selectedInCurrentRun, true);
    assert.equal(contactTool?.selectedInCurrentRun, false);
    assert.equal(followupTool?.selectedInCurrentRun, false);
    assert.equal(chatTool?.selectedInCurrentRun, false);
    assert.equal(eventTool?.riskLevel, "read");
    assert.equal(eventTool?.requiresConfirmation, true);
    assert.match(eventTool?.descriptionZh ?? "", /活动/);
    assert.equal(
      eventTool?.specificationZh,
      "只读取活动和关系上下文并生成推荐视图；不会报名、发消息、写日历或修改数据库。任何外部动作必须另走确认。",
    );
    assert.match(eventTool?.inputSpecZh ?? "", /query/);
    assert.match(eventTool?.outputSpecZh ?? "", /artifact/);
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
