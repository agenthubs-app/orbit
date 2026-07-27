import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

async function importProjectModule<TModule>(
  relativePath: string,
): Promise<TModule> {
  return (await import(pathToFileURL(path.join(projectRoot, relativePath)).href)) as TModule;
}

test("/app/agent consumes GET q prompts and renders linked contact recommendations", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentConversationService: () => {
      sendMessage: (input: {
        locale?: "en" | "zh";
        message?: string | null;
      }) => {
        success: boolean;
        data?: {
          artifacts: readonly {
            result: {
              generatedView: {
                sections: readonly {
                  items: readonly {
                    actions: readonly {
                      href?: string;
                      label: string;
                      requiresConfirmation: boolean;
                    }[];
                    body?: string;
                    confidenceLabel?: string;
                    evidenceIds: readonly string[];
                    metadata: readonly { label: string; value: string }[];
                    reason?: string;
                    title: string;
                  }[];
                }[];
                summary: string;
              } | null;
            };
            task: { kind: string; query: string };
          }[];
        };
      };
    };
  }>("features/orbit-ai/mock-conversation-service.ts");

  const prompt =
    "Find a Japan SMB manufacturing AI workflow PoC buyer with follow-up context.";
  const result = serviceModule.createMockOrbitAgentConversationService().sendMessage({
    locale: "en",
    message: prompt,
  });
  const artifact = result.data?.artifacts[0];
  const items = artifact?.result.generatedView?.sections[0]?.items ?? [];
  const first = items[0];

  assert.equal(result.success, true);
  assert.equal(artifact?.task.kind, "contact_recommendations");
  assert.equal(artifact?.task.query, prompt);
  assert.ok(items.length >= 3);
  assert.equal(first?.title, "佐藤 健一");
  assert.match(first?.reason ?? "", /why this person/i);
  assert.match(first?.body ?? "", /Evidence/i);
  assert.match(first?.confidenceLabel ?? "", /confidence/i);
  assert.ok(first?.evidenceIds.includes("evidence:contact:001"));
  assert.equal(first?.actions[0]?.href, "/app/contacts/contact_001");
  assert.equal(first?.actions[0]?.requiresConfirmation, true);
  assert.equal(
    first?.metadata.find((item) => item.label === "Contact")?.value,
    "contact_001",
  );
  assert.ok(
    first?.metadata.find((item) => item.label === "Score")?.value,
  );
});

test("/app/agent UI source exposes recommendation reason, snippets, confidence, and detail anchors", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(pageSource, /searchParams/);
  assert.match(pageSource, /initialSubmittedGoal/);
  assert.match(pageSource, /initialConversationData/);
  assert.match(pageSource, /createOrbitAgentConversationPreviewService/);
  assert.match(agentSource, /currentAgentQuery\(\)/);
  assert.match(agentSource, /data-orbit-agent-submitted-goal/);
  assert.match(agentSource, /initialAgentMessagesFor/);
  assert.match(agentSource, /ask\(query\)/);
  assert.match(agentSource, /data-orbit-contact-recommendation-card/);
  assert.match(agentSource, /data-orbit-contact-why/);
  assert.match(agentSource, /data-orbit-contact-evidence-snippet/);
  assert.match(agentSource, /href=\{preserveHref\(productHref\(action\.href\)\)\}/);
  assert.match(agentSource, /primaryItems = allItems\.slice\(0, 3\)/);
});

test("/app/agent makes contact discovery explicit before a user submits a goal", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /data-orbit-contact-discovery-goal/);
  assert.match(agentSource, /Contact discovery goal/);
  assert.match(agentSource, /Find a PoC buyer/);
  assert.match(agentSource, /Find an investor intro/);
  assert.match(agentSource, /Find an organizer intro/);
  assert.match(agentSource, /data-orbit-agent-example-prompt/);
  assert.match(agentSource, /data-orbit-agent-submit-label/);
});

