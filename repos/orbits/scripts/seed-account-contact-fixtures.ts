import { createHash } from "node:crypto";

import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../shared/domain/contracts";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import { createConfiguredStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";

interface FixtureDefinition {
  displayName: string;
  organization: string;
  role: string;
  location: string;
  email: string;
  stage: ContactDTO["stage"];
  sourceType: ContactDTO["source"]["type"];
  sourceLabel: string;
  networkCategory: NonNullable<ContactDTO["networkCategory"]>;
  industry: string;
  valueTypes: ConnectionDTO["valueTypes"];
  relationshipStrength: number;
  businessRelevanceScore: number;
  trustLevel: NonNullable<ConnectionDTO["trustLevel"]>;
  sharedTopics: readonly string[];
  nextAction: string;
  summary: string;
}

const fixtures: readonly FixtureDefinition[] = [
  {
    displayName: "Mei Lin",
    organization: "Harbor Ventures",
    role: "Venture Partner",
    location: "Tokyo",
    email: "mei.lin@harbor.example.test",
    stage: "active",
    sourceType: "event_import",
    sourceLabel: "Tokyo AI Partner Meetup",
    networkCategory: "investor",
    industry: "Venture Capital",
    valueTypes: ["strategic_fit", "referral_path"],
    relationshipStrength: 92,
    businessRelevanceScore: 95,
    trustLevel: "trusted",
    sharedTopics: ["AI", "Japan market", "seed investment"],
    nextAction: "Share the AI partner pipeline before Friday.",
    summary: "Trusted investor relationship with strong Japan market context.",
  },
  {
    displayName: "Kenji Sato",
    organization: "Kumo Robotics",
    role: "Founder & CEO",
    location: "Yokohama",
    email: "kenji.sato@kumo.example.test",
    stage: "needs_follow_up",
    sourceType: "business_card_ocr",
    sourceLabel: "Business card scan",
    networkCategory: "prospect",
    industry: "Robotics",
    valueTypes: ["commercial_opportunity", "knowledge_exchange"],
    relationshipStrength: 58,
    businessRelevanceScore: 91,
    trustLevel: "warm",
    sharedTopics: ["robotics", "manufacturing", "computer vision"],
    nextAction: "Confirm a product demo time for next week.",
    summary: "Warm commercial prospect evaluating an AI vision pilot.",
  },
  {
    displayName: "Aiko Tanaka",
    organization: "Tokyo Founders Guild",
    role: "Community Director",
    location: "Tokyo",
    email: "aiko.tanaka@guild.example.test",
    stage: "needs_follow_up",
    sourceType: "referral",
    sourceLabel: "Referral from Mei Lin",
    networkCategory: "connector",
    industry: "Startup Community",
    valueTypes: ["community_context", "referral_path"],
    relationshipStrength: 72,
    businessRelevanceScore: 82,
    trustLevel: "trusted",
    sharedTopics: ["founders", "community", "events"],
    nextAction: "Send the founder roundtable guest profile.",
    summary: "High-trust connector across Tokyo founder communities.",
  },
  {
    displayName: "Priya Rao",
    organization: "Nimbus Systems",
    role: "AI Delivery Director",
    location: "Singapore",
    email: "priya.rao@nimbus.example.test",
    stage: "reviewing",
    sourceType: "external_contacts",
    sourceLabel: "External contacts import",
    networkCategory: "partner",
    industry: "Enterprise AI",
    valueTypes: ["commercial_opportunity", "strategic_fit"],
    relationshipStrength: 76,
    businessRelevanceScore: 94,
    trustLevel: "warm",
    sharedTopics: ["enterprise AI", "delivery", "Southeast Asia"],
    nextAction: "Review the joint delivery model and ownership split.",
    summary: "Potential delivery partner for regional enterprise AI projects.",
  },
  {
    displayName: "Sofia Martinez",
    organization: "Mercado Bridge",
    role: "Cross-border Commerce Lead",
    location: "Osaka",
    email: "sofia.martinez@mercado.example.test",
    stage: "nurture",
    sourceType: "qr_scan",
    sourceLabel: "QR profile exchange",
    networkCategory: "partner",
    industry: "Cross-border Commerce",
    valueTypes: ["knowledge_exchange", "commercial_opportunity"],
    relationshipStrength: 49,
    businessRelevanceScore: 78,
    trustLevel: "emerging",
    sharedTopics: ["ecommerce", "Latin America", "Japan"],
    nextAction: "Share the Japan market entry checklist.",
    summary: "Emerging cross-border commerce relationship with mutual learning value.",
  },
  {
    displayName: "Omar Rahman",
    organization: "Atlas Cloud",
    role: "Regional Partnerships VP",
    location: "Dubai",
    email: "omar.rahman@atlas.example.test",
    stage: "active",
    sourceType: "email_signal",
    sourceLabel: "Confirmed email metadata",
    networkCategory: "partner",
    industry: "Cloud Infrastructure",
    valueTypes: ["strategic_fit", "commercial_opportunity"],
    relationshipStrength: 84,
    businessRelevanceScore: 89,
    trustLevel: "trusted",
    sharedTopics: ["cloud", "partnerships", "Middle East"],
    nextAction: "Prepare the co-selling account shortlist.",
    summary: "Trusted regional partner with active co-selling opportunities.",
  },
  {
    displayName: "Hana Mori",
    organization: "Green Table Collective",
    role: "Sustainability Advisor",
    location: "Kyoto",
    email: "hana.mori@greentable.example.test",
    stage: "captured",
    sourceType: "manual",
    sourceLabel: "Manual contact note",
    networkCategory: "advisor",
    industry: "Sustainability",
    valueTypes: ["knowledge_exchange", "community_context"],
    relationshipStrength: 35,
    businessRelevanceScore: 64,
    trustLevel: "emerging",
    sharedTopics: ["sustainability", "hospitality", "Kyoto"],
    nextAction: "Validate the sustainability workshop outline.",
    summary: "New advisor contact with hospitality sustainability expertise.",
  },
  {
    displayName: "Lucas Chen",
    organization: "Northstar SaaS",
    role: "Revenue Operations Head",
    location: "Taipei",
    email: "lucas.chen@northstar.example.test",
    stage: "needs_follow_up",
    sourceType: "calendar_signal",
    sourceLabel: "Confirmed calendar meeting",
    networkCategory: "customer",
    industry: "B2B SaaS",
    valueTypes: ["commercial_opportunity"],
    relationshipStrength: 63,
    businessRelevanceScore: 88,
    trustLevel: "warm",
    sharedTopics: ["SaaS", "RevOps", "automation"],
    nextAction: "Send the revised automation proof-of-concept scope.",
    summary: "Warm customer relationship with a defined automation use case.",
  },
  {
    displayName: "Emma Wilson",
    organization: "Studio Current",
    role: "Brand Strategy Principal",
    location: "London",
    email: "emma.wilson@current.example.test",
    stage: "archived",
    sourceType: "external_contacts",
    sourceLabel: "External contacts import",
    networkCategory: "advisor",
    industry: "Brand Strategy",
    valueTypes: ["knowledge_exchange"],
    relationshipStrength: 28,
    businessRelevanceScore: 42,
    trustLevel: "emerging",
    sharedTopics: ["brand", "design", "consumer"],
    nextAction: "Revisit when the consumer launch plan is active.",
    summary: "Dormant brand advisor relationship retained for future launch work.",
  },
  {
    displayName: "Daichi Kobayashi",
    organization: "Seishin Manufacturing",
    role: "Digital Transformation Manager",
    location: "Nagoya",
    email: "daichi.kobayashi@seishin.example.test",
    stage: "reviewing",
    sourceType: "event_import",
    sourceLabel: "Manufacturing AI Summit",
    networkCategory: "prospect",
    industry: "Manufacturing",
    valueTypes: ["commercial_opportunity", "knowledge_exchange"],
    relationshipStrength: 54,
    businessRelevanceScore: 86,
    trustLevel: "warm",
    sharedTopics: ["manufacturing", "quality control", "AI"],
    nextAction: "Map the quality-inspection data requirements.",
    summary: "Manufacturing prospect exploring computer-vision quality control.",
  },
  {
    displayName: "Nora Fischer",
    organization: "Alpine Health",
    role: "Innovation Program Lead",
    location: "Berlin",
    email: "nora.fischer@alpine.example.test",
    stage: "nurture",
    sourceType: "referral",
    sourceLabel: "Partner referral",
    networkCategory: "prospect",
    industry: "Digital Health",
    valueTypes: ["strategic_fit", "knowledge_exchange"],
    relationshipStrength: 46,
    businessRelevanceScore: 73,
    trustLevel: "emerging",
    sharedTopics: ["healthcare", "privacy", "innovation"],
    nextAction: "Share the privacy architecture overview.",
    summary: "Early digital-health relationship requiring a privacy-first approach.",
  },
  {
    displayName: "Rafael Costa",
    organization: "Lumen Hospitality",
    role: "Growth Director",
    location: "Lisbon",
    email: "rafael.costa@lumen.example.test",
    stage: "active",
    sourceType: "business_card_ocr",
    sourceLabel: "Business card scan",
    networkCategory: "customer",
    industry: "Hospitality",
    valueTypes: ["commercial_opportunity", "community_context"],
    relationshipStrength: 79,
    businessRelevanceScore: 87,
    trustLevel: "trusted",
    sharedTopics: ["hospitality", "inbound travel", "CRM"],
    nextAction: "Review the CRM rollout results and expansion sites.",
    summary: "Trusted hospitality customer with a successful initial CRM rollout.",
  },
];

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;

  return value?.trim() || null;
}

