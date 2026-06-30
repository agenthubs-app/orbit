/**
 * Local/remote relationship schema 测试。
 *
 * 验证本地远程同步数据库 schema、表集合和 source-backed 记录形状。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION,
  createOrbitLocalRemoteDatabase,
} from "../../shared/local-remote-store/orbit-database";
import { MOCK_FIXTURE_COLLECTION_NAMES } from "../../shared/mock/fixtures";
import {
  isAiAnalysisType,
  isInteractionMemoryType,
  isMatchRecommendationType,
  isRecommendationTestExpectedOutcome,
} from "../../shared/domain/source-types";

type RefRecord = { id: string };
type SourceBackedRecord = {
  source: {
    type: string;
    id: string;
  };
};

type RelationshipSchemaState = {
  accounts: RefRecord[];
  profiles: RefRecord[];
  events: RefRecord[];
  networkPeople: Array<
    RefRecord &
      SourceBackedRecord & {
      personKind: "platform_user" | "external_contact";
      platformUserId?: string;
      evidenceIds: readonly string[];
    }
  >;
  personRelationshipEdges: Array<
    RefRecord &
      SourceBackedRecord & {
      fromPersonId: string;
      toPersonId: string;
      introducedByPersonId?: string;
      connectionMethod:
        | "offline_meeting"
        | "business_card"
        | "qr_scan"
        | "referral"
        | "shared_event";
      relationshipStrength: number;
      trustLevel: string;
      sharedTopics: readonly string[];
      evidenceIds: readonly string[];
    }
  >;
  attendees: Array<RefRecord & { eventId: string; personId: string; contactId?: string }>;
  contacts: Array<RefRecord & SourceBackedRecord & { personId: string; evidenceIds: readonly string[] }>;
  connections: Array<
    RefRecord & {
      contactId: string;
      relationshipStrength: number;
      trustLevel: string;
      businessRelevanceScore: number;
      sharedTopics: readonly string[];
      suggestedActions: readonly string[];
      evidenceIds: readonly string[];
    }
  >;
  evidence: RefRecord[];
  conversations: RefRecord[];
  messages: Array<RefRecord & { conversationId: string }>;
  eventParticipantIntents: Array<
    RefRecord &
      SourceBackedRecord & {
      eventId: string;
      attendeeId: string;
      personId: string;
      contactId?: string;
      lookingFor: readonly string[];
      canOffer: readonly string[];
      preferredLanguage: string;
      evidenceIds: readonly string[];
    }
  >;
  aiAnalyses: Array<
    RefRecord &
      SourceBackedRecord & {
      analysisType: string;
      target: { type: string; id: string };
      resultJson: Record<string, unknown>;
      confidence: number;
      evidenceIds: readonly string[];
    }
  >;
  matchRecommendations: Array<
    RefRecord &
      SourceBackedRecord & {
      eventId: string;
      attendeeId?: string;
      targetPersonId: string;
      contactId?: string;
      connectionId?: string;
      introducedByPersonId?: string;
      recommendationType: string;
      score: number;
      businessRelevanceScore: number;
      sharedTopics: readonly string[];
      suggestedActions: readonly string[];
      evidenceIds: readonly string[];
    }
  >;
  interactionMemories: Array<
    RefRecord &
      SourceBackedRecord & {
      contactId: string;
      connectionId?: string;
      conversationId?: string;
      messageId?: string;
      memoryType: string;
      confidence: number;
      evidenceIds: readonly string[];
    }
  >;
  recommendationTests: Array<
    RefRecord &
      SourceBackedRecord & {
      caseType: "golden_match" | "negative_case" | "dirty_data";
      eventId: string;
      attendeeId?: string;
      targetPersonId?: string;
      contactId?: string;
      connectionId?: string;
      recommendationId?: string;
      expectedOutcome: string;
      confidence: number;
      evidenceIds: readonly string[];
    }
  >;
};

function idSet(records: readonly RefRecord[]): Set<string> {
  return new Set(records.map((record) => record.id));
}

function assertEvidenceBacked(
  recordName: string,
  evidenceIds: readonly string[],
  evidenceIdsInState: Set<string>,
): void {
  assert.ok(evidenceIds.length > 0, `${recordName} must be evidence backed`);

  for (const evidenceId of evidenceIds) {
    assert.ok(
      evidenceIdsInState.has(evidenceId),
      `${recordName} references missing evidence ${evidenceId}`,
    );
  }
}

function assertSourceBacked(recordName: string, record: SourceBackedRecord): void {
  assert.ok(record.source.type, `${recordName} must include a source type`);
  assert.ok(record.source.id, `${recordName} must include a source id`);
}

function assertDocIncludes(
  docName: string,
  content: string,
  expectedExcerpt: string,
): void {
  assert.ok(
    content.includes(expectedExcerpt),
    `${docName} must include: ${expectedExcerpt}`,
  );
}

test("relationship schema advances the local remote database and preserves product collections", () => {
  assert.equal(ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION, 3);

  for (const collectionName of [
    "accounts",
    "profiles",
    "events",
    "networkPeople",
    "personRelationshipEdges",
    "attendees",
    "contacts",
    "connections",
    "evidence",
    "tasks",
    "conversations",
    "messages",
    "dashboards",
    "agentActions",
    "permissions",
    "notifications",
    "eventParticipantIntents",
    "aiAnalyses",
    "matchRecommendations",
    "interactionMemories",
    "recommendationTests",
  ]) {
    assert.ok(
      MOCK_FIXTURE_COLLECTION_NAMES.includes(
        collectionName as (typeof MOCK_FIXTURE_COLLECTION_NAMES)[number],
      ),
      `${collectionName} must be registered as a fixture collection`,
    );
  }

  const state = createOrbitLocalRemoteDatabase().getState() as unknown as RelationshipSchemaState;

  assert.ok(state.eventParticipantIntents.length > 0);
  assert.ok(state.aiAnalyses.length > 0);
  assert.ok(state.matchRecommendations.length > 0);
  assert.ok(state.interactionMemories.length > 0);
  assert.ok(state.recommendationTests.length > 0);
});

test("generated relationship fixture separates platform people from current-user contacts", () => {
  const state = createOrbitLocalRemoteDatabase().getState() as unknown as RelationshipSchemaState;
  const personIds = idSet(state.networkPeople);
  const contactPersonIds = new Set(state.contacts.map((contact) => contact.personId));
  const platformPeople = state.networkPeople.filter(
    (person) => person.personKind === "platform_user",
  );
  const externalPeople = state.networkPeople.filter(
    (person) => person.personKind === "external_contact",
  );
  const concreteContactSourceTypes = new Set([
    "manual",
    "business_card_ocr",
    "qr_scan",
    "referral",
  ]);

  assert.ok(state.networkPeople.length >= 120, "relationship fixture keeps a broad person pool");
  assert.ok(platformPeople.length > 0, "platform users must be represented");
  assert.ok(externalPeople.length > 0, "external contacts must be represented");
  assert.ok(
    externalPeople.length / state.networkPeople.length >= 0.25,
    "external-only personal contacts should be a meaningful share of the people pool",
  );
  assert.ok(
    state.contacts.length < state.networkPeople.length,
    "the current user must not know everyone in the people pool",
  );
  assert.ok(
    platformPeople.some((person) => !contactPersonIds.has(person.id)),
    "some platform users should remain outside the current user's contacts",
  );

  for (const person of externalPeople) {
    assert.ok(
      contactPersonIds.has(person.id),
      `${person.id} external person must exist only as the current user's own contact data`,
    );
  }

  for (const contact of state.contacts) {
    assert.ok(personIds.has(contact.personId), `${contact.id} person exists`);
    assert.notEqual(
      contact.source.type,
      "event_import",
      `${contact.id} must not be created from passive event import alone`,
    );
    assert.ok(
      concreteContactSourceTypes.has(contact.source.type),
      `${contact.id} must be backed by a concrete meeting, card, scan, or referral source`,
    );
  }

  assert.ok(
    state.attendees.some((attendee) => !attendee.contactId),
    "event rosters should include people who are not current-user contacts",
  );
  for (const attendee of state.attendees) {
    assert.ok(personIds.has(attendee.personId), `${attendee.id} person exists`);
  }

  assert.ok(
    state.matchRecommendations.some(
      (recommendation) => recommendation.targetPersonId && !recommendation.contactId,
    ),
    "some recommendations should target platform people who are not current-user contacts",
  );
});

test("generated relationship fixture keeps a non-current-user platform graph", () => {
  const state = createOrbitLocalRemoteDatabase().getState() as unknown as RelationshipSchemaState;
  const platformPersonIds = new Set(
    state.networkPeople
      .filter((person) => person.personKind === "platform_user")
      .map((person) => person.id),
  );
  const edgeSourcePersonIds = new Set(
    state.personRelationshipEdges.map((edge) => edge.fromPersonId),
  );
  const edgeTargetPersonIds = new Set(
    state.personRelationshipEdges.map((edge) => edge.toPersonId),
  );

  assert.ok(
    state.personRelationshipEdges.length >= platformPersonIds.size * 3,
    "platform graph should be dense enough for agent recommendation tests",
  );
  assert.ok(
    edgeSourcePersonIds.size >= Math.floor(platformPersonIds.size * 0.6),
    "platform graph should not be centered on one source person",
  );
  assert.ok(
    edgeTargetPersonIds.size >= Math.floor(platformPersonIds.size * 0.6),
    "platform graph should not point at only a few target people",
  );

  for (const edge of state.personRelationshipEdges) {
    assert.notEqual(edge.fromPersonId, edge.toPersonId, `${edge.id} must not be self-referential`);
    assert.ok(platformPersonIds.has(edge.fromPersonId), `${edge.id} source platform person exists`);
    assert.ok(platformPersonIds.has(edge.toPersonId), `${edge.id} target platform person exists`);
    if (edge.introducedByPersonId) {
      assert.ok(
        platformPersonIds.has(edge.introducedByPersonId),
        `${edge.id} introducer platform person exists`,
      );
    }
    assert.ok(edge.relationshipStrength > 0 && edge.relationshipStrength <= 100);
    assert.ok(edge.sharedTopics.length > 0);
    assertSourceBacked(edge.id, edge);
  }
});

test("event intent and relationship profile fields are directly queryable and source backed", () => {
  const state = createOrbitLocalRemoteDatabase().getState() as unknown as RelationshipSchemaState;
  const evidenceIds = idSet(state.evidence);

  const intent = state.eventParticipantIntents[0];

  assert.ok(intent, "event participant intent must be seeded");
  assert.ok(intent.eventId, "intent must keep eventId query field");
  assert.ok(intent.attendeeId, "intent must keep attendeeId query field");
  assert.ok(intent.lookingFor.length > 0);
  assert.ok(intent.canOffer.length > 0);
  assert.ok(["ja", "en", "zh", "mixed"].includes(intent.preferredLanguage));
  assertSourceBacked(intent.id, intent);
  assertEvidenceBacked(intent.id, intent.evidenceIds, evidenceIds);

  const connection = state.connections[0];

  assert.ok(connection, "connection must be seeded");
  assert.ok(connection.relationshipStrength >= 0 && connection.relationshipStrength <= 100);
  assert.ok(["unverified", "emerging", "warm", "trusted"].includes(connection.trustLevel));
  assert.ok(connection.businessRelevanceScore >= 0 && connection.businessRelevanceScore <= 100);
  assert.ok(connection.sharedTopics.length > 0);
  assert.ok(connection.suggestedActions.length > 0);
  assertEvidenceBacked(
    connection.id,
    connection.evidenceIds,
    evidenceIds,
  );
});

test("semantic relationship discriminator fields use shared runtime type guards", () => {
  const state = createOrbitLocalRemoteDatabase().getState() as unknown as RelationshipSchemaState;

  for (const analysis of state.aiAnalyses) {
    assert.equal(
      isAiAnalysisType(analysis.analysisType),
      true,
      `${analysis.id} analysisType must be a shared schema value`,
    );
  }

  for (const recommendation of state.matchRecommendations) {
    assert.equal(
      isMatchRecommendationType(recommendation.recommendationType),
      true,
      `${recommendation.id} recommendationType must be a shared schema value`,
    );
    assert.ok(
      recommendation.businessRelevanceScore >= 0 &&
        recommendation.businessRelevanceScore <= 100,
      `${recommendation.id} businessRelevanceScore must be score-shaped`,
    );
    assert.ok(recommendation.sharedTopics.length > 0);
    assert.ok(recommendation.suggestedActions.length > 0);
  }

  for (const memory of state.interactionMemories) {
    assert.equal(
      isInteractionMemoryType(memory.memoryType),
      true,
      `${memory.id} memoryType must be a shared schema value`,
    );
  }

  for (const record of state.recommendationTests) {
    assert.equal(
      isRecommendationTestExpectedOutcome(record.expectedOutcome),
      true,
      `${record.id} expectedOutcome must be a shared schema value`,
    );
  }
});

test("semantic relationship records resolve their cross-record references", () => {
  const state = createOrbitLocalRemoteDatabase().getState() as unknown as RelationshipSchemaState;
  const targetIdsByType = new Map<string, Set<string>>([
    ["account", idSet(state.accounts)],
    ["profile", idSet(state.profiles)],
    ["event", idSet(state.events)],
    ["attendee", idSet(state.attendees)],
    ["contact", idSet(state.contacts)],
    ["connection", idSet(state.connections)],
    ["conversation", idSet(state.conversations)],
    ["message", idSet(state.messages)],
  ]);
  const personIds = idSet(state.networkPeople);
  const eventIds = idSet(state.events);
  const attendeeIds = idSet(state.attendees);
  const contactIds = idSet(state.contacts);
  const connectionIds = idSet(state.connections);
  const recommendationIds = idSet(state.matchRecommendations);
  const evidenceIds = idSet(state.evidence);

  for (const analysis of state.aiAnalyses) {
    assert.ok(analysis.id, "AI analysis id must be stable");
    assert.ok(analysis.confidence > 0 && analysis.confidence <= 1);
    assert.ok(
      Object.keys(analysis.resultJson).length > 0,
      `${analysis.id} must keep volatile AI output in resultJson`,
    );
    assertSourceBacked(analysis.id, analysis);
    assert.ok(
      targetIdsByType.get(analysis.target.type)?.has(analysis.target.id),
      `${analysis.id} target must resolve`,
    );
    assertEvidenceBacked(analysis.id, analysis.evidenceIds, evidenceIds);
  }

  for (const recommendation of state.matchRecommendations) {
    assert.ok(eventIds.has(recommendation.eventId), `${recommendation.id} event exists`);
    assert.ok(
      personIds.has(recommendation.targetPersonId),
      `${recommendation.id} target person exists`,
    );
    if (recommendation.contactId) {
      assert.ok(contactIds.has(recommendation.contactId), `${recommendation.id} contact exists`);
    }
    assert.ok(recommendation.score > 0 && recommendation.score <= 100);
    assert.ok(recommendation.suggestedActions.length > 0);
    assertSourceBacked(recommendation.id, recommendation);
    if (recommendation.attendeeId) {
      assert.ok(
        attendeeIds.has(recommendation.attendeeId),
        `${recommendation.id} attendee exists`,
      );
    }
    if (recommendation.connectionId) {
      assert.ok(
        connectionIds.has(recommendation.connectionId),
        `${recommendation.id} connection exists`,
      );
    }
    assertEvidenceBacked(recommendation.id, recommendation.evidenceIds, evidenceIds);
  }

  for (const memory of state.interactionMemories) {
    assert.ok(contactIds.has(memory.contactId), `${memory.id} contact exists`);
    assert.ok(memory.confidence > 0 && memory.confidence <= 1);
    assertSourceBacked(memory.id, memory);
    if (memory.connectionId) {
      assert.ok(connectionIds.has(memory.connectionId), `${memory.id} connection exists`);
    }
    if (memory.conversationId) {
      assert.ok(targetIdsByType.get("conversation")?.has(memory.conversationId));
    }
    if (memory.messageId) {
      assert.ok(targetIdsByType.get("message")?.has(memory.messageId));
    }
    assertEvidenceBacked(memory.id, memory.evidenceIds, evidenceIds);
  }

  assert.deepEqual(
    new Set(state.recommendationTests.map((record) => record.caseType)),
    new Set(["golden_match", "negative_case", "dirty_data"]),
  );

  for (const record of state.recommendationTests) {
    assert.ok(eventIds.has(record.eventId), `${record.id} event exists`);
    assert.ok(record.confidence > 0 && record.confidence <= 1);
    assertSourceBacked(record.id, record);
    if (record.attendeeId) {
      assert.ok(attendeeIds.has(record.attendeeId), `${record.id} attendee exists`);
    }
    if (record.targetPersonId) {
      assert.ok(
        personIds.has(record.targetPersonId),
        `${record.id} target person exists`,
      );
    }
    if (record.contactId) {
      assert.ok(contactIds.has(record.contactId), `${record.id} contact exists`);
    }
    if (record.connectionId) {
      assert.ok(connectionIds.has(record.connectionId), `${record.id} connection exists`);
    }
    if (record.recommendationId) {
      assert.ok(
        recommendationIds.has(record.recommendationId),
        `${record.id} recommendation exists`,
      );
    }
    assertEvidenceBacked(record.id, record.evidenceIds, evidenceIds);
  }
});

test("relationship schema decision document keeps an auditable sprint 81 field matrix", () => {
  const doc = readFileSync("docs/architecture/local-remote-database.md", "utf8");

  for (const expectedExcerpt of [
    "## Sprint 81 Decision Audit",
    "- Event intent: promote event-specific `lookingFor`, `canOffer`, and `preferredLanguage` on `eventParticipantIntents`; keep attendee import facts on `attendees`; reject global contact intent fields because intent changes by event.",
    "- AI analyses: promote `analysisType`, `target`, `confidence`, `source`, and `evidenceIds`; keep volatile interpretation, rejected fields, and scoring rationale in `resultJson`; reject raw prompts, chain-of-thought, model names, and provider token usage on product rows.",
    "- People graph: promote `networkPeople` and `personRelationshipEdges`; keep platform users, external non-platform contacts, current-user contacts, and platform-to-platform relationship edges as separate concepts.",
    "- Contact boundary: require current-user `contacts` to reference `personId` and concrete relationship evidence; reject event attendance or platform membership as automatic contact creation.",
    "- Relationship profiles: keep identity on `contacts` and relationship state on `connections`; promote `relationshipStrength`, `trustLevel`, `businessRelevanceScore`, `sharedTopics`, and `suggestedActions` on `connections`; reject personality, chemistry, and likability labels.",
    "- Interaction memory: keep raw interaction history in `conversations` and `messages`; add `interactionMemories` for durable contact/connection/conversation/message summaries; reject storing memories only inside AI analysis JSON.",
    "- Recommendations: add `matchRecommendations` with top-level event/contact/attendee/connection or `targetPersonId` references, `score`, `businessRelevanceScore`, `sharedTopics`, and `suggestedActions`; reject recommendation ranking that requires parsing AI JSON.",
    "- Golden matches, negative cases, and dirty cases: keep these regression artifacts in `recommendationTests` with `caseType`, `expectedOutcome`, confidence, source, and evidence; reject mixing them into production contacts, connections, or recommendation feeds.",
  ]) {
    assertDocIncludes(
      "docs/architecture/local-remote-database.md",
      doc,
      expectedExcerpt,
    );
  }
});

test("mock-to-live document records the remote replacement gates for the relationship schema", () => {
  const doc = readFileSync(
    "shared/local-remote-store/RELATIONSHIP_SCHEMA_LIVE_IMPLEMENTATION.md",
    "utf8",
  );

  for (const expectedExcerpt of [
    "## Sprint 81 Evidence Summary",
    "- Early evidence excerpt: remote provider files, semantic tables, indexes, JSON boundaries, privacy/provenance gates, migration/version behavior, and replacement tests are summarized here so Sprint 81 verification can confirm the live handoff without relying on later truncated sections.",
    "## Sprint 81 Live Replacement Audit",
    "- Remote table ownership: preserve product tables and add only `network_people`, `person_relationship_edges`, `event_participant_intents`, `ai_analyses`, `match_recommendations`, `interaction_memories`, and `recommendation_tests` for Sprint 81 relationship data.",
    "- Query indexes required before live switch: `network_people(person_kind)`, `person_relationship_edges(from_person_id, relationship_strength)`, `event_participant_intents(event_id, attendee_id)`, `connections(account_id, business_relevance_score)`, `match_recommendations(event_id, score)`, `match_recommendations(target_person_id)`, `interaction_memories(contact_id, occurred_at)`, and `recommendation_tests(case_type, event_id)`.",
    "- JSON boundary: only volatile provider interpretation belongs in `ai_analyses.result_json`; event intent, language, relationship strength, trust, relevance, topics, scores, and actions must remain queryable fields.",
    "- Privacy/provenance gate: every semantic row must carry stable target references, `source`, and non-empty `evidenceIds`; raw prompts, API keys, auth tokens, chain-of-thought, and unrelated user data stay out of product rows.",
    "- Migration gate: local schema `3` maps to remote migration `relationship_schema_v3`; unknown live modes fail closed instead of falling back to mock data.",
    "- Replacement tests must prove remote rows resolve event, attendee, person, contact, connection, conversation, message, profile, and evidence references before live mode is enabled.",
  ]) {
    assertDocIncludes(
      "shared/local-remote-store/RELATIONSHIP_SCHEMA_LIVE_IMPLEMENTATION.md",
      doc,
      expectedExcerpt,
    );
  }
});
