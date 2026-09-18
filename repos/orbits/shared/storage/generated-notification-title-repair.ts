import { createHash } from "node:crypto";

import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "./live-record-store";

const GENERATED_PROVIDER = "generated-relationship-fixtures";
const LEGACY_TITLE = /^Review follow-up for contact_\d+$/u;
const GENERATED_TASK_ID = /\btask_\d+\b/u;

export interface GeneratedNotificationTitleRepairChange {
  contactId: string;
  fromTitle: string;
  notificationId: string;
  taskId: string;
  toTitle: string;
}

export interface GeneratedNotificationTitleRepairRejection {
  notificationId: string;
  reason:
    | "contact_name_missing"
    | "contact_not_found"
    | "evidence_not_found"
    | "task_contact_mismatch"
    | "task_not_found";
}

export interface GeneratedNotificationTitleRepairPlan {
  actorId: string;
  candidateCount: number;
  changes: readonly GeneratedNotificationTitleRepairChange[];
  hash: string;
  rejected: readonly GeneratedNotificationTitleRepairRejection[];
  workspaceId: string;
}

export interface GeneratedNotificationTitleRepairReport {
  actorId: string;
  hash: string;
  reviewedCount: number;
  updated: number;
  workspaceId: string;
}

type UnknownRecord = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function evidenceIds(record: LiveRecord<UnknownRecord>): readonly string[] {
  if (record.evidenceIds.length > 0) return record.evidenceIds;
  return Array.isArray(record.payload.evidenceIds)
    ? record.payload.evidenceIds.filter((value): value is string => typeof value === "string")
    : [];
}

function planHash(changes: readonly GeneratedNotificationTitleRepairChange[]): string {
  return createHash("sha256").update(JSON.stringify(changes)).digest("hex");
}

export async function planGeneratedNotificationTitleRepair(input: {
  actorId: string;
  store: LiveRecordStoreLike<UnknownRecord>;
  workspaceId: string;
}): Promise<GeneratedNotificationTitleRepairPlan> {
  const query = {
    lifecycleState: "active" as const,
    userId: input.actorId,
    workspaceId: input.workspaceId,
  };
  const [notifications, evidence, tasks, contacts] = await Promise.all([
    input.store.listRecords({ limit: "unbounded", ...query, collectionName: "notifications" }),
    input.store.listRecords({
      limit: "unbounded",
      collectionName: "evidence",
      lifecycleState: "active",
      workspaceId: input.workspaceId,
    }),
    input.store.listRecords({ limit: "unbounded", ...query, collectionName: "tasks" }),
    input.store.listRecords({ limit: "unbounded", ...query, collectionName: "contacts" }),
  ]);
  const evidenceById = new Map(evidence.map(record => [record.recordId, record]));
  const tasksById = new Map(tasks.map(record => [record.recordId, record]));
  const contactsById = new Map(contacts.map(record => [record.recordId, record]));
  const candidates = notifications.filter(record =>
    record.provider === GENERATED_PROVIDER && LEGACY_TITLE.test(text(record.payload.title)),
  );
  const changes: GeneratedNotificationTitleRepairChange[] = [];
  const rejected: GeneratedNotificationTitleRepairRejection[] = [];

  for (const notification of candidates) {
    const evidenceRecord = evidenceIds(notification)
      .map(id => evidenceById.get(id))
      .find(record =>
        record?.provider === GENERATED_PROVIDER &&
        (record.userId === null || record.userId === input.actorId) &&
        GENERATED_TASK_ID.test(text(record.payload.summary)),
      );
    const taskId = text(evidenceRecord?.payload.summary).match(GENERATED_TASK_ID)?.[0] ?? "";
    if (!evidenceRecord || !taskId) {
      rejected.push({ notificationId: notification.recordId, reason: "evidence_not_found" });
      continue;
    }

    const task = tasksById.get(taskId);
    if (!task || task.provider !== GENERATED_PROVIDER) {
      rejected.push({ notificationId: notification.recordId, reason: "task_not_found" });
      continue;
    }
    const contactId = text(task.payload.contactId);
    const contact = contactsById.get(contactId);
    if (!contact || contact.provider !== GENERATED_PROVIDER) {
      rejected.push({ notificationId: notification.recordId, reason: "contact_not_found" });
      continue;
    }
    const contactName = text(contact.payload.displayName);
    if (!contactName) {
      rejected.push({ notificationId: notification.recordId, reason: "contact_name_missing" });
      continue;
    }
    const taskTitle = text(task.payload.title);
    if (!taskTitle || LEGACY_TITLE.test(taskTitle) || !taskTitle.includes(contactName)) {
      rejected.push({ notificationId: notification.recordId, reason: "task_contact_mismatch" });
      continue;
    }

    changes.push({
      contactId,
      fromTitle: text(notification.payload.title),
      notificationId: notification.recordId,
      taskId,
      toTitle: taskTitle,
    });
  }

  changes.sort((left, right) => left.notificationId.localeCompare(right.notificationId));
  rejected.sort((left, right) => left.notificationId.localeCompare(right.notificationId));
  return {
    actorId: input.actorId,
    candidateCount: candidates.length,
    changes,
    hash: planHash(changes),
    rejected,
    workspaceId: input.workspaceId,
  };
}

export async function applyGeneratedNotificationTitleRepair(input: {
  actorId: string;
  expectedCount: number;
  expectedHash: string;
  now?: () => string;
  store: LiveRecordStoreLike<UnknownRecord>;
  workspaceId: string;
}): Promise<GeneratedNotificationTitleRepairReport> {
  const plan = await planGeneratedNotificationTitleRepair(input);
  if (
    plan.rejected.length > 0 ||
    plan.changes.length !== input.expectedCount ||
    plan.hash !== input.expectedHash
  ) {
    throw new Error("The reviewed repair plan no longer matches the current records.");
  }

  const updatedAt = (input.now ?? (() => new Date().toISOString()))();
  for (const change of plan.changes) {
    const current = await input.store.getRecord({
      collectionName: "notifications",
      recordId: change.notificationId,
      workspaceId: input.workspaceId,
    });
    if (
      !current ||
      current.lifecycleState !== "active" ||
      current.userId !== input.actorId ||
      current.provider !== GENERATED_PROVIDER ||
      text(current.payload.title) !== change.fromTitle
    ) {
      throw new Error(`Notification ${change.notificationId} changed after review.`);
    }
    const payloadHasUpdatedAt = Object.prototype.hasOwnProperty.call(current.payload, "updatedAt");
    await input.store.upsertRecord({
      ...current,
      updatedAt,
      payload: {
        ...current.payload,
        title: change.toTitle,
        ...(payloadHasUpdatedAt ? { updatedAt } : {}),
      },
    });
  }

  return {
    actorId: input.actorId,
    hash: plan.hash,
    reviewedCount: plan.changes.length,
    updated: plan.changes.length,
    workspaceId: input.workspaceId,
  };
}
