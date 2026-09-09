import { createHash } from "node:crypto";
import { isConnectionStage, type ConnectionStage } from "../../../shared/domain/source-types";
import type { LiveRecord } from "../../../shared/storage/live-record-store";
import { assessRelationshipLifecycleMigration, type LifecyclePreflightReport } from "./migration-preflight";
import { normalizeRelationshipLifecycleInstant } from "./transition";

const collections = ["contacts", "connections", "tasks", "contact_detail_states"] as const;
export type LifecycleMigrationCollection = typeof collections[number];
export interface LifecycleMigrationManifest {
  schemaVersion: 1;
  actorId: string;
  workspaceId: string;
  ownerRepairs: readonly { collectionName: LifecycleMigrationCollection; recordId: string; evidenceId: string }[];
}
export interface LifecycleMigrationChange {
  collectionName: LifecycleMigrationCollection;
  recordId: string;
  beforeHash: string;
  afterHash: string;
  owner?: string;
  payload: { version?: number; stage?: ConnectionStage; dueAt?: string };
}
export interface LifecycleMigrationIssue { code: string; collectionName: string; recordId: string }
export interface LifecycleMigrationPlan {
  migrationId: "relationship-lifecycle-v1";
  schemaVersion: 1;
  actorId: string;
  workspaceId: string;
  sourceHash: string;
  manifestHash: string;
  planHash: string;
  applyEligible: boolean;
  changes: readonly LifecycleMigrationChange[];
  issues: readonly LifecycleMigrationIssue[];
  before: LifecyclePreflightReport;
  after: LifecyclePreflightReport;
  databaseWriteExecuted: false;
}

export class LifecycleMigrationError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "INVALID_MANIFEST" | "CONFLICT" | "INVALID_REVIEW" | "REVIEW_REQUIRED" | "INVALID_RECEIPT" | "INCONSISTENT_STATE") {
    super(`Relationship lifecycle migration failed: ${code}.`);
    this.name = "LifecycleMigrationError";
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function identity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}
function lexical(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function key(row: { collectionName: string; recordId: string }): string { return JSON.stringify([row.collectionName, row.recordId]); }
function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every(k => Object.hasOwn(value, k)) && Reflect.ownKeys(value).every(k => typeof k === "string" && [...required, ...optional].includes(k));
}

// Accept JSON data only: getters, toJSON hooks, sparse arrays and cycles must not
// change the meaning of a reviewed hash or run code while inspecting a snapshot.
function jsonValue(value: unknown, seen = new Set<object>(), allowUndefined = true): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || seen.has(value)) throw new LifecycleMigrationError("INVALID_INPUT");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1) throw new LifecycleMigrationError("INVALID_INPUT");
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor)) throw new LifecycleMigrationError("INVALID_INPUT");
        return jsonValue(descriptor.value, seen, allowUndefined);
      });
    }
    if (!object(value)) throw new LifecycleMigrationError("INVALID_INPUT");
    return Object.fromEntries(Reflect.ownKeys(value).sort((a, b) => lexical(String(a), String(b))).flatMap(k => {
      const descriptor = Object.getOwnPropertyDescriptor(value, k);
      if (typeof k !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new LifecycleMigrationError("INVALID_INPUT");
      return descriptor.value === undefined && allowUndefined ? [] : [[k, jsonValue(descriptor.value, seen, allowUndefined)]];
    }));
  } finally { seen.delete(value); }
}

export function lifecycleMigrationHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(jsonValue(value))).digest("hex");
}

