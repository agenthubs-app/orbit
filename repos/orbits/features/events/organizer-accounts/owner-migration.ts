import { createHash } from "node:crypto";

import {
  EVENT_ORGANIZER_ACCOUNT_MANIFEST,
  EVENT_ORGANIZER_ASSIGNMENTS,
  validateEventOrganizerManifest,
} from "./manifest";
import {
  XIAOYU_ACCOUNT_ID,
  XIAOYU_AUTH_MEMBERSHIP_EVIDENCE_ID,
  XIAOYU_AUTH_USER_ID,
  XIAOYU_PUBLIC_PROFILE_ID,
} from "./bootstrap";
import { authUserRecordId } from "../../auth/storage/auth-user-live-record-provider";

export const EVENT_ORGANIZER_OWNER_MANIFEST_VERSION = "event-organizers-v1" as const;
export const XIAOYU_ACTOR_ID = XIAOYU_ACCOUNT_ID;

const AUDIT_COLLECTION = "event_organizer_owner_migrations";
const AUDIT_RECORD_ID = "event-organizer-owner-migration:event-organizers-v1";
const REVIEW_TIMESTAMP = "2026-08-19T00:00:00.000Z";

export interface EventOrganizerOwnerSqlClient {
  query: <TRow = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: TRow[] }>;
}

export interface EventOrganizerOwnerAssignment {
  readonly accountId: string;
  readonly eventId: string;
}

export interface EventOrganizerOwnerPlan {
  readonly assignments: readonly EventOrganizerOwnerAssignment[];
  readonly count: 16;
  readonly hash: string;
  readonly manifestVersion: "event-organizers-v1";
  readonly sourceHash: string;
}

export interface EventOrganizerOwnerVerification {
  readonly count: 16;
  readonly hash: string;
  readonly manifestVersion: "event-organizers-v1";
}

