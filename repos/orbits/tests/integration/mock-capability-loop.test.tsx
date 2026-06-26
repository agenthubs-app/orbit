import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

type PageSearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params?: Promise<Record<string, string>>;
  searchParams: Promise<PageSearchParams>;
};

interface ApiSuccessBody {
  success: true;
  data: unknown;
}

async function renderRoute(
  modulePath: string,
  props: PageProps = { searchParams: Promise.resolve({}) },
): Promise<string> {
  const routeModule = (await import(modulePath)) as {
    default: (props: PageProps) => Promise<React.ReactNode>;
  };

  return renderToStaticMarkup(await routeModule.default(props));
}

function textOnly(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mainFlowText(html: string): string {
  return textOnly(
    html.replace(/<details[^>]*class="technical-provenance"[\s\S]*?<\/details>/g, " "),
  );
}

const contactsNewInternalCopyPattern =
  /\b(mock|harness|providers?|fixtures?|production contact service|database(?:s)?)\b/i;

function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

function findMissingSourceOrEvidence(value: unknown, pathLabel = "data"): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findMissingSourceOrEvidence(item, `${pathLabel}[${index}]`),
    );
  }

  const record = value as Record<string, unknown>;
  const hasEntityShape =
    typeof record.entityKind === "string" ||
    typeof record.findingId === "string" ||
    typeof record.actionId === "string" ||
    typeof record.taskId === "string" ||
    typeof record.summaryId === "string" ||
    typeof record.contactId === "string" ||
    typeof record.connectionId === "string";
  const hasEvidence =
    Array.isArray(record.evidenceIds) && record.evidenceIds.length > 0;
  const hasSource =
    typeof record.source === "string" ||
    (record.source && typeof record.source === "object") ||
    (Array.isArray(record.sourceRefs) && record.sourceRefs.length > 0);
  const currentMissing =
    hasEntityShape && !hasEvidence && !hasSource ? [pathLabel] : [];

  return Object.entries(record).flatMap(([key, child]) => [
    ...currentMissing.filter((missing) => missing === pathLabel),
    ...findMissingSourceOrEvidence(child, `${pathLabel}.${key}`),
  ]);
}

async function expectSuccessResponse(
  name: string,
  response: Response,
  expectedStatus = 200,
): Promise<ApiSuccessBody> {
  assert.equal(response.status, expectedStatus, `${name} status`);
  assert.equal(
    response.headers.get("x-orbit-feature-mode"),
    "mock",
    `${name} should run in mock mode`,
  );

  const body = (await response.json()) as ApiSuccessBody;
  assert.equal(body.success, true, `${name} success envelope`);
  assert.match(jsonText(body.data), /source|evidence|provenance/i, name);

  return body;
}

