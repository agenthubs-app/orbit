import type { IndustryIdCode } from "../contract/industries";
import type { SourceReferenceContract } from "../contract/source";
import { isIndustryIdCode } from "../domain/industries";
import {
  isRelationshipStage,
  isRelationshipTrustLevel,
  isRelationshipValueType,
  isSourceType,
  type RELATIONSHIP_STAGE_VALUES,
  type RELATIONSHIP_TRUST_LEVEL_VALUES,
  type RELATIONSHIP_VALUE_TYPES,
} from "./relationship-values";
import { compareText, isoTimestamp } from "./compute-text";

/**
 * Sprint 0117 (dashboard D3): the relationship graph every dashboard
 * computation reads — one actor's contacts, connections, events, sources,
 * tasks and contact detail states — and the mapping from stored records to it.
 * Moved from features/dashboard/storage/dashboard-live-record-provider.ts so
 * the server (graph read, snapshot recompute) and the App (its device copy of
 * the sync domain "dashboard-graph") build the graph with the same code.
 */

type RelationshipStage = (typeof RELATIONSHIP_STAGE_VALUES)[number];
type RelationshipValueType = (typeof RELATIONSHIP_VALUE_TYPES)[number];
type RelationshipTrustLevel = (typeof RELATIONSHIP_TRUST_LEVEL_VALUES)[number];
type EvidenceIdList = readonly [string, ...string[]];

export interface DashboardGraphContact {
  id: string;
  personId?: string | undefined;
  displayName: string;
  organization?: string | undefined;
  role?: string | undefined;
  location?: string | undefined;
  primaryEmail?: string | undefined;
  primaryPhone?: string | undefined;
  profileSnippet?: string | undefined;
  primaryIndustryId?: IndustryIdCode | undefined;
  customTags?: readonly string[] | undefined;
  stage: RelationshipStage;
  source: SourceReferenceContract;
  evidenceIds: EvidenceIdList;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardGraphConnection {
  id: string;
  accountId: string;
  contactId: string;
  stage: RelationshipStage;
  valueTypes: readonly RelationshipValueType[];
  summary: string;
  relationshipStrength?: number | undefined;
  trustLevel?: RelationshipTrustLevel | undefined;
  businessRelevanceScore?: number | undefined;
  sharedTopics?: readonly string[] | undefined;
  suggestedActions?: readonly string[] | undefined;
  source: SourceReferenceContract;
  evidenceIds: EvidenceIdList;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardGraphEvent {
  id: string;
  name: string;
  location?: string | undefined;
  startsAt: string;
  endsAt?: string | undefined;
  source: SourceReferenceContract;
  evidenceIds: EvidenceIdList;
}

export interface DashboardGraphEvidence {
  id: string;
  sourceType: SourceReferenceContract["type"];
  sourceId: string;
  summary: string;
  occurredAt: string;
  confidence: number;
  createdBy: string;
}

export interface DashboardGraphTask {
  id: string;
  title: string;
  status: "open" | "scheduled" | "completed" | "dismissed";
  contactId?: string | undefined;
  connectionId?: string | undefined;
  dueAt?: string | undefined;
  source: SourceReferenceContract;
  evidenceIds: EvidenceIdList;
  createdAt: string;
  updatedAt: string;
}

export interface LiveDashboardGraph {
  connections: readonly DashboardGraphConnection[];
  contacts: readonly DashboardGraphContact[];
  events: readonly DashboardGraphEvent[];
  evidence: readonly DashboardGraphEvidence[];
  generatedAt: string;
  tasks: readonly DashboardGraphTask[];
}

export const DASHBOARD_LIVE_RECORD_COLLECTIONS = {
  connections: "connections",
  contacts: "contacts",
  detailStates: "contact_detail_states",
  events: "events",
  evidence: "evidence",
  tasks: "tasks",
} as const;

/** What the graph mapping reads of a stored record (the server passes its LiveRecord). */
export interface DashboardGraphRecord {
  updatedAt: string;
  payload: Record<string, unknown>;
}

export interface DashboardRecordCollections {
  connections: readonly DashboardGraphRecord[];
  contacts: readonly DashboardGraphRecord[];
  detailStates: readonly DashboardGraphRecord[];
  events: readonly DashboardGraphRecord[];
  evidence: readonly DashboardGraphRecord[];
  tasks: readonly DashboardGraphRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => nonEmptyString(item))
    : [];
}

function evidenceIds(value: unknown): EvidenceIdList | null {
  const ids = stringArray(value);

  return ids.length > 0 ? [ids[0]!, ...ids.slice(1)] : null;
}

function sourceReference(value: unknown): SourceReferenceContract | null {
  if (!isRecord(value) || !isSourceType(value.type) || !nonEmptyString(value.id)) {
    return null;
  }

  return {
    type: value.type,
    id: value.id,
    label: optionalString(value.label),
  } as SourceReferenceContract;
}

function contactFromRecord(record: DashboardGraphRecord): DashboardGraphContact | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.displayName) ||
    !isRelationshipStage(payload.stage) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    personId: optionalString(payload.personId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    location: optionalString(payload.location),
    primaryEmail: optionalString(payload.primaryEmail),
    primaryPhone: optionalString(payload.primaryPhone),
    profileSnippet: optionalString(payload.profileSnippet),
    primaryIndustryId: isIndustryIdCode(payload.primaryIndustryId)
      ? payload.primaryIndustryId
      : undefined,
    customTags: stringArray(payload.customTags),
    stage: payload.stage,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function connectionFromRecord(record: DashboardGraphRecord): DashboardGraphConnection | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);
  const valueTypes = stringArray(payload.valueTypes).filter(isRelationshipValueType);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.accountId) ||
    !nonEmptyString(payload.contactId) ||
    !isRelationshipStage(payload.stage) ||
    !nonEmptyString(payload.summary) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    accountId: payload.accountId,
    contactId: payload.contactId,
    stage: payload.stage,
    valueTypes,
    summary: payload.summary,
    relationshipStrength:
      typeof payload.relationshipStrength === "number"
        ? payload.relationshipStrength
        : undefined,
    trustLevel: isRelationshipTrustLevel(payload.trustLevel)
      ? payload.trustLevel
      : undefined,
    businessRelevanceScore:
      typeof payload.businessRelevanceScore === "number"
        ? payload.businessRelevanceScore
        : undefined,
    sharedTopics: stringArray(payload.sharedTopics),
    suggestedActions: stringArray(payload.suggestedActions),
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function eventFromRecord(record: DashboardGraphRecord): DashboardGraphEvent | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.name) ||
    !nonEmptyString(payload.startsAt) ||
    !source ||
    !ids
  ) {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name,
    location: optionalString(payload.location),
    startsAt: payload.startsAt,
    endsAt: optionalString(payload.endsAt),
    source,
    evidenceIds: ids,
  };
}

