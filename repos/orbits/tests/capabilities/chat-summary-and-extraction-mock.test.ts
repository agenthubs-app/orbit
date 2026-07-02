/**
 * Chat 摘要与抽取 mock 的契约测试。
 *
 * 锁住任务/需求/profile 建议抽取结果，以及确认前不写 profile 的边界。
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
    `${pathFromRoot} must exist for the chat summary and extraction mock sprint`,
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
  assert.doesNotMatch(source, /OpenAI|Anthropic|Pinecone|Weaviate|Qdrant/);
  assert.doesNotMatch(source, /sendgrid|postmark|gmail|calendar\.google/i);
}

test("chat summary keeps typed contract separate from mock fixture provenance", async () => {
  const contract = await importProjectModule<{
    CHAT_SUMMARY_EXTRACTION_ERROR_CODES: readonly string[];
    CHAT_SUMMARY_EXTRACTION_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
  }>("features/chat/summary-contract.ts");
  const fixtures = await importProjectModule<{
    CHAT_SUMMARY_EXTRACTION_FIXTURE_SOURCE: string;
    mockChatSummaryFixture: {
      state: string;
      conversationId: string;
      summary: {
        summaryId: string;
        narrative: string;
        extractedNeedIds: readonly string[];
        extractedTaskIds: readonly string[];
        relationshipProfileUpdateIds: readonly string[];
        confirmationRequiredSuggestionIds: readonly string[];
        aiProviderRequested: false;
        liveDatabaseWriteExecuted: false;
      };
      extractedNeeds: readonly Array<{
        needId: string;
        statement: string;
        evidenceIds: readonly string[];
        source: { label: string };
      }>;
      extractedTasks: readonly Array<{
        taskId: string;
        title: string;
        dueHint: string;
        evidenceIds: readonly string[];
      }>;
      relationshipProfileUpdates: readonly Array<{
        updateId: string;
        field: string;
        proposedValue: string;
        autoApplied: false;
      }>;
      confirmationRequiredProfileSuggestions: readonly Array<{
        suggestionId: string;
        confirmationRequired: true;
        autoApplied: false;
        guard: string;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        aiProviderRequested: false;
        externalNetworkRequested: false;
        liveDatabaseReadExecuted: false;
        liveDatabaseWriteExecuted: false;
        emailProviderRequested: false;
        calendarProviderRequested: false;
        notificationDelivered: false;
        deviceRequested: false;
      };
    };
    mockChatExtractionFixture: {
      state: string;
      conversationId: string;
      extractedNeeds: readonly unknown[];
      extractedTasks: readonly unknown[];
      relationshipProfileUpdates: readonly unknown[];
      confirmationRequiredProfileSuggestions: readonly unknown[];
    };
    mockEmptyChatSummaryFixture: {
      state: string;
      summary: null;
      nextAction: string;
    };
    mockPendingChatExtractionFixture: {
      state: string;
      extractedNeeds: readonly unknown[];
      nextAction: string;
    };
  }>("features/chat/summary-fixtures.ts");
  const contractSource = readFileSync(
    join(projectRoot, "features/chat/summary-contract.ts"),
    "utf8",
  );

  assert.match(contractSource, /interface ChatSummaryExtractionService/);
  assert.match(contractSource, /summarizeConversation/);
  assert.match(contractSource, /extractConversationSignals/);
  assert.deepEqual(contract.CHAT_SUMMARY_EXTRACTION_ERROR_CODES, [
    "CHAT_SUMMARY_CONVERSATION_ID_REQUIRED",
    "CHAT_SUMMARY_CONVERSATION_NOT_FOUND",
    "CHAT_SUMMARY_EMPTY",
    "CHAT_SUMMARY_PENDING",
    "CHAT_SUMMARY_MOCK_FAILED",
    "CHAT_SUMMARY_LIVE_STORE_UNCONFIGURED",
  ]);
  assert.equal(
    contract.CHAT_SUMMARY_EXTRACTION_ERROR_DEFINITIONS.CHAT_SUMMARY_MOCK_FAILED
      .appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.CHAT_SUMMARY_EXTRACTION_ERROR_DEFINITIONS.CHAT_SUMMARY_EMPTY
      .recovery,
    /source-backed chat messages|relationship context/i,
  );
  assert.equal(fixtures.mockChatSummaryFixture.state, "success");
  assert.equal(
    fixtures.mockChatSummaryFixture.provenance.source,
    fixtures.CHAT_SUMMARY_EXTRACTION_FIXTURE_SOURCE,
  );
  assert.equal(
    fixtures.mockChatSummaryFixture.summary.summaryId,
    "demo-chat-summary-maya-pilot",
  );
  assert.match(
    fixtures.mockChatSummaryFixture.summary.narrative,
    /pilot timing comparison/i,
  );
  assert.deepEqual(
    fixtures.mockChatSummaryFixture.summary.extractedNeedIds,
    ["need:chat:maya:pilot-window"],
  );
  assert.deepEqual(
    fixtures.mockChatSummaryFixture.summary.extractedTaskIds,
    ["task:chat:maya:send-pilot-comparison"],
  );
  assert.deepEqual(
    fixtures.mockChatSummaryFixture.summary.relationshipProfileUpdateIds,
    ["profile-update:chat:maya:operator-readiness"],
  );
  assert.deepEqual(
    fixtures.mockChatSummaryFixture.summary
      .confirmationRequiredSuggestionIds,
    ["profile-suggestion:chat:maya:priority-topic"],
  );
  assert.equal(fixtures.mockChatSummaryFixture.summary.aiProviderRequested, false);
  assert.equal(
    fixtures.mockChatSummaryFixture.summary.liveDatabaseWriteExecuted,
    false,
  );
  assert.match(
    fixtures.mockChatSummaryFixture.extractedNeeds[0].statement,
    /operator readiness/i,
  );
  assert.match(
    fixtures.mockChatSummaryFixture.extractedTasks[0].title,
    /pilot timing comparison/i,
  );
  assert.equal(
    fixtures.mockChatSummaryFixture.relationshipProfileUpdates[0].autoApplied,
    false,
  );
  assert.equal(
    fixtures.mockChatSummaryFixture.confirmationRequiredProfileSuggestions[0]
      .confirmationRequired,
    true,
  );
  assert.match(
    fixtures.mockChatSummaryFixture.confirmationRequiredProfileSuggestions[0]
      .guard,
    /profile confirmation/i,
  );
  assert.equal(
    fixtures.mockChatSummaryFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    fixtures.mockChatSummaryFixture.provenance.externalNetworkRequested,
    false,
  );
  assert.equal(
    fixtures.mockChatExtractionFixture.extractedNeeds.length,
    fixtures.mockChatSummaryFixture.extractedNeeds.length,
  );
  assert.equal(fixtures.mockEmptyChatSummaryFixture.state, "empty");
  assert.equal(fixtures.mockEmptyChatSummaryFixture.summary, null);
  assert.match(
    fixtures.mockEmptyChatSummaryFixture.nextAction,
    /source-backed chat messages|relationship context/i,
  );
  assert.equal(fixtures.mockPendingChatExtractionFixture.state, "pending");
});

test("mock chat summary service is deterministic and never calls live providers", async () => {
  const serviceModule = await importProjectModule<{
    createMockChatSummaryExtractionService: () => {
      summarizeConversation: (input: {
        conversationId?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          conversationId: string;
          summary: {
            narrative: string;
            aiProviderRequested: false;
            liveDatabaseWriteExecuted: false;
          } | null;
          provenance: {
            aiProviderRequested: false;
            externalNetworkRequested: false;
          };
        };
        error?: { code: string; appCode: string };
      };
      extractConversationSignals: (input: {
        conversationId?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          extractedNeeds: readonly Array<{ statement: string }>;
          extractedTasks: readonly Array<{ title: string }>;
          relationshipProfileUpdates: readonly Array<{ autoApplied: false }>;
          confirmationRequiredProfileSuggestions: readonly Array<{
            confirmationRequired: true;
            autoApplied: false;
          }>;
          provenance: {
            aiProviderRequested: false;
            liveDatabaseWriteExecuted: false;
          };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/chat/mock-summary-service.ts");
  const service = serviceModule.createMockChatSummaryExtractionService();
  const input = { conversationId: "demo-conversation-1" };
  const summary = service.summarizeConversation(input);
  const extractions = service.extractConversationSignals(input);
  const empty = service.summarizeConversation({
    conversationId: "demo-conversation-1",
    scenario: "empty",
  });
  const pending = service.extractConversationSignals({
    conversationId: "demo-conversation-1",
    scenario: "pending",
  });
  const failure = service.summarizeConversation({
    conversationId: "demo-conversation-1",
    scenario: "failure",
  });
  const missingId = service.summarizeConversation({ conversationId: "" });
  const missingConversation = service.extractConversationSignals({
    conversationId: "missing",
  });

  assert.deepEqual(
    service.summarizeConversation(input),
    service.summarizeConversation(input),
  );
  assert.equal(summary.success, true);
  assert.equal(summary.data?.state, "success");
  assert.equal(summary.data?.conversationId, "demo-conversation-1");
  assert.match(summary.data?.summary?.narrative ?? "", /pilot timing/i);
  assert.equal(summary.data?.summary?.aiProviderRequested, false);
  assert.equal(summary.data?.summary?.liveDatabaseWriteExecuted, false);
  assert.equal(summary.data?.provenance.aiProviderRequested, false);
  assert.equal(summary.data?.provenance.externalNetworkRequested, false);
  assert.equal(extractions.success, true);
  assert.equal(extractions.data?.state, "success");
  assert.match(
    extractions.data?.extractedNeeds[0].statement ?? "",
    /operator readiness/i,
  );
  assert.match(
    extractions.data?.extractedTasks[0].title ?? "",
    /pilot timing comparison/i,
  );
  assert.equal(extractions.data?.relationshipProfileUpdates[0].autoApplied, false);
  assert.equal(
    extractions.data?.confirmationRequiredProfileSuggestions[0]
      .confirmationRequired,
    true,
  );
  assert.equal(
    extractions.data?.confirmationRequiredProfileSuggestions[0].autoApplied,
    false,
  );
  assert.equal(extractions.data?.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.summary, null);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(pending.data?.extractedNeeds.length, 0);
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "CHAT_SUMMARY_MOCK_FAILED");
  assert.equal(missingId.success, false);
  assert.equal(missingId.error?.code, "CHAT_SUMMARY_CONVERSATION_ID_REQUIRED");
  assert.equal(missingConversation.success, false);
  assert.equal(
    missingConversation.error?.code,
    "CHAT_SUMMARY_CONVERSATION_NOT_FOUND",
  );

  for (const filePath of [
    "features/chat/summary-contract.ts",
    "features/chat/summary-fixtures.ts",
    "features/chat/mock-summary-service.ts",
    "features/chat/chat-summary-and-extraction-mock/debug-view.tsx",
    "app/api/chat/conversations/[id]/summary/route.ts",
    "app/api/chat/conversations/[id]/extractions/route.ts",
  ]) {
    assertNoLiveProviderCalls(filePath);
  }
});

test("chat summary and extraction API routes return stable envelopes with empty and failure paths", async () => {
  const summaryRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/chat/conversations/[id]/summary/route.ts");
  const extractionsRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/chat/conversations/[id]/extractions/route.ts");
  const fixtures = await importProjectModule<{
    mockEmptyChatSummaryFixture: unknown;
  }>("features/chat/summary-fixtures.ts");

  const summaryResponse = await summaryRoute.POST(
    new Request(
      "https://orbit.local/api/chat/conversations/demo-conversation-1/summary",
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "demo-conversation-1" }) },
  );
  const extractionsResponse = await extractionsRoute.GET(
    new Request(
      "https://orbit.local/api/chat/conversations/demo-conversation-1/extractions",
    ),
    { params: Promise.resolve({ id: "demo-conversation-1" }) },
  );
  const emptyResponse = await summaryRoute.POST(
    new Request(
      "https://orbit.local/api/chat/conversations/demo-conversation-1/summary?scenario=empty",
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "demo-conversation-1" }) },
  );
  const failureResponse = await extractionsRoute.GET(
    new Request(
      "https://orbit.local/api/chat/conversations/demo-conversation-1/extractions?scenario=failure",
    ),
    { params: Promise.resolve({ id: "demo-conversation-1" }) },
  );

  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.headers.get("cache-control"), "no-store");
  assert.equal(summaryResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.equal(extractionsResponse.status, 200);

  const summaryEnvelope = (await summaryResponse.json()) as {
    success: true;
    data: {
      state: string;
      conversationId: string;
      summary: {
        narrative: string;
        aiProviderRequested: false;
      };
      provenance: {
        aiProviderRequested: false;
        externalNetworkRequested: false;
      };
    };
  };
  const extractionEnvelope = (await extractionsResponse.json()) as {
    success: true;
    data: {
      state: string;
      extractedNeeds: readonly Array<{ needId: string; statement: string }>;
      extractedTasks: readonly Array<{ taskId: string; title: string }>;
      relationshipProfileUpdates: readonly Array<{
        updateId: string;
        autoApplied: false;
      }>;
      confirmationRequiredProfileSuggestions: readonly Array<{
        suggestionId: string;
        confirmationRequired: true;
        autoApplied: false;
      }>;
      provenance: {
        aiProviderRequested: false;
        liveDatabaseWriteExecuted: false;
      };
    };
  };

  assert.equal(summaryEnvelope.success, true);
  assert.equal(summaryEnvelope.data.state, "success");
  assert.equal(summaryEnvelope.data.conversationId, "demo-conversation-1");
  assert.match(summaryEnvelope.data.summary.narrative, /pilot timing/i);
  assert.equal(summaryEnvelope.data.summary.aiProviderRequested, false);
  assert.equal(summaryEnvelope.data.provenance.aiProviderRequested, false);
  assert.equal(
    summaryEnvelope.data.provenance.externalNetworkRequested,
    false,
  );
  assert.equal(extractionEnvelope.success, true);
  assert.equal(extractionEnvelope.data.state, "success");
  assert.equal(
    extractionEnvelope.data.extractedNeeds[0].needId,
    "need:chat:maya:pilot-window",
  );
  assert.match(
    extractionEnvelope.data.extractedTasks[0].title,
    /pilot timing comparison/i,
  );
  assert.equal(
    extractionEnvelope.data.relationshipProfileUpdates[0].autoApplied,
    false,
  );
  assert.equal(
    extractionEnvelope.data.confirmationRequiredProfileSuggestions[0]
      .confirmationRequired,
    true,
  );
  assert.equal(
    extractionEnvelope.data.confirmationRequiredProfileSuggestions[0]
      .autoApplied,
    false,
  );
  assert.equal(extractionEnvelope.data.provenance.aiProviderRequested, false);
  assert.equal(
    extractionEnvelope.data.provenance.liveDatabaseWriteExecuted,
    false,
  );
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyChatSummaryFixture,
  });
  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The chat summary and extraction mock boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        chatSummaryExtractionErrorCode: "CHAT_SUMMARY_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance: "Controlled chat summary and extraction mock failure",
        service: "chat-summary-and-extraction",
      },
    },
  });
});

test("chat summary and extraction debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    CHAT_SUMMARY_EXTRACTION_MOCK_SLUG: string;
    CHAT_SUMMARY_EXTRACTION_API_PROBES: readonly Array<{
      label: string;
      method: "GET" | "POST";
      path: string;
      expectedStatus: number;
    }>;
    ChatSummaryExtractionMockDemo: () => React.ReactElement;
  }>("features/chat/chat-summary-and-extraction-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ChatSummaryExtractionMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/chat/chat-summary-and-extraction-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.CHAT_SUMMARY_EXTRACTION_MOCK_SLUG,
    "chat-summary-and-extraction-mock",
  );
  assert.deepEqual(
    debugView.CHAT_SUMMARY_EXTRACTION_API_PROBES.map((probe) => [
      probe.method,
      probe.path,
      probe.expectedStatus,
    ]),
    [
      ["POST", "/api/chat/conversations/demo-conversation-1/summary", 200],
      ["GET", "/api/chat/conversations/demo-conversation-1/extractions", 200],
      [
        "POST",
        "/api/chat/conversations/demo-conversation-1/summary?scenario=empty",
        200,
      ],
      [
        "GET",
        "/api/chat/conversations/demo-conversation-1/extractions?scenario=pending",
        200,
      ],
      [
        "GET",
        "/api/chat/conversations/demo-conversation-1/extractions?scenario=failure",
        503,
      ],
    ],
  );
  assert.match(pageSource, /CHAT_SUMMARY_EXTRACTION_MOCK_SLUG/);
  assert.match(pageSource, /ChatSummaryExtractionMockDemo/);

  assert.match(html, /Chat summary and extraction mock/);
  assert.match(
    html,
    /aria-label="Chat summary extraction operator checkpoint"/,
  );
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Maya Chen/);
  assert.match(html, /pilot timing comparison/i);
  assert.match(html, /Extracted needs/);
  assert.match(html, /Extracted tasks/);
  assert.match(html, /Relationship profile updates/);
  assert.match(html, /Confirmation-required profile suggestions/);
  assert.match(
    html,
    /aria-label="Chat summary extraction state matrix"/,
  );
  assert.match(
    html,
    /Success probe: POST \/api\/chat\/conversations\/demo-conversation-1\/summary/,
  );
  assert.match(html, /Success: summary and 4 extraction groups/);
  assert.match(
    html,
    /Empty probe: POST \/api\/chat\/conversations\/demo-conversation-1\/summary\?scenario=empty/,
  );
  assert.match(html, /Empty: no source-backed chat messages/);
  assert.match(
    html,
    /Pending probe: GET \/api\/chat\/conversations\/demo-conversation-1\/extractions\?scenario=pending/,
  );
  assert.match(html, /Pending: local extraction guard/);
  assert.match(
    html,
    /Failure probe: GET \/api\/chat\/conversations\/demo-conversation-1\/extractions\?scenario=failure/,
  );
  assert.match(html, /Failure: controlled error/);
  assert.match(html, /CHAT_SUMMARY_MOCK_FAILED/);
  assert.match(html, /AI provider false/);
  assert.match(html, /external network false/);
  assert.match(html, /database write false/);
  assert.match(html, /auto-applied false/);
  assert.match(html, /confirmation required true/);
  assert.match(html, /evidence:chat:maya:pilot-timing/);
  assert.match(html, /POST \/api\/chat\/conversations\/demo-conversation-1\/summary/);
  assert.match(html, /GET \/api\/chat\/conversations\/demo-conversation-1\/extractions/);
  assert.match(html, /Browser-submit these probes to collect real envelopes/);
  assert.match(
    html,
    /action="\/api\/chat\/conversations\/demo-conversation-1\/summary" aria-label="Run chat summary success API probe" method="post"><button class="secondary-action" type="submit">Run summary probe/,
  );
  assert.match(
    html,
    /action="\/api\/chat\/conversations\/demo-conversation-1\/summary" aria-label="Run empty chat summary API probe" method="post"><input type="hidden" name="scenario" value="empty"\/><button class="secondary-action" type="submit">Run empty probe/,
  );
  assert.match(
    html,
    /action="\/api\/chat\/conversations\/demo-conversation-1\/extractions" aria-label="Run pending chat extraction API probe" method="get"><input type="hidden" name="scenario" value="pending"\/><button class="secondary-action" type="submit">Run pending probe/,
  );
  assert.match(
    html,
    /action="\/api\/chat\/conversations\/demo-conversation-1\/extractions" aria-label="Run controlled failure chat extraction API probe" method="get"><input type="hidden" name="scenario" value="failure"\/><button class="secondary-action" type="submit">Run controlled failure probe/,
  );

  for (const requiredText of [
    "Live service files",
    "ORBIT_MODULE_MODE",
    "ORBIT_CHAT_SUMMARY_EXTRACTION_PROVIDER",
    "ORBIT_EVENT_DATABASE_URL",
    "ORBIT_WORKSPACE_ID",
    "chat-summary-live-record-provider",
    "live-store-summary",
    "live-store-extraction",
    "automaticProfileMutationExecuted",
    "confirmationRequired",
    "AI",
    "profile mutation",
    "email",
    "calendar",
    "notification",
    "source evidence",
    "provenance",
    "privacy",
    "replacement tests",
  ]) {
    assert.match(liveDoc, new RegExp(requiredText, "i"));
  }
});
