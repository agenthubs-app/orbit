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
    `${pathFromRoot} must exist for the message draft generator mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("message draft generator contract exports typed fixtures errors and mock-only provenance", async () => {
  const contract = await importProjectModule<{
    MESSAGE_DRAFT_GENERATOR_DRAFT_KINDS: readonly string[];
    MESSAGE_DRAFT_GENERATOR_ERROR_CODES: readonly string[];
    MESSAGE_DRAFT_GENERATOR_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    MESSAGE_DRAFT_GENERATOR_FIXTURE_SOURCE: string;
    mockMessageDraftGeneratorFixture: {
      state: string;
      drafts: readonly Array<{
        draftId: string;
        kind: string;
        channel: string;
        recipientName: string;
        subject: string;
        body: string;
        evidenceIds: readonly string[];
        generatedBy: string;
        audit: {
          sourceLabel: string;
          providerBoundary: string;
          verificationAction: string;
        };
        aiProviderRequested: false;
        externalSendRequested: false;
        emailProviderRequested: false;
        calendarProviderRequested: false;
        notificationDelivered: false;
        liveDatabaseWriteExecuted: false;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        aiProviderRequested: false;
        externalNetworkRequested: false;
        emailProviderRequested: false;
        calendarProviderRequested: false;
        notificationDelivered: false;
        liveDatabaseReadExecuted: false;
        liveDatabaseWriteExecuted: false;
        deviceRequested: false;
      };
    };
    mockEmptyMessageDraftGeneratorFixture: {
      state: string;
      drafts: readonly unknown[];
      nextAction: string;
    };
    mockPendingMessageDraftGeneratorFixture: {
      state: string;
      drafts: readonly unknown[];
      nextAction: string;
    };
  }>("features/followups/message-draft-contract.ts");
  const serviceSource = readFileSync(
    join(projectRoot, "features/followups/message-draft-contract.ts"),
    "utf8",
  );

  assert.match(serviceSource, /interface MessageDraftGeneratorService/);
  assert.match(serviceSource, /createDraft/);
  assert.match(serviceSource, /updateDraft/);
  assert.deepEqual(contract.MESSAGE_DRAFT_GENERATOR_DRAFT_KINDS, [
    "greeting",
    "follow_up",
    "appointment",
    "introduction_request",
    "invitation",
    "thank_you",
  ]);
  assert.deepEqual(contract.MESSAGE_DRAFT_GENERATOR_ERROR_CODES, [
    "MESSAGE_DRAFT_GENERATOR_DRAFT_ID_REQUIRED",
    "MESSAGE_DRAFT_GENERATOR_DRAFT_NOT_FOUND",
    "MESSAGE_DRAFT_GENERATOR_EMPTY",
    "MESSAGE_DRAFT_GENERATOR_PENDING",
    "MESSAGE_DRAFT_GENERATOR_MOCK_FAILED",
  ]);
  assert.equal(
    contract.MESSAGE_DRAFT_GENERATOR_ERROR_DEFINITIONS
      .MESSAGE_DRAFT_GENERATOR_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.MESSAGE_DRAFT_GENERATOR_ERROR_DEFINITIONS
      .MESSAGE_DRAFT_GENERATOR_EMPTY.recovery,
    /relationship context|contact evidence|source/i,
  );

  assert.equal(contract.mockMessageDraftGeneratorFixture.state, "success");
  assert.equal(
    contract.mockMessageDraftGeneratorFixture.provenance.source,
    contract.MESSAGE_DRAFT_GENERATOR_FIXTURE_SOURCE,
  );
  assert.deepEqual(
    contract.mockMessageDraftGeneratorFixture.drafts.map((draft) => draft.kind),
    [
      "greeting",
      "follow_up",
      "appointment",
      "introduction_request",
      "invitation",
      "thank_you",
    ],
  );
  assert.equal(
    contract.mockMessageDraftGeneratorFixture.drafts[0].generatedBy,
    "mock-message-draft-rules",
  );
  assert.deepEqual(contract.mockMessageDraftGeneratorFixture.drafts[0].audit, {
    sourceLabel: "Tokyo climate operator breakfast note",
    providerBoundary: "AI false, external send false, persistence false",
    verificationAction: "Review source evidence",
  });
  assert.equal(
    contract.mockMessageDraftGeneratorFixture.drafts[0].aiProviderRequested,
    false,
  );
  assert.equal(
    contract.mockMessageDraftGeneratorFixture.drafts[0].externalSendRequested,
    false,
  );
  assert.equal(
    contract.mockMessageDraftGeneratorFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    contract.mockMessageDraftGeneratorFixture.provenance
      .externalNetworkRequested,
    false,
  );
  assert.equal(
    contract.mockEmptyMessageDraftGeneratorFixture.state,
    "empty",
  );
  assert.match(
    contract.mockEmptyMessageDraftGeneratorFixture.nextAction,
    /relationship context|contact evidence|source/i,
  );
  assert.equal(
    contract.mockPendingMessageDraftGeneratorFixture.state,
    "pending",
  );
});

test("mock message draft generator service is deterministic and never calls live providers", async () => {
  const serviceModule = await importProjectModule<{
    createMockMessageDraftGeneratorService: () => {
      createDraft: (input?: {
        scenario?: string | null;
        draftKind?: string | null;
        recipientName?: string | null;
        contextNote?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          drafts: readonly Array<{
            draftId: string;
            kind: string;
            body: string;
            aiProviderRequested: false;
            externalSendRequested: false;
          }>;
        };
        error?: { code: string; appCode: string };
      };
      updateDraft: (input: {
        draftId?: string | null;
        scenario?: string | null;
        userEdits?: string | null;
        status?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          drafts: readonly Array<{
            draftId: string;
            status: string;
            body: string;
            externalSendRequested: false;
          }>;
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/followups/mock-message-draft-service.ts");
  const service = serviceModule.createMockMessageDraftGeneratorService();
  const input = {
    contextNote: "Maya asked to compare pilot timing after the event.",
    draftKind: "follow_up",
    recipientName: "Maya Chen",
  };
  const generated = service.createDraft(input);
  const updated = service.updateDraft({
    draftId: "demo-draft-1",
    status: "ready_for_confirmation",
    userEdits: "Add the promised pilot window before sending.",
  });
  const empty = service.createDraft({ scenario: "empty" });
  const pending = service.updateDraft({
    draftId: "demo-draft-1",
    scenario: "pending",
  });
  const failure = service.createDraft({ scenario: "failure" });
  const missing = service.updateDraft({ draftId: "missing-draft" });

  assert.deepEqual(service.createDraft(input), service.createDraft(input));
  assert.equal(generated.success, true);
  assert.equal(generated.data?.state, "success");
  assert.deepEqual(
    generated.data?.drafts.map((draft) => draft.kind),
    ["follow_up"],
  );
  assert.match(generated.data?.drafts[0].body ?? "", /Maya Chen/);
  assert.match(generated.data?.drafts[0].body ?? "", /pilot timing/);
  assert.equal(generated.data?.drafts[0].aiProviderRequested, false);
  assert.equal(generated.data?.drafts[0].externalSendRequested, false);
  assert.equal(updated.success, true);
  assert.equal(updated.data?.drafts[0].draftId, "demo-draft-1");
  assert.equal(updated.data?.drafts[0].status, "ready_for_confirmation");
  assert.match(updated.data?.drafts[0].body ?? "", /promised pilot window/);
  assert.equal(updated.data?.drafts[0].externalSendRequested, false);
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.drafts.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "MESSAGE_DRAFT_GENERATOR_MOCK_FAILED");
  assert.equal(missing.success, false);
  assert.equal(missing.error?.code, "MESSAGE_DRAFT_GENERATOR_DRAFT_NOT_FOUND");

  for (const filePath of [
    "features/followups/message-draft-contract.ts",
    "features/followups/mock-message-draft-service.ts",
    "features/followups/message-draft-generator-mock/debug-view.tsx",
    "app/api/message-drafts/route.ts",
    "app/api/message-drafts/[id]/route.ts",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(source, /OpenAI|Anthropic|Pinecone|Weaviate|Qdrant/);
    assert.doesNotMatch(source, /sendgrid|postmark|gmail|calendar\.google/i);
  }
});

test("message draft API routes return stable envelopes with empty and failure paths", async () => {
  const draftsRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/message-drafts/route.ts");
  const draftRoute = await importProjectModule<{
    PATCH: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/message-drafts/[id]/route.ts");
  const contract = await importProjectModule<{
    mockEmptyMessageDraftGeneratorFixture: unknown;
  }>("features/followups/message-draft-contract.ts");

  const createResponse = await draftsRoute.POST(
    new Request("https://orbit.local/api/message-drafts", {
      body: JSON.stringify({
        contextNote: "Maya asked to compare pilot timing after the event.",
        draftKind: "follow_up",
        recipientName: "Maya Chen",
      }),
      method: "POST",
    }),
  );
  const updateResponse = await draftRoute.PATCH(
    new Request("https://orbit.local/api/message-drafts/demo-draft-1", {
      body: JSON.stringify({
        status: "ready_for_confirmation",
        userEdits: "Add the promised pilot window before sending.",
      }),
      method: "PATCH",
    }),
    { params: Promise.resolve({ id: "demo-draft-1" }) },
  );
  const emptyResponse = await draftsRoute.POST(
    new Request("https://orbit.local/api/message-drafts?scenario=empty", {
      body: JSON.stringify({ draftKind: "follow_up" }),
      method: "POST",
    }),
  );
  const failureResponse = await draftsRoute.POST(
    new Request("https://orbit.local/api/message-drafts?scenario=failure", {
      body: JSON.stringify({ draftKind: "follow_up" }),
      method: "POST",
    }),
  );

  assert.equal(createResponse.status, 200);
  assert.equal(createResponse.headers.get("cache-control"), "no-store");
  assert.equal(createResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.headers.get("cache-control"), "no-store");

  const createEnvelope = (await createResponse.json()) as {
    success: true;
    data: {
      state: string;
      drafts: readonly Array<{
        kind: string;
        body: string;
        aiProviderRequested: false;
        externalSendRequested: false;
      }>;
      provenance: {
        aiProviderRequested: false;
        externalNetworkRequested: false;
      };
    };
  };
  const updateEnvelope = (await updateResponse.json()) as {
    success: true;
    data: {
      state: string;
      drafts: readonly Array<{
        draftId: string;
        status: string;
        externalSendRequested: false;
      }>;
    };
  };

  assert.equal(createEnvelope.success, true);
  assert.equal(createEnvelope.data.state, "success");
  assert.deepEqual(
    createEnvelope.data.drafts.map((draft) => draft.kind),
    ["follow_up"],
  );
  assert.match(createEnvelope.data.drafts[0].body, /pilot timing/);
  assert.equal(createEnvelope.data.drafts[0].aiProviderRequested, false);
  assert.equal(createEnvelope.data.drafts[0].externalSendRequested, false);
  assert.equal(createEnvelope.data.provenance.aiProviderRequested, false);
  assert.equal(createEnvelope.data.provenance.externalNetworkRequested, false);
  assert.equal(updateEnvelope.success, true);
  assert.equal(updateEnvelope.data.state, "success");
  assert.equal(updateEnvelope.data.drafts[0].draftId, "demo-draft-1");
  assert.equal(
    updateEnvelope.data.drafts[0].status,
    "ready_for_confirmation",
  );
  assert.equal(updateEnvelope.data.drafts[0].externalSendRequested, false);
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: contract.mockEmptyMessageDraftGeneratorFixture,
  });
  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock message draft generator boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        messageDraftGeneratorErrorCode:
          "MESSAGE_DRAFT_GENERATOR_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock message draft generator failure came from deterministic fixture rules.",
        service: "message-draft-generator-mock",
      },
    },
  });
});

test("message draft generator debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    MESSAGE_DRAFT_GENERATOR_MOCK_SLUG: string;
    MESSAGE_DRAFT_GENERATOR_API_PROBES: readonly Array<{
      label: string;
      method: "POST" | "PATCH";
      path: string;
      expectedStatus: number;
    }>;
    MessageDraftGeneratorMockDemo: () => React.ReactElement;
  }>("features/followups/message-draft-generator-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.MessageDraftGeneratorMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/followups/message-draft-generator-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.MESSAGE_DRAFT_GENERATOR_MOCK_SLUG,
    "message-draft-generator-mock",
  );
  assert.deepEqual(
    debugView.MESSAGE_DRAFT_GENERATOR_API_PROBES.map((probe) => [
      probe.method,
      probe.path,
      probe.expectedStatus,
    ]),
    [
      ["POST", "/api/message-drafts", 200],
      ["PATCH", "/api/message-drafts/demo-draft-1", 200],
      ["POST", "/api/message-drafts?scenario=empty", 200],
      ["POST", "/api/message-drafts?scenario=pending", 200],
      ["POST", "/api/message-drafts?scenario=failure", 503],
    ],
  );
  assert.match(pageSource, /MESSAGE_DRAFT_GENERATOR_MOCK_SLUG/);
  assert.match(pageSource, /MessageDraftGeneratorMockDemo/);

  assert.match(html, /Message draft generator mock/);
  assert.match(
    html,
    /aria-label="Message draft generator operator checkpoint"/,
  );
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Six relationship message drafts/);
  assert.match(
    html,
    /Local rules prepared greeting, follow-up, appointment, introduction request, invitation, and thank-you drafts/,
  );
  assert.match(html, /aria-label="Message draft generator state matrix"/);
  assert.match(html, /Success probe: POST \/api\/message-drafts/);
  assert.match(html, /Success: 6 message drafts/);
  assert.match(html, /Empty probe: POST \/api\/message-drafts\?scenario=empty/);
  assert.match(html, /Empty: no source-backed message context/);
  assert.match(html, /Pending probe: POST \/api\/message-drafts\?scenario=pending/);
  assert.match(html, /Pending: confirmation guard/);
  assert.match(
    html,
    /Failure probe: POST \/api\/message-drafts\?scenario=failure/,
  );
  assert.match(html, /Failure: controlled error/);
  assert.match(html, /Greeting/);
  assert.match(html, /Follow-up/);
  assert.match(html, /Appointment/);
  assert.match(html, /Introduction request/);
  assert.match(html, /Invitation/);
  assert.match(html, /Thank-you/);
  assert.match(html, /aria-label="Audit message draft demo-draft-1"/);
  assert.match(html, /Review source evidence/);
  assert.match(html, /Source: Tokyo climate operator breakfast note/);
  assert.match(html, /Provider boundary: AI false, external send false, persistence false/);
  assert.match(html, /evidence:message-draft:greeting/);
  assert.match(html, /AI provider false/);
  assert.match(html, /external send false/);
  assert.match(html, /database write false/);
  assert.match(html, /MESSAGE_DRAFT_GENERATOR_MOCK_FAILED/);
  assert.match(html, /POST \/api\/message-drafts/);
  assert.match(html, /PATCH \/api\/message-drafts\/demo-draft-1/);

  for (const requiredText of [
    "Live service files",
    "ORBIT_MESSAGE_DRAFT_GENERATOR_PROVIDER",
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