test("Sprint 68 scripted acceptance run covers the mock MVP loop app routes", async () => {
  const renderedRoutes = [
    {
      route: "/app",
      html: await renderRoute("../../app/(app)/app/page", {
        searchParams: Promise.resolve({ panel: "agent" }),
      }),
      expected: [
        "问 Orbit AI",
        "发送前检查",
        "发送前确认介绍草稿",
      ],
    },
    {
      route: "/app/profile",
      html: await renderRoute("../../app/(app)/app/profile/page", {
        searchParams: Promise.resolve({ action: "complete-profile-field" }),
      }),
      expected: [
        "Ari Lane profile",
        "Ready for confirmation",
        "Outside services contacted: none",
      ],
    },
    {
      route: "/app/contacts/new",
      html: await renderRoute("../../app/(app)/app/contacts/new/page", {
        searchParams: Promise.resolve({ action: "confirm-manual-draft" }),
      }),
      expected: [
        "Relationship source intake",
        "Ready for contact review: Kenji Watanabe",
        "Manual note from climate founders dinner",
        "Preview contact review",
        "External contacts",
        "Email and calendar signals",
        "Outside accounts contacted: none",
      ],
    },
    {
      route: "/app/contacts",
      html: await renderRoute("../../app/(app)/app/contacts/page", {
        searchParams: Promise.resolve({
          action: "review-filtered-contact",
          query: "storage",
          tag: "topic:storage-pilots",
          value: "commercial_opportunity",
        }),
      }),
      expected: [
        "Contacts relationship console",
        "Filtered review ready: Kenji Watanabe",
        "Outside services contacted: none",
      ],
    },
    {
      route: "/app/contacts/demo-contact-1",
      html: await renderRoute("../../app/(app)/app/contacts/[id]/page", {
        params: Promise.resolve({ id: "demo-contact-1" }),
        searchParams: Promise.resolve({ action: "prepare-follow-up" }),
      }),
      expected: [
        "Kenji Watanabe",
        "Follow-up prepared",
        "This draft stays local until you confirm where it should go",
      ],
    },
    {
      route: "/app/events",
      html: await renderRoute("../../app/(app)/app/events/page", {
        searchParams: Promise.resolve({ action: "accept-top-event" }),
      }),
      expected: [
        "Event briefing",
        "Event recommendation accepted",
        "No calendar changes, saved records, messages, or notifications were made",
      ],
    },
    {
      route: "/app/events/demo-event-1",
      html: await renderRoute("../../app/(app)/app/events/[id]/page", {
        params: Promise.resolve({ id: "demo-event-1" }),
        searchParams: Promise.resolve({
          action: "want-to-connect",
          targetContactId: "contact:priya-shah",
        }),
      }),
      expected: [
        "Climate founders dinner",
        "Intent held for this review: Priya Shah",
        "Opening line",
      ],
    },
    {
      route: "/app/followups",
      html: await renderRoute("../../app/(app)/app/followups/page", {
        searchParams: Promise.resolve({ action: "complete-top-followup" }),
      }),
      expected: [
        "Follow-up command center",
        "Completion preview ready",
        "Messages sent: none",
      ],
    },
    {
      route: "/app/chat",
      html: await renderRoute("../../app/(app)/app/chat/page", {
        searchParams: Promise.resolve({ action: "record-local-reply" }),
      }),
      expected: [
        "Chat command center",
        "Local reply preview ready",
        "Follow-up tracker",
      ],
    },
    {
      route: "/app/dashboard",
      html: await renderRoute("../../app/(app)/app/dashboard/page", {
        searchParams: Promise.resolve({ action: "run-dashboard-review" }),
      }),
      expected: [
        "Dashboard command center",
        "Dashboard review ready",
        "Production audit storage changed: no",
      ],
    },
    {
      route: "/app/agent",
      html: await renderRoute("../../app/(app)/app/agent/page", {
        searchParams: Promise.resolve({
          action: "review-top-agent-action",
        }),
      }),
      expected: [
        "Agent command center",
        "Agent review ready",
        "External sandbox result: no-op preview",
      ],
    },
  ] as const;

  for (const renderedRoute of renderedRoutes) {
    const text = textOnly(renderedRoute.html);

    for (const expected of renderedRoute.expected) {
      assert.match(text, new RegExp(expected), renderedRoute.route);
    }

    assert.match(renderedRoute.html, /data-side-effects="none"|data-state-boundary=/);
  }

  const contactsNewRoute = renderedRoutes.find(
    (renderedRoute) => renderedRoute.route === "/app/contacts/new",
  );
  assert.ok(contactsNewRoute, "/app/contacts/new rendered");
  assert.match(
    contactsNewRoute.html,
    /\.app-contacts-new-route\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    "/app/contacts/new constrains the route grid for narrow viewports",
  );
  assert.match(
    contactsNewRoute.html,
    /\.app-contacts-new-route\s*\{[\s\S]*overflow-x:\s*clip/,
    "/app/contacts/new clips accidental horizontal overflow at the route boundary",
  );
  assert.match(
    contactsNewRoute.html,
    /\.app-contacts-new-route\s+\.chip-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*128px\),\s*1fr\)\)/,
    "/app/contacts/new evidence chips wrap inside a 375px viewport",
  );
  assert.match(
    contactsNewRoute.html,
    /\.app-contacts-new-route\s+\.orbit-chip\s*\{[\s\S]*white-space:\s*normal/,
    "/app/contacts/new long chip labels can wrap instead of widening the viewport",
  );
  assert.doesNotMatch(
    textOnly(contactsNewRoute.html),
    contactsNewInternalCopyPattern,
    "/app/contacts/new keeps customer-visible copy focused on relationship work",
  );
  assert.match(
    mainFlowText(contactsNewRoute.html),
    /Choose another relationship source/,
    "/app/contacts/new exposes alternate relationship sources in the main intake flow",
  );
  assert.doesNotMatch(
    mainFlowText(contactsNewRoute.html),
    /first queue item is Akari Mori/i,
    "/app/contacts/new does not imply the separate sample queue is the highlighted candidate",
  );
  assert.doesNotMatch(
    mainFlowText(contactsNewRoute.html),
    /\bevidence:[\w:-]+/i,
    "/app/contacts/new keeps raw evidence IDs out of the main customer flow",
  );
  assert.match(
    mainFlowText(contactsNewRoute.html),
    /Manual note from climate founders dinner/,
    "/app/contacts/new shows a human-readable source label in the main flow",
  );
  assert.doesNotMatch(
    textOnly(contactsNewRoute.html),
    /Technical provenance IDs/i,
    "/app/contacts/new keeps technical provenance labels out of customer-facing copy",
  );
  assert.match(
    contactsNewRoute.html,
    /<summary>Source record details<\/summary>[\s\S]*<code>evidence:manual-note-kenji<\/code>/,
    "/app/contacts/new keeps raw evidence IDs in expandable technical provenance details",
  );
  assert.match(
    contactsNewRoute.html,
    /<h3 class="relationship-name">Current review candidate<\/h3>[\s\S]*Kenji Watanabe[\s\S]*Manual note from climate founders dinner[\s\S]*<button type="submit">Preview contact review<\/button>[\s\S]*<h2>Choose another relationship source<\/h2>/,
    "/app/contacts/new leads with the current candidate decision before alternate paths",
  );
  assert.match(
    contactsNewRoute.html,
    /aria-label="Selectable relationship source methods"[\s\S]*<button type="button">Choose manual note<\/button>[\s\S]*<button type="button">Choose merge review<\/button>/,
    "/app/contacts/new renders selectable source methods with named controls",
  );

  const dashboardRoute = renderedRoutes.find(
    (renderedRoute) => renderedRoute.route === "/app/dashboard",
  );
  assert.ok(dashboardRoute, "/app/dashboard rendered");
  assert.doesNotMatch(
    mainFlowText(dashboardRoute.html),
    /\bevidence:[\w:-]+/i,
    "/app/dashboard keeps raw evidence IDs out of the main customer flow",
  );
  assert.match(
    mainFlowText(dashboardRoute.html),
    /Audit contact event badge/,
    "/app/dashboard shows a human-readable source label in the main flow",
  );
  assert.match(
    dashboardRoute.html,
    /<summary>Technical provenance IDs<\/summary>[\s\S]*<code>evidence:audit:contact:event-badge<\/code>/,
    "/app/dashboard keeps raw evidence IDs in expandable technical provenance details",
  );
});

