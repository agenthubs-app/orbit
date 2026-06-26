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
    `${pathFromRoot} must exist for the chat writing assist mock sprint`,
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

test("chat writing assist contract exports typed fixtures errors and mock-only provenance", async () => {
  const contract = await importProjectModule<{
    CHAT_WRITING_ASSIST_FIXTURE_SOURCE: string;
    CHAT_WRITING_ASSIST_KINDS: readonly string[];
    CHAT_WRITING_ASSIST_ERROR_CODES: readonly string[];
    CHAT_WRITING_ASSIST_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    mockChatWritingAssistFixture: {
      state: string;
      assists: readonly Array<{
        assistId: string;
        kind: string;
        label: string;
        suggestedText: string;
        evidenceIds: readonly string[];
        generatedBy: string;
        audit: {
          sourceLabel: string;
          providerBoundary: string;
          verificationAction: string;
        };
        sendActionRequiresConfirmation: true;
        aiProviderRequested: false;
        externalSendRequested: false;
        externalNetworkRequested: false;
        emailProviderRequested: false;
        calendarProviderRequested: false;
        notificationDelivered: false;
        liveDatabaseWriteExecuted: false;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        aiProviderRequested: false;
        externalSendRequested: false;
        externalNetworkRequested: false;
        emailProviderRequested: false;
        calendarProviderRequested: false;
        notificationDelivered: false;
        liveDatabaseReadExecuted: false;
        liveDatabaseWriteExecuted: false;
        deviceRequested: false;
      };
    };
    mockEmptyChatWritingAssistFixture: {
      state: string;
      assists: readonly unknown[];
      nextAction: string;
    };
    mockPendingChatWritingAssistFixture: {
      state: string;
      assists: readonly unknown[];
      nextAction: string;
    };
  }>("features/chat/assist-contract.ts");
  const contractSource = readFileSync(
    join(projectRoot, "features/chat/assist-contract.ts"),
    "utf8",
  );

  assert.match(contractSource, /interface ChatWritingAssistService/);
  assert.match(contractSource, /rewritePolitely/);
  assert.match(contractSource, /draftFollowup/);
  assert.match(contractSource, /suggestAppointment/);
  assert.match(contractSource, /createQuickGreeting/);
  assert.deepEqual(contract.CHAT_WRITING_ASSIST_KINDS, [
    "polite_rewrite",
    "follow_up_draft",
    "appointment_suggestion",
    "quick_greeting",
  ]);
  assert.deepEqual(contract.CHAT_WRITING_ASSIST_ERROR_CODES, [
    "CHAT_WRITING_ASSIST_INPUT_REQUIRED",
    "CHAT_WRITING_ASSIST_EMPTY",
    "CHAT_WRITING_ASSIST_PENDING",
    "CHAT_WRITING_ASSIST_MOCK_FAILED",
  ]);
  assert.equal(
    contract.CHAT_WRITING_ASSIST_ERROR_DEFINITIONS
      .CHAT_WRITING_ASSIST_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.CHAT_WRITING_ASSIST_ERROR_DEFINITIONS.CHAT_WRITING_ASSIST_EMPTY
      .recovery,
    /relationship context|chat evidence|source/i,
  );

  assert.equal(contract.mockChatWritingAssistFixture.state, "success");
  assert.equal(
    contract.mockChatWritingAssistFixture.provenance.source,
    contract.CHAT_WRITING_ASSIST_FIXTURE_SOURCE,
  );
  assert.deepEqual(
    contract.mockChatWritingAssistFixture.assists.map((assist) => assist.kind),
    [
      "polite_rewrite",
      "follow_up_draft",
      "appointment_suggestion",
      "quick_greeting",
    ],
  );
  assert.equal(
    contract.mockChatWritingAssistFixture.assists[0].generatedBy,
    "mock-chat-writing-assist-rules",
  );
  assert.deepEqual(contract.mockChatWritingAssistFixture.assists[0].audit, {
    sourceLabel: "Maya pilot timing chat evidence",
    providerBoundary: "AI false, external send false, persistence false",
    verificationAction: "Review Maya pilot timing chat evidence",
  });
  assert.equal(
    contract.mockChatWritingAssistFixture.assists[0]
      .sendActionRequiresConfirmation,
    true,
  );
  assert.equal(
    contract.mockChatWritingAssistFixture.assists[0].aiProviderRequested,
    false,
  );
  assert.equal(
    contract.mockChatWritingAssistFixture.assists[0].externalSendRequested,
    false,
  );
  assert.equal(
    contract.mockChatWritingAssistFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    contract.mockChatWritingAssistFixture.provenance.externalNetworkRequested,
    false,
  );
  assert.equal(contract.mockEmptyChatWritingAssistFixture.state, "empty");
  assert.match(
    contract.mockEmptyChatWritingAssistFixture.nextAction,
    /relationship context|chat evidence|source/i,
  );
  assert.equal(contract.mockPendingChatWritingAssistFixture.state, "pending");
});