export function parseLifecycleMigrationManifest(input: unknown): LifecycleMigrationManifest {
  try {
    const value = jsonValue(input, new Set(), false);
    if (!object(value) || !exactKeys(value, ["schemaVersion", "actorId", "workspaceId", "ownerRepairs"]) || value.schemaVersion !== 1 || !identity(value.actorId) || !identity(value.workspaceId) || !Array.isArray(value.ownerRepairs)) throw 0;
    const ownerRepairs = value.ownerRepairs.map(item => {
      if (!object(item) || !exactKeys(item, ["collectionName", "recordId", "evidenceId"]) || !collections.includes(item.collectionName as LifecycleMigrationCollection) || !identity(item.recordId) || !identity(item.evidenceId)) throw 0;
      return { collectionName: item.collectionName as LifecycleMigrationCollection, recordId: item.recordId, evidenceId: item.evidenceId };
    }).sort((a, b) => lexical(key(a), key(b)));
    if (new Set(ownerRepairs.map(key)).size !== ownerRepairs.length) throw 0;
    return { schemaVersion: 1, actorId: value.actorId, workspaceId: value.workspaceId, ownerRepairs };
  } catch { throw new LifecycleMigrationError("INVALID_MANIFEST"); }
}

function normalizedRecord(input: LiveRecord): LiveRecord {
  const row = jsonValue(input);
  if (!object(row) || !["workspaceId", "collectionName", "recordId", "sourceType", "sourceId", "createdAt", "updatedAt"].every(k => identity(row[k])) || !Object.hasOwn(row, "payload") || (row.userId != null && typeof row.userId !== "string") || typeof row.lifecycleState !== "string" || !["active", "archived", "deleted"].includes(row.lifecycleState) || !Array.isArray(row.evidenceIds) || !row.evidenceIds.every(id => typeof id === "string")) throw new LifecycleMigrationError("INVALID_INPUT");
  return { ...row, userId: row.userId ?? null, sourceLabel: row.sourceLabel ?? null, provider: row.provider ?? null, providerRecordId: row.providerRecordId ?? null, targetType: row.targetType ?? null, targetId: row.targetId ?? null, occurredAt: row.occurredAt ?? null, deletedAt: row.deletedAt ?? null, searchText: row.searchText ?? null } as unknown as LiveRecord;
}

export function lifecycleMigrationRecordHash(record: LiveRecord): string {
  return lifecycleMigrationHash(normalizedRecord(record));
}

function validVersion(payload: Record<string, unknown>): boolean {
  return payload.version === undefined || (typeof payload.version === "number" && Number.isSafeInteger(payload.version) && payload.version > 0);
}