test("Sprint 68 exercises required mock capability API paths", async () => {
  const bootstrapRoute = await import("../../app/api/app/bootstrap/route");
  const auditRoute = await import("../../app/api/audit/provenance/route");
  const agentActionsRoute = await import("../../app/api/agent/actions/route");
  const agentAcceptRoute = await import(
    "../../app/api/agent/actions/[id]/accept/route"
  );
  const dashboardRoute = await import("../../app/api/dashboard/route");
  const ocrRoute = await import(
    "../../app/api/contact-drafts/business-card/scan/route"
  );
  const qrRoute = await import("../../app/api/contact-drafts/qr/scan/route");
  const externalImportRoute = await import(
    "../../app/api/contact-drafts/external/import/route"
  );
  const emailCalendarRoute = await import(
    "../../app/api/relationship-signals/email-calendar/route"
  );
  const aiDraftRoute = await import("../../app/api/ai/mock/message-draft/route");
  const chatSummaryRoute = await import(
    "../../app/api/chat/conversations/[id]/summary/route"
  );
  const notificationRoute = await import("../../app/api/notifications/route");
  const sandboxRoute = await import(
    "../../app/api/sandbox/external-actions/send-message/route"
  );

  const probes = [
    {
      name: "bootstrap",
      body: await expectSuccessResponse(
        "bootstrap",
        await bootstrapRoute.GET(
          new Request("https://orbit.local/api/app/bootstrap"),
        ),
      ),
      expected: /Mina Tanaka|bootstrap-fixture-1/,
    },
    {
      name: "provenance_audit",
      body: await expectSuccessResponse(
        "provenance_audit",
        await auditRoute.GET(
          new Request("https://orbit.local/api/audit/provenance"),
        ),
      ),
      expected: /contact|connection|recommendation|task|chat_summary|agent_action/,
    },
    {
      name: "agent_actions",
      body: await expectSuccessResponse(
        "agent_actions",
        await agentActionsRoute.GET(
          new Request("https://orbit.local/api/agent/actions"),
        ),
      ),
      expected: /demo-action-1|confirmationRequired/,
    },
    {
      name: "dashboard",
      body: await expectSuccessResponse(
        "dashboard",
        await dashboardRoute.GET(
          new Request("https://orbit.local/api/dashboard"),
        ),
      ),
      expected: /Maya Chen|dashboard/i,
    },
    {
      name: "ocr",
      body: await expectSuccessResponse(
        "ocr",
        await ocrRoute.POST(
          new Request("https://orbit.local/api/contact-drafts/business-card/scan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              imageText: "Kenji Watanabe\nAster Grid\nkenji@example.test",
              imageName: "kenji-card.txt",
            }),
          }),
        ),
      ),
      expected: /business_card_ocr|ocrProviderCalled":false/,
    },
    {
      name: "qr",
      body: await expectSuccessResponse(
        "qr",
        await qrRoute.POST(
          new Request("https://orbit.local/api/contact-drafts/qr/scan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              qrText:
                "orbit-qr:name=Mika Tan;role=Founder;organization=HelioGrid;event=Climate founders dinner;mutual=Rei Nakamura;topic=grid resilience",
              scanLabel: "Mika QR badge",
            }),
          }),
        ),
      ),
      expected: /qr|notificationDelivered":false/,
    },
    {
      name: "external_contact_import",
      body: await expectSuccessResponse(
        "external_contact_import",
        await externalImportRoute.POST(
          new Request("https://orbit.local/api/contact-drafts/external/import", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sourceKind: "google_contacts" }),
          }),
        ),
      ),
      expected: /external|externalNetworkRequested":false/,
    },
    {
      name: "email_calendar_signal",
      body: await expectSuccessResponse(
        "email_calendar_signal",
        await emailCalendarRoute.GET(
          new Request(
            "https://orbit.local/api/relationship-signals/email-calendar",
          ),
        ),
      ),
      expected: /email|calendar|externalNetworkRequested":false/,
    },
    {
      name: "ai_draft",
      body: await expectSuccessResponse(
        "ai_draft",
        await aiDraftRoute.POST(
          new Request("https://orbit.local/api/ai/mock/message-draft", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              promptTemplateId: "orbit.message-draft.followup.v1",
              recipientName: "Maya Chen",
              relationshipContext:
                "Maya asked for the reliability memo after the event.",
              desiredOutcome: "Ask for pilot-scope feedback.",
              sourceEvidenceIds: ["evidence:agent:followup:maya-chen"],
            }),
          }),
        ),
      ),
      expected: /message_draft|liveAiProviderRequested":false/,
    },
    {
      name: "chat_summary",
      body: await expectSuccessResponse(
        "chat_summary",
        await chatSummaryRoute.POST(
          new Request(
            "https://orbit.local/api/chat/conversations/demo-conversation-1/summary",
            { method: "POST" },
          ),
          { params: Promise.resolve({ id: "demo-conversation-1" }) },
        ),
      ),
      expected: /chat-summary|aiProviderRequested":false/,
    },
    {
      name: "notification",
      body: await expectSuccessResponse(
        "notification",
        await notificationRoute.GET(
          new Request("https://orbit.local/api/notifications"),
        ),
      ),
      expected: /notificationQueue|notificationProviderRequested":false/,
    },
    {
      name: "agent_action_confirmation",
      body: await expectSuccessResponse(
        "agent_action_confirmation",
        await agentAcceptRoute.POST(
          new Request(
            "https://orbit.local/api/agent/actions/demo-action-1/accept",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ actorLabel: "Acceptance runner" }),
            },
          ),
          { params: Promise.resolve({ id: "demo-action-1" }) },
        ),
      ),
      expected: /accepted|externalSideEffectExecuted":false/,
    },
    {
      name: "external_action_sandbox",
      body: await expectSuccessResponse(
        "external_action_sandbox",
        await sandboxRoute.POST(
          new Request(
            "https://orbit.local/api/sandbox/external-actions/send-message",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                actionId: "sandbox-message-demo-1",
                actorLabel: "Acceptance runner",
                targetLabel: "Maya Chen",
              }),
            },
          ),
        ),
      ),
      expected: /providerRequestIssued":false|externalSideEffectExecuted":false/,
    },
  ] as const;

  for (const probe of probes) {
    assert.match(jsonText(probe.body.data), probe.expected, probe.name);
  }
});