test("mock chat writing assist service is deterministic and never calls live providers", async () => {
  const serviceModule = await importProjectModule<{
    createMockChatWritingAssistService: () => {
      rewritePolitely: (input?: {
        scenario?: string | null;
        sourceText?: string | null;
        participantName?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          assists: readonly Array<{
            kind: string;
            originalText: string;
            suggestedText: string;
            aiProviderRequested: false;
            externalSendRequested: false;
          }>;
        };
        error?: { code: string; appCode: string };
      };
      draftFollowup: (input?: {
        scenario?: string | null;
        contextNote?: string | null;
        participantName?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          assists: readonly Array<{
            kind: string;
            suggestedText: string;
            externalNetworkRequested: false;
          }>;
        };
        error?: { code: string; appCode: string };
      };
      suggestAppointment: (input?: {
        preferredWindow?: string | null;
        participantName?: string | null;
      }) => {
        success: boolean;
        data?: {
          assists: readonly Array<{ kind: string; suggestedText: string }>;
        };
      };
      createQuickGreeting: (input?: {
        participantName?: string | null;
        organization?: string | null;
      }) => {
        success: boolean;
        data?: {
          assists: readonly Array<{ kind: string; suggestedText: string }>;
        };
      };
    };
  }>("features/chat/mock-assist-service.ts");
  const service = serviceModule.createMockChatWritingAssistService();
  const rewriteInput = {
    participantName: "Maya Chen",
    sourceText: "send me the pilot timing thing",
  };
  const rewrite = service.rewritePolitely(rewriteInput);
  const followup = service.draftFollowup({
    contextNote: "Maya asked for the pilot timing comparison after breakfast.",
    participantName: "Maya Chen",
  });
  const appointment = service.suggestAppointment({
    participantName: "Maya Chen",
    preferredWindow: "Tuesday afternoon",
  });
  const greeting = service.createQuickGreeting({
    organization: "Kumo Grid",
    participantName: "Maya Chen",
  });
  const empty = service.draftFollowup({ scenario: "empty" });
  const pending = service.rewritePolitely({ scenario: "pending" });
  const failure = service.rewritePolitely({ scenario: "failure" });
  const missing = service.rewritePolitely({ sourceText: "" });

  assert.deepEqual(
    service.rewritePolitely(rewriteInput),
    service.rewritePolitely(rewriteInput),
  );
  assert.equal(rewrite.success, true);
  assert.equal(rewrite.data?.state, "success");
  assert.deepEqual(
    rewrite.data?.assists.map((assist) => assist.kind),
    ["polite_rewrite"],
  );
  assert.equal(rewrite.data?.assists[0].originalText, rewriteInput.sourceText);
  assert.match(rewrite.data?.assists[0].suggestedText ?? "", /Maya Chen/);
  assert.match(rewrite.data?.assists[0].suggestedText ?? "", /pilot timing/);
  assert.equal(rewrite.data?.assists[0].aiProviderRequested, false);
  assert.equal(rewrite.data?.assists[0].externalSendRequested, false);
  assert.equal(followup.success, true);
  assert.deepEqual(
    followup.data?.assists.map((assist) => assist.kind),
    ["follow_up_draft"],
  );
  assert.match(followup.data?.assists[0].suggestedText ?? "", /breakfast/);
  assert.equal(
    followup.data?.assists[0].externalNetworkRequested,
    false,
  );
  assert.equal(appointment.success, true);
  assert.match(
    appointment.data?.assists[0].suggestedText ?? "",
    /Tuesday afternoon/,
  );
  assert.equal(greeting.success, true);
  assert.match(greeting.data?.assists[0].suggestedText ?? "", /Kumo Grid/);
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.assists.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "CHAT_WRITING_ASSIST_MOCK_FAILED");
  assert.equal(missing.success, false);
  assert.equal(missing.error?.code, "CHAT_WRITING_ASSIST_INPUT_REQUIRED");

  for (const filePath of [
    "features/chat/assist-contract.ts",
    "features/chat/mock-assist-service.ts",
    "features/chat/chat-writing-assist-mock/debug-view.tsx",
    "app/api/chat/assist/rewrite/route.ts",
    "app/api/chat/assist/followup-draft/route.ts",
  ]) {
    assertNoLiveProviderCalls(filePath);
  }
});