export function planRelationshipLifecycleMigration(input: { manifest: LifecycleMigrationManifest; records: readonly LiveRecord[] }): LifecycleMigrationPlan {
  const manifest = parseLifecycleMigrationManifest(input.manifest);
  const { actorId, workspaceId } = manifest;
  if (!Array.isArray(input.records)) throw new LifecycleMigrationError("INVALID_INPUT");
  const rows = input.records.map(normalizedRecord);
  const source = rows.filter(row => row.workspaceId === workspaceId && collections.includes(row.collectionName as LifecycleMigrationCollection));
  const sourceHash = lifecycleMigrationHash(source.map(row => ({ key: key(row), hash: lifecycleMigrationRecordHash(row) })).sort((a, b) => lexical(a.key, b.key) || lexical(a.hash, b.hash)));
  const manifestHash = lifecycleMigrationHash(manifest);
  const before = assessRelationshipLifecycleMigration({ actorId, workspaceId, records: rows });
  const projected = structuredClone(rows);
  const visible = projected.filter(row => row.workspaceId === workspaceId && row.lifecycleState !== "deleted");
  const physical = new Map<string, LiveRecord[]>();
  for (const row of projected.filter(row => row.workspaceId === workspaceId && collections.includes(row.collectionName as LifecycleMigrationCollection))) physical.set(key(row), [...(physical.get(key(row)) ?? []), row]);
  // Establish scope before any owner changes. Evidence permits an empty-owner
  // repair inside this graph, not adoption of unrelated private records.
  const claimedConnections = visible.filter(row => row.collectionName === "connections" && (row.userId === actorId || (object(row.payload) && row.payload.accountId === actorId)));
  const claimedConnectionIds = new Set(claimedConnections.map(row => row.recordId));
  const claimedContactIds = new Set([
    ...visible.filter(row => row.collectionName === "contacts" && row.userId === actorId).map(row => row.recordId),
    ...claimedConnections.flatMap(row => object(row.payload) && identity(row.payload.contactId) ? [row.payload.contactId] : []),
  ]);
  for (const repair of manifest.ownerRepairs) {
    const matches = source.filter(row => key(row) === key(repair));
    if (matches.length !== 1 || matches[0].lifecycleState === "deleted" || (matches[0].userId != null && matches[0].userId !== "")) throw new LifecycleMigrationError("INVALID_MANIFEST");
    const target = matches[0]; const payload = target.payload;
    const scoped = object(payload) && (
      (repair.collectionName === "contacts" && claimedContactIds.has(target.recordId)) ||
      (repair.collectionName === "connections" && payload.accountId === actorId) ||
      (repair.collectionName === "tasks" && typeof payload.connectionId === "string" && claimedConnectionIds.has(payload.connectionId)) ||
      (repair.collectionName === "contact_detail_states" && payload.actorId === actorId && typeof payload.contactId === "string" && claimedContactIds.has(payload.contactId))
    );
    if (!scoped) throw new LifecycleMigrationError("INVALID_MANIFEST");
    physical.get(key(repair))![0].userId = actorId;
  }
  const issues: LifecycleMigrationIssue[] = [];
  const add = (row: LiveRecord, code: string) => { issues.push({ collectionName: row.collectionName, recordId: row.recordId, code }); };
  for (const duplicates of physical.values()) if (duplicates.length > 1) add(duplicates[0], "INVALID_RECORD");
  const connections = visible.filter(row => row.collectionName === "connections" && (row.userId === actorId || (object(row.payload) && row.payload.accountId === actorId)));
  const connectionIds = new Set(connections.map(row => row.recordId));
  const contactIds = new Set(connections.flatMap(row => object(row.payload) && typeof row.payload.contactId === "string" ? [row.payload.contactId] : []));
  const contacts = visible.filter(row => row.collectionName === "contacts" && (row.userId === actorId || contactIds.has(row.recordId)));
  const tasks = visible.filter(row => row.collectionName === "tasks" && (object(row.payload) ? (row.userId === actorId && (row.payload.connectionId !== undefined || row.payload.relationshipPurpose !== undefined)) || connectionIds.has(String(row.payload.connectionId)) : row.userId === actorId));
  const valid = (row: LiveRecord) => row.userId === actorId && object(row.payload) && row.payload.id === row.recordId && physical.get(key(row))?.length === 1 && validVersion(row.payload);
  for (const row of [...contacts, ...connections, ...tasks]) {
    if (!valid(row)) continue;
    if (row.payload.version === undefined) row.payload.version = 1;
    if (row.collectionName === "tasks" && row.payload.dueAt !== undefined) {
      try {
        if (typeof row.payload.title !== "string" || !row.payload.title.trim() || typeof row.payload.status !== "string" || !["open", "scheduled", "completed", "dismissed"].includes(row.payload.status)) throw 0;
        normalizeRelationshipLifecycleInstant(row.payload.createdAt, "INVALID_TASK");
        normalizeRelationshipLifecycleInstant(row.payload.updatedAt, "INVALID_TASK");
        row.payload.dueAt = normalizeRelationshipLifecycleInstant(row.payload.dueAt, "INVALID_TASK");
      }
      catch { add(row, "INVALID_TASK"); }
    }
  }
  // Ownership is a gate even when Connection already supplies the stage. Only
  // legacy stage/date interpretation may be bypassed by canonical authority.
  const validContactIds = new Set(contacts.filter(valid).map(row => row.recordId));
  for (const row of visible.filter(row => row.collectionName === "contact_detail_states" && (row.userId === actorId || (object(row.payload) && (row.payload.actorId === actorId || claimedContactIds.has(String(row.payload.contactId))))))) {
    if (!object(row.payload)) { add(row, "INVALID_RECORD"); continue; }
    if (row.userId !== actorId || row.payload.actorId !== actorId) { add(row, row.userId == null || row.userId === "" ? "MISSING_OWNER" : "OWNER_CONFLICT"); continue; }
    if (typeof row.payload.contactId !== "string" || !validContactIds.has(row.payload.contactId)) add(row, "INVALID_REFERENCE");
  }
  for (const connection of connections) {
    if (!valid(connection) || connection.payload.accountId !== actorId || isConnectionStage(connection.payload.stage)) continue;
    const contact = contacts.find(row => row.recordId === connection.payload.contactId && valid(row));
    if (!contact) continue;
    const relevant = visible.filter(row => row.collectionName === "contact_detail_states" && object(row.payload) && row.payload.contactId === contact.recordId);
    let invalid = false;
    let contactTime: number;
    try { contactTime = Date.parse(normalizeRelationshipLifecycleInstant(contact.payload.updatedAt, "INVALID_TRANSITION")); }
    catch { add(contact, "INVALID_RECORD"); continue; }
    const candidates: { row: LiveRecord; time: number; stage: ConnectionStage }[] = [];
    for (const row of relevant) {
      if (row.userId !== actorId || row.payload.actorId !== actorId) { add(row, row.userId == null || row.userId === "" ? "MISSING_OWNER" : "OWNER_CONFLICT"); invalid = true; continue; }
      if (physical.get(key(row))?.length !== 1) { add(row, "INVALID_RECORD"); invalid = true; continue; }
      if (!isConnectionStage(row.payload.status)) { add(row, "UNKNOWN_STAGE"); invalid = true; continue; }
      try {
        const time = Date.parse(normalizeRelationshipLifecycleInstant(row.payload.updatedAt, "INVALID_TRANSITION"));
        if (time > contactTime) candidates.push({ row, time, stage: row.payload.status });
      } catch { add(row, "INVALID_RECORD"); invalid = true; }
    }
    if (invalid) continue;
    candidates.sort((a, b) => b.time - a.time || lexical(a.row.recordId, b.row.recordId));
    const latest = candidates[0];
    if (latest && candidates.some(candidate => candidate.time === latest.time && candidate.stage !== latest.stage)) { add(connection, "AMBIGUOUS_STAGE"); continue; }
    if (latest) connection.payload.stage = latest.stage;
    else if (isConnectionStage(contact.payload.stage)) connection.payload.stage = contact.payload.stage;
    else add(connection, ["captured", "reviewing"].includes(String(contact.payload.stage)) || ["captured", "reviewing"].includes(String(connection.payload.stage)) ? "ACQUISITION_REVIEW" : "UNKNOWN_STAGE");
  }
  const after = assessRelationshipLifecycleMigration({ actorId, workspaceId, records: projected });
  const combined = [...new Map([...issues, ...after.issues].map(issue => [JSON.stringify([issue.collectionName, issue.recordId, issue.code]), issue])).values()].sort((a, b) => lexical(a.collectionName, b.collectionName) || lexical(a.recordId, b.recordId) || lexical(a.code, b.code));
  const changes: LifecycleMigrationChange[] = [];
  for (let index = 0; index < rows.length; index++) {
    const original = rows[index]; const next = projected[index];
    const beforeHash = lifecycleMigrationRecordHash(original); const afterHash = lifecycleMigrationRecordHash(next);
    if (beforeHash === afterHash) continue;
    const payload: LifecycleMigrationChange["payload"] = {};
    if (object(original.payload) && object(next.payload)) {
      if (next.payload.version !== original.payload.version) payload.version = next.payload.version as number;
      if (next.payload.stage !== original.payload.stage) payload.stage = next.payload.stage as ConnectionStage;
      if (next.payload.dueAt !== original.payload.dueAt) payload.dueAt = next.payload.dueAt as string;
    }
    changes.push({ collectionName: next.collectionName as LifecycleMigrationCollection, recordId: next.recordId, beforeHash, afterHash, payload, ...(next.userId !== original.userId ? { owner: actorId } : {}) });
  }
  changes.sort((a, b) => lexical(a.collectionName, b.collectionName) || lexical(a.recordId, b.recordId));
  const fields = { migrationId: "relationship-lifecycle-v1" as const, schemaVersion: 1 as const, actorId, workspaceId, sourceHash, manifestHash, applyEligible: combined.length === 0, changes, issues: combined, before, after, databaseWriteExecuted: false as const };
  return { ...fields, planHash: lifecycleMigrationHash(fields) };
}

