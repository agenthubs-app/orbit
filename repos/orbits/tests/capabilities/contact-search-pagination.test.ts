import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import { createMockContactsListSearchAndFilterService } from "../../features/contacts/mock-service";
import {
  createPostgresContactRecordPageReader,
  createStorageContactGraphProvider,
} from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import type { ContactListItem } from "../../features/contacts/contract";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import {
  createPostgresLiveRecordStore,
  type LiveRecordSqlClient,
} from "../../shared/storage/postgres-live-record-store";
import type { LiveRecord } from "../../shared/storage/live-record-store";

const lifecycleTestDatabaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const lifecycleDatabaseSkip = lifecycleTestDatabaseUrl
  ? false
  : "ORBIT_LIFECYCLE_TEST_DATABASE_URL is not configured";
const lifecycleTestDatabaseName = "orbit_cutover_test_20260917";
const contactFixtureWorkspaceId = "workspace:w0-b1-contact-oracle";
const contactFixtureForeignWorkspaceId = "workspace:w0-b1-contact-foreign";
const contactFixtureActorOne = "actor:w0-b1:one";
const contactFixtureActorTwo = "actor:w0-b1:two";
const contactFixtureActorThree = "actor:w0-b1:three";
const contactFixtureSharedOwner = "actor:w0-b1:shared-owner";
const contactFixtureSourceLabel = "W0-B1 local PostgreSQL contact fixture";
const contactFixtureSource = "postgres:w0-b1-contact-fixture";
const contactFixtureCreatedBy =
  "hybrid-contacts-list-search-and-filter-service";

function contactFixtureTimestamp(second: number): string {
  return `2026-09-17T00:00:${String(second).padStart(2, "0")}.000Z`;
}

function cursorLastForTest(cursor: string): {
  occurredAt?: unknown;
  updatedAt?: unknown;
} {
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
    last?: { occurredAt?: unknown; updatedAt?: unknown };
  };
  return parsed.last ?? {};
}

interface ContactFixtureSource {
  type: string;
  id: string;
  label: string;
}

function contactFixtureRecord(input: {
  workspaceId: string;
  collectionName: string;
  recordId: string;
  userId: string | null;
  sourceType: string;
  sourceId: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  targetType: string | null;
  targetId: string | null;
  timestamp: string;
  occurredAt?: string;
  createdAt?: string;
  updatedAt?: string;
  searchText?: string;
  payload: Record<string, unknown>;
}): LiveRecord<Record<string, unknown>> {
  return {
    workspaceId: input.workspaceId,
    collectionName: input.collectionName,
    recordId: input.recordId,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceLabel: input.sourceLabel,
    provider: "w0-b1-contact-oracle",
    providerRecordId: input.recordId,
    evidenceIds: [...input.evidenceIds],
    targetType: input.targetType,
    targetId: input.targetId,
    occurredAt: input.occurredAt ?? input.timestamp,
    createdAt: input.createdAt ?? input.timestamp,
    updatedAt: input.updatedAt ?? input.timestamp,
    deletedAt: null,
    lifecycleState: "active",
    searchText: input.searchText ?? "",
    payload: input.payload,
  };
}

function contactFixtureContact(input: {
  workspaceId: string;
  recordId: string;
  userId: string;
  id: string;
  displayName: string;
  role: string;
  organization: string;
  location: string;
  profileSnippet: string;
  source: ContactFixtureSource;
  evidenceId: string;
  timestamp: string;
  occurredAt?: string;
  updatedAt?: string;
  searchText: string;
  stage?: string;
  version?: number;
  nextAction?: string;
  lifecycleInitialization?: "pending" | "ready";
}): LiveRecord<Record<string, unknown>> {
  return contactFixtureRecord({
    workspaceId: input.workspaceId,
    collectionName: "contacts",
    recordId: input.recordId,
    userId: input.userId,
    sourceType: input.source.type,
    sourceId: input.source.id,
    sourceLabel: input.source.label,
    evidenceIds: [input.evidenceId],
    targetType: "contact",
    targetId: input.id,
    timestamp: input.timestamp,
    occurredAt: input.occurredAt,
    updatedAt: input.updatedAt,
    searchText: input.searchText,
    payload: {
      id: input.id,
      displayName: input.displayName,
      role: input.role,
      organization: input.organization,
      location: input.location,
      profileSnippet: input.profileSnippet,
      ...(input.version === undefined ? {} : { version: input.version }),
      stage: input.stage ?? "active",
      source: { ...input.source },
      evidenceIds: [input.evidenceId],
      createdAt: input.timestamp,
      updatedAt: input.updatedAt ?? input.timestamp,
      ...(input.nextAction
        ? { nextAction: { text: input.nextAction } }
        : {}),
      ...(input.lifecycleInitialization
        ? { lifecycleInitialization: input.lifecycleInitialization }
        : {}),
    },
  });
}

function contactFixtureConnection(input: {
  workspaceId: string;
  recordId: string;
  userId: string;
  id: string;
  accountId: string;
  contactId: string;
  source: ContactFixtureSource;
  evidenceId: string;
  timestamp: string;
  summary: string;
  valueTypes: readonly string[];
  stage?: string;
  version?: number;
  lifecycleInitialization?: "pending" | "ready";
}): LiveRecord<Record<string, unknown>> {
  return contactFixtureRecord({
    workspaceId: input.workspaceId,
    collectionName: "connections",
    recordId: input.recordId,
    userId: input.userId,
    sourceType: input.source.type,
    sourceId: input.source.id,
    sourceLabel: input.source.label,
    evidenceIds: [input.evidenceId],
    targetType: "connection",
    targetId: input.id,
    timestamp: input.timestamp,
    payload: {
      id: input.id,
      accountId: input.accountId,
      contactId: input.contactId,
      ...(input.version === undefined ? {} : { version: input.version }),
      ...(input.lifecycleInitialization
        ? { lifecycleInitialization: input.lifecycleInitialization }
        : {}),
      stage: input.stage ?? "active",
      valueTypes: [...input.valueTypes],
      summary: input.summary,
      source: { ...input.source },
      evidenceIds: [input.evidenceId],
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
    },
  });
}

function contactFixtureEvidence(input: {
  workspaceId: string;
  id: string;
  recordId?: string;
  contactId: string;
  source: ContactFixtureSource;
  timestamp: string;
  summary: string;
}): LiveRecord<Record<string, unknown>> {
  return contactFixtureRecord({
    workspaceId: input.workspaceId,
    collectionName: "evidence",
    recordId: input.recordId ?? input.id,
    userId: null,
    sourceType: input.source.type,
    sourceId: input.source.id,
    sourceLabel: input.source.label,
    evidenceIds: [input.id],
    targetType: "contact",
    targetId: input.contactId,
    timestamp: input.timestamp,
    payload: {
      id: input.id,
      sourceType: input.source.type,
      sourceId: input.source.id,
      summary: input.summary,
      occurredAt: input.timestamp,
      confidence: 0.95,
      createdBy: "w0-b1-contact-oracle",
    },
  });
}

function contactFixtureDetailState(input: {
  workspaceId: string;
  recordId: string;
  userId: string;
  contactId: string;
  tags: readonly string[];
  timestamp: string;
}): LiveRecord<Record<string, unknown>> {
  return contactFixtureRecord({
    workspaceId: input.workspaceId,
    collectionName: "contact_detail_states",
    recordId: input.recordId,
    userId: input.userId,
    sourceType: "manual",
    sourceId: `contact-detail:${input.contactId}`,
    sourceLabel: "W0-B1 private contact detail fixture",
    evidenceIds: [],
    targetType: "contact",
    targetId: input.contactId,
    timestamp: input.timestamp,
    payload: {
      actorId: input.userId,
      contactId: input.contactId,
      tags: [...input.tags],
      status: "active",
      notes: [],
      updatedAt: input.timestamp,
    },
  });
}

