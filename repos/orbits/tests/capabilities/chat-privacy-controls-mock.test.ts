/**
 * Chat 隐私控制 mock 的契约测试。
 *
 * 验证分析开关、私密 note、privacy provenance 和 debug-view 状态。
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
    `${pathFromRoot} must exist for the chat privacy controls mock sprint`,
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

test("chat privacy controls keeps typed contract separate from mock fixture states", async () => {
  const contract = await importProjectModule<{
    CHAT_PRIVACY_CONTROLS_ERROR_CODES: readonly string[];
    CHAT_PRIVACY_CONTROLS_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
  }>("features/chat/privacy-contract.ts");
  const fixtures = await importProjectModule<{
    CHAT_PRIVACY_CONTROLS_FIXTURE_SOURCE: string;
    mockChatPrivacyControlsFixture: {
      state: string;
      conversationId: string;
      analysisOptIn: {
        enabled: true;
        status: string;
        confirmationRequiredToDisable: true;
        aiProviderRequested: false;
      };
      analysisDeletion: {
        status: string;
        productionDataDeletionExecuted: false;
        productionPrivacyAuditLogWritten: false;
      };
      privateNotes: readonly Array<{
        noteId: string;
        visibility: string;
        bodyRedacted: true;
        visibleToAiAnalysis: false;
        visibleInSharePreview: false;
      }>;
      sensitiveShareConfirmation: {
        confirmationRequired: true;
        status: string;
        canShareWithoutConfirmation: false;
        externalActionExecuted: false;
      };
      provenance: {
        source: string;
        privacy: string;
        aiProviderRequested: false;
        externalNetworkRequested: false;
        liveDatabaseReadExecuted: false;
        liveDatabaseWriteExecuted: false;
        productionDataDeletionExecuted: false;
        productionPrivacyAuditLogWritten: false;
        emailProviderRequested: false;
        calendarProviderRequested: false;
        notificationDelivered: false;
        deviceRequested: false;
      };
    };
    mockEmptyChatPrivacyControlsFixture: {
      state: string;
      privateNotes: readonly unknown[];
      nextAction: string;
    };
    mockPendingChatPrivacyControlsFixture: {
      state: string;
      analysisOptIn: { status: string };
      analysisDeletion: { status: string };
      nextAction: string;
    };
    mockChatPrivacyControlsToggleOffFixture: {
      analysisOptIn: { enabled: false; status: string };
    };
    mockChatPrivacyAnalysisDeletedFixture: {
      analysisDeletion: {
        status: string;
        deletedInMock: true;
        productionDataDeletionExecuted: false;
      };
    };
  }>("features/chat/privacy-fixtures.ts");
  const contractSource = readFileSync(
    join(projectRoot, "features/chat/privacy-contract.ts"),
    "utf8",
  );

  assert.match(contractSource, /interface ChatPrivacyControlsService/);
  assert.match(contractSource, /getPrivacyControls/);
  assert.match(contractSource, /setAnalysisOptIn/);
  assert.match(contractSource, /requestAnalysisDeletion/);
  assert.match(contractSource, /prepareSensitiveShare/);
  assert.deepEqual(contract.CHAT_PRIVACY_CONTROLS_ERROR_CODES, [
    "CHAT_PRIVACY_CONVERSATION_ID_REQUIRED",
    "CHAT_PRIVACY_CONVERSATION_NOT_FOUND",
    "CHAT_PRIVACY_TOGGLE_VALUE_REQUIRED",
    "CHAT_PRIVACY_EMPTY",
    "CHAT_PRIVACY_PENDING",
    "CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED",
    "CHAT_PRIVACY_MOCK_FAILED",
    "CHAT_PRIVACY_LIVE_STORE_UNCONFIGURED",
  ]);
  assert.equal(
    contract.CHAT_PRIVACY_CONTROLS_ERROR_DEFINITIONS
      .CHAT_PRIVACY_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.CHAT_PRIVACY_CONTROLS_ERROR_DEFINITIONS
      .CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED.recovery,
    /confirmation/i,
  );
  assert.equal(fixtures.mockChatPrivacyControlsFixture.state, "success");
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.provenance.source,
    fixtures.CHAT_PRIVACY_CONTROLS_FIXTURE_SOURCE,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.analysisOptIn.enabled,
    true,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.analysisOptIn.status,
    "opted_in",
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.analysisOptIn
      .confirmationRequiredToDisable,
    true,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.analysisOptIn.aiProviderRequested,
    false,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.analysisDeletion.status,
    "available",
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.analysisDeletion
      .productionDataDeletionExecuted,
    false,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.analysisDeletion
      .productionPrivacyAuditLogWritten,
    false,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.privateNotes[0].visibility,
    "hidden",
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.privateNotes[0].bodyRedacted,
    true,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.privateNotes[0]
      .visibleToAiAnalysis,
    false,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.privateNotes[0]
      .visibleInSharePreview,
    false,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.sensitiveShareConfirmation
      .confirmationRequired,
    true,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.sensitiveShareConfirmation
      .canShareWithoutConfirmation,
    false,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.sensitiveShareConfirmation
      .externalActionExecuted,
    false,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.provenance.externalNetworkRequested,
    false,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.provenance
      .productionDataDeletionExecuted,
    false,
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsFixture.provenance
      .productionPrivacyAuditLogWritten,
    false,
  );
  assert.equal(fixtures.mockEmptyChatPrivacyControlsFixture.state, "empty");
  assert.equal(fixtures.mockEmptyChatPrivacyControlsFixture.privateNotes.length, 0);
  assert.match(
    fixtures.mockEmptyChatPrivacyControlsFixture.nextAction,
    /source-backed chat conversation/i,
  );
  assert.equal(fixtures.mockPendingChatPrivacyControlsFixture.state, "pending");
  assert.equal(
    fixtures.mockPendingChatPrivacyControlsFixture.analysisOptIn.status,
    "pending_confirmation",
  );
  assert.equal(
    fixtures.mockPendingChatPrivacyControlsFixture.analysisDeletion.status,
    "pending",
  );
  assert.equal(
    fixtures.mockChatPrivacyControlsToggleOffFixture.analysisOptIn.enabled,
    false,
  );
  assert.equal(
    fixtures.mockChatPrivacyAnalysisDeletedFixture.analysisDeletion
      .deletedInMock,
    true,
  );
});

test("mock chat privacy controls service is deterministic and never calls live providers", async () => {
  const serviceModule = await importProjectModule<{
    createMockChatPrivacyControlsService: () => {
      getPrivacyControls: (input?: {
        conversationId?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          analysisOptIn: { enabled: boolean; status: string };
          privateNotes: readonly Array<{ bodyRedacted: true }>;
          provenance: {
            aiProviderRequested: false;
            externalNetworkRequested: false;
            productionDataDeletionExecuted: false;
            productionPrivacyAuditLogWritten: false;
          };
        };
        error?: { code: string; appCode: string };
      };
      setAnalysisOptIn: (input: {
        conversationId?: string | null;
        enabled?: boolean | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: {
          analysisOptIn: { enabled: boolean; status: string };
          provenance: { aiProviderRequested: false };
        };
        error?: { code: string; appCode: string };
      };
      requestAnalysisDeletion: (input?: {
        conversationId?: string | null;
      }) => {
        success: boolean;
        data?: {
          analysisDeletion: {
            status: string;
            deletedInMock: true;
            productionDataDeletionExecuted: false;
          };
        };
      };
      prepareSensitiveShare: (input: {
        conversationId?: string | null;
        confirmed?: boolean | null;
      }) => {
        success: boolean;
        data?: {
          sensitiveShareConfirmation: {
            status: string;
            confirmationRequired: boolean;
            externalActionExecuted: false;
          };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/chat/mock-privacy-service.ts");
  const service = serviceModule.createMockChatPrivacyControlsService();
  const success = service.getPrivacyControls();
  const empty = service.getPrivacyControls({ scenario: "empty" });
  const pending = service.getPrivacyControls({ scenario: "pending" });
  const failure = service.getPrivacyControls({ scenario: "failure" });
  const toggleOff = service.setAnalysisOptIn({ enabled: false });
  const toggleOn = service.setAnalysisOptIn({ enabled: true });
  const missingToggleValue = service.setAnalysisOptIn({});
  const deleted = service.requestAnalysisDeletion();
  const blockedShare = service.prepareSensitiveShare({ confirmed: false });
  const confirmedShare = service.prepareSensitiveShare({ confirmed: true });
  const missingConversation = service.getPrivacyControls({
    conversationId: "missing-conversation",
  });

  assert.deepEqual(service.getPrivacyControls(), service.getPrivacyControls());
  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.analysisOptIn.enabled, true);
  assert.equal(success.data?.analysisOptIn.status, "opted_in");
  assert.equal(success.data?.privateNotes[0].bodyRedacted, true);
  assert.equal(success.data?.provenance.aiProviderRequested, false);
  assert.equal(success.data?.provenance.externalNetworkRequested, false);
  assert.equal(
    success.data?.provenance.productionDataDeletionExecuted,
    false,
  );
  assert.equal(
    success.data?.provenance.productionPrivacyAuditLogWritten,
    false,
  );
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.privateNotes.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(pending.data?.analysisOptIn.status, "pending_confirmation");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "CHAT_PRIVACY_MOCK_FAILED");
  assert.equal(toggleOff.success, true);
  assert.equal(toggleOff.data?.analysisOptIn.enabled, false);
  assert.equal(toggleOff.data?.analysisOptIn.status, "opted_out");
  assert.equal(toggleOn.success, true);
  assert.equal(toggleOn.data?.analysisOptIn.enabled, true);
  assert.equal(missingToggleValue.success, false);
  assert.equal(
    missingToggleValue.error?.code,
    "CHAT_PRIVACY_TOGGLE_VALUE_REQUIRED",
  );
  assert.equal(deleted.success, true);
  assert.equal(deleted.data?.analysisDeletion.deletedInMock, true);
  assert.equal(
    deleted.data?.analysisDeletion.productionDataDeletionExecuted,
    false,
  );
  assert.equal(blockedShare.success, false);
  assert.equal(
    blockedShare.error?.code,
    "CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED",
  );
  assert.equal(confirmedShare.success, true);
  assert.equal(
    confirmedShare.data?.sensitiveShareConfirmation.status,
    "confirmed_mock_only",
  );
  assert.equal(
    confirmedShare.data?.sensitiveShareConfirmation.externalActionExecuted,
    false,
  );
  assert.equal(missingConversation.success, false);
  assert.equal(
    missingConversation.error?.code,
    "CHAT_PRIVACY_CONVERSATION_NOT_FOUND",
  );

  for (const filePath of [
    "features/chat/privacy-contract.ts",
    "features/chat/privacy-fixtures.ts",
    "features/chat/mock-privacy-service.ts",
    "features/chat/chat-privacy-controls-mock/debug-view.tsx",
    "app/api/chat/privacy/route.ts",
    "app/api/chat/privacy/analysis-toggle/route.ts",
  ]) {
    assertNoLiveProviderCalls(filePath);
  }
});

test("chat privacy controls API routes return stable envelopes with empty and failure paths", async () => {
  const privacyRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/chat/privacy/route.ts");
  const toggleRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/chat/privacy/analysis-toggle/route.ts");
  const fixtures = await importProjectModule<{
    mockEmptyChatPrivacyControlsFixture: unknown;
  }>("features/chat/privacy-fixtures.ts");

  const privacyResponse = await privacyRoute.GET(
    new Request("https://orbit.local/api/chat/privacy"),
  );
  const toggleResponse = await toggleRoute.POST(
    new Request("https://orbit.local/api/chat/privacy/analysis-toggle", {
      method: "POST",
      body: JSON.stringify({ enabled: false }),
      headers: { "content-type": "application/json" },
    }),
  );
  const declaredToggleProbeResponse = await toggleRoute.POST(
    new Request("https://orbit.local/api/chat/privacy/analysis-toggle", {
      method: "POST",
    }),
  );
  const emptyResponse = await privacyRoute.GET(
    new Request("https://orbit.local/api/chat/privacy?scenario=empty"),
  );
  const failureResponse = await privacyRoute.GET(
    new Request("https://orbit.local/api/chat/privacy?scenario=failure"),
  );

  assert.equal(privacyResponse.status, 200);
  assert.equal(privacyResponse.headers.get("cache-control"), "no-store");
  assert.equal(privacyResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.equal(toggleResponse.status, 200);
  assert.equal(declaredToggleProbeResponse.status, 200);

  const privacyEnvelope = (await privacyResponse.json()) as {
    success: true;
    data: {
      state: string;
      conversationId: string;
      analysisOptIn: { enabled: true; status: string };
      analysisDeletion: {
        status: string;
        productionDataDeletionExecuted: false;
      };
      privateNotes: readonly Array<{
        visibility: string;
        visibleToAiAnalysis: false;
      }>;
      sensitiveShareConfirmation: {
        confirmationRequired: true;
        canShareWithoutConfirmation: false;
      };
      provenance: {
        aiProviderRequested: false;
        externalNetworkRequested: false;
        productionPrivacyAuditLogWritten: false;
      };
    };
  };
  const toggleEnvelope = (await toggleResponse.json()) as {
    success: true;
    data: {
      analysisOptIn: { enabled: false; status: string };
      provenance: {
        aiProviderRequested: false;
        liveDatabaseWriteExecuted: false;
      };
    };
  };
  const declaredToggleProbeEnvelope =
    (await declaredToggleProbeResponse.json()) as {
      success: true;
      data: {
        analysisOptIn: { enabled: false; status: string };
        provenance: {
          aiProviderRequested: false;
          liveDatabaseWriteExecuted: false;
        };
      };
    };

  assert.equal(privacyEnvelope.success, true);
  assert.equal(privacyEnvelope.data.state, "success");
  assert.equal(
    privacyEnvelope.data.conversationId,
    "demo-conversation-privacy-1",
  );
  assert.equal(privacyEnvelope.data.analysisOptIn.enabled, true);
  assert.equal(privacyEnvelope.data.analysisOptIn.status, "opted_in");
  assert.equal(privacyEnvelope.data.analysisDeletion.status, "available");
  assert.equal(
    privacyEnvelope.data.analysisDeletion.productionDataDeletionExecuted,
    false,
  );
  assert.equal(privacyEnvelope.data.privateNotes[0].visibility, "hidden");
  assert.equal(
    privacyEnvelope.data.privateNotes[0].visibleToAiAnalysis,
    false,
  );
  assert.equal(
    privacyEnvelope.data.sensitiveShareConfirmation.confirmationRequired,
    true,
  );
  assert.equal(
    privacyEnvelope.data.sensitiveShareConfirmation.canShareWithoutConfirmation,
    false,
  );
  assert.equal(privacyEnvelope.data.provenance.aiProviderRequested, false);
  assert.equal(privacyEnvelope.data.provenance.externalNetworkRequested, false);
  assert.equal(
    privacyEnvelope.data.provenance.productionPrivacyAuditLogWritten,
    false,
  );
  assert.equal(toggleEnvelope.success, true);
  assert.equal(toggleEnvelope.data.analysisOptIn.enabled, false);
  assert.equal(toggleEnvelope.data.analysisOptIn.status, "opted_out");
  assert.equal(toggleEnvelope.data.provenance.aiProviderRequested, false);
  assert.equal(toggleEnvelope.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(declaredToggleProbeEnvelope.success, true);
  assert.equal(declaredToggleProbeEnvelope.data.analysisOptIn.enabled, false);
  assert.equal(
    declaredToggleProbeEnvelope.data.analysisOptIn.status,
    "opted_out",
  );
  assert.equal(
    declaredToggleProbeEnvelope.data.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    declaredToggleProbeEnvelope.data.provenance.liveDatabaseWriteExecuted,
    false,
  );
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyChatPrivacyControlsFixture,
  });
  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The chat privacy controls mock boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        chatPrivacyControlsErrorCode: "CHAT_PRIVACY_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance: "Controlled chat privacy controls mock failure",
        service: "chat-privacy-controls",
      },
    },
  });
});

test("chat privacy controls debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    CHAT_PRIVACY_CONTROLS_MOCK_SLUG: string;
    CHAT_PRIVACY_CONTROLS_API_PROBES: readonly Array<{
      label: string;
      method: "GET" | "POST";
      path: string;
      expectedStatus: number;
    }>;
    ChatPrivacyControlsMockDemo: () => React.ReactElement;
  }>("features/chat/chat-privacy-controls-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ChatPrivacyControlsMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/chat/chat-privacy-controls-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.CHAT_PRIVACY_CONTROLS_MOCK_SLUG,
    "chat-privacy-controls-mock",
  );
  assert.deepEqual(
    debugView.CHAT_PRIVACY_CONTROLS_API_PROBES.map((probe) => [
      probe.method,
      probe.path,
      probe.expectedStatus,
    ]),
    [
      ["GET", "/api/chat/privacy", 200],
      ["POST", "/api/chat/privacy/analysis-toggle", 200],
      ["GET", "/api/chat/privacy?scenario=empty", 200],
      ["GET", "/api/chat/privacy?scenario=pending", 200],
      ["GET", "/api/chat/privacy?scenario=failure", 503],
    ],
  );
  assert.match(pageSource, /CHAT_PRIVACY_CONTROLS_MOCK_SLUG/);
  assert.match(pageSource, /ChatPrivacyControlsMockDemo/);

  assert.match(html, /Chat privacy controls mock/);
  assert.match(
    html,
    /aria-label="Chat privacy controls operator checkpoint"/,
  );
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Maya Chen/);
  assert.match(html, /AI analysis opt-in/);
  assert.match(html, /opted_in/);
  assert.match(html, /Delete-analysis state/);
  assert.match(html, /production deletion false/);
  assert.match(html, /Private notes hidden/);
  assert.match(html, /body redacted true/);
  assert.match(html, /visible to AI analysis false/);
  assert.match(html, /Sensitive share confirmation/);
  assert.match(html, /confirmation required true/);
  assert.match(
    html,
    /aria-label="Chat privacy controls state matrix"/,
  );
  assert.match(html, /Success probe: GET \/api\/chat\/privacy/);
  assert.match(html, /Success: opted in with hidden private notes/);
  assert.match(html, /Empty probe: GET \/api\/chat\/privacy\?scenario=empty/);
  assert.match(html, /Empty: no source-backed chat conversation/);
  assert.match(html, /Pending probe: GET \/api\/chat\/privacy\?scenario=pending/);
  assert.match(html, /Pending: local privacy confirmation/);
  assert.match(html, /Failure probe: GET \/api\/chat\/privacy\?scenario=failure/);
  assert.match(html, /Failure: controlled error/);
  assert.match(html, /CHAT_PRIVACY_MOCK_FAILED/);
  assert.match(html, /AI provider false/);
  assert.match(html, /external network false/);
  assert.match(html, /database write false/);
  assert.match(html, /privacy audit log false/);
  assert.match(html, /evidence:chat-privacy:maya:analysis-opt-in/);
  assert.match(html, /GET \/api\/chat\/privacy/);
  assert.match(html, /POST \/api\/chat\/privacy\/analysis-toggle/);
  assert.match(
    html,
    /Browser-submit these probes to collect real envelopes/,
  );
  assert.match(
    html,
    /action="\/api\/chat\/privacy" aria-label="Run chat privacy success API probe" method="get"><button class="secondary-action" type="submit">Run privacy probe/,
  );
  assert.match(
    html,
    /action="\/api\/chat\/privacy\/analysis-toggle" aria-label="Run chat analysis opt-in toggle API probe" method="post"><input type="hidden" name="enabled" value="false"\/><button class="secondary-action" type="submit">Run toggle probe/,
  );
  assert.match(
    html,
    /action="\/api\/chat\/privacy" aria-label="Run empty chat privacy API probe" method="get"><input type="hidden" name="scenario" value="empty"\/><button class="secondary-action" type="submit">Run empty probe/,
  );

  for (const requiredText of [
    "Live service files",
    "ORBIT_MODULE_MODE",
    "mock",
    "live",
    "ORBIT_EVENT_DATABASE_URL",
    "ORBIT_WORKSPACE_ID",
    "analysis opt-in",
    "deletion preview",
    "privacy audit log",
    "private notes",
    "redaction",
    "confirmation guard",
    "AI provider",
    "external share",
    "source evidence",
    "provenance",
    "privacy",
    "replacement tests",
  ]) {
    assert.match(liveDoc, new RegExp(requiredText, "i"));
  }
});