export function applyLifecycleMigrationChanges(records: readonly LiveRecord[], changes: readonly LifecycleMigrationChange[]): LiveRecord[] {
  if (!Array.isArray(records) || !Array.isArray(changes)) throw new LifecycleMigrationError("INVALID_INPUT");
  jsonValue(records);
  const output = structuredClone(records) as LiveRecord[];
  const indexed = new Map<string, { row: LiveRecord; hash: string }[]>();
  for (const row of output) indexed.set(key(row), [...(indexed.get(key(row)) ?? []), { row, hash: lifecycleMigrationRecordHash(row) }]);
  const seen = new Set<string>();
  for (const input of changes) {
    const change = jsonValue(input, new Set(), false);
    if (!object(change) || !exactKeys(change, ["collectionName", "recordId", "beforeHash", "afterHash", "payload"], ["owner"]) || !collections.includes(change.collectionName as LifecycleMigrationCollection) || !identity(change.recordId) || typeof change.beforeHash !== "string" || !/^[a-f0-9]{64}$/u.test(change.beforeHash) || typeof change.afterHash !== "string" || !/^[a-f0-9]{64}$/u.test(change.afterHash) || !object(change.payload) || !exactKeys(change.payload, [], ["version", "stage", "dueAt"])) throw new LifecycleMigrationError("INVALID_INPUT");
    const typed = change as unknown as LifecycleMigrationChange;
    const id = key(typed);
    if (seen.has(id)) throw new LifecycleMigrationError("CONFLICT");
    seen.add(id);
    const matches = (indexed.get(id) ?? []).filter(item => item.hash === typed.beforeHash);
    if (matches.length !== 1) throw new LifecycleMigrationError("CONFLICT");
    const row = matches[0].row;
    if (row.lifecycleState === "deleted" || !object(row.payload)) throw new LifecycleMigrationError("CONFLICT");
    if (typed.owner !== undefined) {
      if (!identity(typed.owner) || (row.userId != null && row.userId !== "")) throw new LifecycleMigrationError("CONFLICT");
      row.userId = typed.owner;
    }
    if (typed.payload.version !== undefined && (typed.payload.version !== 1 || row.payload.version !== undefined || row.collectionName === "contact_detail_states")) throw new LifecycleMigrationError("CONFLICT");
    if (typed.payload.stage !== undefined && (row.collectionName !== "connections" || !isConnectionStage(typed.payload.stage) || isConnectionStage(row.payload.stage))) throw new LifecycleMigrationError("CONFLICT");
    if (typed.payload.dueAt !== undefined) {
      try { if (row.collectionName !== "tasks" || normalizeRelationshipLifecycleInstant(row.payload.dueAt, "INVALID_TASK") !== typed.payload.dueAt) throw 0; }
      catch { throw new LifecycleMigrationError("CONFLICT"); }
    }
    row.payload = { ...row.payload, ...typed.payload };
    if (lifecycleMigrationRecordHash(row) !== typed.afterHash) throw new LifecycleMigrationError("CONFLICT");
  }
  return output;
}