function evidenceFromRecord(record: DashboardGraphRecord): DashboardGraphEvidence | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !isSourceType(payload.sourceType) ||
    !nonEmptyString(payload.sourceId) ||
    !nonEmptyString(payload.summary) ||
    !nonEmptyString(payload.occurredAt) ||
    typeof payload.confidence !== "number" ||
    !nonEmptyString(payload.createdBy)
  ) {
    return null;
  }

  return {
    id: payload.id,
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    summary: payload.summary,
    occurredAt: payload.occurredAt,
    confidence: payload.confidence,
    createdBy: payload.createdBy,
  };
}

function taskFromRecord(record: DashboardGraphRecord): DashboardGraphTask | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.title) ||
    !(
      payload.status === "open" ||
      payload.status === "scheduled" ||
      payload.status === "completed" ||
      payload.status === "dismissed"
    ) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    title: payload.title,
    status: payload.status,
    contactId: optionalString(payload.contactId),
    connectionId: optionalString(payload.connectionId),
    dueAt: optionalString(payload.dueAt),
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

function latestTimestamp(records: readonly DashboardGraphRecord[]): string {
  return (
    records
      .map((record) => record.updatedAt)
      .filter(nonEmptyString)
      .sort()
      .at(-1) ?? EPOCH_ISO
  );
}

/**
 * Maps the six collections of one actor (or the workspace) to the dashboard
 * graph. The records must be in graph order (per collection:
 * coalesce(occurred_at, updated_at) desc, updated_at desc, record_id).
 */
export function dashboardGraphFromRecords(collections: DashboardRecordCollections): LiveDashboardGraph {
  const {
    contacts: contactRecords,
    connections: connectionRecords,
    detailStates: detailStateRecords,
    events: eventRecords,
    tasks: taskRecords,
    evidence: evidenceRecords,
  } = collections;

  const customTagsByContactId = new Map<string, readonly string[]>();
  for (const record of detailStateRecords) {
    const contactId = optionalString(record.payload.contactId);
    if (contactId) customTagsByContactId.set(contactId, stringArray(record.payload.tags));
  }

  return {
    connections: connectionRecords
      .map(connectionFromRecord)
      .filter((connection): connection is DashboardGraphConnection => connection !== null),
    contacts: contactRecords
      .map(contactFromRecord)
      .filter((contact): contact is DashboardGraphContact => contact !== null)
      .map((contact) => ({
        ...contact,
        customTags: customTagsByContactId.get(contact.id) ?? contact.customTags ?? [],
      })),
    events: eventRecords
      .map(eventFromRecord)
      .filter((event): event is DashboardGraphEvent => event !== null),
    evidence: evidenceRecords
      .map(evidenceFromRecord)
      .filter(
        (evidence): evidence is DashboardGraphEvidence => evidence !== null,
      ),
    generatedAt: latestTimestamp([
      ...contactRecords,
      ...connectionRecords,
      ...detailStateRecords,
      ...eventRecords,
      ...taskRecords,
      ...evidenceRecords,
    ]),
    tasks: taskRecords
      .map(taskFromRecord)
      .filter((task): task is DashboardGraphTask => task !== null),
  };
}