test("chat writing assist API routes return stable envelopes with empty and failure paths", async () => {
  const rewriteRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/chat/assist/rewrite/route.ts");
  const followupRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/chat/assist/followup-draft/route.ts");
  const contract = await importProjectModule<{
    mockEmptyChatWritingAssistFixture: unknown;
  }>("features/chat/assist-contract.ts");

  const rewriteResponse = await rewriteRoute.POST(
    new Request("https://orbit.local/api/chat/assist/rewrite", {
      body: JSON.stringify({
        participantName: "Maya Chen",
        sourceText: "send me the pilot timing thing",
      }),
      method: "POST",
    }),
  );
  const followupResponse = await followupRoute.POST(
    new Request("https://orbit.local/api/chat/assist/followup-draft", {
      body: JSON.stringify({
        contextNote:
          "Maya asked for the pilot timing comparison after breakfast.",
        participantName: "Maya Chen",
      }),
      method: "POST",
    }),
  );
  const emptyResponse = await followupRoute.POST(
    new Request(
      "https://orbit.local/api/chat/assist/followup-draft?scenario=empty",
      {
        body: JSON.stringify({ participantName: "Maya Chen" }),
        method: "POST",
      },
    ),
  );
  const failureResponse = await rewriteRoute.POST(
    new Request("https://orbit.local/api/chat/assist/rewrite?scenario=failure", {
      body: JSON.stringify({ sourceText: "hello" }),
      method: "POST",
    }),
  );

  assert.equal(rewriteResponse.status, 200);
  assert.equal(rewriteResponse.headers.get("cache-control"), "no-store");
  assert.equal(rewriteResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.equal(followupResponse.status, 200);
  assert.equal(followupResponse.headers.get("cache-control"), "no-store");

  const rewriteEnvelope = (await rewriteResponse.json()) as {
    success: true;
    data: {
      state: string;
      assists: readonly Array<{
        kind: string;
        originalText: string;
        suggestedText: string;
        aiProviderRequested: false;
        externalSendRequested: false;
      }>;
      provenance: {
        aiProviderRequested: false;
        externalNetworkRequested: false;
      };
    };
  };
  const followupEnvelope = (await followupResponse.json()) as {
    success: true;
    data: {
      state: string;
      assists: readonly Array<{
        kind: string;
        suggestedText: string;
        externalSendRequested: false;
      }>;
    };
  };

  assert.equal(rewriteEnvelope.success, true);
  assert.equal(rewriteEnvelope.data.state, "success");
  assert.deepEqual(
    rewriteEnvelope.data.assists.map((assist) => assist.kind),
    ["polite_rewrite"],
  );
  assert.equal(
    rewriteEnvelope.data.assists[0].originalText,
    "send me the pilot timing thing",
  );
  assert.match(rewriteEnvelope.data.assists[0].suggestedText, /pilot timing/);
  assert.equal(rewriteEnvelope.data.assists[0].aiProviderRequested, false);
  assert.equal(rewriteEnvelope.data.assists[0].externalSendRequested, false);
  assert.equal(rewriteEnvelope.data.provenance.aiProviderRequested, false);
  assert.equal(rewriteEnvelope.data.provenance.externalNetworkRequested, false);
  assert.equal(followupEnvelope.success, true);
  assert.equal(followupEnvelope.data.state, "success");
  assert.deepEqual(
    followupEnvelope.data.assists.map((assist) => assist.kind),
    ["follow_up_draft"],
  );
  assert.match(followupEnvelope.data.assists[0].suggestedText, /breakfast/);
  assert.equal(followupEnvelope.data.assists[0].externalSendRequested, false);
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: contract.mockEmptyChatWritingAssistFixture,
  });
  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The chat writing assist mock boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        chatWritingAssistErrorCode: "CHAT_WRITING_ASSIST_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock chat writing assist failure came from deterministic fixture rules.",
        service: "chat-writing-assist-mock",
      },
    },
  });
});