test("Sprint 68 provenance audit records source or evidence links for MVP entities", async () => {
  const auditRoute = await import("../../app/api/audit/provenance/route");
  const dashboardRoute = await import("../../app/api/dashboard/route");
  const auditBody = await expectSuccessResponse(
    "provenance_audit",
    await auditRoute.GET(
      new Request("https://orbit.local/api/audit/provenance"),
    ),
  );
  const dashboardBody = await expectSuccessResponse(
    "dashboard",
    await dashboardRoute.GET(new Request("https://orbit.local/api/dashboard")),
  );
  const auditData = auditBody.data as {
    activeFindingCount: number;
    auditedCollections: readonly Array<{
      entityKind: string;
      sourceRefs: readonly unknown[];
      evidenceIds: readonly string[];
    }>;
    findings: readonly Array<{
      entityKind: string;
      sourceRefs: readonly unknown[];
      evidenceIds: readonly string[];
    }>;
    summary: string;
  };
  const auditedKinds = auditData.auditedCollections.map(
    (collection) => collection.entityKind,
  );

  assert.deepEqual(auditedKinds, [
    "contact",
    "connection",
    "evidence",
    "recommendation",
    "task",
    "chat_summary",
    "agent_action",
  ]);
  assert.equal(auditData.activeFindingCount, 0);
  assert.deepEqual(auditData.findings, []);
  assert.match(auditData.summary, /zero active findings/i);

  for (const collection of auditData.auditedCollections) {
    assert.ok(collection.sourceRefs.length > 0, collection.entityKind);
    assert.ok(collection.evidenceIds.length > 0, collection.entityKind);
  }

  for (const finding of auditData.findings) {
    assert.ok(finding.sourceRefs.length > 0, finding.entityKind);
    assert.ok(finding.evidenceIds.length > 0, finding.entityKind);
  }

  assert.deepEqual(findMissingSourceOrEvidence(dashboardBody.data), []);
});