/**
 * One row of the sync domain "dashboard-graph" (features/sync/
 * dashboard-graph-reader.ts): one stored record of the actor's six graph
 * collections. `data` is the projection the server's graph read selects,
 * without the fields no computation reads; a source (evidence) row carries none, because no dashboard
 * computation reads a source's content, only its record time. The two times
 * are the record's columns in UTC with microseconds
 * ("2026-09-28T01:02:03.123456Z"), so the device can order rows exactly as the
 * server's SQL does.
 */
export type DashboardGraphSyncCollection = (typeof DASHBOARD_LIVE_RECORD_COLLECTIONS)[keyof typeof DASHBOARD_LIVE_RECORD_COLLECTIONS];

export interface DashboardGraphSyncRow {
  collection: DashboardGraphSyncCollection;
  recordId: string;
  occurredAt: string | null;
  updatedAt: string;
  data: Record<string, unknown> | null;
}

export const DASHBOARD_GRAPH_SYNC_FIELDS = ["collection", "recordId", "occurredAt", "updatedAt", "data"] as const;

const MICROSECOND_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/;

/**
 * The ISO string the server's Postgres driver gives for the same column
 * (node-postgres: Date.UTC(…, 1000 * parseFloat(".ffffff")), which drops the
 * sub-millisecond part), so record times on the device equal the server's.
 */
export function dashboardRecordTimeIso(microseconds: string): string | null {
  const match = MICROSECOND_UTC.exec(microseconds);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction] = match;
  const time = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), 1000 * parseFloat(`.${fraction}`));
  return isoTimestamp(time);
}

function isSyncCollection(value: unknown): value is DashboardGraphSyncCollection {
  return typeof value === "string" && (Object.values(DASHBOARD_LIVE_RECORD_COLLECTIONS) as readonly string[]).includes(value);
}

/** A device row the graph can use, or null (malformed rows are ignored, never half-built). */
export function dashboardGraphSyncRow(value: unknown): DashboardGraphSyncRow | null {
  if (!isRecord(value)) return null;
  const { collection, recordId, occurredAt, updatedAt, data } = value;
  if (!isSyncCollection(collection) || !nonEmptyString(recordId) || typeof updatedAt !== "string" || !MICROSECOND_UTC.test(updatedAt)) return null;
  if (occurredAt !== null && (typeof occurredAt !== "string" || !MICROSECOND_UTC.test(occurredAt))) return null;
  if (data !== null && (!isRecord(data) || Array.isArray(data))) return null;
  return { collection, recordId, occurredAt: occurredAt as string | null, updatedAt, data: data as Record<string, unknown> | null };
}

/** The server's per-collection row order: coalesce(occurred_at, updated_at) desc, updated_at desc, record_id. */
function compareGraphOrder(left: DashboardGraphSyncRow, right: DashboardGraphSyncRow): number {
  const leftOccurred = left.occurredAt ?? left.updatedAt;
  const rightOccurred = right.occurredAt ?? right.updatedAt;
  if (leftOccurred !== rightOccurred) return leftOccurred < rightOccurred ? 1 : -1;
  if (left.updatedAt !== right.updatedAt) return left.updatedAt < right.updatedAt ? 1 : -1;
  // Ties of both times fall back to the record id. The server orders it by the
  // database's collation; this is code point order (equal on the local and
  // test databases; see the sprint 0117 report for the Linux caveat).
  return left.recordId < right.recordId ? -1 : left.recordId > right.recordId ? 1 : 0;
}

/**
 * The graph from the device's copy of the sync domain "dashboard-graph": the
 * same records, in the same order, as the server's graph read, mapped by the
 * same code.
 */
export function dashboardGraphFromSyncRows(rows: readonly DashboardGraphSyncRow[]): LiveDashboardGraph {
  const byCollection = new Map<DashboardGraphSyncCollection, DashboardGraphSyncRow[]>();
  for (const row of rows) {
    const list = byCollection.get(row.collection) ?? [];
    list.push(row);
    byCollection.set(row.collection, list);
  }
  const records = (collection: DashboardGraphSyncCollection): DashboardGraphRecord[] =>
    [...(byCollection.get(collection) ?? [])]
      .sort(compareGraphOrder)
      .map((row) => ({ updatedAt: dashboardRecordTimeIso(row.updatedAt) ?? "", payload: row.data ?? {} }));
  return dashboardGraphFromRecords({
    connections: records("connections"),
    contacts: records("contacts"),
    detailStates: records("contact_detail_states"),
    events: records("events"),
    evidence: records("evidence"),
    tasks: records("tasks"),
  });
}

/** Trimmed, non-empty contact roles with their counts (the contacts analysis "decision role" tile), in role order. */
export function dashboardContactRoleCounts(graph: LiveDashboardGraph): { role: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const contact of graph.contacts) {
    const role = contact.role?.trim();
    if (role) counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => compareText(left, right)).map(([role, count]) => ({ role, count }));
}
