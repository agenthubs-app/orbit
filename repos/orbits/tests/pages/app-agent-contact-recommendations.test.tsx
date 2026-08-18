import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defaultMockFixtures } from "../../shared/mock/fixtures";

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
  assert.equal(first?.title, defaultMockFixtures.contacts[0]?.displayName);
  assert.match(first?.reason ?? "", /why this person/i);
  assert.match(first?.body ?? "", /Evidence/i);
  assert.match(first?.confidenceLabel ?? "", /confidence/i);
  assert.ok(first?.evidenceIds.includes("evidence:contact:001"));
  assert.equal(first?.actions[0]?.href, "/app/contacts/contact_001");
  assert.equal(first?.actions[0]?.requiresConfirmation, true);
  assert.equal(
    first?.metadata.find((item) => item.label === "Contact")?.value,
    defaultMockFixtures.contacts[0]?.displayName,
  );
  assert.ok(
    first?.metadata.find((item) => item.label === "Score")?.value,
  );
});

test("/app/agent maps contact artifacts into reason, confidence, evidence, and detail-card fields", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(pageSource, /searchParams/);
  assert.match(pageSource, /loadAppChatRouteViewModel/);
  assert.match(pageSource, /composeOrbitAgentEntryViewModel/);
  assert.match(agentSource, /currentAgentQuery\(\)/);
  assert.match(agentSource, /artifactOfKind\(\s*payload\.data\.artifacts,\s*"contact_recommendations"/);
  assert.match(agentSource, /peopleItemsFromArtifact\(contactArtifact\)/);
  assert.match(agentSource, /industry: item\.confidenceLabel/);
  assert.match(agentSource, /opener: item\.body/);
  assert.match(agentSource, /reason: item\.reason/);
  assert.match(agentSource, /function AgentPeopleRow/);
  assert.match(agentSource, /navigate\(`\/app\/contacts\/\$\{connection\.id\}`\)/);
  assert.match(agentSource, /requestMessageDraft/);
  assert.match(agentSource, /data-agent-inline-draft-error-code/);
  assert.match(agentSource, /data-agent-inline-draft/);
  assert.match(agentSource, /生成跟进草稿/);
  assert.match(agentSource, /panel\.items\.slice\(0, initialLimit\)/);
  assert.match(agentSource, /data-agent-recommendations-toggle/);
  assert.match(agentSource, /查看完整处理过程/);
  assert.match(agentSource, /<details data-agent-run-details/);
  assert.match(agentSource, /<AgentEvidenceSources/);
  assert.match(agentSource, /onKeyDown=\{toggleAgentEvidenceSourcesFromKeyboard\}/);
  assert.match(agentSource, /details\.open = !details\.open/);
});

test("contact artifact mapping preserves actor-scoped contact ids", async () => {
  const { contactIdFromArtifactItemId } = await importProjectModule<{
    contactIdFromArtifactItemId: (value: unknown) => string;
  }>("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.equal(
    contactIdFromArtifactItemId(
      "contact-recommendation:iorbit-qa:contact_042",
    ),
    "iorbit-qa:contact_042",
  );
  assert.equal(
    contactIdFromArtifactItemId("contact-recommendation:contact_001"),
    "contact_001",
  );
});

test("/app/agent makes contact and event discovery explicit before submission", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /viewModel\.suggests\.map/);
  assert.match(agentSource, /onPick\(suggest\.q\)/);
  assert.match(agentSource, /It can see your events, registration answers/);
  assert.match(agentSource, /just say the goal/);
  // 输入框现在由全局组件渲染（layout 级），断言跟着组件走。
  const composerSource = readProjectFile("app/(app)/app/orbit-global-ask/orbit-global-ask.tsx");
  assert.match(composerSource, /Ask Orbit about contacts, events, and relationship to-dos/);
  assert.match(composerSource, /data-orbit-agent-submit="true"/);
});

test("contact detail mapping translates live source and relationship tokens into labels", async () => {
  const routeModule = await importProjectModule<{
    loadAppContactDetailRoute: (input: {
      actorId?: string | null;
      contactId: string;
      liveContactGraphProvider: {
        source: string;
        sourceLabel: string;
        readContactGraph: () => never;
        readContactGraphForContact: (contactId: string, actorId?: string) => {
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
  assert.match(visibleText, /种子轮融资的投资人暖介绍/);
  assert.match(visibleText, /QR scan at Japan-China AI Workflow PoC Roundtable/);
  assert.doesNotMatch(
    visibleText,
    /investment interest|community context|venture_capital|community_context|event table matching and sponsor visibility|source:qr_scan:contact_001/,
  );
});

test("contact detail presenter exposes one identity, provenance, and follow-up surface", () => {
  const source = readProjectFile(
    "app/(app)/app/contacts/orbit-real-card-connection.tsx",
  );

  assert.match(source, /className="orbit-desktop-only"/);
  assert.match(source, /className="orbit-mobile-only"/);
  assert.match(source, /<OrbitContactAvatar contact=\{contact\}/);
  assert.match(source, /<SourceBadge source=\{contact\.source\}/);
  assert.match(source, /data-agent-context="contact"/);
  assert.match(source, /data-inbox-compose/);
  assert.match(source, /<TimelineCard contact=\{contact\}/);
  assert.match(source, /<NextStepCard(?: compact)? contact=\{contact\}/);
  assert.doesNotMatch(source, /isMobileLayout|setIsMobileLayout/);
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
