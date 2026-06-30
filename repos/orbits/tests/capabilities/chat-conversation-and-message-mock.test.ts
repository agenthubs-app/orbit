/**
 * Chat 会话与消息 mock 的契约测试。
 *
 * 覆盖会话列表、线程、发送状态和 debug-view 的基础聊天数据边界。
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
    `${pathFromRoot} must exist for the chat conversation and message mock sprint`,
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

test("chat contract exports typed fixtures errors and mock-only provenance", async () => {
  const contract = await importProjectModule<{
    CHAT_CONVERSATION_MOCK_ERROR_CODES: readonly string[];
    CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    CHAT_CONVERSATION_MOCK_FIXTURE_SOURCE: string;
    CHAT_CONVERSATION_STATUSES: readonly string[];
    SEND_MESSAGE_STATUSES: readonly string[];
  }>("features/chat/contract.ts");
  const fixtures = await importProjectModule<{
    mockChatConversationListFixture: {
      state: string;
      conversations: readonly Array<{
        conversationId: string;
        participantName: string;
        oneToOneContext: {
          contactId: string;
          relationshipStage: string;
          evidenceIds: readonly string[];
        };
        realtimeTransportRequested: false;
        websocketSubscriptionRequested: false;
        productionMessageStorageRequested: false;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        realtimeTransportRequested: false;
        websocketSubscriptionRequested: false;
        productionMessageStorageRequested: false;
        externalNetworkRequested: false;
        liveDatabaseReadExecuted: false;
        liveDatabaseWriteExecuted: false;
        aiProviderRequested: false;
        emailProviderRequested: false;
        calendarProviderRequested: false;
        notificationDelivered: false;
        deviceRequested: false;
      };
    };
    mockChatThreadFixture: {
      state: string;
      conversation: {
        conversationId: string;
        participantName: string;
      };
      messages: readonly Array<{
        messageId: string;
        body: string;
        evidenceIds: readonly string[];
        source: { label: string };
      }>;
      sendMessageState: {
        status: string;
        confirmationRequiredBeforeLiveSend: true;
        externalSendRequested: false;
        productionMessageStorageRequested: false;
      };
      oneToOneContext: {
        participantName: string;
        latestContext: string;
      };
    };
    mockEmptyChatConversationFixture: {
      state: string;
      conversations: readonly unknown[];
      nextAction: string;
    };
    mockPendingChatConversationFixture: {
      state: string;
      conversations: readonly unknown[];
      nextAction: string;
    };
  }>("features/chat/fixtures.ts");
  const contractSource = readFileSync(
    join(projectRoot, "features/chat/contract.ts"),
    "utf8",
  );
  const serviceSource = readFileSync(
    join(projectRoot, "features/chat/service.ts"),
    "utf8",
  );

  assert.match(contractSource, /interface ChatConversationMessageService/);
  assert.match(serviceSource, /interface ChatConversationMessageService/);
  assert.match(serviceSource, /listConversations/);
  assert.match(serviceSource, /getMessageThread/);
  assert.match(serviceSource, /sendMessage/);
  assert.deepEqual(contract.CHAT_CONVERSATION_STATUSES, [
    "active",
    "paused",
    "needs_followup",
  ]);
  assert.deepEqual(contract.SEND_MESSAGE_STATUSES, [
    "ready",
    "pending_confirmation",
    "blocked",
  ]);
  assert.deepEqual(contract.CHAT_CONVERSATION_MOCK_ERROR_CODES, [
    "CHAT_CONVERSATION_ID_REQUIRED",
    "CHAT_CONVERSATION_NOT_FOUND",
    "CHAT_MESSAGE_BODY_REQUIRED",
    "CHAT_CONVERSATION_EMPTY",
    "CHAT_CONVERSATION_PENDING",
    "CHAT_CONVERSATION_MOCK_FAILED",
  ]);
  assert.equal(
    contract.CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS
      .CHAT_CONVERSATION_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS
      .CHAT_CONVERSATION_EMPTY.recovery,
    /one-to-one relationship context|source evidence/i,
  );

  assert.equal(fixtures.mockChatConversationListFixture.state, "success");
  assert.equal(
    fixtures.mockChatConversationListFixture.provenance.source,
    contract.CHAT_CONVERSATION_MOCK_FIXTURE_SOURCE,
  );
  assert.deepEqual(
    fixtures.mockChatConversationListFixture.conversations.map(
      (conversation) => conversation.participantName,
    ),
    ["Maya Chen", "Diego Rivera"],
  );
  assert.equal(
    fixtures.mockChatConversationListFixture.conversations[0]
      .oneToOneContext.relationshipStage,
    "active_collaboration",
  );
  assert.deepEqual(
    fixtures.mockChatConversationListFixture.conversations[0].oneToOneContext
      .evidenceIds,
    ["evidence:chat:maya:breakfast", "evidence:chat:maya:pilot-timing"],
  );
  assert.equal(
    fixtures.mockChatConversationListFixture.conversations[0]
      .realtimeTransportRequested,
    false,
  );
  assert.equal(
    fixtures.mockChatConversationListFixture.conversations[0]
      .websocketSubscriptionRequested,
    false,
  );
  assert.equal(
    fixtures.mockChatConversationListFixture.conversations[0]
      .productionMessageStorageRequested,
    false,
  );
  assert.equal(
    fixtures.mockChatConversationListFixture.provenance
      .externalNetworkRequested,
    false,
  );
  assert.equal(
    fixtures.mockChatConversationListFixture.provenance.liveDatabaseReadExecuted,
    false,
  );
  assert.equal(
    fixtures.mockChatConversationListFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(fixtures.mockChatThreadFixture.state, "success");
  assert.equal(
    fixtures.mockChatThreadFixture.conversation.conversationId,
    "demo-conversation-1",
  );
  assert.match(
    fixtures.mockChatThreadFixture.oneToOneContext.latestContext,
    /pilot timing/i,
  );
  assert.equal(
    fixtures.mockChatThreadFixture.sendMessageState
      .confirmationRequiredBeforeLiveSend,
    true,
  );
  assert.equal(
    fixtures.mockChatThreadFixture.sendMessageState.externalSendRequested,
    false,
  );
  assert.equal(fixtures.mockEmptyChatConversationFixture.state, "empty");
  assert.match(
    fixtures.mockEmptyChatConversationFixture.nextAction,
    /relationship context|source evidence/i,
  );
  assert.equal(fixtures.mockPendingChatConversationFixture.state, "pending");
});

test("mock chat service is deterministic and never calls live transport storage or providers", async () => {
  const serviceModule = await importProjectModule<{
    createMockChatConversationMessageService: () => {
      listConversations: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: {
          state: string;
          conversations: readonly Array<{
            conversationId: string;
            participantName: string;
            websocketSubscriptionRequested: false;
          }>;
        };
        error?: { code: string; appCode: string };
      };
      getMessageThread: (input: {
        conversationId?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          messages: readonly Array<{
            messageId: string;
            body: string;
            productionMessageStorageRequested: false;
          }>;
          sendMessageState: {
            status: string;
            externalSendRequested: false;
          };
          oneToOneContext: {
            participantName: string;
            recommendedFollowup: string;
          };
        };
        error?: { code: string; appCode: string };
      };
      sendMessage: (input: {
        conversationId?: string | null;
        body?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          message: {
            body: string;
            deliveryState: string;
            realtimeTransportRequested: false;
            productionMessageStorageRequested: false;
          };
          sendMessageState: {
            status: string;
            productionMessageStorageRequested: false;
          };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/chat/mock-service.ts");
  const service = serviceModule.createMockChatConversationMessageService();
  const list = service.listConversations();
  const thread = service.getMessageThread({
    conversationId: "demo-conversation-1",
  });
  const sent = service.sendMessage({
    body: "Let's compare pilot windows next week.",
    conversationId: "demo-conversation-1",
  });
  const empty = service.listConversations({ scenario: "empty" });
  const pending = service.getMessageThread({
    conversationId: "demo-conversation-1",
    scenario: "pending",
  });
  const failure = service.listConversations({ scenario: "failure" });
  const missing = service.getMessageThread({ conversationId: "missing" });
  const missingBody = service.sendMessage({
    body: " ",
    conversationId: "demo-conversation-1",
  });

  assert.deepEqual(
    service.sendMessage({
      body: "Let's compare pilot windows next week.",
      conversationId: "demo-conversation-1",
    }),
    service.sendMessage({
      body: "Let's compare pilot windows next week.",
      conversationId: "demo-conversation-1",
    }),
  );
  assert.equal(list.success, true);
  assert.deepEqual(
    list.data?.conversations.map((conversation) => conversation.conversationId),
    ["demo-conversation-1", "demo-conversation-2"],
  );
  assert.equal(list.data?.conversations[0].websocketSubscriptionRequested, false);
  assert.equal(thread.success, true);
  assert.equal(thread.data?.state, "success");
  assert.match(
    thread.data?.oneToOneContext.recommendedFollowup ?? "",
    /pilot/i,
  );
  assert.equal(
    thread.data?.messages[0].productionMessageStorageRequested,
    false,
  );
  assert.equal(thread.data?.sendMessageState.externalSendRequested, false);
  assert.equal(sent.success, true);
  assert.equal(sent.data?.state, "success");
  assert.equal(sent.data?.message.body, "Let's compare pilot windows next week.");
  assert.equal(sent.data?.message.deliveryState, "mock_recorded_locally");
  assert.equal(sent.data?.message.realtimeTransportRequested, false);
  assert.equal(sent.data?.message.productionMessageStorageRequested, false);
  assert.equal(
    sent.data?.sendMessageState.productionMessageStorageRequested,
    false,
  );
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.conversations.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "CHAT_CONVERSATION_MOCK_FAILED");
  assert.equal(missing.success, false);
  assert.equal(missing.error?.code, "CHAT_CONVERSATION_NOT_FOUND");
  assert.equal(missingBody.success, false);
  assert.equal(missingBody.error?.code, "CHAT_MESSAGE_BODY_REQUIRED");

  for (const filePath of [
    "features/chat/contract.ts",
    "features/chat/fixtures.ts",
    "features/chat/service.ts",
    "features/chat/mock-service.ts",
    "features/chat/chat-conversation-and-message-mock/debug-view.tsx",
    "app/api/chat/conversations/route.ts",
    "app/api/chat/conversations/[id]/route.ts",
    "app/api/chat/conversations/[id]/messages/route.ts",
  ]) {
    assertNoLiveProviderCalls(filePath);
  }
});

test("chat conversation API routes return stable envelopes with empty and failure paths", async () => {
  const listRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/chat/conversations/route.ts");
  const threadRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/chat/conversations/[id]/route.ts");
  const messagesRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/chat/conversations/[id]/messages/route.ts");
  const fixtures = await importProjectModule<{
    mockEmptyChatConversationFixture: unknown;
  }>("features/chat/fixtures.ts");

  const listResponse = await listRoute.GET(
    new Request("https://orbit.local/api/chat/conversations"),
  );
  const threadResponse = await threadRoute.GET(
    new Request("https://orbit.local/api/chat/conversations/demo-conversation-1"),
    { params: Promise.resolve({ id: "demo-conversation-1" }) },
  );
  const sendResponse = await messagesRoute.POST(
    new Request(
      "https://orbit.local/api/chat/conversations/demo-conversation-1/messages",
      {
        body: JSON.stringify({
          body: "Let's compare pilot windows next week.",
        }),
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "demo-conversation-1" }) },
  );
  const bodylessSendResponse = await messagesRoute.POST(
    new Request(
      "https://orbit.local/api/chat/conversations/demo-conversation-1/messages",
      {
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "demo-conversation-1" }) },
  );
  const blankBodyResponse = await messagesRoute.POST(
    new Request(
      "https://orbit.local/api/chat/conversations/demo-conversation-1/messages",
      {
        body: JSON.stringify({
          body: " ",
        }),
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "demo-conversation-1" }) },
  );
  const emptyResponse = await listRoute.GET(
    new Request("https://orbit.local/api/chat/conversations?scenario=empty"),
  );
  const failureResponse = await threadRoute.GET(
    new Request(
      "https://orbit.local/api/chat/conversations/demo-conversation-1?scenario=failure",
    ),
    { params: Promise.resolve({ id: "demo-conversation-1" }) },
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "no-store");
  assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.equal(threadResponse.status, 200);
  assert.equal(sendResponse.status, 201);
  assert.equal(bodylessSendResponse.status, 201);
  assert.equal(blankBodyResponse.status, 400);

  const listEnvelope = (await listResponse.json()) as {
    success: true;
    data: {
      state: string;
      conversations: readonly Array<{
        conversationId: string;
        participantName: string;
        websocketSubscriptionRequested: false;
      }>;
      provenance: {
        realtimeTransportRequested: false;
        productionMessageStorageRequested: false;
      };
    };
  };
  const threadEnvelope = (await threadResponse.json()) as {
    success: true;
    data: {
      state: string;
      messages: readonly Array<{ body: string }>;
      oneToOneContext: {
        participantName: string;
        latestContext: string;
      };
    };
  };
  const sendEnvelope = (await sendResponse.json()) as {
    success: true;
    data: {
      state: string;
      message: {
        body: string;
        deliveryState: string;
        websocketSubscriptionRequested: false;
        productionMessageStorageRequested: false;
      };
      sendMessageState: {
        confirmationRequiredBeforeLiveSend: true;
      };
    };
  };
  const bodylessSendEnvelope = (await bodylessSendResponse.json()) as {
    success: true;
    data: {
      message: {
        body: string;
        deliveryState: string;
        productionMessageStorageRequested: false;
      };
      provenance: {
        generationMethod: string;
      };
    };
  };
  const blankBodyEnvelope = (await blankBodyResponse.json()) as {
    success: false;
    error: {
      code: string;
      message: string;
      context: {
        chatConversationMockErrorCode: string;
        service: string;
      };
    };
  };

  assert.equal(listEnvelope.success, true);
  assert.equal(listEnvelope.data.state, "success");
  assert.deepEqual(
    listEnvelope.data.conversations.map(
      (conversation) => conversation.participantName,
    ),
    ["Maya Chen", "Diego Rivera"],
  );
  assert.equal(
    listEnvelope.data.conversations[0].websocketSubscriptionRequested,
    false,
  );
  assert.equal(listEnvelope.data.provenance.realtimeTransportRequested, false);
  assert.equal(
    listEnvelope.data.provenance.productionMessageStorageRequested,
    false,
  );
  assert.equal(threadEnvelope.success, true);
  assert.equal(threadEnvelope.data.state, "success");
  assert.equal(threadEnvelope.data.oneToOneContext.participantName, "Maya Chen");
  assert.match(threadEnvelope.data.messages[1].body, /pilot timing/i);
  assert.equal(sendEnvelope.success, true);
  assert.equal(sendEnvelope.data.state, "success");
  assert.equal(
    sendEnvelope.data.message.body,
    "Let's compare pilot windows next week.",
  );
  assert.equal(sendEnvelope.data.message.deliveryState, "mock_recorded_locally");
  assert.equal(sendEnvelope.data.message.websocketSubscriptionRequested, false);
  assert.equal(
    sendEnvelope.data.message.productionMessageStorageRequested,
    false,
  );
  assert.equal(
    sendEnvelope.data.sendMessageState.confirmationRequiredBeforeLiveSend,
    true,
  );
  assert.equal(bodylessSendEnvelope.success, true);
  assert.equal(
    bodylessSendEnvelope.data.message.body,
    "Let's compare pilot windows next week.",
  );
  assert.equal(
    bodylessSendEnvelope.data.message.deliveryState,
    "mock_recorded_locally",
  );
  assert.equal(
    bodylessSendEnvelope.data.message.productionMessageStorageRequested,
    false,
  );
  assert.equal(
    bodylessSendEnvelope.data.provenance.generationMethod,
    "rule-based-send",
  );
  assert.equal(blankBodyEnvelope.success, false);
  assert.equal(blankBodyEnvelope.error.code, "VALIDATION_ERROR");
  assert.equal(
    blankBodyEnvelope.error.context.chatConversationMockErrorCode,
    "CHAT_MESSAGE_BODY_REQUIRED",
  );
  assert.equal(
    blankBodyEnvelope.error.context.service,
    "chat-conversation-and-message-mock",
  );
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyChatConversationFixture,
  });
  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The chat conversation and message mock boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        chatConversationMockErrorCode: "CHAT_CONVERSATION_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock chat conversation failure came from deterministic fixture rules.",
        service: "chat-conversation-and-message-mock",
      },
    },
  });
});

test("chat conversation debug route renders all states and live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    CHAT_CONVERSATION_AND_MESSAGE_MOCK_SLUG: string;
    CHAT_CONVERSATION_AND_MESSAGE_API_PROBES: readonly Array<{
      label: string;
      method: "GET" | "POST";
      path: string;
      expectedStatus: number;
    }>;
    ChatConversationAndMessageMockDemo: () => React.ReactElement;
  }>("features/chat/chat-conversation-and-message-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ChatConversationAndMessageMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/chat/chat-conversation-and-message-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.CHAT_CONVERSATION_AND_MESSAGE_MOCK_SLUG,
    "chat-conversation-and-message-mock",
  );
  assert.deepEqual(
    debugView.CHAT_CONVERSATION_AND_MESSAGE_API_PROBES.map((probe) => [
      probe.method,
      probe.path,
      probe.expectedStatus,
    ]),
    [
      ["GET", "/api/chat/conversations", 200],
      ["GET", "/api/chat/conversations/demo-conversation-1", 200],
      ["POST", "/api/chat/conversations/demo-conversation-1/messages", 201],
      ["GET", "/api/chat/conversations?scenario=empty", 200],
      ["GET", "/api/chat/conversations?scenario=pending", 200],
      ["GET", "/api/chat/conversations?scenario=failure", 503],
    ],
  );
  assert.match(pageSource, /CHAT_CONVERSATION_AND_MESSAGE_MOCK_SLUG/);
  assert.match(pageSource, /ChatConversationAndMessageMockDemo/);

  assert.match(html, /Chat conversation and message mock/);
  assert.match(html, /aria-label="Chat conversation operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Maya Chen/);
  assert.match(html, /Diego Rivera/);
  assert.match(html, /Pilot timing follow-up/);
  assert.match(html, /One-to-one context/);
  assert.match(html, /active collaboration/i);
  assert.match(html, /aria-label="Chat conversation state matrix"/);
  assert.match(html, /Success probe: GET \/api\/chat\/conversations/);
  assert.match(html, /Success: 2 conversations/);
  assert.match(
    html,
    /Empty probe: GET \/api\/chat\/conversations\?scenario=empty/,
  );
  assert.match(html, /Empty: no one-to-one chat context/);
  assert.match(
    html,
    /Pending probe: GET \/api\/chat\/conversations\?scenario=pending/,
  );
  assert.match(html, /Pending: local transport handshake/);
  assert.match(
    html,
    /Failure probe: GET \/api\/chat\/conversations\?scenario=failure/,
  );
  assert.match(html, /Failure: controlled error/);
  assert.match(html, /CHAT_CONVERSATION_MOCK_FAILED/);
  assert.match(html, /realtime transport false/);
  assert.match(html, /websocket subscription false/);
  assert.match(html, /production message storage false/);
  assert.match(html, /evidence:chat:maya:breakfast/);
  assert.match(html, /GET \/api\/chat\/conversations/);
  assert.match(html, /POST \/api\/chat\/conversations\/demo-conversation-1\/messages/);
  assert.match(html, /Default demo body/);
  assert.match(html, /body-less harness POST records the deterministic mock reply/);
  assert.match(html, /Blank body recovery/);
  assert.match(html, /CHAT_MESSAGE_BODY_REQUIRED/);

  for (const requiredText of [
    "Live service files",
    "ORBIT_CHAT_CONVERSATION_PROVIDER",
    "real-time transport",
    "WebSocket",
    "message storage",
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