function actorKey(actorId: string): string {
  return createHash("sha256").update(actorId).digest("hex").slice(0, 10);
}

function timestampFor(index: number): string {
  return new Date(Date.UTC(2026, 6, 26 - index * 3, 9, 30)).toISOString();
}

async function main(): Promise<void> {
  const email = argumentValue("--email");
  if (!email) {
    throw new Error("Usage: --email <test-account-email>");
  }

  const authProvider = createConfiguredStorageAuthUserProvider();
  const configuredStore = createConfiguredPostgresLiveRecordStore();
  if (!authProvider || !configuredStore) {
    throw new Error("The configured live store is unavailable.");
  }

  const actor = await authProvider.getUserByEmail(email);
  if (!actor) {
    throw new Error(`No account exists for ${email}.`);
  }

  const key = actorKey(actor.id);
  for (const [index, fixture] of fixtures.entries()) {
    const suffix = String(index + 1).padStart(2, "0");
    const contactId = `test-contact-${key}-${suffix}`;
    const connectionId = `test-connection-${key}-${suffix}`;
    const evidenceId = `test-evidence-${key}-${suffix}`;
    const timestamp = timestampFor(index);
    const source = {
      type: fixture.sourceType,
      id: `test-source-${key}-${suffix}`,
      label: fixture.sourceLabel,
    } as const;
    const evidence: RelationshipEvidenceDTO = {
      id: evidenceId,
      sourceType: fixture.sourceType,
      sourceId: source.id,
      summary: fixture.summary,
      occurredAt: timestamp,
      confidence: 0.9,
      createdBy: actor.id,
    };
    const contact: ContactDTO = {
      id: contactId,
      personId: `test-person-${key}-${suffix}`,
      displayName: fixture.displayName,
      organization: fixture.organization,
      role: fixture.role,
      location: fixture.location,
      primaryEmail: fixture.email,
      profileSnippet: fixture.summary,
      stage: fixture.stage,
      handles: { email: fixture.email },
      publicProfile: {
        bio: fixture.summary,
        industry: fixture.industry,
        offering: fixture.sharedTopics.slice(0, 2),
        seeking: [fixture.nextAction],
        topics: fixture.sharedTopics,
        conversationPrompts: [fixture.nextAction],
      },
      networkCategory: fixture.networkCategory,
      nextAction: {
        text: fixture.nextAction,
        reason: fixture.summary,
        evidenceId,
      },
      source,
      evidenceIds: [evidenceId],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const connection: ConnectionDTO = {
      id: connectionId,
      accountId: actor.id,
      contactId,
      stage: fixture.stage,
      valueTypes: fixture.valueTypes,
      summary: fixture.summary,
      relationshipStrength: fixture.relationshipStrength,
      trustLevel: fixture.trustLevel,
      businessRelevanceScore: fixture.businessRelevanceScore,
      sharedTopics: fixture.sharedTopics,
      suggestedActions: [fixture.nextAction],
      source,
      evidenceIds: [evidenceId],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await configuredStore.store.upsertRecord({
      workspaceId: configuredStore.workspaceId,
      collectionName: "evidence",
      recordId: evidenceId,
      userId: actor.id,
      sourceType: fixture.sourceType,
      sourceId: source.id,
      sourceLabel: fixture.sourceLabel,
      evidenceIds: [evidenceId],
      occurredAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      lifecycleState: "active",
      searchText: `${fixture.displayName} ${fixture.summary}`,
      payload: evidence as unknown as Record<string, unknown>,
    });
    await configuredStore.store.upsertRecord({
      workspaceId: configuredStore.workspaceId,
      collectionName: "contacts",
      recordId: contactId,
      userId: actor.id,
      sourceType: fixture.sourceType,
      sourceId: source.id,
      sourceLabel: fixture.sourceLabel,
      provider: "orbit-account-contact-fixtures",
      providerRecordId: contactId,
      targetType: "contact",
      targetId: contactId,
      evidenceIds: [evidenceId],
      occurredAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      lifecycleState: "active",
      searchText: [
        fixture.displayName,
        fixture.organization,
        fixture.role,
        fixture.location,
        fixture.industry,
        ...fixture.sharedTopics,
      ].join(" "),
      payload: contact as unknown as Record<string, unknown>,
    });
    await configuredStore.store.upsertRecord({
      workspaceId: configuredStore.workspaceId,
      collectionName: "connections",
      recordId: connectionId,
      userId: actor.id,
      sourceType: fixture.sourceType,
      sourceId: source.id,
      sourceLabel: fixture.sourceLabel,
      provider: "orbit-account-contact-fixtures",
      providerRecordId: connectionId,
      targetType: "connection",
      targetId: connectionId,
      evidenceIds: [evidenceId],
      occurredAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      lifecycleState: "active",
      searchText: `${fixture.displayName} ${fixture.summary} ${fixture.sharedTopics.join(" ")}`,
      payload: connection as unknown as Record<string, unknown>,
    });
  }

  console.log(
    JSON.stringify({
      accountId: actor.id,
      contactsUpserted: fixtures.length,
      fixtureSet: `account-network-${key}`,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Contact fixture seeding failed.");
  process.exitCode = 1;
});