test("Sprint 68 acceptance artifacts stay in owned paths and document live replacement", () => {
  const manualAcceptancePath = "scripts/manual-acceptance.md";
  const liveDocPath =
    "docs/mock-to-live/verify-that-the-capability-first-framework-can-run-the-mvp-loop-in-mock-mode-wit/LIVE_IMPLEMENTATION.md";

  for (const filePath of [manualAcceptancePath, liveDocPath]) {
    assert.equal(
      existsSync(path.join(projectRoot, filePath)),
      true,
      `${filePath} exists`,
    );
  }

  const manualAcceptance = readFileSync(
    path.join(projectRoot, manualAcceptancePath),
    "utf8",
  );
  const liveDoc = readFileSync(path.join(projectRoot, liveDocPath), "utf8");

  for (const route of [
    "/app",
    "/app/profile",
    "/app/contacts/new",
    "/app/contacts",
    "/app/contacts/demo-contact-1",
    "/app/events",
    "/app/events/demo-event-1",
    "/app/followups",
    "/app/chat",
    "/app/dashboard",
    "/app/agent",
  ]) {
    assert.match(manualAcceptance, new RegExp(route.replace(/\//g, "\\/")));
  }

  for (const required of [
    "OCR",
    "QR",
    "external contact import",
    "email-calendar signal",
    "AI draft",
    "chat summary",
    "notification",
    "external action sandbox",
    "harness-state/runs",
  ]) {
    assert.match(manualAcceptance, new RegExp(required, "i"));
  }

  for (const required of [
    "live service/provider files",
    "switch mechanism",
    "required env vars or permissions",
    "privacy/provenance constraints",
    "replacement tests",
    "ORBIT_FEATURE_MODE",
  ]) {
    assert.match(liveDoc.toLowerCase(), new RegExp(required.toLowerCase()));
  }
});