interface OrbitRecordRow {
  collection_name: string;
  created_at: string | Date;
  deleted_at: string | Date | null;
  evidence_ids: readonly string[] | null;
  lifecycle_state: string;
  occurred_at: string | Date | null;
  payload: unknown;
  provider: string | null;
  provider_record_id: string | null;
  record_id: string;
  search_text: string | null;
  source_id: string;
  source_label: string | null;
  source_type: string;
  target_id: string | null;
  target_type: string | null;
  updated_at: string | Date;
  user_id: string | null;
  workspace_id: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedEmail(value: unknown): string | null {
  const email = text(value);
  return email ? email.toLowerCase() : null;
}

function validPayloadTimestamp(value: unknown): boolean {
  return typeof value === "string" && text(value) !== null && timestamp(value) !== null;
}

function timestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function auditPayload(plan: EventOrganizerOwnerPlan): Record<string, unknown> {
  return {
    actorIds: [...new Set(plan.assignments.map((assignment) => assignment.accountId))].sort(),
    count: plan.count,
    eventIds: plan.assignments.map((assignment) => assignment.eventId),
    manifestVersion: plan.manifestVersion,
    planHash: plan.hash,
  };
}

function sourceHash(rows: readonly OrbitRecordRow[]): string {
  return createHash("sha256")
    .update(canonicalJson(rows
      .map(({ user_id: _userId, ...row }) => row)
      .sort((left, right) => left.record_id.localeCompare(right.record_id))))
    .digest("hex");
}

function planHash(
  assignments: readonly EventOrganizerOwnerAssignment[],
  reviewedSourceHash: string,
): string {
  return createHash("sha256")
    .update(canonicalJson({
      assignments,
      manifestVersion: EVENT_ORGANIZER_OWNER_MANIFEST_VERSION,
      sourceHash: reviewedSourceHash,
    }))
    .digest("hex");
}

function expectedAssignmentDefinitions() {
  const validation = validateEventOrganizerManifest();
  if (validation.state !== "valid") {
    throw new Error(`Organizer manifest is invalid: ${validation.errors.join("; ")}`);
  }
  const assignments = [...EVENT_ORGANIZER_ASSIGNMENTS]
    .sort((left, right) => left.eventId.localeCompare(right.eventId));
  if (assignments.length !== 16 || new Set(assignments.map((item) => item.eventId)).size !== 16) {
    throw new Error("Reviewed organizer assignment set must contain exactly 16 unique events.");
  }
  return assignments;
}

function activeRecords(
  rows: readonly OrbitRecordRow[],
  collectionName: string,
): readonly OrbitRecordRow[] {
  return rows.filter((row) =>
    row.collection_name === collectionName && row.lifecycle_state === "active",
  );
}

function exactlyOne<TValue>(values: readonly TValue[], message: string): TValue {
  if (values.length !== 1) throw new Error(message);
  return values[0]!;
}

function assertOrganizerChain(
  rows: readonly OrbitRecordRow[],
  input: { displayName: string; email: string; userId: string },
): void {
  const account = exactlyOne(
    activeRecords(rows, "accounts").filter((row) => row.record_id === input.userId),
    `Expected one active Account for ${input.email}.`,
  );
  const profileId = `profile:${input.userId}`;
  const profile = exactlyOne(
    activeRecords(rows, "profiles").filter((row) => row.record_id === profileId),
    `Expected one active default Profile for ${input.email}.`,
  );
  if (
    account.user_id !== input.userId ||
    !isObject(account.payload) || account.payload.id !== input.userId ||
    profile.user_id !== input.userId ||
    !isObject(profile.payload) ||
    profile.payload.id !== profileId ||
    profile.payload.accountId !== input.userId ||
    profile.payload.displayName !== input.displayName
  ) {
    throw new Error(`Organizer account/profile chain is malformed for ${input.email}.`);
  }
}

function expectedXiaoyuMembership(user: OrbitRecordRow): Record<string, unknown> {
  const payload = user.payload as Record<string, unknown>;
  const email = text(payload.email);
  const displayName = text(payload.displayName);
  if (!email || displayName !== "agenthubs") {
    throw new Error("Expected the reviewed agenthubs Xiaoyu auth identity.");
  }
  return {
    collection_name: "profiles",
    created_at: REVIEW_TIMESTAMP,
    deleted_at: null,
    evidence_ids: [XIAOYU_AUTH_MEMBERSHIP_EVIDENCE_ID],
    lifecycle_state: "active",
    occurred_at: REVIEW_TIMESTAMP,
    payload: {
      accountId: XIAOYU_ACTOR_ID,
      createdAt: REVIEW_TIMESTAMP,
      displayName,
      id: XIAOYU_AUTH_USER_ID,
      timezone: "Asia/Tokyo",
      updatedAt: REVIEW_TIMESTAMP,
    },
    provider: "event-organizer-account-bootstrap",
    provider_record_id: XIAOYU_AUTH_USER_ID,
    record_id: `profile:auth-membership:${XIAOYU_AUTH_USER_ID}`,
    search_text: `${displayName} ${email}`,
    source_id: `auth-membership:${XIAOYU_AUTH_USER_ID}`,
    source_label: "Reviewed Xiaoyu auth membership",
    source_type: "manual",
    target_id: null,
    target_type: null,
    updated_at: REVIEW_TIMESTAMP,
    user_id: XIAOYU_ACTOR_ID,
    workspace_id: user.workspace_id,
  };
}

function sameRecord(
  actual: OrbitRecordRow,
  expected: Record<string, unknown>,
): boolean {
  const normalized = {
    ...actual,
    created_at: timestamp(actual.created_at),
    deleted_at: timestamp(actual.deleted_at),
    occurred_at: timestamp(actual.occurred_at),
    updated_at: timestamp(actual.updated_at),
  };
  return canonicalJson(normalized) === canonicalJson(expected);
}

function assertXiaoyuIdentity(rows: readonly OrbitRecordRow[], xiaoyuActorId: string): void {
  if (xiaoyuActorId !== XIAOYU_ACTOR_ID) {
    throw new Error("Use the reviewed Xiaoyu actor ID.");
  }
  const user = exactlyOne(
    activeRecords(rows, "auth_users").filter((row) => isObject(row.payload) && row.payload.id === XIAOYU_AUTH_USER_ID),
    "Expected one active Google agenthubs Xiaoyu auth identity.",
  );
  if (
    !isObject(user.payload) ||
    user.record_id !== authUserRecordId(String(user.payload.email ?? "")) ||
    user.user_id !== XIAOYU_AUTH_USER_ID ||
    user.payload.id !== XIAOYU_AUTH_USER_ID ||
    user.payload.displayName !== "agenthubs" ||
    user.payload.provider !== "google" ||
    !normalizedEmail(user.payload.email) ||
    !validPayloadTimestamp(user.payload.createdAt) ||
    !validPayloadTimestamp(user.payload.updatedAt)
  ) {
    throw new Error("Expected one noncanonical Xiaoyu auth user.");
  }
  const account = exactlyOne(
    activeRecords(rows, "accounts").filter((row) => row.record_id === XIAOYU_ACTOR_ID),
    "Xiaoyu canonical Account is incomplete or conflicting.",
  );
  const profile = exactlyOne(
    activeRecords(rows, "profiles").filter((row) => row.record_id === XIAOYU_PUBLIC_PROFILE_ID),
    "Xiaoyu canonical Profile is incomplete or conflicting.",
  );
  if (
    account.user_id !== XIAOYU_ACTOR_ID || !isObject(account.payload) || account.payload.id !== XIAOYU_ACTOR_ID ||
    profile.user_id !== XIAOYU_ACTOR_ID || !isObject(profile.payload) ||
    profile.payload.id !== XIAOYU_PUBLIC_PROFILE_ID || profile.payload.accountId !== XIAOYU_ACTOR_ID
  ) {
    throw new Error("Xiaoyu canonical account/profile chain is incomplete or conflicting.");
  }
  const membership = exactlyOne(
    rows.filter((row) => row.collection_name === "profiles" && row.record_id === `profile:auth-membership:${XIAOYU_AUTH_USER_ID}`),
    "Xiaoyu auth membership is incomplete or conflicting.",
  );
  if (!sameRecord(membership, expectedXiaoyuMembership(user))) {
    throw new Error("Xiaoyu auth membership is incomplete or conflicting.");
  }
  if (activeRecords(rows, "profiles").some((row) => row.record_id !== membership.record_id && isObject(row.payload) && row.payload.id === XIAOYU_AUTH_USER_ID)) {
    throw new Error("Xiaoyu auth membership is ambiguous.");
  }
}

function resolveOrganizerAccounts(rows: readonly OrbitRecordRow[]): ReadonlyMap<string, string> {
  const accounts = new Map<string, string>();
  const authUsers = activeRecords(rows, "auth_users");
  for (const organizer of EVENT_ORGANIZER_ACCOUNT_MANIFEST) {
    const organizerEmail = normalizedEmail(organizer.email)!;
    const user = exactlyOne(
      authUsers.filter((row) => isObject(row.payload) && normalizedEmail(row.payload.email) === organizerEmail),
      `Expected one active auth user for ${organizer.email}.`,
    );
    if (!isObject(user.payload)) {
      throw new Error(`Organizer has a noncanonical auth user for ${organizer.email}.`);
    }
    const userId = text(user.payload.id);
    if (
      !userId ||
      user.record_id !== authUserRecordId(organizerEmail) ||
      user.user_id !== userId ||
      normalizedEmail(user.payload.email) !== organizerEmail ||
      user.payload.provider !== "credentials" ||
      user.payload.displayName !== organizer.displayName ||
      !validPayloadTimestamp(user.payload.createdAt) ||
      !validPayloadTimestamp(user.payload.updatedAt)
    ) {
      throw new Error(`Organizer has a noncanonical auth user for ${organizer.email}.`);
    }
    assertOrganizerChain(rows, { displayName: organizer.displayName, email: organizer.email, userId });
    accounts.set(organizer.key, userId);
  }
  if (accounts.size !== 13) throw new Error("Expected exactly 13 reviewed organizer accounts.");
  return accounts;
}

async function readIdentityRows(
  client: EventOrganizerOwnerSqlClient,
  workspaceId: string,
  lock: boolean,
): Promise<readonly OrbitRecordRow[]> {
  const result = await client.query<OrbitRecordRow>(
    `select * from orbit_records
     where workspace_id = $1
       and collection_name in ('auth_users', 'accounts', 'profiles')${lock ? " for update" : ""}`,
    [workspaceId],
  );
  return result.rows;
}

async function readReviewedEvents(
  client: EventOrganizerOwnerSqlClient,
  workspaceId: string,
  eventIds: readonly string[],
  lock: boolean,
): Promise<readonly OrbitRecordRow[]> {
  const result = await client.query<OrbitRecordRow>(
    `select * from orbit_records
     where workspace_id = $1
       and collection_name = 'events'
       and record_id = any($2::text[])
     order by record_id${lock ? " for update" : ""}`,
    [workspaceId, eventIds],
  );
  return result.rows;
}

function assertReviewedEventSources(
  rows: readonly OrbitRecordRow[],
  expected: readonly EventOrganizerOwnerAssignment[],
): void {
  const expectedIds = new Set(expected.map((item) => item.eventId));
  if (rows.length !== 16 || new Set(rows.map((row) => row.record_id)).size !== 16) {
    throw new Error("Expected exactly the 16 reviewed legacy event records.");
  }
  for (const row of rows) {
    const target = expected.find((item) => item.eventId === row.record_id);
    if (
      !target || !expectedIds.has(row.record_id) || row.collection_name !== "events" ||
      row.lifecycle_state !== "active" || !isObject(row.payload) || !text(row.source_id) || !text(row.source_type) ||
      (row.user_id !== null && row.user_id !== target.accountId)
    ) {
      throw new Error(`Reviewed legacy event ${row.record_id} is missing, malformed, or has drifted ownership.`);
    }
  }
}

function assertFinalReviewedEventOwners(
  rows: readonly OrbitRecordRow[],
  expected: readonly EventOrganizerOwnerAssignment[],
): void {
  assertReviewedEventSources(rows, expected);
  for (const row of rows) {
    const target = expected.find((item) => item.eventId === row.record_id);
    if (!target || row.user_id !== target.accountId) {
      throw new Error(`Reviewed legacy event ${row.record_id} did not receive its reviewed owner.`);
    }
  }
}

function assertExactUpdatedPairs(
  rows: readonly { record_id: string; user_id: string | null }[],
  expected: readonly EventOrganizerOwnerAssignment[],
): void {
  if (rows.length !== 16 || new Set(rows.map((row) => row.record_id)).size !== 16) {
    throw new Error("Migration must update exactly the 16 reviewed event owners.");
  }
  const targets = new Map(expected.map((item) => [item.eventId, item.accountId]));
  if (targets.size !== 16 || rows.some((row) => targets.get(row.record_id) !== row.user_id)) {
    throw new Error("Migration must update exactly the 16 reviewed event owners.");
  }
}

async function buildPlan(
  input: { client: EventOrganizerOwnerSqlClient; lockRows: boolean; workspaceId: string; xiaoyuActorId: string },
): Promise<EventOrganizerOwnerPlan> {
  const definitions = expectedAssignmentDefinitions();
  const identities = await readIdentityRows(input.client, input.workspaceId, input.lockRows);
  assertXiaoyuIdentity(identities, input.xiaoyuActorId);
  const organizerAccounts = resolveOrganizerAccounts(identities);
  const assignments = definitions.map((assignment) => ({
    accountId: assignment.organizerKey === "xiaoyu" ? XIAOYU_ACTOR_ID : organizerAccounts.get(assignment.organizerKey),
    eventId: assignment.eventId,
  }));
  if (assignments.some((assignment) => !assignment.accountId)) {
    throw new Error("Reviewed organizer assignment has no active account.");
  }
  const canonicalAssignments = assignments as EventOrganizerOwnerAssignment[];
  const events = await readReviewedEvents(
    input.client,
    input.workspaceId,
    canonicalAssignments.map((assignment) => assignment.eventId),
    input.lockRows,
  );
  assertReviewedEventSources(events, canonicalAssignments);
  const reviewedSourceHash = sourceHash(events);
  return {
    assignments: canonicalAssignments,
    count: 16,
    hash: planHash(canonicalAssignments, reviewedSourceHash),
    manifestVersion: EVENT_ORGANIZER_OWNER_MANIFEST_VERSION,
    sourceHash: reviewedSourceHash,
  };
}

function samePlan(left: EventOrganizerOwnerPlan, right: EventOrganizerOwnerPlan): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function auditValues(workspaceId: string, plan: EventOrganizerOwnerPlan): readonly unknown[] {
  return [
    workspaceId,
    AUDIT_COLLECTION,
    AUDIT_RECORD_ID,
    XIAOYU_ACTOR_ID,
    "manual",
    AUDIT_RECORD_ID,
    EVENT_ORGANIZER_OWNER_MANIFEST_VERSION,
    [],
    "active",
    "",
    auditPayload(plan),
    REVIEW_TIMESTAMP,
    REVIEW_TIMESTAMP,
  ];
}

function sameAudit(row: OrbitRecordRow, workspaceId: string, plan: EventOrganizerOwnerPlan): boolean {
  const expected = {
    collection_name: AUDIT_COLLECTION,
    created_at: REVIEW_TIMESTAMP,
    deleted_at: null,
    evidence_ids: [],
    lifecycle_state: "active",
    occurred_at: null,
    payload: auditPayload(plan),
    provider: EVENT_ORGANIZER_OWNER_MANIFEST_VERSION,
    provider_record_id: null,
    record_id: AUDIT_RECORD_ID,
    search_text: "",
    source_id: AUDIT_RECORD_ID,
    source_label: null,
    source_type: "manual",
    target_id: null,
    target_type: null,
    updated_at: REVIEW_TIMESTAMP,
    user_id: XIAOYU_ACTOR_ID,
    workspace_id: workspaceId,
  };
  return sameRecord(row, expected);
}

async function writeOrVerifyAudit(
  client: EventOrganizerOwnerSqlClient,
  workspaceId: string,
  plan: EventOrganizerOwnerPlan,
): Promise<void> {
  await client.query(
    `insert into orbit_records (
       workspace_id, collection_name, record_id, user_id, source_type, source_id,
       provider, evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
     on conflict (workspace_id, collection_name, record_id) do nothing`,
    auditValues(workspaceId, plan),
  );
  const result = await client.query<OrbitRecordRow>(
    `select * from orbit_records
     where workspace_id = $1 and collection_name = $2 and record_id = $3
     for update`,
    [workspaceId, AUDIT_COLLECTION, AUDIT_RECORD_ID],
  );
  const audit = exactlyOne(result.rows, "Organizer owner migration audit is missing or ambiguous.");
  if (!sameAudit(audit, workspaceId, plan)) {
    throw new Error("Organizer owner migration audit conflicts with the reviewed plan.");
  }
}

export async function buildEventOrganizerOwnerPlan(input: {
  client: EventOrganizerOwnerSqlClient;
  workspaceId: string;
  xiaoyuActorId: string;
}): Promise<EventOrganizerOwnerPlan> {
  return buildPlan({ ...input, lockRows: false });
}

export async function applyEventOrganizerOwnerPlan(input: {
  client: EventOrganizerOwnerSqlClient;
  expectedCount: number;
  expectedPlanHash: string;
  plan: EventOrganizerOwnerPlan;
  workspaceId: string;
  xiaoyuActorId: string;
}): Promise<EventOrganizerOwnerVerification> {
  if (input.expectedCount !== 16 || !/^[a-f0-9]{64}$/u.test(input.expectedPlanHash)) {
    throw new Error("Reviewed owner migration apply requires count 16 and a lowercase SHA-256 plan hash.");
  }
  await input.client.query("BEGIN");
  try {
    const lockedPlan = await buildPlan({
      client: input.client,
      lockRows: true,
      workspaceId: input.workspaceId,
      xiaoyuActorId: input.xiaoyuActorId,
    });
    if (
      input.expectedPlanHash !== lockedPlan.hash ||
      input.plan.hash !== lockedPlan.hash ||
      !samePlan(input.plan, lockedPlan)
    ) {
      throw new Error("Reviewed owner migration plan changed since review.");
    }
    const values: unknown[] = [input.workspaceId];
    const rows = lockedPlan.assignments.map((assignment, index) => {
      const eventIndex = index * 2 + 2;
      const accountIndex = eventIndex + 1;
      values.push(assignment.eventId, assignment.accountId);
      return `($${eventIndex}, $${accountIndex})`;
    });
    const updated = await input.client.query<{ record_id: string; user_id: string | null }>(
      `update orbit_records as events
       set user_id = assignments.account_id
       from (values ${rows.join(", ")}) as assignments(event_id, account_id)
       where events.workspace_id = $1
         and events.collection_name = 'events'
         and events.record_id = assignments.event_id
       returning events.record_id, events.user_id`,
      values,
    );
    assertExactUpdatedPairs(updated.rows, lockedPlan.assignments);
    const finalRows = await readReviewedEvents(
      input.client,
      input.workspaceId,
      lockedPlan.assignments.map((assignment) => assignment.eventId),
      true,
    );
    assertFinalReviewedEventOwners(finalRows, lockedPlan.assignments);
    await writeOrVerifyAudit(input.client, input.workspaceId, lockedPlan);
    await input.client.query("COMMIT");
    return {
      count: 16,
      hash: lockedPlan.hash,
      manifestVersion: EVENT_ORGANIZER_OWNER_MANIFEST_VERSION,
    };
  } catch (error) {
    await input.client.query("ROLLBACK");
    throw error;
  }
}