async function seedContactFixture(
  store: ReturnType<typeof createPostgresLiveRecordStore>,
): Promise<void> {
  const alphaSource = {
    type: "manual",
    id: "source:alpha",
    label: "Alpha source",
  } satisfies ContactFixtureSource;
  const evidenceSource = {
    type: "email_signal",
    id: "source:evidence-only",
    label: "Evidence-only source",
  } satisfies ContactFixtureSource;
  const tagSource = {
    type: "referral",
    id: "source:tag-only",
    label: "Tag-only source",
  } satisfies ContactFixtureSource;
  const pageSource = {
    type: "business_card_ocr",
    id: "source:page-two",
    label: "Page-two source",
  } satisfies ContactFixtureSource;
  const actorTwoSource = {
    type: "manual",
    id: "source:actor-two",
    label: "Actor-two source",
  } satisfies ContactFixtureSource;
  const actorThreeSource = {
    type: "calendar_signal",
    id: "source:actor-three",
    label: "Actor-three lifecycle source",
  } satisfies ContactFixtureSource;
  const literalPercentSource = {
    type: "email_signal",
    id: "source:literal-percent",
    label: "Literal percent source",
  } satisfies ContactFixtureSource;
  const literalUnderscoreSource = {
    type: "qr_scan",
    id: "source:literal-underscore",
    label: "Literal underscore source",
  } satisfies ContactFixtureSource;

  const records = [
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:alpha",
      userId: contactFixtureActorOne,
      id: "contact:alpha",
      displayName: "Alpha Tanaka",
      role: "Founder",
      organization: "Orbit Analytics",
      location: "Tokyo",
      profileSnippet: "Alpha page-token profile.",
      source: alphaSource,
      evidenceId: "evidence:alpha",
      timestamp: contactFixtureTimestamp(6),
      searchText: "alpha page-token",
      nextAction: "Review Alpha",
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:alpha",
      userId: contactFixtureActorOne,
      id: "connection:alpha",
      accountId: contactFixtureActorOne,
      contactId: "contact:alpha",
      source: alphaSource,
      evidenceId: "evidence:alpha",
      timestamp: contactFixtureTimestamp(6),
      summary: "Alpha relationship context",
      valueTypes: ["strategic_fit"],
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: "evidence:alpha",
      recordId: "evidence-row:alpha",
      contactId: "contact:alpha",
      source: alphaSource,
      timestamp: contactFixtureTimestamp(6),
      summary: "Alpha evidence excerpt",
    }),
    contactFixtureDetailState({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "detail:alpha",
      userId: contactFixtureActorOne,
      contactId: "contact:alpha",
      tags: ["topic:storage-pilots"],
      timestamp: contactFixtureTimestamp(6),
    }),
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:evidence-only",
      userId: contactFixtureSharedOwner,
      id: "contact:evidence-only",
      displayName: "Evidence Person",
      role: "Researcher",
      organization: "Source Lab",
      location: "Shanghai",
      profileSnippet: "Evidence-only profile.",
      source: evidenceSource,
      evidenceId: "evidence:evidence-only",
      timestamp: contactFixtureTimestamp(5),
      searchText: "evidence person",
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:evidence-only",
      userId: contactFixtureActorOne,
      id: "connection:evidence-only",
      accountId: contactFixtureActorOne,
      contactId: "contact:evidence-only",
      source: evidenceSource,
      evidenceId: "evidence:evidence-only",
      timestamp: contactFixtureTimestamp(5),
      summary: "Shared relationship context",
      valueTypes: ["knowledge_exchange"],
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:evidence-only:two",
      userId: contactFixtureActorTwo,
      id: "connection:evidence-only:two",
      accountId: contactFixtureActorTwo,
      contactId: "contact:evidence-only",
      source: evidenceSource,
      evidenceId: "evidence:evidence-only",
      timestamp: contactFixtureTimestamp(5),
      summary: "Shared relationship context",
      valueTypes: ["knowledge_exchange"],
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: "evidence:evidence-only",
      contactId: "contact:evidence-only",
      source: evidenceSource,
      timestamp: contactFixtureTimestamp(5),
      summary: "证据唯一命中",
    }),
    contactFixtureDetailState({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "detail:evidence-only:one",
      userId: contactFixtureActorOne,
      contactId: "contact:evidence-only",
      tags: ["shared-private-one"],
      timestamp: contactFixtureTimestamp(5),
    }),
    contactFixtureDetailState({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "detail:evidence-only:two",
      userId: contactFixtureActorTwo,
      contactId: "contact:evidence-only",
      tags: ["shared-private-two"],
      timestamp: contactFixtureTimestamp(5),
    }),
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:tag-only",
      userId: contactFixtureActorOne,
      id: "contact:tag-only",
      displayName: "Tag Person",
      role: "Operator",
      organization: "Tag Works",
      location: "Beijing",
      profileSnippet: "Tag-only profile.",
      source: tagSource,
      evidenceId: "evidence:tag-only",
      timestamp: contactFixtureTimestamp(4),
      searchText: "tag person",
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:tag-only",
      userId: contactFixtureActorOne,
      id: "connection:tag-only",
      accountId: contactFixtureActorOne,
      contactId: "contact:tag-only",
      source: tagSource,
      evidenceId: "evidence:tag-only",
      timestamp: contactFixtureTimestamp(4),
      summary: "Tag relationship context",
      valueTypes: [],
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: "evidence:tag-only",
      contactId: "contact:tag-only",
      source: tagSource,
      timestamp: contactFixtureTimestamp(4),
      summary: "Tag evidence excerpt",
    }),
    contactFixtureDetailState({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "detail:tag-only",
      userId: contactFixtureActorOne,
      contactId: "contact:tag-only",
      tags: ["本人私有tag命中"],
      timestamp: contactFixtureTimestamp(4),
    }),
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:page-two",
      userId: contactFixtureActorOne,
      id: "contact:page-two",
      displayName: "Beta Sato",
      role: "Partner",
      organization: "Page Systems",
      location: "Osaka",
      profileSnippet: "Beta page-token profile.",
      source: pageSource,
      evidenceId: "evidence:page-two",
      timestamp: contactFixtureTimestamp(3),
      searchText: "beta page-token",
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:page-two",
      userId: contactFixtureActorOne,
      id: "connection:page-two",
      accountId: contactFixtureActorOne,
      contactId: "contact:page-two",
      source: pageSource,
      evidenceId: "evidence:page-two",
      timestamp: contactFixtureTimestamp(3),
      summary: "Beta relationship context",
      valueTypes: ["commercial_opportunity"],
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: "evidence:page-two",
      contactId: "contact:page-two",
      source: pageSource,
      timestamp: contactFixtureTimestamp(3),
      summary: "Beta evidence excerpt",
    }),
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:actor-two",
      userId: contactFixtureActorTwo,
      id: "contact:actor-two",
      displayName: "Actor Two",
      role: "Owner",
      organization: "Private Two",
      location: "Kyoto",
      profileSnippet: "Actor-two private profile.",
      source: actorTwoSource,
      evidenceId: "evidence:actor-two",
      timestamp: contactFixtureTimestamp(2),
      searchText: "actor two",
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:actor-two-duplicate-values",
      userId: contactFixtureActorTwo,
      id: "connection:actor-two-duplicate-values",
      accountId: contactFixtureActorTwo,
      contactId: "contact:actor-two",
      source: actorTwoSource,
      evidenceId: "evidence:actor-two",
      timestamp: contactFixtureTimestamp(2),
      summary: "Actor-two duplicate value relationship",
      valueTypes: ["strategic_fit", "strategic_fit"],
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: "evidence:actor-two",
      contactId: "contact:actor-two",
      source: actorTwoSource,
      timestamp: contactFixtureTimestamp(2),
      summary: "Actor-two private evidence",
    }),
    contactFixtureDetailState({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "detail:actor-two",
      userId: contactFixtureActorTwo,
      contactId: "contact:actor-two",
      tags: ["actor-two-private", "actor-two-private"],
      timestamp: contactFixtureTimestamp(2),
    }),
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:literal-percent",
      userId: contactFixtureActorThree,
      id: "contact:literal-percent",
      displayName: "Literal Percent",
      role: "Tester",
      organization: "Token Semantics",
      location: "Tokyo",
      profileSnippet: "Literal % fixture.",
      source: literalPercentSource,
      evidenceId: "evidence:literal-percent",
      timestamp: contactFixtureTimestamp(12),
      searchText: "literal % marker",
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: "evidence:literal-percent",
      contactId: "contact:literal-percent",
      source: literalPercentSource,
      timestamp: contactFixtureTimestamp(12),
      summary: "Literal percent evidence",
    }),
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:literal-underscore",
      userId: contactFixtureActorThree,
      id: "contact:literal-underscore",
      displayName: "Literal Underscore",
      role: "Tester",
      organization: "Token Semantics",
      location: "Osaka",
      profileSnippet: "Literal _ fixture.",
      source: literalUnderscoreSource,
      evidenceId: "evidence:literal-underscore",
      timestamp: contactFixtureTimestamp(11),
      searchText: "literal _ marker",
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: "evidence:literal-underscore",
      contactId: "contact:literal-underscore",
      source: literalUnderscoreSource,
      timestamp: contactFixtureTimestamp(11),
      summary: "Literal underscore evidence",
    }),
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:canonical",
      userId: contactFixtureActorThree,
      id: "contact:canonical",
      displayName: "Canonical Contact",
      role: "Canonical owner",
      organization: "Lifecycle Systems",
      location: "Tokyo",
      profileSnippet: "Canonical canonical-token lifecycle fixture.",
      source: actorThreeSource,
      evidenceId: "evidence:canonical",
      timestamp: contactFixtureTimestamp(10),
      searchText: "canonical-token",
      stage: "captured",
      version: 1,
      lifecycleInitialization: "ready",
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:canonical",
      userId: contactFixtureActorThree,
      id: "connection:canonical",
      accountId: contactFixtureActorThree,
      contactId: "contact:canonical",
      source: actorThreeSource,
      evidenceId: "evidence:canonical",
      timestamp: contactFixtureTimestamp(10),
      summary: "Canonical relationship summary",
      valueTypes: ["strategic_fit"],
      version: 1,
      lifecycleInitialization: "ready",
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: "evidence:canonical",
      contactId: "contact:canonical",
      source: actorThreeSource,
      timestamp: contactFixtureTimestamp(10),
      summary: "Canonical evidence",
    }),
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:legacy",
      userId: contactFixtureActorThree,
      id: "contact:legacy",
      displayName: "Legacy Contact",
      role: "Legacy owner",
      organization: "Lifecycle Systems",
      location: "Shanghai",
      profileSnippet: "Legacy legacy-token lifecycle fixture.",
      source: actorThreeSource,
      evidenceId: "evidence:legacy",
      timestamp: contactFixtureTimestamp(9),
      searchText: "legacy-token",
      stage: "captured",
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:legacy",
      userId: contactFixtureActorThree,
      id: "connection:legacy",
      accountId: contactFixtureActorThree,
      contactId: "contact:legacy",
      source: actorThreeSource,
      evidenceId: "evidence:legacy",
      timestamp: contactFixtureTimestamp(9),
      summary: "Legacy relationship summary",
      valueTypes: ["community_context"],
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: "evidence:legacy",
      contactId: "contact:legacy",
      source: actorThreeSource,
      timestamp: contactFixtureTimestamp(9),
      summary: "Legacy evidence",
    }),
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:pending",
      userId: contactFixtureActorThree,
      id: "contact:pending",
      displayName: "Pending Contact",
      role: "Pending owner",
      organization: "Lifecycle Systems",
      location: "Beijing",
      profileSnippet: "Pending pending-token lifecycle fixture.",
      source: actorThreeSource,
      evidenceId: "evidence:pending",
      timestamp: contactFixtureTimestamp(8),
      searchText: "pending-token",
      stage: "captured",
      version: 1,
      lifecycleInitialization: "pending",
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:pending",
      userId: contactFixtureActorThree,
      id: "connection:pending",
      accountId: contactFixtureActorThree,
      contactId: "contact:pending",
      source: actorThreeSource,
      evidenceId: "evidence:pending",
      timestamp: contactFixtureTimestamp(9),
      summary: "Pending relationship summary",
      valueTypes: ["knowledge_exchange"],
      version: 1,
      lifecycleInitialization: "ready",
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: "evidence:pending",
      contactId: "contact:pending",
      source: actorThreeSource,
      timestamp: contactFixtureTimestamp(8),
      summary: "Pending evidence",
    }),
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:ambiguous",
      userId: contactFixtureActorThree,
      id: "contact:ambiguous",
      displayName: "Ambiguous Contact",
      role: "Ambiguous owner",
      organization: "Lifecycle Systems",
      location: "Kyoto",
      profileSnippet: "Ambiguous ambiguous-token lifecycle fixture.",
      source: actorThreeSource,
      evidenceId: "evidence:ambiguous",
      timestamp: contactFixtureTimestamp(7),
      searchText: "ambiguous-token",
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:ambiguous:version",
      userId: contactFixtureActorThree,
      id: "connection:ambiguous:version",
      accountId: contactFixtureActorThree,
      contactId: "contact:ambiguous",
      source: actorThreeSource,
      evidenceId: "evidence:ambiguous",
      timestamp: contactFixtureTimestamp(7),
      summary: "Ambiguous versioned relationship",
      valueTypes: [],
      version: 1,
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:ambiguous:ready",
      userId: contactFixtureActorThree,
      id: "connection:ambiguous:ready",
      accountId: contactFixtureActorThree,
      contactId: "contact:ambiguous",
      source: actorThreeSource,
      evidenceId: "evidence:ambiguous",
      timestamp: contactFixtureTimestamp(7),
      summary: "Ambiguous ready relationship",
      valueTypes: [],
      lifecycleInitialization: "ready",
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: "evidence:ambiguous",
      contactId: "contact:ambiguous",
      source: actorThreeSource,
      timestamp: contactFixtureTimestamp(7),
      summary: "Ambiguous evidence",
    }),
    contactFixtureContact({
      workspaceId: contactFixtureForeignWorkspaceId,
      recordId: "storage:foreign",
      userId: contactFixtureActorOne,
      id: "contact:foreign-workspace",
      displayName: "Foreign Workspace",
      role: "Hidden",
      organization: "Other Workspace",
      location: "Nagoya",
      profileSnippet: "Foreign workspace profile.",
      source: alphaSource,
      evidenceId: "evidence:foreign-workspace",
      timestamp: contactFixtureTimestamp(1),
      searchText: "foreign workspace",
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureForeignWorkspaceId,
      id: "evidence:foreign-workspace",
      contactId: "contact:foreign-workspace",
      source: alphaSource,
      timestamp: contactFixtureTimestamp(1),
      summary: "Foreign workspace evidence",
    }),
  ];

  for (const record of records) {
    await store.upsertRecord(record);
  }
}

async function seedUnicodeContactFixture(
  store: ReturnType<typeof createPostgresLiveRecordStore>,
): Promise<void> {
  const source = {
    type: "manual",
    id: "source:unicode",
    label: "Unicode matcher source",
  } satisfies ContactFixtureSource;
  const contactId = "contact:unicode";
  const evidenceId = "evidence:unicode";
  const timestamp = contactFixtureTimestamp(13);
  const records = [
    contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "storage:unicode",
      userId: contactFixtureActorOne,
      id: contactId,
      displayName: "İ",
      role: "ΟΣ",
      organization: "ΟΣΑ",
      location: "AΣ",
      profileSnippet: "ß Ｆｕｌｌｗｉｄｔｈ",
      source,
      evidenceId,
      timestamp,
      searchText: "legacy-only-search-text",
    }),
    contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "connection:unicode",
      userId: contactFixtureActorOne,
      id: "connection:unicode",
      accountId: contactFixtureActorOne,
      contactId,
      source,
      evidenceId,
      timestamp,
      summary: "关系摘要Ω",
      valueTypes: ["knowledge_exchange"],
    }),
    contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: evidenceId,
      recordId: "evidence-row:unicode",
      contactId,
      source,
      timestamp,
      summary: "证据 %_ literal",
    }),
    contactFixtureDetailState({
      workspaceId: contactFixtureWorkspaceId,
      recordId: "detail:unicode",
      userId: contactFixtureActorOne,
      contactId,
      tags: ["TAG-ΟΣ", "combining e\u0301", "全角：%_"],
      timestamp,
    }),
  ];
  for (const record of records) await store.upsertRecord(record);
}

async function seedTieContactFixture(
  store: ReturnType<typeof createPostgresLiveRecordStore>,
): Promise<void> {
  const source = {
    type: "manual",
    id: "source:tie",
    label: "Tie order source",
  } satisfies ContactFixtureSource;
  const timestamp = contactFixtureTimestamp(14);
  const suffixes = ["A", "a", "Ω"] as const;
  for (const suffix of suffixes) {
    const contactId = `contact:tie:${suffix}`;
    const evidenceId = `evidence:tie:${suffix}`;
    await store.upsertRecord(contactFixtureContact({
      workspaceId: contactFixtureWorkspaceId,
      recordId: `storage:tie:${suffix}`,
      userId: contactFixtureActorOne,
      id: contactId,
      displayName: `Tie Contact ${suffix}`,
      role: "Tie fixture",
      organization: "Cursor Tests",
      location: "Tokyo",
      profileSnippet: `tie cursor ${suffix}`,
      source,
      evidenceId,
      timestamp,
      searchText: `tie cursor ${suffix}`,
    }));
    await store.upsertRecord(contactFixtureConnection({
      workspaceId: contactFixtureWorkspaceId,
      recordId: `connection:tie:${suffix}`,
      userId: contactFixtureActorOne,
      id: `connection:tie:${suffix}`,
      accountId: contactFixtureActorOne,
      contactId,
      source,
      evidenceId,
      timestamp,
      summary: `Tie relationship ${suffix}`,
      valueTypes: [],
    }));
    await store.upsertRecord(contactFixtureEvidence({
      workspaceId: contactFixtureWorkspaceId,
      id: evidenceId,
      recordId: `evidence-row:tie:${suffix}`,
      contactId,
      source,
      timestamp,
      summary: `Tie evidence ${suffix}`,
    }));
  }
}

