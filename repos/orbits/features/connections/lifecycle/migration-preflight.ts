import { isConnectionStage } from "../../../shared/domain/source-types";
import type { LiveRecord } from "../../../shared/storage/live-record-store";
import { normalizeRelationshipLifecycleInstant } from "./transition";

export interface LifecyclePreflightIssue {
  code: "INVALID_RECORD" | "MISSING_OWNER" | "OWNER_CONFLICT"
    | "MISSING_CONNECTION" | "MULTIPLE_CONNECTIONS" | "INVALID_REFERENCE"
    | "ACQUISITION_REVIEW" | "UNKNOWN_STAGE" | "MISSING_VERSION"
    | "INVALID_VERSION" | "MISSING_GOAL" | "MISSING_DATED_TASK"
    | "INVALID_TASK" | "NON_CANONICAL_DATE" | "ARCHIVED_OPEN_TASKS";
  collectionName: string;
  recordId: string;
}

export interface LifecyclePreflightReport {
  actorId: string;
  workspaceId: string;
  readyForCutover: boolean;
  counts: { contacts: number; connections: number; relationshipTasks: number; ignored: number };
  issues: LifecyclePreflightIssue[];
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identity(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim() && !value.includes("\0");
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function assessRelationshipLifecycleMigration({ actorId, workspaceId, records }: {
  actorId: string;
  workspaceId: string;
  records: readonly LiveRecord[];
}): LifecyclePreflightReport {
  if (!identity(actorId) || !identity(workspaceId) || !Array.isArray(records)) throw new Error("An explicit actor, workspace and record-array scope is required.");
  const issues: LifecyclePreflightIssue[] = [];
  const add = (row: LiveRecord, code: LifecyclePreflightIssue["code"]) => {
    issues.push({ code, collectionName: row.collectionName, recordId: row.recordId });
  };
  const visible = records.filter((row) => row.workspaceId === workspaceId && row.lifecycleState !== "deleted");
  const connections = visible.filter((row) => row.collectionName === "connections" && (row.userId === actorId || (object(row.payload) && row.payload.accountId === actorId)));
  const connectionIds = new Set(connections.map(({ recordId }) => recordId));
  const contactIds = new Set(connections.flatMap(({ payload }) => object(payload) && identity(payload.contactId) ? [payload.contactId] : []));
  const contacts = visible.filter((row) => row.collectionName === "contacts" && (row.userId === actorId || contactIds.has(row.recordId)));
  const tasks = visible.filter((row) => row.collectionName === "tasks" && ((!object(row.payload) && row.userId === actorId) || (object(row.payload) && ((row.userId === actorId && (row.payload.relationshipPurpose !== undefined || row.payload.connectionId !== undefined)) || (typeof row.payload.connectionId === "string" && connectionIds.has(row.payload.connectionId))))));
  const selected = [...contacts, ...connections, ...tasks];
  const valid = new Set<LiveRecord>();
  const versionValid = new Set<LiveRecord>();
  const physicalKeys = new Map<string, number>();
  for (const row of visible) {
    const key = JSON.stringify([row.collectionName, row.recordId]);
    physicalKeys.set(key, (physicalKeys.get(key) ?? 0) + 1);
  }
  for (const row of selected) {
    if (!identity(row.recordId) || !object(row.payload) || row.payload.id !== row.recordId || physicalKeys.get(JSON.stringify([row.collectionName, row.recordId])) !== 1) {
      add(row, "INVALID_RECORD");
      continue;
    }
    if (row.userId !== actorId) {
      add(row, row.userId == null || row.userId === "" ? "MISSING_OWNER" : "OWNER_CONFLICT");
      continue;
    }
    valid.add(row);
    const version = row.payload.version;
    if (version === undefined) add(row, "MISSING_VERSION");
    else if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) add(row, "INVALID_VERSION");
    else versionValid.add(row);
  }
  const validContacts = new Map(contacts.filter((row) => valid.has(row)).map((row) => [row.recordId, row]));
  const validConnections = new Map<string, LiveRecord>();
  const connectionsByContact = new Map<string, LiveRecord[]>();
  for (const row of connections) {
    if (!valid.has(row)) continue;
    if (row.payload.accountId !== actorId) {
      add(row, "OWNER_CONFLICT");
      continue;
    }
    try {
      normalizeRelationshipLifecycleInstant(row.payload.createdAt, "INVALID_TRANSITION");
      normalizeRelationshipLifecycleInstant(row.payload.updatedAt, "INVALID_TRANSITION");
    } catch {
      add(row, "INVALID_RECORD");
      continue;
    }
    const contactId = row.payload.contactId;
    if (!identity(contactId) || !validContacts.has(contactId)) {
      add(row, "INVALID_REFERENCE");
      continue;
    }
    validConnections.set(row.recordId, row);
    const list = connectionsByContact.get(contactId) ?? [];
    list.push(row);
    connectionsByContact.set(contactId, list);
  }
  for (const contact of contacts) {
    if (!valid.has(contact)) continue;
    const count = connectionsByContact.get(contact.recordId)?.length ?? 0;
    if (count === 0) add(contact, "MISSING_CONNECTION");
    if (count > 1) add(contact, "MULTIPLE_CONNECTIONS");
  }
  const eligibleTasks = new Map<string, LiveRecord[]>();
  for (const task of tasks) {
    if (!valid.has(task)) continue;
    const payload = task.payload;
    const connection = typeof payload.connectionId === "string" ? validConnections.get(payload.connectionId) : undefined;
    const generic = payload.relationshipPurpose === undefined;
    if (!connection || ((!generic || payload.contactId !== undefined) && payload.contactId !== connection.payload.contactId)) {
      add(task, "INVALID_REFERENCE");
      continue;
    }
    // Generic tasks still need valid ownership/references, but are not obligations.
    if (generic) continue;
    if ((payload.relationshipPurpose !== "follow_up" && payload.relationshipPurpose !== "maintenance") || typeof payload.status !== "string" || !["open", "scheduled", "completed", "dismissed"].includes(payload.status) || typeof payload.title !== "string" || !payload.title.trim()) {
      add(task, "INVALID_TASK");
      continue;
    }
    try {
      if (normalizeRelationshipLifecycleInstant(payload.dueAt, "INVALID_TASK") !== payload.dueAt) add(task, "NON_CANONICAL_DATE");
      normalizeRelationshipLifecycleInstant(payload.createdAt, "INVALID_TASK");
      normalizeRelationshipLifecycleInstant(payload.updatedAt, "INVALID_TASK");
    } catch {
      add(task, "INVALID_TASK");
      continue;
    }
    if (!versionValid.has(task)) continue;
    const list = eligibleTasks.get(connection.recordId) ?? [];
    list.push(task);
    eligibleTasks.set(connection.recordId, list);
  }
  for (const connection of validConnections.values()) {
    const stage = connection.payload.stage;
    const goal = connection.payload.activeGoal;
    if (goal != null && (typeof goal !== "string" || !goal.trim())) add(connection, "INVALID_RECORD");
    if (!isConnectionStage(stage)) {
      add(connection, stage === "captured" || stage === "reviewing" ? "ACQUISITION_REVIEW" : "UNKNOWN_STAGE");
      continue;
    }
    const open = (eligibleTasks.get(connection.recordId) ?? []).filter(({ payload }) => payload.status === "open" || payload.status === "scheduled");
    if (stage === "active" && (typeof connection.payload.activeGoal !== "string" || !connection.payload.activeGoal.trim())) add(connection, "MISSING_GOAL");
    if (stage === "archived" && open.length > 0) add(connection, "ARCHIVED_OPEN_TASKS");
    if ((stage === "needs_follow_up" || stage === "nurture") && !open.some(({ payload }) => payload.relationshipPurpose === (stage === "needs_follow_up" ? "follow_up" : "maintenance"))) add(connection, "MISSING_DATED_TASK");
  }
  const unique = [...new Map(issues.map((issue) => [JSON.stringify([issue.collectionName, issue.recordId, issue.code]), issue])).values()];
  unique.sort((left, right) => lexical(left.collectionName, right.collectionName) || lexical(left.recordId, right.recordId) || lexical(left.code, right.code));
  return {
    actorId, workspaceId, readyForCutover: unique.length === 0,
    counts: { contacts: contacts.length, connections: connections.length, relationshipTasks: tasks.length, ignored: records.length - selected.length },
    issues: unique,
  };
}
