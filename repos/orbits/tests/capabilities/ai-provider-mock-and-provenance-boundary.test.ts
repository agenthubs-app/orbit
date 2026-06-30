/**
 * AI provider mock 与 provenance 边界测试。
 *
 * 验证 provider run record、来源追踪和 debug-view 不会触发真实 AI provider。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the AI provider mock provenance sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

function assertNoLiveProviderCalls(filePath: string): void {
  const source = readFileSync(join(projectRoot, filePath), "utf8");

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
  assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
  assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
  assert.doesNotMatch(source, /Anthropic|DeepSeek|OpenAI|Pinecone|Weaviate|Qdrant/);
  assert.doesNotMatch(source, /sendgrid|postmark|gmail|calendar\.google/i);
}

test("AI provider contract exports typed provenance fixtures errors and service interface", async () => {
  const provider = await importProjectModule<{
    AI_PROVIDER_FIXTURE_SOURCE: string;
    AI_PROVIDER_PROMPT_TEMPLATE_IDS: readonly string[];
    AI_PROVIDER_ERROR_CODES: readonly string[];
    AI_PROVIDER_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    mockAiProviderFixture: {
      state: string;
      runs: readonly Array<{
        runId: string;
        promptTemplateId: string;
        inputHash: string;
        output: {
          kind: string;
          text: string;
          fallbackUsed: boolean;
        };
        provenance: {
          source: string;
          providerMode: string;
          promptTemplateId: string;
          inputHash: string;
          outputPreview: string;
          externalNetworkRequested: false;
          liveAiProviderRequested: false;
          liveDatabaseWriteExecuted: false;
        };
        fallbackBehavior: {
          used: boolean;
          reason: string;
          output: string;
        };
      }>;
      provenance: {
        source: string;
        providerMode: string;
        liveAiProviderRequested: false;
        externalNetworkRequested: false;
      };
    };
    mockEmptyAiProviderFixture: {
      state: string;
      runs: readonly unknown[];
      nextAction: string;
    };
    mockPendingAiProviderFixture: {
      state: string;
      runs: readonly unknown[];
      nextAction: string;
    };
  }>("shared/ai/provider.ts");
  const providerSource = readFileSync(
    join(projectRoot, "shared/ai/provider.ts"),
    "utf8",
  );
  const provenanceSource = readFileSync(
    join(projectRoot, "shared/ai/provenance.ts"),
    "utf8",
  );

  assert.match(providerSource, /interface AiProviderService/);
  assert.match(providerSource, /draftMessage/);
  assert.match(providerSource, /getRun/);
  assert.match(providerSource, /AiRunProvenanceRecord/);
  assert.match(providerSource, /PromptTemplateId/);
  assert.match(providerSource, /inputHash/);
  assert.match(providerSource, /fallbackBehavior/);
  assert.match(provenanceSource, /createMockInputHash/);
  assert.match(provenanceSource, /buildMockAiRunProvenance/);
  assert.deepEqual(provider.AI_PROVIDER_PROMPT_TEMPLATE_IDS, [
    "orbit.message-draft.followup.v1",
    "orbit.relationship-context-summary.v1",
  ]);
  assert.deepEqual(provider.AI_PROVIDER_ERROR_CODES, [
    "AI_PROVIDER_INPUT_REQUIRED",
    "AI_PROVIDER_RUN_NOT_FOUND",
    "AI_PROVIDER_EMPTY",
    "AI_PROVIDER_PENDING",
    "AI_PROVIDER_MOCK_FAILED",
  ]);
  assert.equal(
    provider.AI_PROVIDER_ERROR_DEFINITIONS.AI_PROVIDER_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    provider.AI_PROVIDER_ERROR_DEFINITIONS.AI_PROVIDER_EMPTY.recovery,
    /relationship context|source evidence|prompt/i,
  );
  assert.equal(provider.mockAiProviderFixture.state, "success");
  assert.equal(
    provider.mockAiProviderFixture.provenance.source,
    provider.AI_PROVIDER_FIXTURE_SOURCE,
  );
  assert.equal(provider.mockAiProviderFixture.runs[0].runId, "demo-ai-run-1");
  assert.equal(
    provider.mockAiProviderFixture.runs[0].promptTemplateId,
    "orbit.message-draft.followup.v1",
  );
  assert.match(
    provider.mockAiProviderFixture.runs[0].inputHash,
    /^mock-sha256-/,
  );
  assert.equal(
    provider.mockAiProviderFixture.runs[0].output.kind,
    "message_draft",
  );
  assert.equal(
    provider.mockAiProviderFixture.runs[0].provenance.liveAiProviderRequested,
    false,
  );
  assert.equal(
    provider.mockAiProviderFixture.runs[0].provenance
      .externalNetworkRequested,
    false,
  );
  assert.equal(
    provider.mockAiProviderFixture.runs[0].fallbackBehavior.used,
    false,
  );
  assert.equal(provider.mockEmptyAiProviderFixture.state, "empty");
  assert.match(
    provider.mockEmptyAiProviderFixture.nextAction,
    /relationship context|source evidence|prompt/i,
  );
  assert.equal(provider.mockPendingAiProviderFixture.state, "pending");
});

test("mock AI provider service is deterministic and never calls live providers", async () => {
  const serviceModule = await importProjectModule<{
    createMockAiProviderService: () => {
      draftMessage: (input?: {
        scenario?: string | null;
        promptTemplateId?: string | null;
        recipientName?: string | null;
        relationshipContext?: string | null;
        desiredOutcome?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          runs: readonly Array<{
            runId: string;
            inputHash: string;
            output: { text: string; fallbackUsed: boolean };
            provenance: {
              promptTemplateId: string;
              inputHash: string;
              liveAiProviderRequested: false;
              externalNetworkRequested: false;
            };
            fallbackBehavior: {
              used: boolean;
              output: string;
            };
          }>;
        };
        error?: { code: string; appCode: string };
      };
      getRun: (input: { runId?: string | null; scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          run: {
            runId: string;
            provenance: {
              inputHash: string;
              liveAiProviderRequested: false;
              externalNetworkRequested: false;
            };
          };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("shared/ai/mock-provider.ts");

  const service = serviceModule.createMockAiProviderService();
  const input = {
    desiredOutcome: "Schedule a 20-minute pilot-readiness call",
    recipientName: "Maya Chen",
    relationshipContext:
      "Maya asked for the pilot timing comparison after breakfast.",
  };
  const draft = service.draftMessage(input);
  const draftAgain = service.draftMessage(input);
  const run = service.getRun({ runId: "demo-ai-run-1" });
  const empty = service.draftMessage({ scenario: "empty" });
  const pending = service.draftMessage({ scenario: "pending" });
  const fallback = service.draftMessage({
    promptTemplateId: "unknown-template",
    recipientName: "Maya Chen",
    relationshipContext: "Maya asked for a short follow-up.",
  });
  const failure = service.draftMessage({ scenario: "failure" });
  const missingRun = service.getRun({ runId: "missing-run" });
  const missingInput = service.draftMessage({ relationshipContext: "" });

  assert.deepEqual(draft, draftAgain);
  assert.equal(draft.success, true);
  assert.equal(draft.data?.state, "success");
  assert.equal(draft.data?.runs.length, 1);
  assert.match(draft.data?.runs[0].output.text ?? "", /Maya Chen/);
  assert.match(draft.data?.runs[0].output.text ?? "", /pilot-readiness/);
  assert.match(draft.data?.runs[0].inputHash ?? "", /^mock-sha256-/);
  assert.equal(
    draft.data?.runs[0].inputHash,
    draft.data?.runs[0].provenance.inputHash,
  );
  assert.equal(
    draft.data?.runs[0].provenance.promptTemplateId,
    "orbit.message-draft.followup.v1",
  );
  assert.equal(draft.data?.runs[0].provenance.liveAiProviderRequested, false);
  assert.equal(draft.data?.runs[0].provenance.externalNetworkRequested, false);
  assert.equal(draft.data?.runs[0].output.fallbackUsed, false);
  assert.equal(run.success, true);
  assert.equal(run.data?.run.runId, "demo-ai-run-1");
  assert.equal(run.data?.run.provenance.liveAiProviderRequested, false);
  assert.equal(run.data?.run.provenance.externalNetworkRequested, false);
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.runs.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(fallback.success, true);
  assert.equal(fallback.data?.runs[0].fallbackBehavior.used, true);
  assert.match(fallback.data?.runs[0].fallbackBehavior.output ?? "", /Maya Chen/);
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "AI_PROVIDER_MOCK_FAILED");
  assert.equal(missingRun.success, false);
  assert.equal(missingRun.error?.code, "AI_PROVIDER_RUN_NOT_FOUND");
  assert.equal(missingInput.success, false);
  assert.equal(missingInput.error?.code, "AI_PROVIDER_INPUT_REQUIRED");

  for (const filePath of [
    "shared/ai/provider.ts",
    "shared/ai/mock-provider.ts",
    "shared/ai/provenance.ts",
    "shared/ai/ai-provider-mock-and-provenance-boundary/debug-view.tsx",
    "app/api/ai/mock/message-draft/route.ts",
    "app/api/ai/runs/[id]/route.ts",
  ]) {
    assertNoLiveProviderCalls(filePath);
  }
});

test("AI provider API routes return stable envelopes with empty and failure paths", async () => {
  const draftRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/ai/mock/message-draft/route.ts");
  const runRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/ai/runs/[id]/route.ts");
  const provider = await importProjectModule<{
    mockEmptyAiProviderFixture: unknown;
    mockPendingAiProviderFixture: unknown;
  }>("shared/ai/provider.ts");

  const draftResponse = await draftRoute.POST(
    new Request("https://orbit.local/api/ai/mock/message-draft", {
      body: JSON.stringify({
        desiredOutcome: "Schedule a 20-minute pilot-readiness call",
        recipientName: "Maya Chen",
        relationshipContext:
          "Maya asked for the pilot timing comparison after breakfast.",
      }),
      method: "POST",
    }),
  );
  const runResponse = await runRoute.GET(
    new Request("https://orbit.local/api/ai/runs/demo-ai-run-1"),
    { params: Promise.resolve({ id: "demo-ai-run-1" }) },
  );
  const emptyResponse = await draftRoute.POST(
    new Request("https://orbit.local/api/ai/mock/message-draft?scenario=empty", {
      body: JSON.stringify({ recipientName: "Maya Chen" }),
      method: "POST",
    }),
  );
  const pendingResponse = await draftRoute.POST(
    new Request(
      "https://orbit.local/api/ai/mock/message-draft?scenario=pending",
      {
        body: JSON.stringify({ recipientName: "Maya Chen" }),
        method: "POST",
      },
    ),
  );
  const failureResponse = await draftRoute.POST(
    new Request(
      "https://orbit.local/api/ai/mock/message-draft?scenario=failure",
      {
        body: JSON.stringify({
          relationshipContext: "Maya asked for a short follow-up.",
        }),
        method: "POST",
      },
    ),
  );
  const missingRunResponse = await runRoute.GET(
    new Request("https://orbit.local/api/ai/runs/missing-run"),
    { params: Promise.resolve({ id: "missing-run" }) },
  );

  assert.equal(draftResponse.status, 200);
  assert.equal(draftResponse.headers.get("cache-control"), "no-store");
  assert.equal(draftResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.equal(runResponse.status, 200);
  assert.equal(runResponse.headers.get("cache-control"), "no-store");

  const draftEnvelope = (await draftResponse.json()) as {
    success: true;
    data: {
      state: string;
      runs: readonly Array<{
        runId: string;
        output: { text: string; fallbackUsed: false };
        provenance: {
          inputHash: string;
          liveAiProviderRequested: false;
          externalNetworkRequested: false;
        };
      }>;
    };
  };
  const runEnvelope = (await runResponse.json()) as {
    success: true;
    data: {
      state: string;
      run: {
        runId: string;
        output: { text: string };
        provenance: {
          inputHash: string;
          liveAiProviderRequested: false;
          externalNetworkRequested: false;
        };
      };
    };
  };

  assert.equal(draftEnvelope.success, true);
  assert.equal(draftEnvelope.data.state, "success");
  assert.equal(draftEnvelope.data.runs[0].runId, "demo-ai-run-generated");
  assert.match(draftEnvelope.data.runs[0].output.text, /Maya Chen/);
  assert.match(draftEnvelope.data.runs[0].provenance.inputHash, /^mock-sha256-/);
  assert.equal(
    draftEnvelope.data.runs[0].provenance.liveAiProviderRequested,
    false,
  );
  assert.equal(
    draftEnvelope.data.runs[0].provenance.externalNetworkRequested,
    false,
  );
  assert.equal(runEnvelope.success, true);
  assert.equal(runEnvelope.data.state, "success");
  assert.equal(runEnvelope.data.run.runId, "demo-ai-run-1");
  assert.match(runEnvelope.data.run.output.text, /Maya Chen/);
  assert.equal(runEnvelope.data.run.provenance.liveAiProviderRequested, false);
  assert.equal(runEnvelope.data.run.provenance.externalNetworkRequested, false);
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: provider.mockEmptyAiProviderFixture,
  });
  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: provider.mockPendingAiProviderFixture,
  });
  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock AI provider boundary is pinned to a controlled failure scenario.",
      context: {
        aiProviderErrorCode: "AI_PROVIDER_MOCK_FAILED",
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock AI provider failure came from deterministic fixture rules.",
        service: "ai-provider-mock-and-provenance-boundary",
      },
    },
  });
  assert.equal(missingRunResponse.status, 404);
  assert.deepEqual(await missingRunResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock AI run provenance record matches that run id.",
      context: {
        aiProviderErrorCode: "AI_PROVIDER_RUN_NOT_FOUND",
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock AI provider failure came from deterministic fixture rules.",
        service: "ai-provider-mock-and-provenance-boundary",
      },
    },
  });
});

test("AI provider provenance debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    AI_PROVIDER_MOCK_PROVENANCE_SLUG: string;
    AI_PROVIDER_MOCK_API_PROBES: readonly Array<{
      label: string;
      method: "GET" | "POST";
      path: string;
      curlCommand: string;
      expectedStatus: number;
    }>;
    AiProviderMockProvenanceDemo: () => React.ReactElement;
  }>("shared/ai/ai-provider-mock-and-provenance-boundary/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.AiProviderMockProvenanceDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "shared/ai/ai-provider-mock-and-provenance-boundary/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.AI_PROVIDER_MOCK_PROVENANCE_SLUG,
    "ai-provider-mock-and-provenance-boundary",
  );
  assert.deepEqual(
    debugView.AI_PROVIDER_MOCK_API_PROBES.map((probe) => [
      probe.method,
      probe.path,
      probe.curlCommand,
      probe.expectedStatus,
    ]),
    [
      [
        "POST",
        "/api/ai/mock/message-draft",
        "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft",
        200,
      ],
      [
        "GET",
        "/api/ai/runs/demo-ai-run-1",
        "curl -s http://localhost:3000/api/ai/runs/demo-ai-run-1",
        200,
      ],
      [
        "POST",
        "/api/ai/mock/message-draft?scenario=empty",
        "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft?scenario=empty",
        200,
      ],
      [
        "POST",
        "/api/ai/mock/message-draft?scenario=pending",
        "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft?scenario=pending",
        200,
      ],
      [
        "POST",
        "/api/ai/mock/message-draft?scenario=failure",
        "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft?scenario=failure",
        503,
      ],
    ],
  );
  assert.match(pageSource, /AI_PROVIDER_MOCK_PROVENANCE_SLUG/);
  assert.match(pageSource, /AiProviderMockProvenanceDemo/);

  assert.match(html, /AI provider mock and provenance boundary/);
  assert.match(html, /aria-label="AI provider mock operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Prompt template/);
  assert.match(html, /Input hash/);
  assert.match(html, /Fallback behavior/);
  assert.match(html, /aria-label="AI provider mock state matrix"/);
  assert.match(html, /Success probe: POST \/api\/ai\/mock\/message-draft/);
  assert.match(html, /Run probe: GET \/api\/ai\/runs\/demo-ai-run-1/);
  assert.match(html, /Empty: no prompt-ready relationship context/);
  assert.match(html, /Pending: local provider guard/);
  assert.match(html, /Failure: controlled error/);
  assert.match(html, /AI_PROVIDER_MOCK_FAILED/);
  assert.match(html, /demo-ai-run-1/);
  assert.match(html, /demo-ai-run-2/);
  assert.match(html, /orbit.message-draft.followup.v1/);
  assert.match(html, /mock-sha256-/);
  assert.match(html, /live AI provider false/);
  assert.match(html, /external network false/);
  assert.match(html, /database write false/);
  assert.match(html, /POST \/api\/ai\/mock\/message-draft/);
  assert.match(html, /GET \/api\/ai\/runs\/demo-ai-run-1/);
  assert.match(html, /Run these probes against the dev server/);
  assert.match(
    html,
    /curl -s -X POST http:\/\/localhost:3000\/api\/ai\/mock\/message-draft/,
  );
  assert.match(
    html,
    /curl -s http:\/\/localhost:3000\/api\/ai\/runs\/demo-ai-run-1/,
  );
  assert.match(
    html,
    /curl -s -X POST http:\/\/localhost:3000\/api\/ai\/mock\/message-draft\?scenario=failure/,
  );

  for (const requiredText of [
    "Live service/provider files",
    "ORBIT_AI_PROVIDER_MODE",
    "ORBIT_AI_PROVIDER",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENAI_API_KEY",
    "prompt template",
    "input hash",
    "output",
    "fallback",
    "privacy",
    "provenance",
    "replacement tests",
  ]) {
    assert.match(liveDoc, new RegExp(requiredText, "i"));
  }
});