const oracleAlpha: ContactListItem = {
  id: "contact:alpha",
  displayName: "Alpha Tanaka",
  role: "Founder",
  organization: "Orbit Analytics",
  location: "Tokyo",
  profileSnippet: "Alpha page-token profile.",
  relationshipContext: "Alpha relationship context",
  lastInteractionAt: contactFixtureTimestamp(6),
  nextAction: "Review Alpha",
  source: {
    type: "manual",
    id: "source:alpha",
    label: "Alpha source",
    evidenceId: "evidence:alpha",
  },
  evidence: [
    {
      evidenceId: "evidence:alpha",
      source: {
        type: "manual",
        id: "source:alpha",
        label: "Alpha source",
        evidenceId: "evidence:alpha",
      },
      excerpt: "Alpha evidence excerpt",
      capturedAt: contactFixtureTimestamp(6),
      createdBy: contactFixtureCreatedBy,
    },
  ],
  tags: ["topic:storage-pilots"],
  value: {
    score: 72,
    valueTypes: ["strategic_fit"],
    rationale: "Alpha relationship context",
    evidenceIds: ["evidence:alpha"],
  },
  status: "active",
  databaseQueryExecuted: true,
  searchIndexReadExecuted: false,
  externalNetworkRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

async function withContactPostgresFixture(
  run: (input: {
    service: ReturnType<typeof createLiveContactsListSearchAndFilterService>;
    actorOne: string;
    actorTwo: string;
    actorThree: string;
    client: LiveRecordSqlClient;
    sqlQueryCount: () => number;
    store: ReturnType<typeof createPostgresLiveRecordStore>;
    workspaceId: string;
  }) => Promise<void>,
): Promise<void> {
  assert.ok(lifecycleTestDatabaseUrl);
  const database = new URL(lifecycleTestDatabaseUrl);
  assert.equal(database.protocol, "postgresql:");
  assert.equal(database.hostname, "localhost");
  assert.equal(database.pathname, `/${lifecycleTestDatabaseName}`);

  const schema = `w0_b1_contact_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: lifecycleTestDatabaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    options:
      "-c search_path=pg_catalog -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000",
  });
  const scopedDatabase = new URL(lifecycleTestDatabaseUrl);
  scopedDatabase.searchParams.set(
    "options",
    `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000`,
  );
  const pool = new Pool({
    connectionString: scopedDatabase.toString(),
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
  });
  let schemaCreated = false;
  let sqlQueryCount = 0;

  try {
    await admin.query(`create schema "${schema}"`);
    schemaCreated = true;
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);

    const client: LiveRecordSqlClient = {
      async query<TRow>(text: string, values?: readonly unknown[]) {
        sqlQueryCount += 1;
        const result = await pool.query(
          text,
          values === undefined ? undefined : [...values],
        );
        return { rows: result.rows as TRow[] };
      },
    };
    const store = createPostgresLiveRecordStore({ client });
    await seedContactFixture(store);
    sqlQueryCount = 0;

    // This is the graph-resolved storage symbol; there is no
    // createStorageContactsProvider in this baseline.
    const provider = createStorageContactGraphProvider({
      contactRecordPageReader: createPostgresContactRecordPageReader({
        client,
        workspaceId: contactFixtureWorkspaceId,
      }),
      contactScopeRecordReader: createPostgresContactScopeRecordReader({
        client,
        workspaceId: contactFixtureWorkspaceId,
      }),
      source: contactFixtureSource,
      sourceLabel: contactFixtureSourceLabel,
      store,
      workspaceId: contactFixtureWorkspaceId,
    });
    const service = createLiveContactsListSearchAndFilterService({ provider });

    await run({
      service,
      actorOne: contactFixtureActorOne,
      actorTwo: contactFixtureActorTwo,
      actorThree: contactFixtureActorThree,
      client,
      sqlQueryCount: () => sqlQueryCount,
      store,
      workspaceId: contactFixtureWorkspaceId,
    });
  } finally {
    try {
      await pool.end();
    } finally {
      try {
        if (schemaCreated) {
          await admin.query(`drop schema if exists "${schema}" cascade`);
        }
      } finally {
        await admin.end();
      }
    }
  }
}

function createContactSearchServiceForClient(input: {
  client: LiveRecordSqlClient;
  store: ReturnType<typeof createPostgresLiveRecordStore>;
  workspaceId: string;
}) {
  return createLiveContactsListSearchAndFilterService({
    provider: createStorageContactGraphProvider({
      contactRecordPageReader: createPostgresContactRecordPageReader({
        client: input.client,
        workspaceId: input.workspaceId,
      }),
      contactScopeRecordReader: createPostgresContactScopeRecordReader({
        client: input.client,
        workspaceId: input.workspaceId,
      }),
      source: contactFixtureSource,
      sourceLabel: contactFixtureSourceLabel,
      store: input.store,
      workspaceId: input.workspaceId,
    }),
  });
}

test("live no-limit returns the complete literal DTO projection for the actor", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorOne, sqlQueryCount }) => {
    const result = await service.listContacts({ actorId: actorOne });

    assert.equal(result.success, true);
    if (!result.success) return;

    assert.deepEqual(result.data.contacts.map((contact) => contact.id), [
      "contact:alpha",
      "contact:evidence-only",
      "contact:tag-only",
      "contact:page-two",
    ]);
    assert.deepEqual(
      result.data.contacts[0],
      oracleAlpha,
      "literal oracle: the complete Alpha DTO must preserve mapper fields",
    );
    assert.deepEqual(
      result.data.contacts.map((contact) => ({
        id: contact.id,
        tags: [...contact.tags],
      })),
      [
        { id: "contact:alpha", tags: ["topic:storage-pilots"] },
        { id: "contact:evidence-only", tags: ["shared-private-one"] },
        { id: "contact:tag-only", tags: ["本人私有tag命中"] },
        { id: "contact:page-two", tags: [] },
      ],
    );
    assert.equal(result.data.total, 4);
    assert.equal(
      sqlQueryCount(),
      6,
      "literal oracle: no-limit graph hydration stays at the baseline two scope + four batch reads",
    );
    assert.equal(
      result.data.summary,
      "4 contacts matched the hybrid local remote database query.",
    );
    assert.equal(
      result.data.nextAction,
      "Use the source-backed local database contacts for agent workflow testing.",
    );
    assert.deepEqual(result.data.appliedFilters, {
      query: "",
      sourceFilters: [],
      statusFilters: [],
      tagFilters: [],
      valueFilters: [],
    });
    assert.deepEqual(
      result.data.provenance,
      {
        source: contactFixtureSource,
        sourceLabel: contactFixtureSourceLabel,
        evidenceIds: [
          "evidence:alpha",
          "evidence:evidence-only",
          "evidence:tag-only",
          "evidence:page-two",
        ],
        collectedAt: contactFixtureTimestamp(6),
        privacy: "live-contacts-list-search-filter",
        generationMethod: "live-store-query",
        searchIndexReadExecuted: false,
        databaseQueryExecuted: true,
        externalNetworkRequested: false,
        deviceRequested: false,
        aiProviderRequested: false,
        calendarProviderRequested: false,
        emailProviderRequested: false,
        notificationDelivered: false,
      },
    );
    assert.deepEqual(
      result.data.availableFilters.sources.map((option) => [
        option.value,
        option.count,
      ]),
      [
        ["manual", 1],
        ["business_card_ocr", 1],
        ["qr_scan", 0],
        ["event_import", 0],
        ["external_contacts", 0],
        ["email_signal", 1],
        ["calendar_signal", 0],
        ["referral", 1],
      ],
    );
  });
});

test("live no-limit matches a substring found only in evidence", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorOne }) => {
    const result = await service.searchContacts({
      actorId: actorOne,
      query: "证据唯一命中",
    });

    assert.equal(result.success, true);
    if (!result.success) return;

    assert.deepEqual(
      result.data.contacts.map((contact) => contact.id),
      ["contact:evidence-only"],
      "literal oracle: evidence excerpt substring must select the contact",
    );
    assert.equal(result.data.total, 1);
    assert.deepEqual(
      result.data.contacts[0]?.evidence.map((evidence) => evidence.excerpt),
      ["证据唯一命中"],
    );
  });
});

test("live no-limit matches an actor-owned custom tag substring", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorOne }) => {
    const result = await service.searchContacts({
      actorId: actorOne,
      query: "本人私有tag",
    });

    assert.equal(result.success, true);
    if (!result.success) return;

    assert.deepEqual(result.data.contacts.map((contact) => contact.id), [
      "contact:tag-only",
    ]);
    assert.equal(result.data.total, 1);
    assert.deepEqual(result.data.contacts[0]?.tags, ["本人私有tag命中"]);
    assert.equal(
      result.data.contacts.some((contact) =>
        contact.tags.includes("shared-private-two"),
      ),
      false,
    );
  });
});

test("live no-limit matches a relationship-summary-only substring", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorOne }) => {
    const result = await service.searchContacts({
      actorId: actorOne,
      query: "Alpha relationship context",
    });

    assert.equal(result.success, true);
    if (!result.success) return;

    assert.deepEqual(
      result.data.contacts.map((contact) => contact.id),
      ["contact:alpha"],
      "literal oracle: no-limit relationship summary must select the contact",
    );
    assert.equal(result.data.total, 1);
    assert.equal(
      result.data.contacts[0]?.relationshipContext,
      "Alpha relationship context",
    );
  });
});

test("live bounded pages retain full total and actor-scoped facet counts", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorOne }) => {
    const result = await service.searchContacts({
      actorId: actorOne,
      query: "page-token",
      limit: 1,
    });

    assert.equal(result.success, true);
    if (!result.success) return;

    assert.deepEqual(result.data.contacts.map((contact) => contact.id), [
      "contact:alpha",
    ]);
    assert.deepEqual(
      result.data.contacts[0],
      oracleAlpha,
      "literal oracle: bounded SQL page must carry the complete Alpha DTO projection",
    );
    assert.equal(
      result.data.total,
      2,
      "literal oracle: total must count both matching contacts, not page rows",
    );
    assert.equal(
      result.data.availableFilters.sources.find(
        (option) => option.value === "business_card_ocr",
      )?.count,
      1,
      "literal oracle: facets must count the complete actor-scoped graph",
    );
    assert.ok(result.data.nextCursor);
  });
});

test("bounded snapshot keeps connection-only evidence in provenance and generatedAt", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorOne, store, workspaceId }) => {
    const source = {
      type: "manual",
      id: "source:connection-only-evidence",
      label: "Connection-only evidence source",
    } satisfies ContactFixtureSource;
    const evidenceId = "evidence:connection-only";
    const timestamp = contactFixtureTimestamp(17);
    const connectionTimestamp = contactFixtureTimestamp(16);
    await store.upsertRecord(contactFixtureEvidence({
      workspaceId,
      id: evidenceId,
      recordId: "evidence-row:connection-only",
      contactId: "contact:alpha",
      source,
      timestamp,
      summary: "Connection-only evidence timestamp",
    }));
    await store.upsertRecord(contactFixtureConnection({
      workspaceId,
      recordId: "connection:alpha:connection-only-evidence",
      userId: actorOne,
      id: "connection:alpha:connection-only-evidence",
      accountId: actorOne,
      contactId: "contact:alpha",
      source,
      evidenceId,
      timestamp: connectionTimestamp,
      summary: "Connection-only relationship",
      valueTypes: [],
    }));

    const result = await service.searchContacts({
      actorId: actorOne,
      query: "page-token",
      limit: 2,
    });
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(result.data.contacts.map((contact) => contact.id), [
      "contact:alpha",
      "contact:page-two",
    ]);
    assert.equal(
      new Date(result.data.provenance.collectedAt).toISOString(),
      timestamp,
      "generatedAt must include a connection-only evidence row in the same page snapshot",
    );

    const unboundedResult = await service.searchContacts({
      actorId: actorOne,
      query: "page-token",
    });
    assert.equal(unboundedResult.success, true);
    if (!unboundedResult.success) return;
    assert.equal(
      new Date(unboundedResult.data.provenance.collectedAt).toISOString(),
      timestamp,
      "unpaged generatedAt must retain connection-only evidence timestamps",
    );
  });
});

test("scope evidence keys are intersected with the final contact and connection evidence IDs", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ actorOne, client, store, workspaceId }) => {
    const source = {
      type: "manual",
      id: "source:p2-evidence-scope",
      label: "P2 evidence scope source",
    } satisfies ContactFixtureSource;
    const contactId = "contact:p2-evidence-scope";
    const contactEvidenceId = "evidence:p2-contact";
    const connectionEvidenceId = "evidence:p2-connection";
    const contactTimestamp = contactFixtureTimestamp(20);
    const contactEvidenceTimestamp = contactFixtureTimestamp(21);
    const connectionEvidenceTimestamp = "2030-01-01T00:00:00.000Z";
    const connectionRecordId = "connection-row:p2-invalid";

    await store.upsertRecord(contactFixtureEvidence({
      workspaceId,
      id: contactEvidenceId,
      recordId: "evidence-row:p2-contact",
      contactId,
      source,
      timestamp: contactEvidenceTimestamp,
      summary: "P2 contact evidence",
    }));
    await store.upsertRecord(contactFixtureEvidence({
      workspaceId,
      id: connectionEvidenceId,
      recordId: "evidence-row:p2-connection",
      contactId,
      source,
      timestamp: connectionEvidenceTimestamp,
      summary: "P2 connection evidence",
    }));
    await store.upsertRecord(contactFixtureContact({
      workspaceId,
      recordId: contactId,
      userId: actorOne,
      id: contactId,
      displayName: "P2 Evidence Scope",
      role: "Regression fixture",
      organization: "Projection Tests",
      location: "Tokyo",
      profileSnippet: "P2 evidence scope fixture",
      source,
      evidenceId: contactEvidenceId,
      timestamp: contactTimestamp,
      searchText: "p2 evidence scope",
    }));
    const initiallyInvalidConnection = contactFixtureConnection({
      workspaceId,
      recordId: connectionRecordId,
      userId: actorOne,
      id: "connection:p2-invalid",
      accountId: actorOne,
      contactId,
      source,
      evidenceId: connectionEvidenceId,
      timestamp: contactFixtureTimestamp(22),
      summary: "temporary valid summary",
      valueTypes: [],
    });
    await store.upsertRecord({
      ...initiallyInvalidConnection,
      payload: {
        ...initiallyInvalidConnection.payload,
        summary: "",
      },
    });

    const scopeReader = createPostgresContactScopeRecordReader({ client, workspaceId });
    const provider = createStorageContactGraphProvider({
      contactScopeRecordReader: scopeReader,
      source: contactFixtureSource,
      sourceLabel: contactFixtureSourceLabel,
      store,
      workspaceId,
    });
    const readEntries = [
      ["unpaged", () => provider.readContactGraph(actorOne)],
      ["list", () => provider.readContactGraphForList?.({ query: "p2 evidence scope" }, actorOne)],
      ["detail", () => provider.readContactGraphForContact?.(contactId, actorOne)],
    ] as const;

    for (const [entryPoint, read] of readEntries) {
      const graph = await read();
      assert.ok(graph, `${entryPoint}: graph`);
      if (!graph) continue;
      assert.deepEqual(
        graph.evidence
          .filter((evidence) =>
            typeof evidence.id === "string" && evidence.id.startsWith("evidence:p2-"),
          )
          .map((evidence) => evidence.id)
          .filter((evidenceId): evidenceId is string => typeof evidenceId === "string"),
        [contactEvidenceId],
        `${entryPoint}: invalid connection evidence is not in the final computed evidence union`,
      );
      assert.equal(
        graph.connections.filter((connection) => connection.contactId === contactId).length,
        0,
        `${entryPoint}: invalid connection is not mapped into DTO connections`,
      );
      assert.equal(
        graph.generatedAt,
        contactEvidenceTimestamp,
        `${entryPoint}: scope superset evidence must not advance generatedAt`,
      );
    }

    await store.upsertRecord({
      ...initiallyInvalidConnection,
      payload: {
        ...initiallyInvalidConnection.payload,
        summary: "P2 valid connection",
      },
    });
    for (const [entryPoint, read] of readEntries) {
      const graph = await read();
      assert.ok(graph, `${entryPoint}/valid: graph`);
      if (!graph) continue;
      assert.deepEqual(
        graph.evidence
          .filter((evidence) =>
            typeof evidence.id === "string" && evidence.id.startsWith("evidence:p2-"),
          )
          .map((evidence) => evidence.id)
          .filter((evidenceId): evidenceId is string => typeof evidenceId === "string")
          .sort(),
        [contactEvidenceId, connectionEvidenceId].sort(),
        `${entryPoint}: legal connection evidence remains in the final union`,
      );
      assert.equal(
        graph.connections.filter((connection) => connection.contactId === contactId).length,
        1,
        `${entryPoint}: legal connection is mapped after its summary is repaired`,
      );
      assert.equal(graph.generatedAt, connectionEvidenceTimestamp, `${entryPoint}: generatedAt includes legal connection evidence`);
    }
  });
});

test("ambiguous contacts use one error scope and one fallback status projection", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, client, store, workspaceId }) => {
    const ambiguityActor = "actor:p2-ambiguity";
    const manualSource = {
      type: "manual",
      id: "source:p2-ambiguity-manual",
      label: "P2 ambiguity manual source",
    } satisfies ContactFixtureSource;
    const qrSource = {
      type: "qr_scan",
      id: "source:p2-ambiguity-qr",
      label: "P2 ambiguity QR source",
    } satisfies ContactFixtureSource;
    const contactA = "contact:p2-ambiguity-a";
    const contactB = "contact:p2-ambiguity-b";
    const evidenceA = "evidence:p2-ambiguity-a";
    const evidenceB = "evidence:p2-ambiguity-b";
    await store.upsertRecord(contactFixtureEvidence({
      workspaceId,
      id: evidenceA,
      recordId: "evidence-row:p2-ambiguity-a",
      contactId: contactA,
      source: manualSource,
      timestamp: contactFixtureTimestamp(20),
      summary: "P2 ambiguity A evidence",
    }));
    await store.upsertRecord(contactFixtureEvidence({
      workspaceId,
      id: evidenceB,
      recordId: "evidence-row:p2-ambiguity-b",
      contactId: contactB,
      source: qrSource,
      timestamp: contactFixtureTimestamp(19),
      summary: "P2 ambiguity B evidence",
    }));
    await store.upsertRecord(contactFixtureContact({
      workspaceId,
      recordId: "storage:p2-ambiguity-a",
      userId: ambiguityActor,
      id: contactA,
      displayName: "Common A",
      role: "Ambiguity regression",
      organization: "Projection Tests",
      location: "Tokyo",
      profileSnippet: "Common A profile",
      source: manualSource,
      evidenceId: evidenceA,
      timestamp: contactFixtureTimestamp(20),
      stage: "active",
      searchText: "common ambiguity",
    }));
    await store.upsertRecord(contactFixtureContact({
      workspaceId,
      recordId: "storage:p2-ambiguity-b",
      userId: ambiguityActor,
      id: contactB,
      displayName: "Common B",
      role: "Ambiguity regression",
      organization: "Projection Tests",
      location: "Tokyo",
      profileSnippet: "Common B profile",
      source: qrSource,
      evidenceId: evidenceB,
      timestamp: contactFixtureTimestamp(19),
      stage: "captured",
      searchText: "common ambiguity",
    }));
    for (const [suffix, timestamp] of [["0", 18], ["1", 17]] as const) {
      await store.upsertRecord(contactFixtureConnection({
        workspaceId,
        recordId: `connection-row:p2-ambiguity-b:${suffix}`,
        userId: ambiguityActor,
        id: `connection:p2-ambiguity-b:${suffix}`,
        accountId: ambiguityActor,
        contactId: contactB,
        source: qrSource,
        evidenceId: evidenceB,
        timestamp: contactFixtureTimestamp(timestamp),
        summary: `Common B nurture ${suffix}`,
        valueTypes: [],
        stage: "nurture",
        version: 1,
      }));
    }

    await assert.rejects(
      async () => service.listContacts({ actorId: ambiguityActor, sourceFilters: ["manual"] }),
      /CONTACT_DETAIL_AMBIGUOUS_CONNECTION/,
      "unpaged filtered graph must preserve the original full-scope ambiguity error",
    );
    const unpagedNonMatching = await service.listContacts({
      actorId: ambiguityActor,
      query: "Common A",
    });
    assert.equal(unpagedNonMatching.success, true, "unpaged query may exclude an unrelated ambiguous contact");
    if (unpagedNonMatching.success) {
      assert.deepEqual(unpagedNonMatching.data.contacts.map((contact) => contact.id), [contactA]);
    }
    await assert.rejects(
      async () => service.listContacts({
        actorId: ambiguityActor,
        query: "Common",
        sourceFilters: ["manual"],
      }),
      /CONTACT_DETAIL_AMBIGUOUS_CONNECTION/,
      "unpaged query ambiguity is checked before structured source filters",
    );
    await assert.rejects(
      async () => service.listContacts({ actorId: ambiguityActor, query: "Common B" }),
      /CONTACT_DETAIL_AMBIGUOUS_CONNECTION/,
      "unpaged query must reject when its search collection contains the ambiguous contact",
    );

    const fast = await service.searchContacts({
      actorId: ambiguityActor,
      query: "common",
      limit: 1,
    });
    assert.equal(fast.success, true, "fast first page remains usable before the ambiguous contact");
    if (!fast.success) return;
    assert.deepEqual(fast.data.contacts.map((contact) => contact.id), [contactA]);
    assert.equal(fast.data.total, 2);
    const fastStatusCount = (value: string) =>
      fast.data.availableFilters.statuses.find((status) => status.value === value)?.count ?? 0;
    assert.equal(fastStatusCount("active"), 1);
    assert.equal(fastStatusCount("needs_follow_up"), 1);
    assert.equal(fastStatusCount("nurture"), 0);
    assert.ok(fast.data.nextCursor);

    const fallbackClient: LiveRecordSqlClient = {
      async query<TRow>(text, values) {
        if (text.includes("pg_collation_actual_version")) {
          return { rows: [{ server_version_num: "unapproved" }] as TRow[] };
        }
        return client.query<TRow>(text, values);
      },
    };
    const fallbackService = createContactSearchServiceForClient({
      client: fallbackClient,
      store,
      workspaceId,
    });
    const fallback = await fallbackService.searchContacts({
      actorId: ambiguityActor,
      query: "common",
      limit: 1,
    });
    assert.equal(fallback.success, true, "fallback first page remains usable before the ambiguous contact");
    if (!fallback.success) return;
    assert.deepEqual(fallback.data.contacts.map((contact) => contact.id), [contactA]);
    assert.equal(fallback.data.total, 2);
    assert.deepEqual(
      fallback.data.availableFilters,
      fast.data.availableFilters,
      "fast and fallback must expose the same complete facets when the ambiguous contact is outside the page",
    );
    const fallbackStatusCount = (value: string) =>
      fallback.data.availableFilters.statuses.find((status) => status.value === value)?.count ?? 0;
    assert.equal(fallbackStatusCount("needs_follow_up"), fastStatusCount("needs_follow_up"));
    assert.equal(fallbackStatusCount("nurture"), fastStatusCount("nurture"));

    for (const [engine, engineService] of [["fast", service], ["fallback", fallbackService]] as const) {
      const nurture = await engineService.searchContacts({
        actorId: ambiguityActor,
        query: "common",
        statusFilters: ["nurture"],
        limit: 1,
      });
      assert.equal(nurture.success, true, `${engine}: ambiguity excluded by the non-matching status filter`);
      if (nurture.success) assert.deepEqual(nurture.data.contacts, []);

      await assert.rejects(
        async () => engineService.searchContacts({
          actorId: ambiguityActor,
          query: "common",
          statusFilters: ["needs_follow_up"],
          limit: 1,
        }),
        /CONTACT_DETAIL_AMBIGUOUS_CONNECTION/,
        `${engine}: the selected ambiguous contact must fail after structured filtering`,
      );

      await assert.rejects(
        async () => engineService.searchContacts({
          actorId: ambiguityActor,
          query: "common",
          limit: 1,
          cursor: fast.data.nextCursor,
        }),
        /CONTACT_DETAIL_AMBIGUOUS_CONNECTION/,
        `${engine}: ambiguity must fail when the corrupted contact is on the returned page`,
      );
    }
  });
});

test("unknown Unicode tuple falls back to one snapshot projection and backs off", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ actorOne, client, store, workspaceId }) => {
    let probeCount = 0;
    let fallbackQueryCount = 0;
    const unknownTupleClient: LiveRecordSqlClient = {
      async query<TRow>(text, values) {
        if (text.includes("pg_collation_actual_version")) {
          probeCount += 1;
          return { rows: [{ server_version_num: "0" }] as TRow[] };
        }
        fallbackQueryCount += 1;
        return client.query<TRow>(text, values);
      },
    };
    const reader = createPostgresContactRecordPageReader({
      client: unknownTupleClient,
      workspaceId,
    });
    const service = createLiveContactsListSearchAndFilterService({
      provider: createStorageContactGraphProvider({
        contactRecordPageReader: reader,
        source: contactFixtureSource,
        sourceLabel: contactFixtureSourceLabel,
        store,
        workspaceId,
      }),
    });

    const first = await service.searchContacts({
      actorId: actorOne,
      query: "证据唯一命中",
      limit: 1,
    });
    assert.equal(first.success, true);
    if (!first.success) return;
    assert.deepEqual(first.data.contacts.map((contact) => contact.id), [
      "contact:evidence-only",
    ]);
    assert.equal(first.data.total, 1);
    assert.equal(probeCount, 1);
    assert.equal(fallbackQueryCount, 1);

    const alpha = await service.searchContacts({
      actorId: actorOne,
      query: "Alpha",
      limit: 1,
    });
    assert.equal(alpha.success, true);
    if (alpha.success) {
      assert.deepEqual(
        alpha.data.contacts[0],
        oracleAlpha,
        "fallback projection preserves the complete DTO mapper output",
      );
    }
    assert.equal(fallbackQueryCount, 2);

    const second = await service.searchContacts({
      actorId: actorOne,
      query: "证据唯一命中",
      limit: 1,
    });
    assert.equal(second.success, true);
    assert.equal(probeCount, 1, "negative tuple is cached during the 30s backoff");
    assert.equal(fallbackQueryCount, 3);
  });
});

test("approved local ICU lower matches JS fields without NFKC or wildcard expansion", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ actorOne, service, store }) => {
    await seedUnicodeContactFixture(store);
    const cases = [
      { query: "  i\u0307  ", label: "display name İ" },
      { query: "ος", label: "role ΟΣ" },
      { query: "οσα", label: "organization ΟΣΑ" },
      { query: "aς", label: "location AΣ" },
      { query: "ß", label: "profile ß" },
      { query: "摘要ω", label: "relationship summary Ω" },
      { query: "%_", label: "evidence literal percent and underscore" },
      { query: "tag-ος", label: "custom tag ΟΣ" },
      { query: "e\u0301", label: "combining mark" },
      { query: "Ｆｕｌｌｗｉｄｔｈ", label: "fullwidth literal" },
    ];
    for (const testCase of cases) {
      const result = await service.searchContacts({
        actorId: actorOne,
        limit: 20,
        query: testCase.query,
      });
      assert.equal(result.success, true, testCase.label);
      if (!result.success) continue;
      assert.deepEqual(
        result.data.contacts.map((contact) => contact.id),
        ["contact:unicode"],
        testCase.label,
      );
      assert.equal(result.data.total, 1, testCase.label);
    }

    const nfkcWouldMatch = await service.searchContacts({
      actorId: actorOne,
      limit: 20,
      query: "fullwidth",
    });
    assert.equal(nfkcWouldMatch.success, true);
    if (nfkcWouldMatch.success) {
      assert.deepEqual(nfkcWouldMatch.data.contacts, []);
      assert.equal(nfkcWouldMatch.data.total, 0);
    }
  });
});

test("unknown Unicode fallback pages use JS prefix rank with storage tuple boundaries", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ actorOne, client, store, workspaceId }) => {
    const source = {
      type: "manual",
      id: "source:unicode-pagination",
      label: "Unicode pagination source",
    } satisfies ContactFixtureSource;
    const timestamp = contactFixtureTimestamp(19);
    for (const family of ["i-dot", "greek-final-sigma"] as const) {
      for (let index = 0; index < 3; index += 1) {
        const suffix = String(index);
        const contactId = `contact:unicode:${family}:${suffix}`;
        await store.upsertRecord(contactFixtureContact({
          workspaceId,
          recordId: `storage:unicode-pagination:${family}:${suffix}`,
          userId: actorOne,
          id: contactId,
          displayName: family === "i-dot" ? `İstanbul ${suffix}` : `ΟΣ ${suffix}`,
          role: "Unicode pagination fixture",
          organization: "Cursor semantics",
          location: "Tokyo",
          profileSnippet: "Unicode pagination profile",
          source,
          evidenceId: "evidence:alpha",
          timestamp,
          searchText: "unicode pagination fixture",
        }));
      }
    }

    let fastQueryCount = 0;
    const fastClient: LiveRecordSqlClient = {
      async query<TRow>(text, values) {
        if (text.includes("with base_contacts") && text.includes('collate pg_catalog."und-x-icu"')) {
          fastQueryCount += 1;
        }
        return client.query<TRow>(text, values);
      },
    };
    const fastService = createContactSearchServiceForClient({
      client: fastClient,
      store,
      workspaceId,
    });
    const fallbackClient: LiveRecordSqlClient = {
      async query<TRow>(text, values) {
        if (text.includes("as matcher_policy_version")) {
          return { rows: [{ server_version_num: "unapproved" }] as TRow[] };
        }
        return client.query<TRow>(text, values);
      },
    };
    const fallbackService = createContactSearchServiceForClient({
      client: fallbackClient,
      store,
      workspaceId,
    });

    const verifySwitch = async (
      query: string,
      expectedIds: readonly string[],
    ): Promise<void> => {
      const input = { actorId: actorOne, query, limit: 1 } as const;
      const fastFirst = await fastService.searchContacts(input);
      assert.equal(fastFirst.success, true, `${query}: fast first page`);
      if (!fastFirst.success) return;
      assert.deepEqual(
        fastFirst.data.contacts.map((contact) => contact.id),
        [expectedIds[0]],
        `${query}: fast first page must use the JS-equivalent prefix rank`,
      );
      assert.equal(fastFirst.data.total, expectedIds.length, `${query}: total`);
      assert.ok(fastFirst.data.nextCursor, `${query}: fast first cursor`);

      const fallbackSecond = await fallbackService.searchContacts({
        ...input,
        cursor: fastFirst.data.nextCursor,
      });
      assert.equal(fallbackSecond.success, true, `${query}: fallback second page`);
      if (!fallbackSecond.success) return;
      assert.deepEqual(
        fallbackSecond.data.contacts.map((contact) => contact.id),
        [expectedIds[1]],
        `${query}: fallback must combine JS prefix rank and storage tuple boundary`,
      );
      assert.ok(fallbackSecond.data.nextCursor, `${query}: fallback second cursor`);

      const fastThird = await fastService.searchContacts({
        ...input,
        cursor: fallbackSecond.data.nextCursor,
      });
      assert.equal(fastThird.success, true, `${query}: fast third page`);
      if (!fastThird.success) return;
      assert.deepEqual(
        fastThird.data.contacts.map((contact) => contact.id),
        [expectedIds[2]],
        `${query}: fast must accept the fallback cursor without a duplicate`,
      );
      assert.equal(fastThird.data.nextCursor, undefined, `${query}: final page terminates`);
    };

    await verifySwitch("i\u0307", [
      "contact:unicode:i-dot:0",
      "contact:unicode:i-dot:1",
      "contact:unicode:i-dot:2",
    ]);
    await verifySwitch("ος", [
      "contact:unicode:greek-final-sigma:0",
      "contact:unicode:greek-final-sigma:1",
      "contact:unicode:greek-final-sigma:2",
    ]);
    assert.equal(
      fastQueryCount,
      4,
      "both Unicode cases must actually traverse fast SQL on first and third pages",
    );
  });
});

test("runtime tuple probe is single-flight and retries after its bounded backoff", async () => {
  let now = 0;
  let probeCount = 0;
  let projectionQueryCount = 0;
  const client: LiveRecordSqlClient = {
    async query<TRow>(text) {
      if (text.includes("as matcher_policy_version")) {
        probeCount += 1;
        return { rows: [] as TRow[] };
      }
      projectionQueryCount += 1;
      return { rows: [] as TRow[] };
    },
  };
  const reader = createPostgresContactRecordPageReader({
    client,
    now: () => now,
    workspaceId: "workspace:probe-backoff",
  });

  await reader({ query: "İ", limit: 1 }, "actor:probe");
  now = 29_999;
  await reader({ query: "İ", limit: 1 }, "actor:probe");
  assert.equal(probeCount, 1);
  assert.equal(projectionQueryCount, 2);

  now = 30_000;
  await reader({ query: "İ", limit: 1 }, "actor:probe");
  assert.equal(probeCount, 2);
  assert.equal(projectionQueryCount, 3);
});

test("empty bounded query uses the uncollated SQL path without probing", async () => {
  let probeCount = 0;
  let projectionQueryCount = 0;
  const client: LiveRecordSqlClient = {
    async query<TRow>(text) {
      if (text.includes("as matcher_policy_version")) {
        probeCount += 1;
        throw new Error("empty query must not probe the runtime tuple");
      }
      if (text.includes('pg_catalog."und-x-icu"')) {
        throw new Error("empty query must not compile the ICU SQL path");
      }
      projectionQueryCount += 1;
      return {
        rows: [{
          total: "0",
          facet_tags: [],
          facet_sources: {},
          facet_values: {},
          facet_statuses: {},
          page: [],
          has_more: false,
        }] as TRow[],
      };
    },
  };
  const reader = createPostgresContactRecordPageReader({
    client,
    workspaceId: "workspace:probe-empty",
  });

  const result = await reader({ query: "", limit: 1 }, "actor:probe");
  assert.equal(result?.total, 0);
  assert.equal(probeCount, 0);
  assert.equal(projectionQueryCount, 1);
});

test("known ICU SQL incompatibility falls back once while other SQL errors propagate", async () => {
  let probeCount = 0;
  let fastQueryCount = 0;
  let fallbackQueryCount = 0;
  const approvedTuple = {
    actual_collversion: "153.136",
    catalog_collversion: "153.136",
    collisdeterministic: true,
    collation: "und-x-icu",
    collprovider: "i",
    matcher_policy_version: "ecmascript-lower-substring-v1",
    server_encoding: "UTF8",
    server_version_num: "160012",
  };
  const client: LiveRecordSqlClient = {
    async query<TRow>(text) {
      if (text.includes("as matcher_policy_version")) {
        probeCount += 1;
        return { rows: [approvedTuple] as TRow[] };
      }
      if (text.includes('collate pg_catalog."und-x-icu"')) {
        fastQueryCount += 1;
        throw {
          code: "42704",
          message: 'collation "pg_catalog.und-x-icu" does not exist',
        };
      }
      fallbackQueryCount += 1;
      return { rows: [] as TRow[] };
    },
  };
  const reader = createPostgresContactRecordPageReader({
    client,
    workspaceId: "workspace:probe-compatibility",
  });

  const first = await reader({ query: "İ", limit: 1 }, "actor:probe");
  assert.equal(first?.mode, "fallback");
  const second = await reader({ query: "İ", limit: 1 }, "actor:probe");
  assert.equal(second?.mode, "fallback");
  assert.equal(probeCount, 1, "compatibility failure enters the bounded negative backoff");
  assert.equal(fastQueryCount, 1);
  assert.equal(fallbackQueryCount, 2);

  const nonCompatibilityClient: LiveRecordSqlClient = {
    async query<TRow>(text) {
      if (text.includes("as matcher_policy_version")) {
        return { rows: [approvedTuple] as TRow[] };
      }
      if (text.includes('collate pg_catalog."und-x-icu"')) {
        throw { code: "42P01", message: "relation orbit_records does not exist" };
      }
      throw new Error("fallback must not run for unrelated database errors");
    },
  };
  const nonCompatibilityReader = createPostgresContactRecordPageReader({
    client: nonCompatibilityClient,
    workspaceId: "workspace:probe-non-compatibility",
  });
  await assert.rejects(
    nonCompatibilityReader({ query: "İ", limit: 1 }, "actor:probe"),
    (error: unknown) =>
      Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "42P01"),
  );
});

test("concurrent non-empty queries share the runtime probe promise", async () => {
  let releaseProbe: (() => void) | undefined;
  const probeGate = new Promise<void>((resolve) => {
    releaseProbe = resolve;
  });
  let probeCount = 0;
  let projectionQueryCount = 0;
  const approvedTuple = {
    actual_collversion: "153.136",
    catalog_collversion: "153.136",
    collisdeterministic: true,
    collation: "und-x-icu",
    collprovider: "i",
    matcher_policy_version: "ecmascript-lower-substring-v1",
    server_encoding: "UTF8",
    server_version_num: "160012",
  };
  const client: LiveRecordSqlClient = {
    async query<TRow>(text) {
      if (text.includes("as matcher_policy_version")) {
        probeCount += 1;
        await probeGate;
        return { rows: [approvedTuple] as TRow[] };
      }
      projectionQueryCount += 1;
      return {
        rows: [{
          total: "0",
          facet_tags: [],
          facet_sources: {},
          facet_values: {},
          facet_statuses: {},
          page: [],
          has_more: false,
          runtime_fingerprint: approvedTuple,
        }] as TRow[],
      };
    },
  };
  const reader = createPostgresContactRecordPageReader({
    client,
    workspaceId: "workspace:probe-concurrency",
  });

  const first = reader({ query: "ΟΣ", limit: 1 }, "actor:probe");
  const second = reader({ query: "ΟΣ", limit: 1 }, "actor:probe");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(probeCount, 1);
  releaseProbe?.();
  await Promise.all([first, second]);
  assert.equal(probeCount, 1);
  assert.equal(projectionQueryCount, 2);
});

test("fast and fallback pages share storage-order cursors for case and Unicode ties", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ actorOne, client, store, workspaceId }) => {
    await seedTieContactFixture(store);
    const tieStorageRecordIds = [
      "storage:tie:A",
      "storage:tie:a",
      "storage:tie:Ω",
    ] as const;
    const tieRows = await client.query<{
      record_id: string;
      domain_id: string | null;
    }>(
      `select record_id, payload->>'id' as domain_id
         from orbit_records
        where workspace_id = $1
          and collection_name = 'contacts'
          and record_id in ($2, $3, $4)
        order by record_id asc`,
      [workspaceId, ...tieStorageRecordIds],
    );
    assert.equal(tieRows.rows.length, tieStorageRecordIds.length);
    assert.deepEqual(
      new Set(tieRows.rows.map((row) => row.record_id)),
      new Set(tieStorageRecordIds),
      "tie oracle must contain exactly the three seeded storage identities",
    );
    assert.ok(tieRows.rows.every((row) => typeof row.domain_id === "string"));
    assert.deepEqual(
      tieRows.rows.map((row) => [row.record_id, row.domain_id]),
      tieRows.rows.map((row) => [
        row.record_id,
        `contact:tie:${row.record_id.slice("storage:tie:".length)}`,
      ]),
      "tie oracle must preserve the storage-to-domain mapping",
    );
    const tieContactOrder = tieRows.rows.map((row) => row.domain_id!);
    assert.deepEqual(
      new Set(tieContactOrder),
      new Set(tieStorageRecordIds.map((recordId) =>
        `contact:tie:${recordId.slice("storage:tie:".length)}`,
      )),
      "tie oracle must map each selected storage identity to one domain ID",
    );
    const fastService = createContactSearchServiceForClient({
      client,
      store,
      workspaceId,
    });
    const fallbackClient: LiveRecordSqlClient = {
      async query<TRow>(text, values) {
        if (text.includes("as matcher_policy_version")) {
          return { rows: [{ server_version_num: "unapproved" }] as TRow[] };
        }
        return client.query<TRow>(text, values);
      },
    };
    const fallbackService = createContactSearchServiceForClient({
      client: fallbackClient,
      store,
      workspaceId,
    });
    const input = { actorId: actorOne, query: "tie", limit: 1 } as const;

    const fastFirst = await fastService.searchContacts(input);
    assert.equal(fastFirst.success, true);
    if (!fastFirst.success) return;
    assert.deepEqual(fastFirst.data.contacts.map((contact) => contact.id), [
      tieContactOrder[0],
    ], "fast first page follows the independent storage order");
    assert.equal(fastFirst.data.total, 3);
    assert.ok(fastFirst.data.nextCursor);

    const fallbackAfterFast = await fallbackService.searchContacts({
      ...input,
      cursor: fastFirst.data.nextCursor,
    });
    assert.equal(fallbackAfterFast.success, true);
    if (!fallbackAfterFast.success) return;
    assert.deepEqual(fallbackAfterFast.data.contacts.map((contact) => contact.id), [
      tieContactOrder[1],
    ], "fallback second page follows the independent storage order");
    assert.equal(fallbackAfterFast.data.total, 3);

    const fallbackFirst = await fallbackService.searchContacts(input);
    assert.equal(fallbackFirst.success, true);
    if (!fallbackFirst.success) return;
    assert.deepEqual(fallbackFirst.data.contacts.map((contact) => contact.id), [
      tieContactOrder[0],
    ], "fallback first page follows the independent storage order");
    assert.ok(fallbackFirst.data.nextCursor);

    const fastAfterFallback = await fastService.searchContacts({
      ...input,
      cursor: fallbackFirst.data.nextCursor,
    });
    assert.equal(fastAfterFallback.success, true);
    if (!fastAfterFallback.success) return;
    assert.deepEqual(fastAfterFallback.data.contacts.map((contact) => contact.id), [
      tieContactOrder[1],
    ], "fast second page follows the independent storage order");

    const ids = [
      fastFirst.data.contacts[0]?.id,
      fallbackAfterFast.data.contacts[0]?.id,
    ];
    let cursor = fallbackAfterFast.data.nextCursor;
    for (let pageNumber = 0; pageNumber < 5 && cursor; pageNumber += 1) {
      const page = await fallbackService.searchContacts({ ...input, cursor });
      assert.equal(page.success, true);
      if (!page.success) return;
      ids.push(...page.data.contacts.map((contact) => contact.id));
      cursor = page.data.nextCursor;
    }
    assert.equal(
      cursor,
      undefined,
      `three tie rows must terminate the keyset cursor: ${JSON.stringify(ids)}`,
    );
    assert.deepEqual(ids, [
      ...tieContactOrder,
    ], "full walk follows the independent storage order");
    assert.equal(new Set(ids).size, ids.length);
  });
});

test("live no-limit reads isolate actor and workspace and private shared tags", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorOne, actorTwo }) => {
    const actorOneResult = await service.listContacts({ actorId: actorOne });

    assert.equal(actorOneResult.success, true);
    if (!actorOneResult.success) return;

    assert.deepEqual(actorOneResult.data.contacts.map((contact) => contact.id), [
      "contact:alpha",
      "contact:evidence-only",
      "contact:tag-only",
      "contact:page-two",
    ]);
    const sharedContact = actorOneResult.data.contacts.find(
      (contact) => contact.id === "contact:evidence-only",
    );
    assert.deepEqual(sharedContact?.tags, ["shared-private-one"]);
    assert.equal(sharedContact?.tags.includes("shared-private-two"), false);
    assert.equal(
      actorOneResult.data.contacts.some(
        (contact) => contact.id === "contact:actor-two",
      ),
      false,
    );
    assert.equal(
      actorOneResult.data.contacts.some(
        (contact) => contact.id === "contact:foreign-workspace",
      ),
      false,
    );

    const actorTwoResult = await service.listContacts({ actorId: actorTwo });

    assert.equal(actorTwoResult.success, true);
    if (!actorTwoResult.success) return;

    assert.deepEqual(actorTwoResult.data.contacts.map((contact) => contact.id), [
      "contact:evidence-only",
      "contact:actor-two",
    ]);
    assert.deepEqual(actorTwoResult.data.contacts[0]?.tags, [
      "shared-private-two",
    ]);
    assert.equal(
      actorTwoResult.data.contacts[0]?.tags.includes("shared-private-one"),
      false,
    );
    assert.deepEqual(actorTwoResult.data.contacts[1]?.tags, [
      "actor-two-private",
      "actor-two-private",
    ]);
    assert.equal(
      actorTwoResult.data.availableFilters.tags.find(
        (option) => option.value === "actor-two-private",
      )?.count,
      1,
      "literal oracle: duplicate custom tags count one actor-two contact once",
    );
    assert.equal(
      actorTwoResult.data.availableFilters.values.find(
        (option) => option.value === "strategic_fit",
      )?.count,
      1,
      "literal oracle: duplicate valueTypes count one actor-two contact once",
    );

    const actorTwoBounded = await service.listContacts({
      actorId: actorTwo,
      query: "Actor Two",
      limit: 1,
    });
    assert.equal(actorTwoBounded.success, true);
    if (!actorTwoBounded.success) return;
    assert.equal(
      actorTwoBounded.data.availableFilters.tags.find(
        (option) => option.value === "actor-two-private",
      )?.count,
      1,
      "literal oracle: SQL tag facet counts duplicate values once per contact",
    );
    assert.equal(
      actorTwoBounded.data.availableFilters.values.find(
        (option) => option.value === "strategic_fit",
      )?.count,
      1,
      "literal oracle: SQL value facet counts duplicate values once per contact",
    );
    assert.equal(
      actorTwoResult.data.contacts.some(
        (contact) => contact.id === "contact:foreign-workspace",
      ),
      false,
    );
  });
});

test("live bounded pages match an evidence-only substring", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorOne }) => {
    const result = await service.searchContacts({
      actorId: actorOne,
      query: "证据唯一命中",
      limit: 1,
    });

    assert.equal(result.success, true);
    if (!result.success) return;

    assert.deepEqual(
      result.data.contacts.map((contact) => contact.id),
      ["contact:evidence-only"],
      "literal oracle: bounded evidence substring must select the contact",
    );
    assert.equal(result.data.total, 1);
    assert.deepEqual(
      result.data.contacts[0]?.evidence.map((evidence) => evidence.excerpt),
      ["证据唯一命中"],
    );
  });
});

test("live bounded pages match an actor-owned custom-tag substring", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorOne }) => {
    const result = await service.searchContacts({
      actorId: actorOne,
      query: "本人私有tag",
      limit: 1,
    });

    assert.equal(result.success, true);
    if (!result.success) return;

    assert.deepEqual(result.data.contacts.map((contact) => contact.id), [
      "contact:tag-only",
    ]);
    assert.equal(result.data.total, 1);
    assert.deepEqual(result.data.contacts[0]?.tags, ["本人私有tag命中"]);
  });
});

test("live bounded pages match a relationship-summary-only substring", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorOne }) => {
    const result = await service.searchContacts({
      actorId: actorOne,
      query: "Alpha relationship context",
      limit: 1,
    });

    assert.equal(result.success, true);
    if (!result.success) return;

    assert.deepEqual(result.data.contacts.map((contact) => contact.id), [
      "contact:alpha",
    ]);
    assert.equal(result.data.total, 1);
    assert.equal(
      result.data.contacts[0]?.relationshipContext,
      "Alpha relationship context",
    );
  });
});

test("live lifecycle oracle keeps canonical authority, legacy stage, and pending state", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorThree }) => {
    const canonicalResult = await service.listContacts({
      actorId: actorThree,
      query: "canonical-token",
    });

    assert.equal(canonicalResult.success, true);
    if (!canonicalResult.success) return;
    assert.deepEqual(canonicalResult.data.contacts.map((contact) => contact.id), [
      "contact:canonical",
    ]);
    assert.equal(canonicalResult.data.contacts[0]?.status, "active");
    assert.equal(
      canonicalResult.data.contacts[0]?.lifecycleInitialization,
      "ready",
    );
    assert.equal(
      canonicalResult.data.contacts[0]?.relationshipContext,
      "Canonical relationship summary",
    );
    assert.equal(
      canonicalResult.data.contacts[0]?.lastInteractionAt,
      contactFixtureTimestamp(10),
    );

    const legacyResult = await service.listContacts({
      actorId: actorThree,
      query: "legacy-token",
    });

    assert.equal(legacyResult.success, true);
    if (!legacyResult.success) return;
    assert.deepEqual(legacyResult.data.contacts.map((contact) => contact.id), [
      "contact:legacy",
    ]);
    assert.equal(legacyResult.data.contacts[0]?.status, "needs_follow_up");
    assert.equal(
      legacyResult.data.contacts[0]?.relationshipContext,
      "Legacy relationship summary",
    );
    assert.equal(
      legacyResult.data.contacts[0]?.lastInteractionAt,
      contactFixtureTimestamp(9),
    );

    const pendingResult = await service.listContacts({
      actorId: actorThree,
      query: "pending-token",
    });

    assert.equal(pendingResult.success, true);
    if (!pendingResult.success) return;
    assert.deepEqual(pendingResult.data.contacts.map((contact) => contact.id), [
      "contact:pending",
    ]);
    assert.equal(pendingResult.data.contacts[0]?.status, "needs_follow_up");
    assert.equal(
      pendingResult.data.contacts[0]?.lifecycleInitialization,
      "pending",
    );
    assert.equal(
      pendingResult.data.contacts[0]?.lastInteractionAt,
      contactFixtureTimestamp(8),
    );

    const pendingActiveFilter = await service.listContacts({
      actorId: actorThree,
      query: "pending-token",
      statusFilters: ["active"],
    });

    assert.equal(pendingActiveFilter.success, true);
    if (!pendingActiveFilter.success) return;
    assert.deepEqual(pendingActiveFilter.data.contacts, []);
    assert.equal(pendingActiveFilter.data.total, 0);
  });
});

test("live lifecycle oracle explicitly rejects duplicate canonical connections", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorThree }) => {
    await assert.rejects(
      async () =>
        service.listContacts({
          actorId: actorThree,
          query: "ambiguous-token",
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "CONTACT_DETAIL_AMBIGUOUS_CONNECTION",
    );
  });
});

test("bounded fast and fallback pages defer a later canonical error to that page", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ actorThree, client, store, workspaceId }) => {
    const fastService = createContactSearchServiceForClient({
      client,
      store,
      workspaceId,
    });
    const fallbackClient: LiveRecordSqlClient = {
      async query<TRow>(text, values) {
        if (text.includes("pg_collation_actual_version")) {
          return { rows: [{ server_version_num: "unapproved" }] as TRow[] };
        }
        return client.query<TRow>(text, values);
      },
    };
    const fallbackService = createContactSearchServiceForClient({
      client: fallbackClient,
      store,
      workspaceId,
    });
    const input = {
      actorId: actorThree,
      query: "lifecycle",
      limit: 2,
    } as const;

    const fastFirst = await fastService.searchContacts(input);
    assert.equal(fastFirst.success, true);
    if (!fastFirst.success) return;
    assert.deepEqual(fastFirst.data.contacts.map((contact) => contact.id), [
      "contact:canonical",
      "contact:legacy",
    ]);
    assert.equal(fastFirst.data.total, 4);
    assert.ok(fastFirst.data.nextCursor);

    const fallbackFirst = await fallbackService.searchContacts(input);
    assert.equal(fallbackFirst.success, true);
    if (!fallbackFirst.success) return;
    assert.deepEqual(fallbackFirst.data.contacts.map((contact) => contact.id), [
      "contact:canonical",
      "contact:legacy",
    ]);
    assert.equal(fallbackFirst.data.total, fastFirst.data.total);
    assert.deepEqual(fallbackFirst.data.availableFilters, fastFirst.data.availableFilters);

    await assert.rejects(
      async () => fastService.searchContacts({ ...input, cursor: fastFirst.data.nextCursor }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "CONTACT_DETAIL_AMBIGUOUS_CONNECTION",
    );
    await assert.rejects(
      async () => fallbackService.searchContacts({ ...input, cursor: fastFirst.data.nextCursor }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "CONTACT_DETAIL_AMBIGUOUS_CONNECTION",
    );
    await assert.rejects(
      async () => fastService.listContacts({ actorId: actorThree, query: "lifecycle" }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "CONTACT_DETAIL_AMBIGUOUS_CONNECTION",
    );
  });
});

test("live no-limit search treats percent and underscore as literal substrings", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorThree }) => {
    const cases = [
      { query: "  %  ", expectedId: "contact:literal-percent" },
      // The phrase isolates the literal marker from legitimate enum values
      // such as strategic_fit, while the percent fixture remains a wildcard
      // distractor if `_` is not escaped.
      { query: "literal _", expectedId: "contact:literal-underscore" },
    ] as const;

    for (const { query, expectedId } of cases) {
      const result = await service.searchContacts({
        actorId: actorThree,
        query,
      });

      assert.equal(result.success, true);
      if (!result.success) return;
      assert.deepEqual(
        result.data.contacts.map((contact) => contact.id),
        [expectedId],
        `literal oracle: ${JSON.stringify(query)} must not act as SQL wildcard`,
      );
      assert.equal(result.data.query, query.trim().toLocaleLowerCase());
    }
  });
});

test("live bounded cursor restarts safely for invalid, cross-actor, and cross-filter scopes", {
  skip: lifecycleDatabaseSkip,
  timeout: 30_000,
}, async () => {
  await withContactPostgresFixture(async ({ service, actorOne, actorTwo }) => {
    const first = await service.searchContacts({
      actorId: actorOne,
      query: "page-token",
      limit: 1,
    });

    assert.equal(first.success, true);
    if (!first.success) return;
    assert.deepEqual(first.data.contacts.map((contact) => contact.id), [
      "contact:alpha",
    ]);
    assert.equal(first.data.total, 2);
    assert.ok(first.data.nextCursor);
    const cursor = first.data.nextCursor!;

    const second = await service.searchContacts({
      actorId: actorOne,
      query: "page-token",
      limit: 1,
      cursor,
    });

    assert.equal(second.success, true);
    if (!second.success) return;
    assert.deepEqual(second.data.contacts.map((contact) => contact.id), [
      "contact:page-two",
    ]);
    assert.equal(second.data.total, 2);
    assert.equal(second.data.nextCursor, undefined);

    const invalid = await service.searchContacts({
      actorId: actorOne,
      query: "page-token",
      limit: 1,
      cursor: "not-a-valid-cursor",
    });

    assert.equal(invalid.success, true);
    if (!invalid.success) return;
    assert.deepEqual(invalid.data.contacts.map((contact) => contact.id), [
      "contact:alpha",
    ]);

    const crossActor = await service.searchContacts({
      actorId: actorTwo,
      query: "page-token",
      limit: 1,
      cursor,
    });

    assert.equal(crossActor.success, true);
    if (!crossActor.success) return;
    assert.deepEqual(crossActor.data.contacts, []);
    assert.equal(crossActor.data.total, 0);
    assert.equal(crossActor.data.nextCursor, undefined);

    const crossFilter = await service.searchContacts({
      actorId: actorOne,
      query: "page-token",
      sourceFilters: ["business_card_ocr"],
      limit: 1,
      cursor,
    });

    assert.equal(crossFilter.success, true);
    if (!crossFilter.success) return;
    assert.deepEqual(crossFilter.data.contacts.map((contact) => contact.id), [
      "contact:page-two",
    ]);
    assert.equal(crossFilter.data.total, 1);
    assert.equal(crossFilter.data.nextCursor, undefined);
  });
});

test("real PostgreSQL preserves microsecond keyset timestamps in empty, fast, and fallback pages", {
  skip: lifecycleDatabaseSkip,
  timeout: 60_000,
}, async () => {
  const cases = [
    {
      label: "occurred-microseconds",
      query: "microsecond-occurred-token",
      first: {
        id: "contact:microsecond:occurred:0",
        occurredAt: "2026-09-18T00:00:00.123456+00:00",
        updatedAt: "2026-09-18T00:00:01.000001+00:00",
      },
      second: {
        id: "contact:microsecond:occurred:1",
        occurredAt: "2026-09-18T00:00:00.123455+00:00",
        updatedAt: "2026-09-18T00:00:01.000001+00:00",
      },
    },
    {
      label: "updated-microseconds",
      query: "microsecond-updated-token",
      first: {
        id: "contact:microsecond:updated:0",
        occurredAt: "2026-09-18T00:01:00.000001+00:00",
        updatedAt: "2026-09-18T00:01:01.123456+00:00",
      },
      second: {
        id: "contact:microsecond:updated:1",
        occurredAt: "2026-09-18T00:01:00.000001+00:00",
        updatedAt: "2026-09-18T00:01:01.123455+00:00",
      },
    },
  ] as const;

  for (const fixtureCase of cases) {
    await withContactPostgresFixture(async ({ actorOne, client, store, workspaceId }) => {
      const source = {
        type: "manual",
        id: `source:${fixtureCase.label}`,
        label: `Microsecond ${fixtureCase.label}`,
      } satisfies ContactFixtureSource;
      for (const [index, entry] of [fixtureCase.first, fixtureCase.second].entries()) {
        await store.upsertRecord(contactFixtureContact({
          workspaceId,
          recordId: `storage:${fixtureCase.label}:${index}`,
          userId: actorOne,
          id: entry.id,
          displayName: `Microsecond ${fixtureCase.label} ${index}`,
          role: "Precision fixture",
          organization: "Cursor tests",
          location: "Tokyo",
          profileSnippet: `${fixtureCase.query} profile ${index}`,
          source,
          evidenceId: "evidence:alpha",
          timestamp: contactFixtureTimestamp(20),
          occurredAt: entry.occurredAt,
          updatedAt: entry.updatedAt,
          searchText: fixtureCase.query,
        }));
      }

      const runMode = async (mode: "empty" | "approved" | "fallback"): Promise<void> => {
        const projectionQueries: { values: readonly unknown[] }[] = [];
        const modeClient: LiveRecordSqlClient = {
          async query<TRow>(text, values) {
            if (mode === "fallback" && text.includes("as matcher_policy_version")) {
              return { rows: [{ server_version_num: "unapproved" }] as TRow[] };
            }
            if (text.includes("with base_contacts")) {
              projectionQueries.push({ values: values ?? [] });
            }
            return client.query<TRow>(text, values);
          },
        };
        const service = createContactSearchServiceForClient({
          client: modeClient,
          store,
          workspaceId,
        });
        const query = mode === "empty" ? "" : fixtureCase.query;
        const first = await service.searchContacts({
          actorId: actorOne,
          query,
          limit: 1,
        });
        assert.equal(first.success, true, `${fixtureCase.label}/${mode}: first page`);
        if (!first.success) return;
        assert.deepEqual(
          first.data.contacts.map((contact) => contact.id),
          [fixtureCase.first.id],
          `${fixtureCase.label}/${mode}: microsecond-newer row must be first`,
        );
        assert.equal(
          first.data.total,
          mode === "empty" ? 6 : 2,
          `${fixtureCase.label}/${mode}: total`,
        );
        assert.ok(first.data.nextCursor, `${fixtureCase.label}/${mode}: first cursor`);
        const cursor = first.data.nextCursor!;
        const cursorLast = cursorLastForTest(cursor);
        const cursorOccurredAt = String(cursorLast.occurredAt);
        const cursorUpdatedAt = String(cursorLast.updatedAt);
        const expectedOccurredFraction = /\.(\d{6})/.exec(fixtureCase.first.occurredAt)?.[1] ?? "";
        const expectedUpdatedFraction = /\.(\d{6})/.exec(fixtureCase.first.updatedAt)?.[1] ?? "";
        assert.match(
          cursorOccurredAt,
          new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.${expectedOccurredFraction}(?:Z|[+-]\\d{2}:\\d{2})$`),
        );
        assert.match(
          cursorUpdatedAt,
          new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.${expectedUpdatedFraction}(?:Z|[+-]\\d{2}:\\d{2})$`),
        );

        const second = await service.searchContacts({
          actorId: actorOne,
          query,
          limit: 1,
          cursor,
        });
        assert.equal(second.success, true, `${fixtureCase.label}/${mode}: second page`);
        if (!second.success) return;
        assert.deepEqual(
          second.data.contacts.map((contact) => contact.id),
          [fixtureCase.second.id],
          `${fixtureCase.label}/${mode}: microsecond-older row must not be skipped`,
        );
        if (mode === "empty") {
          assert.ok(second.data.nextCursor, `${fixtureCase.label}/${mode}: continues past the microsecond pair`);
        } else {
          assert.equal(second.data.nextCursor, undefined, `${fixtureCase.label}/${mode}: terminates`);
        }
        assert.equal(projectionQueries[1]?.values[10], cursorOccurredAt);
        assert.equal(projectionQueries[1]?.values[11], cursorUpdatedAt);

        const cursorEnvelope = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
          last: Record<string, unknown>;
          scope: string;
          version: number;
        };
        for (const [field, invalidValue] of [
          ["occurredAt", "2026-09-18T00:00:00.1234567+00:00"],
          ["updatedAt", "2026-09-18T00:00:00.123456+99:00"],
          ["occurredAt", "0000-01-01T00:00:00.123456Z"],
          ["updatedAt", "2026-09-18T00:00:00.123456+16:00"],
          ["updatedAt", "2026-09-18T00:00:00.123456+23:00"],
        ] as const) {
          const invalidCursor = Buffer.from(JSON.stringify({
            ...cursorEnvelope,
            last: { ...cursorEnvelope.last, [field]: invalidValue },
          }), "utf8").toString("base64url");
          const restarted = await service.searchContacts({
            actorId: actorOne,
            query,
            limit: 1,
            cursor: invalidCursor,
          });
          assert.equal(restarted.success, true, `${fixtureCase.label}/${mode}/${field}: invalid cursor`);
          if (!restarted.success) return;
          assert.deepEqual(
            restarted.data.contacts.map((contact) => contact.id),
            [fixtureCase.first.id],
            `${fixtureCase.label}/${mode}/${field}: invalid timestamp restarts first page`,
          );
        }
        assert.equal(projectionQueries.length, 7, `${fixtureCase.label}/${mode}: cursor validation snapshots`);
        assert.equal(projectionQueries[2]?.values[10], null);
        assert.equal(projectionQueries[2]?.values[11], null);
        assert.equal(projectionQueries[3]?.values[10], null);
        assert.equal(projectionQueries[3]?.values[11], null);
        assert.equal(projectionQueries[4]?.values[10], null);
        assert.equal(projectionQueries[4]?.values[11], null);
        assert.equal(projectionQueries[5]?.values[10], null);
        assert.equal(projectionQueries[5]?.values[11], null);
        assert.equal(projectionQueries[6]?.values[10], null);
        assert.equal(projectionQueries[6]?.values[11], null);
      };

      await runMode("empty");
      await runMode("approved");
      await runMode("fallback");
    });
  }
});

test("contact search returns bounded stable pages and never repeats a candidate", async () => {
  const service = createMockContactsListSearchAndFilterService();
  const first = await service.searchContacts({ query: "", limit: 2 });
  assert.equal(first.success, true);
  if (!first.success) return;
  assert.equal(first.data.contacts.length, 2);
  assert.equal(first.data.total, 4);
  assert.ok(first.data.nextCursor);

  const second = await service.searchContacts({ query: "", limit: 2, cursor: first.data.nextCursor });
  assert.equal(second.success, true);
  if (!second.success) return;
  assert.equal(second.data.contacts.length, 2);
  assert.equal(second.data.nextCursor, undefined);
  assert.deepEqual(
    new Set([...first.data.contacts, ...second.data.contacts].map((contact) => contact.id)).size,
    4,
  );

  const invalid = await service.searchContacts({ query: "", limit: Number.NaN });
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.equal(invalid.error.code, "CONTACTS_FILTER_NOT_SUPPORTED");
});

test("the live provider reads only one contact-id page from a 10,000-contact match", async () => {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  const page = (start: number) => Array.from({ length: 20 }, (_, index) => ({
    record_id: `contact:${start + index}`,
    sort_prefix_rank: 1,
    sort_occurred_at: "2026-09-17T00:00:00.000Z",
    sort_updated_at: "2026-09-17T00:00:00.000Z",
    error_code: null,
  }));
  const reader = createPostgresContactRecordPageReader({
    workspaceId: "workspace:test",
    client: {
      async query<TRow>(text: string, values: readonly unknown[] = []) {
        calls.push({ text, values });
        const cursorRecordId = typeof values[12] === "string" ? values[12] : null;
        const offset = cursorRecordId
          ? Number(cursorRecordId.split(":").at(-1)) + 1
          : 0;
        return {
          rows: [{
            total: "10000",
            facet_tags: [],
            facet_sources: {},
            facet_values: {},
            facet_statuses: {},
            page: page(offset),
            has_more: true,
          }] as TRow[],
        };
      },
    },
  });

  const first = await reader({ query: "", limit: 20 }, "account:one");
  assert.equal(first?.recordIds.length, 20);
  assert.equal(first?.total, 10_000);
  assert.ok(first?.nextCursor);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.values[13], 20);
  assert.equal(calls[0]?.values[12], null);
  assert.ok(calls.every((call) => call.values.includes("account:one")));

  calls.length = 0;
  const second = await reader({ query: "", limit: 20, cursor: first?.nextCursor }, "account:one");
  assert.equal(second?.recordIds[0], "contact:20");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.values[12], "contact:19");

  calls.length = 0;
  const reusedByAnotherActor = await reader({ query: "", limit: 20, cursor: first?.nextCursor }, "account:two");
  assert.equal(reusedByAnotherActor?.recordIds[0], "contact:0");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.values[12], null);
});

test("real PostgreSQL batches a 1000-contact projection and reports egress separately", {
  skip: lifecycleDatabaseSkip,
  timeout: 60_000,
}, async () => {
  await withContactPostgresFixture(async ({ actorOne, client, store, workspaceId }) => {
    const source = {
      type: "manual",
      id: "source:batch-cost",
      label: "Batch cost source",
    } satisfies ContactFixtureSource;
    const uniqueEvidenceSource = {
      type: "manual",
      id: "source:batch-cost-unique-evidence",
      label: "Batch cost unique evidence source",
    } satisfies ContactFixtureSource;
    const timestamp = contactFixtureTimestamp(15);
    for (let index = 0; index < 1_000; index += 1) {
      const suffix = String(index).padStart(4, "0");
      const uniqueEvidenceId = `evidence:batch-cost:${suffix}`;
      await store.upsertRecord(contactFixtureEvidence({
        workspaceId,
        id: uniqueEvidenceId,
        recordId: `evidence-row:batch-cost:${suffix}`,
        contactId: `contact:batch-cost:${suffix}`,
        source: uniqueEvidenceSource,
        timestamp: contactFixtureTimestamp(16),
        summary: `Batch unique evidence ${suffix}`,
      }));
      await store.upsertRecord(contactFixtureContact({
        workspaceId,
        recordId: `storage:batch-cost:${suffix}`,
        userId: actorOne,
        id: `contact:batch-cost:${suffix}`,
        displayName: `Batch Cost ${suffix}`,
        role: "Cost fixture",
        organization: "Projection Tests",
        location: "Tokyo",
        profileSnippet: `batch-cost-token ${suffix}`,
        source,
        evidenceId: uniqueEvidenceId,
        timestamp,
        searchText: "batch-cost-token",
      }));
      await store.upsertRecord(contactFixtureConnection({
        workspaceId,
        recordId: `connection:batch-cost:${suffix}`,
        userId: actorOne,
        id: `connection:batch-cost:${suffix}`,
        accountId: actorOne,
        contactId: `contact:batch-cost:${suffix}`,
        source,
        evidenceId: "evidence:alpha",
        timestamp,
        summary: "Batch cost relationship",
        valueTypes: ["strategic_fit"],
      }));
      await store.upsertRecord(contactFixtureDetailState({
        workspaceId,
        recordId: `detail:batch-cost:${suffix}`,
        userId: actorOne,
        contactId: `contact:batch-cost:${suffix}`,
        tags: ["batch-cost-tag"],
        timestamp,
      }));
    }
    const unreferencedEvidenceSource = {
      type: "manual",
      id: "source:unreferenced-evidence",
      label: "Unreferenced evidence source",
    } satisfies ContactFixtureSource;
    for (let index = 0; index < 500; index += 1) {
      const suffix = String(index).padStart(4, "0");
      await store.upsertRecord(contactFixtureEvidence({
        workspaceId,
        id: `evidence:unreferenced:${suffix}`,
        recordId: `evidence-row:unreferenced:${suffix}`,
        contactId: "contact:unreferenced",
        source: unreferencedEvidenceSource,
        timestamp: contactFixtureTimestamp(18),
        summary: `Unreferenced evidence ${suffix}`,
      }));
    }

    const projectionQueries: { label: string; text: string; values: readonly unknown[] }[] = [];
    let returnedProjectionBytes = 0;
    const returnedProjectionRowsByLabel = new Map<string, number>();
    const measuredClient: LiveRecordSqlClient = {
      async query<TRow>(text, values) {
        const result = await client.query<TRow>(text, values);
        if (text.includes("with base_contacts")) {
          const label = values?.[2] === "" ? "empty" : "query";
          projectionQueries.push({ label, text, values: values ?? [] });
          returnedProjectionBytes += Buffer.byteLength(JSON.stringify(result.rows), "utf8");
          returnedProjectionRowsByLabel.set(
            label,
            (returnedProjectionRowsByLabel.get(label) ?? 0) + result.rows.length,
          );
        }
        return result;
      },
    };
    const reader = createPostgresContactRecordPageReader({
      client: measuredClient,
      workspaceId,
    });
    const page = await reader({ query: "batch-cost-token", limit: 5 }, actorOne);
    assert.equal(page?.total, 1_000);
    assert.ok(page);
    assert.equal(
      page.evidenceRecords.filter((record) => record.payload.id === "evidence:alpha").length,
      1,
      "the cost fixture must exercise one real shared evidence row, not missing-evidence fallback text",
    );
    assert.deepEqual(
      page.evidenceRecords
        .map((record) => record.payload.id)
        .filter((id): id is string => typeof id === "string" && id.startsWith("evidence:batch-cost:"))
        .sort(),
      ["evidence:batch-cost:0000", "evidence:batch-cost:0001", "evidence:batch-cost:0002", "evidence:batch-cost:0003", "evidence:batch-cost:0004"],
      "the bounded page must retain each returned contact's unique evidence while using shared connection evidence",
    );
    assert.equal(
      page.evidenceRecords.some((record) =>
        typeof record.payload.id === "string" && record.payload.id.startsWith("evidence:unreferenced:"),
      ),
      false,
      "unreferenced evidence must not enter the page projection",
    );
    const emptyPage = await reader({ query: "", limit: 5 }, actorOne);
    assert.equal(emptyPage?.total, 1_004);
    assert.deepEqual(
      projectionQueries.map((projectionQuery) => projectionQuery.label),
      ["query", "empty"],
      "query and empty paths must each use one snapshot projection statement",
    );

    const fastService = createContactSearchServiceForClient({
      client,
      store,
      workspaceId,
    });
    const fastFirst = await fastService.searchContacts({
      actorId: actorOne,
      query: "batch-cost-token",
      limit: 2,
    });
    assert.equal(fastFirst.success, true);
    if (!fastFirst.success) return;
    assert.deepEqual(fastFirst.data.contacts.map((contact) => contact.id), [
      "contact:batch-cost:0000",
      "contact:batch-cost:0001",
    ]);
    assert.ok(fastFirst.data.nextCursor);
    const firstCursor = fastFirst.data.nextCursor!;
    const deleted = await store.deleteRecord({
      workspaceId,
      collectionName: "contacts",
      recordId: "storage:batch-cost:0001",
      userId: actorOne,
      deletedAt: contactFixtureTimestamp(16),
    });
    assert.ok(deleted);

    const fastAfterDeletion = await fastService.searchContacts({
      actorId: actorOne,
      query: "batch-cost-token",
      limit: 2,
      cursor: firstCursor,
    });
    assert.equal(fastAfterDeletion.success, true);
    if (!fastAfterDeletion.success) return;
    assert.deepEqual(fastAfterDeletion.data.contacts.map((contact) => contact.id), [
      "contact:batch-cost:0002",
      "contact:batch-cost:0003",
    ], "fast SQL keeps the tuple boundary even after the cursor row is deleted");

    const fallbackProjectionQueries: { label: string; text: string; values: readonly unknown[] }[] = [];
    const fallbackClient: LiveRecordSqlClient = {
      async query<TRow>(text, values) {
        if (text.includes("pg_collation_actual_version")) {
          return { rows: [{ server_version_num: "unapproved" }] as TRow[] };
        }
        if (text.includes("with base_contacts")) {
          fallbackProjectionQueries.push({ label: "fallback", text, values: values ?? [] });
        }
        return client.query<TRow>(text, values);
      },
    };
    const fallbackService = createContactSearchServiceForClient({
      client: fallbackClient,
      store,
      workspaceId,
    });
    const fallbackAfterDeletion = await fallbackService.searchContacts({
      actorId: actorOne,
      query: "batch-cost-token",
      limit: 2,
      cursor: firstCursor,
    });
    assert.equal(fallbackAfterDeletion.success, true);
    if (!fallbackAfterDeletion.success) return;
    assert.deepEqual(fallbackAfterDeletion.data.contacts.map((contact) => contact.id), [
      "contact:batch-cost:0002",
      "contact:batch-cost:0003",
    ], "fallback must use the SQL tuple-after sidecar when the cursor row is gone");

    const deletedContact = deleted!;
    await store.upsertRecord({
      ...deletedContact,
      updatedAt: contactFixtureTimestamp(17),
      deletedAt: null,
      lifecycleState: "active",
      searchText: "cursor row no longer matches",
      payload: {
        ...deletedContact.payload,
        displayName: "Moved Cost 0001",
        profileSnippet: "cursor row no longer matches",
        updatedAt: contactFixtureTimestamp(17),
      },
    });
    const fallbackAfterCursorUpdate = await fallbackService.searchContacts({
      actorId: actorOne,
      query: "batch-cost-token",
      limit: 2,
      cursor: firstCursor,
    });
    assert.equal(fallbackAfterCursorUpdate.success, true);
    if (!fallbackAfterCursorUpdate.success) return;
    assert.deepEqual(fallbackAfterCursorUpdate.data.contacts.map((contact) => contact.id), [
      "contact:batch-cost:0002",
      "contact:batch-cost:0003",
    ], "a changed/non-matching cursor row must not force fallback to page one");
    assert.equal(fallbackProjectionQueries.length, 2, "fallback cursor checks use one snapshot statement each");

    if (page?.mode !== "fallback") {
      assert.equal(page?.recordIds.length, 5);
      assert.equal(
        returnedProjectionRowsByLabel.get("query"),
        1,
        "fast metadata and page must be returned as one row, not repeated once per contact",
      );
      assert.ok(returnedProjectionBytes > 0);
      assert.ok(
        returnedProjectionBytes < 100_000,
        `database returned ${returnedProjectionBytes} bytes for the bounded page; this is egress, not scan cost`,
      );
    } else {
      assert.ok(
        page.recordIds.length >= 1_000,
        "an unapproved runtime must use the complete authorized fallback snapshot",
      );
    }

    const planNodes = (value: unknown): Record<string, unknown>[] => {
      if (Array.isArray(value)) return value.flatMap(planNodes);
      if (!value || typeof value !== "object") return [];
      const record = value as Record<string, unknown>;
      return [
        record,
        ...Object.values(record).flatMap(planNodes),
      ];
    };
    const explainTargets = [
      ...projectionQueries,
      fallbackProjectionQueries[0]!,
    ];
    for (const projectionQuery of explainTargets) {
      const explainResult = await client.query<{ "QUERY PLAN": unknown }>(
        `explain (analyze, buffers, format json) ${projectionQuery.text}`,
        projectionQuery.values,
      );
      const rawPlan = explainResult.rows[0]?.["QUERY PLAN"];
      const parsedPlan = typeof rawPlan === "string"
        ? JSON.parse(rawPlan) as unknown
        : rawPlan;
      const nodes = planNodes(parsedPlan);
      const baseContactScans = nodes.filter(
        (node) => node["CTE Name"] === "base_contacts" ||
          node["Subplan Name"] === "CTE base_contacts",
      );
      const isPageProjectionCte = (node: Record<string, unknown>) =>
        node["CTE Name"] === "page_contact_ids" ||
        node["CTE Name"] === "page_contact_id_rows" ||
        node["Subplan Name"] === "CTE page_contact_ids" ||
        node["Subplan Name"] === "CTE page_contact_id_rows";
      const pageContactIdRows = nodes.filter(
        (node) => node["CTE Name"] === "page_contact_id_rows" ||
          node["Subplan Name"] === "CTE page_contact_id_rows",
      );
      const pageContactIdScans = nodes.filter(
        (node) => node["CTE Name"] === "page_contact_ids" ||
          node["Subplan Name"] === "CTE page_contact_ids",
      );
      const cteScans = nodes.filter(
        (node) => node["Node Type"] === "CTE Scan" &&
          !isPageProjectionCte(node),
      );
      const repeatedHighCardinalityCteScans = cteScans.filter((node) =>
        Number(node["Actual Rows"] ?? 0) >= 100 &&
        Number(node["Actual Loops"] ?? 0) > 2,
      );
      const repeatedHighCardinalityPlanNodes = nodes.filter((node) =>
        !isPageProjectionCte(node) &&
        Number(node["Actual Rows"] ?? 0) >= 100 &&
        Number(node["Actual Loops"] ?? 0) > 2,
      );
      assert.ok(
        baseContactScans.length > 0,
        `${projectionQuery.label}: EXPLAIN must expose the materialized base contact CTE`,
      );
      assert.ok(
        baseContactScans.every((node) => Number(node["Actual Loops"] ?? 0) <= 2),
        `${projectionQuery.label}: base_contacts CTE scans must be batched, got ${JSON.stringify(baseContactScans)}`,
      );
      assert.ok(
        pageContactIdRows.length > 0,
        `${projectionQuery.label}: EXPLAIN must expose the page-contact ID rows CTE`,
      );
      assert.ok(
        pageContactIdRows.every((node) => Number(node["Actual Loops"] ?? 0) <= 2),
        `${projectionQuery.label}: page-contact ID rows may only be built/read in a bounded number of passes, got ${JSON.stringify(pageContactIdRows)}`,
      );
      if (projectionQuery.label === "fallback") {
        assert.ok(
          pageContactIdRows.every((node) => Number(node["Actual Rows"] ?? 0) >= 1_000),
          `fallback must build the complete authorized snapshot, got ${JSON.stringify(pageContactIdRows)}`,
        );
      } else {
        assert.ok(
          pageContactIdRows.every((node) => Number(node["Actual Rows"] ?? 0) <= 5),
          `${projectionQuery.label} metadata projection must be limited to returned page IDs, got ${JSON.stringify(pageContactIdRows)}`,
        );
      }
      assert.ok(
        pageContactIdScans.length > 0,
        `${projectionQuery.label}: EXPLAIN must expose the one-row page-contact ID array`,
      );
      assert.ok(
        pageContactIdScans.every((node) =>
          Number(node["Actual Rows"] ?? 0) === 1 &&
          Number(node["Actual Loops"] ?? 0) <= 4,
        ),
        `${projectionQuery.label}: page-contact ID array must be read as one bounded row, got ${JSON.stringify(pageContactIdScans)}`,
      );
      assert.deepEqual(
        repeatedHighCardinalityCteScans,
        [],
        `${projectionQuery.label}: no high-cardinality derived CTE may be rescanned per contact, got ${JSON.stringify(repeatedHighCardinalityCteScans)}`,
      );
      assert.deepEqual(
        repeatedHighCardinalityPlanNodes,
        [],
        `${projectionQuery.label}: no high-cardinality plan node may repeat per contact, got ${JSON.stringify(repeatedHighCardinalityPlanNodes)}`,
      );
      const repeatedPlanWork = nodes.filter((node) => {
        const actualRows = Number(node["Actual Rows"] ?? 0);
        const actualLoops = Number(node["Actual Loops"] ?? 0);
        return !isPageProjectionCte(node) &&
          actualRows >= 100 && actualRows * actualLoops > 20_000;
      });
      assert.deepEqual(
        repeatedPlanWork,
        [],
        `${projectionQuery.label}: EXPLAIN derived work must not grow as rows-by-contact loops, got ${JSON.stringify(repeatedPlanWork)}`,
      );
      const repeatedRemovedRows = nodes.filter((node) => {
        const removedRows = ["Rows Removed by Filter", "Rows Removed by Join Filter"]
          .reduce((total, key) => total + Number(node[key] ?? 0), 0);
        const actualLoops = Number(node["Actual Loops"] ?? 0);
        return removedRows >= 100 && actualLoops > 2 && removedRows * actualLoops > 20_000;
      });
      assert.deepEqual(
        repeatedRemovedRows,
        [],
        `${projectionQuery.label}: EXPLAIN must include filtered rows in the batch-work bound, got ${JSON.stringify(repeatedRemovedRows)}`,
      );
      const tempSpillNodes = nodes.filter((node) =>
        Number(node["Temp Read Blocks"] ?? 0) > 0 ||
        Number(node["Temp Written Blocks"] ?? 0) > 0,
      );
      if (projectionQuery.label === "fallback") {
        assert.ok(
          tempSpillNodes.every((node) =>
            node["CTE Name"] === "page_projections" ||
            node["Subplan Name"] === "CTE page_projections" ||
            (node["Node Type"] === "Sort" &&
              Array.isArray(node["Sort Key"]) &&
              (node["Sort Key"] as unknown[]).some((key) => String(key).includes("p.storage_order"))),
          ),
          `${projectionQuery.label}: any temp spill must be confined to the full fallback page projection sort, got ${JSON.stringify(tempSpillNodes)}`,
        );
      } else {
        assert.deepEqual(
          tempSpillNodes,
          [],
          `${projectionQuery.label}: bounded page projection must not spill temp blocks, got ${JSON.stringify(tempSpillNodes)}`,
        );
      }
      const evidenceRows = nodes.filter(
        (node) => node["CTE Name"] === "evidence_rows" ||
          node["Subplan Name"] === "CTE evidence_rows",
      );
      assert.ok(evidenceRows.length > 0, `${projectionQuery.label}: EXPLAIN must expose the referenced evidence CTE`);
      assert.ok(
        evidenceRows.every((node) =>
          Number(node["Actual Rows"] ?? 0) >= 1_000 &&
          Number(node["Actual Rows"] ?? 0) < 1_500 &&
          Number(node["Actual Loops"] ?? 0) <= 2,
        ),
        `${projectionQuery.label}: evidence_rows must batch referenced unique evidence without scanning unreferenced rows repeatedly, got ${JSON.stringify(evidenceRows)}`,
      );
    }
    assert.equal(returnedProjectionRowsByLabel.get("query"), 1);
    assert.equal(returnedProjectionRowsByLabel.get("empty"), 1);
  });
});

test("the live service trusts a bounded database page without filtering it a second time", async () => {
  const contact = defaultMockFixtures.contacts[0]!;
  const service = createLiveContactsListSearchAndFilterService({
    provider: {
      source: "postgres:test",
      sourceLabel: "Postgres test",
      readContactGraph: () => ({
        connections: [],
        contacts: [],
        evidence: [],
        generatedAt: "2026-09-15T00:00:00.000Z",
      }),
      readContactGraphForList: () => ({
        connections: defaultMockFixtures.connections.filter((item) => item.contactId === contact.id),
        contacts: [contact],
        evidence: defaultMockFixtures.evidence.filter((item) => contact.evidenceIds.includes(item.id)),
        generatedAt: "2026-09-15T00:00:00.000Z",
        boundedPage: {
          total: 66,
          nextCursor: "database-page-2",
        },
      }),
    },
  });

  const result = await service.searchContacts({
    actorId: "account:test",
    query: "qa-index-only-token",
    limit: 20,
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.contacts.map((item) => item.id), [contact.id]);
  assert.equal(result.data.total, 66);
  assert.equal(result.data.nextCursor, "database-page-2");
});