test("contact detail mapping translates live source and relationship tokens into labels", async () => {
  const routeModule = await importProjectModule<{
    loadAppContactDetailRoute: (input: {
      contactId: string;
      liveContactGraphProvider: {
        source: string;
        sourceLabel: string;
        readContactGraph: () => never;
        readContactGraphForContact: (contactId: string) => {
          contacts: readonly unknown[];
          connections: readonly unknown[];
          evidence: readonly unknown[];
          generatedAt: string;
        };
      };
      mode: "live";
    }) => Promise<
      | { routeState: "success"; [key: string]: unknown }
      | { routeState: "empty" | "failure" | "pending"; [key: string]: unknown }
    >;
  }>(
    "app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts",
  );
  const adapterModule = await importProjectModule<{
    contactDetailRouteToOrbitContactsViewModel: (model: {
      routeState: "success";
      [key: string]: unknown;
    }) => {
      connections: readonly {
        encounters: readonly {
          context: {
            publicProfile: {
              industry: string;
              offering: readonly string[];
              topics: readonly string[];
            };
            reason: string;
          };
          eventId: string;
        }[];
        note: string;
        offering: string;
      }[];
      events: readonly { id: string; name: string }[];
    };
  }>(
    "app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter.ts",
  );
  const timestamp = "2026-07-01T10:00:00.000Z";
  const graph = {
    contacts: [
      {
        id: "contact_001",
        displayName: "佐藤 健一",
        organization: "North Star Foods",
        role: "Store Owner",
        location: "Osaka",
        profileSnippet:
          "Store owner looking for an AI workflow PoC buyer in Japanese SMB manufacturing.",
        stage: "reviewing",
        source: {
          type: "qr_scan",
          id: "source:qr_scan:contact_001",
          label: "Japan-China AI Workflow PoC Roundtable QR scan",
        },
        evidenceIds: ["evidence:contact:001"],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    connections: [
      {
        id: "connection_001",
        accountId: "account_001",
        contactId: "contact_001",
        stage: "reviewing",
        valueTypes: ["community_context", "referral_path"],
        summary:
          "Relationship context for 佐藤 健一: venture_capital, investor warm intro for seed fundraising; next action event table matching.",
        relationshipStrength: 82,
        businessRelevanceScore: 89,
        sharedTopics: ["venture_capital", "community_context"],
        suggestedActions: ["investor warm intro for seed fundraising"],
        source: {
          type: "qr_scan",
          id: "source:qr_scan:contact_001",
          label: "Japan-China AI Workflow PoC Roundtable QR scan",
        },
        evidenceIds: ["evidence:connection:001"],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    evidence: [
      {
        id: "evidence:contact:001",
        sourceType: "qr_scan",
        sourceId: "source:qr_scan:contact_001",
        summary: "QR scan at Japan-China AI Workflow PoC Roundtable.",
        occurredAt: timestamp,
        confidence: 0.92,
        createdBy: "route-test",
      },
      {
        id: "evidence:connection:001",
        sourceType: "manual",
        sourceId: "connection_001",
        summary:
          "Relationship context for 佐藤 健一: venture_capital, investor warm intro for seed fundraising.",
        occurredAt: timestamp,
        confidence: 0.88,
        createdBy: "route-test",
      },
    ],
    generatedAt: timestamp,
  };

  const routeModel = await routeModule.loadAppContactDetailRoute({
    actorId: "actor:contact-recommendations",
    contactId: "contact_001",
    liveContactGraphProvider: {
      source: "live-record-store:contacts:test",
      sourceLabel: "Test live contacts graph",
      readContactGraph() {
        throw new Error("contact detail route should read the focused graph");
      },
      readContactGraphForContact(contactId: string, actorId?: string) {
        assert.equal(contactId, "contact_001");
        assert.equal(actorId, "actor:contact-recommendations");
        return graph;
      },
    },
    mode: "live",
  });

  assert.equal(routeModel.routeState, "success");

  if (routeModel.routeState !== "success") return;

  const viewModel =
    adapterModule.contactDetailRouteToOrbitContactsViewModel(routeModel);
  const contact = viewModel.connections[0];
  const encounter = contact?.encounters[0];
  const visibleText = [
    contact?.note,
    contact?.offering,
    encounter?.context.reason,
    encounter?.context.publicProfile.industry,
    encounter?.context.publicProfile.offering.join(" "),
    encounter?.context.publicProfile.topics.join(" "),
    encounter?.eventId,
    viewModel.events[0]?.name,
  ].join(" ");

  assert.match(visibleText, /投资意向/);
  assert.match(visibleText, /社群上下文/);
  assert.match(visibleText, /种子轮融资投资人引荐/);
  assert.match(visibleText, /QR scan at Japan-China AI Workflow PoC Roundtable/);
  assert.doesNotMatch(
    visibleText,
    /investment interest|community context|venture_capital|community_context|event table matching and sponsor visibility|source:qr_scan:contact_001/,
  );
});

test("contact detail presenter exposes one identity, provenance, and follow-up surface", () => {
  const source = readProjectFile(
    "app/(app)/app/contacts/orbit-real-contacts.tsx",
  );

  assert.match(source, /const \[isMobileLayout, setIsMobileLayout\]/);
  assert.match(source, /data-orbit-contact-detail-summary="relationship-story"/);
  assert.match(source, /返回应用首页/);
  assert.doesNotMatch(source, /aria-hidden=\{isMobileLayout\}/);
  assert.doesNotMatch(source, /aria-hidden=\{!isMobileLayout\}/);
  assert.doesNotMatch(source, /display: isMobileLayout \? "none"/);
  assert.doesNotMatch(source, /display: isMobileLayout \? "flex" : "none"/);
  assert.match(source, /data-orbit-contact-detail-identity="primary"/);
  assert.match(source, /data-orbit-contact-detail-provenance="primary"/);
  assert.match(source, /data-orbit-contact-detail-follow-up="primary"/);
  assert.match(source, /data-orbit-contact-detail-actions="primary"/);
});

test("contact recommendation documentation records evaluation threshold and live replacement path", () => {
  const doc = readProjectFile(
    "features/orbit-ai/CONTACT_RECOMMENDATION_EVALUATION.md",
  );

  assert.match(doc, /Design -> Evaluation -> Analysis/i);
  assert.match(doc, /minimum ready score threshold/i);
  assert.match(doc, /72/);
  assert.match(doc, /live-service\.ts/);
  assert.match(doc, /provider\.ts/);
  assert.match(doc, /ORBIT_MODULE_MODE/);
  assert.match(doc, /server-seeded GET preview/i);
  assert.match(doc, /conversation-preview-service\.ts/);
  assert.match(doc, /privacy/i);
  assert.match(doc, /provenance/i);
  assert.match(doc, /replacement tests/i);
});