test("chat writing assist debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    CHAT_WRITING_ASSIST_MOCK_SLUG: string;
    CHAT_WRITING_ASSIST_API_PROBES: readonly Array<{
      label: string;
      method: "POST";
      path: string;
      expectedStatus: number;
    }>;
    ChatWritingAssistMockDemo: () => React.ReactElement;
  }>("features/chat/chat-writing-assist-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ChatWritingAssistMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/chat/chat-writing-assist-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.CHAT_WRITING_ASSIST_MOCK_SLUG,
    "chat-writing-assist-mock",
  );
  assert.deepEqual(
    debugView.CHAT_WRITING_ASSIST_API_PROBES.map((probe) => [
      probe.method,
      probe.path,
      probe.expectedStatus,
    ]),
    [
      ["POST", "/api/chat/assist/rewrite", 200],
      ["POST", "/api/chat/assist/followup-draft", 200],
      ["POST", "/api/chat/assist/followup-draft?scenario=empty", 200],
      ["POST", "/api/chat/assist/rewrite?scenario=pending", 200],
      ["POST", "/api/chat/assist/rewrite?scenario=failure", 503],
    ],
  );
  assert.match(pageSource, /CHAT_WRITING_ASSIST_MOCK_SLUG/);
  assert.match(pageSource, /ChatWritingAssistMockDemo/);

  assert.match(html, /Chat writing assist mock/);
  assert.match(html, /aria-label="Chat writing assist operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Four chat assists/);
  assert.match(
    html,
    /Local rules prepared polite rewrite, follow-up draft, appointment suggestion, and quick greeting assists/,
  );
  assert.match(html, /aria-label="Chat writing assist state matrix"/);
  assert.match(html, /Success probe: POST \/api\/chat\/assist\/rewrite/);
  assert.match(html, /Success: 4 chat assists/);
  assert.match(
    html,
    /Empty probe: POST \/api\/chat\/assist\/followup-draft\?scenario=empty/,
  );
  assert.match(html, /Empty: no source-backed chat context/);
  assert.match(
    html,
    /Pending probe: POST \/api\/chat\/assist\/rewrite\?scenario=pending/,
  );
  assert.match(html, /Pending: local writing guard/);
  assert.match(
    html,
    /Failure probe: POST \/api\/chat\/assist\/rewrite\?scenario=failure/,
  );
  assert.match(html, /Failure: controlled error/);
  assert.match(html, /Polite rewrite/);
  assert.match(html, /Follow-up draft/);
  assert.match(html, /Appointment suggestion/);
  assert.match(html, /Quick greeting/);
  assert.match(html, /aria-label="Audit chat assist demo-chat-assist-rewrite"/);
  assert.match(html, /Review Maya pilot timing chat evidence/);
  assert.match(html, /Review Diego case study chat evidence/);
  assert.match(html, /Source: Maya pilot timing chat evidence/);
  assert.match(html, /Provider boundary: AI false, external send false, persistence false/);
  assert.match(html, /evidence:chat-assist:rewrite/);
  assert.match(html, /AI provider false/);
  assert.match(html, /external send false/);
  assert.match(html, /database write false/);
  assert.match(html, /CHAT_WRITING_ASSIST_MOCK_FAILED/);
  assert.match(html, /POST \/api\/chat\/assist\/rewrite/);
  assert.match(html, /POST \/api\/chat\/assist\/followup-draft/);

  for (const requiredText of [
    "Live service files",
    "ORBIT_CHAT_WRITING_ASSIST_PROVIDER",
    "AI writing provider",
    "email",
    "calendar",
    "notification",
    "external send",
    "source evidence",
    "provenance",
    "privacy",
    "replacement tests",
  ]) {
    assert.match(liveDoc, new RegExp(requiredText, "i"));
  }
});
