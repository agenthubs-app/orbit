import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createConfiguredStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";
import { resolveCanonicalAccountOwnerId } from "../features/account/canonical-account-owner";
import {
  createConfiguredStorageAccountSessionProvider,
  type LiveAccountSessionGraph,
} from "../features/account/storage/account-live-record-provider";
import { createConfiguredReminderPlanService } from "../features/notifications/reminder-plan-service-factory";
import { createConfiguredTaskService } from "../features/tasks/service-factory";
import {
  buildXiaoyuThreeMonthSeed,
  type XiaoyuSeedScheduleItem,
  type XiaoyuSeedTask,
} from "../features/tasks/xiaoyu-three-month-seed";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../shared/storage/live-record-store";
import { loadLocalEnv } from "./load-local-env";

type RunMode = "preview" | "apply" | "verify";

interface Command {
  email: string;
  fromDate: string;
  mode: RunMode;
}

const PROVIDER = "orbit-xiaoyu-three-month-planner-v1";

export function resolveXiaoyuSeedAccountId(input: {
  authUserId: string;
  graph: LiveAccountSessionGraph;
}): string {
  return resolveCanonicalAccountOwnerId(input);
}

function argumentValue(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1]?.trim() || null : null;
}

function tokyoDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(now);
}

export function parseXiaoyuSeedCommand(args: readonly string[]): Command {
  const mode = (argumentValue(args, "--mode") ?? "preview") as RunMode;
  if (mode !== "preview" && mode !== "apply" && mode !== "verify") {
    throw new Error("--mode must be preview, apply, or verify");
  }
  const fromDate = argumentValue(args, "--from") ?? tokyoDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(fromDate)) {
    throw new Error("--from must use YYYY-MM-DD");
  }
  return {
    email: argumentValue(args, "--email") ?? "agenthubs.app@gmail.com",
    fromDate,
    mode,
  };
}

function stableId(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}:${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24)}`;
}

function taskId(actorId: string, fromDate: string, key: string): string {
  return stableId("task", actorId, `${PROVIDER}:${fromDate}:${key}`);
}

function scheduleId(actorId: string, fromDate: string, key: string): string {
  return stableId("schedule", actorId, `${PROVIDER}:${fromDate}:${key}`);
}

async function contactsByName(input: {
  actorId: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<ReadonlyMap<string, string>> {
  const records = await input.store.listRecords({
    collectionName: "contacts",
    userId: input.actorId,
    workspaceId: input.workspaceId,
  });
  const contacts = new Map<string, string>();
  for (const record of records) {
    const displayName = record.payload.displayName;
    if (typeof displayName === "string" && displayName.trim()) {
      contacts.set(displayName.trim(), record.recordId);
    }
  }
  return contacts;
}

function relatedContactId(task: { relatedContactName?: string }, contacts: ReadonlyMap<string, string>): string | undefined {
  return task.relatedContactName ? contacts.get(task.relatedContactName) : undefined;
}

async function upsertSchedule(input: {
  actorId: string;
  fromDate: string;
  item: XiaoyuSeedScheduleItem;
  contactId?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<string> {
  const id = scheduleId(input.actorId, input.fromDate, input.item.key);
  const category = input.item.kind === "event" ? "event" : input.item.kind === "meeting" ? "meeting" : "personal";
  await input.store.upsertRecord({
    collectionName: "orbitScheduleItems",
    createdAt: `${input.fromDate}T00:00:00.000Z`,
    evidenceIds: [],
    lifecycleState: "active",
    occurredAt: input.item.startsAt,
    payload: {
      accountId: input.actorId,
      category,
      endsAt: input.item.endsAt,
      eventId: id,
      evidenceIds: [],
      id,
      kind: input.item.kind,
      location: input.item.location,
      ...(input.contactId ? { relatedContactId: input.contactId } : {}),
      sourceId: id,
      startsAt: input.item.startsAt,
      title: input.item.title,
    },
    provider: PROVIDER,
    providerRecordId: input.item.key,
    recordId: id,
    searchText: `${input.item.title} ${input.item.location} ${input.item.relatedContactName ?? ""}`,
    sourceId: `${PROVIDER}:${input.item.key}`,
    sourceLabel: "小雨三个月日程",
    sourceType: "manual",
    targetId: id,
    targetType: "schedule_item",
    updatedAt: `${input.fromDate}T00:00:00.000Z`,
    userId: input.actorId,
    workspaceId: input.workspaceId,
  });
  return id;
}

async function applyTask(input: {
  actorId: string;
  contactId?: string;
  createdAt?: string;
  fromDate: string;
  task: XiaoyuSeedTask;
}) {
  return createConfiguredTaskService().create({
    actorId: input.actorId,
    category: input.task.category,
    dueAt: input.task.dueAt,
    idempotencyKey: `${PROVIDER}:${input.fromDate}:${input.task.key}`,
    notes: input.task.notes,
    now: input.createdAt ?? `${input.fromDate}T00:00:00.000Z`,
    plannedDate: input.task.plannedDate,
    priority: input.task.priority,
    ...(input.contactId ? { relatedContactId: input.contactId } : {}),
    source: "manual",
    title: input.task.title,
  });
}

async function verify(input: {
  actorId: string;
  fromDate: string;
  expectedTaskKeys: readonly string[];
  expectedScheduleKeys: readonly string[];
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}) {
  const [taskRecords, scheduleRecords] = await Promise.all([
    input.store.listRecords({ collectionName: "tasks", userId: input.actorId, workspaceId: input.workspaceId }),
    input.store.listRecords({ collectionName: "orbitScheduleItems", userId: input.actorId, workspaceId: input.workspaceId }),
  ]);
  const taskIds = new Set(taskRecords.map((record) => record.recordId));
  const scheduleIds = new Set(scheduleRecords.map((record) => record.recordId));
  const missingTasks = input.expectedTaskKeys
    .map((key) => taskId(input.actorId, input.fromDate, key))
    .filter((id) => !taskIds.has(id));
  const missingSchedules = input.expectedScheduleKeys
    .map((key) => scheduleId(input.actorId, input.fromDate, key))
    .filter((id) => !scheduleIds.has(id));
  return {
    missingSchedules,
    missingTasks,
    schedulesFound: input.expectedScheduleKeys.length - missingSchedules.length,
    tasksFound: input.expectedTaskKeys.length - missingTasks.length,
  };
}

export async function runXiaoyuThreeMonthSeed(command: Command): Promise<Record<string, unknown>> {
  const seed = buildXiaoyuThreeMonthSeed(command.fromDate);
  if (command.mode === "preview") {
    return {
      completedTasks: seed.completedTasks.length,
      email: command.email,
      fromDate: seed.fromDate,
      mode: command.mode,
      openTasks: seed.openTasks.length,
      sampleSchedule: seed.scheduleItems.slice(0, 4),
      sampleTasks: seed.openTasks.slice(0, 6),
      scheduleItems: seed.scheduleItems.length,
      throughDate: seed.throughDate,
    };
  }

  loadLocalEnv();
  const authProvider = createConfiguredStorageAuthUserProvider();
  const accountProvider = createConfiguredStorageAccountSessionProvider();
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!authProvider || !accountProvider || !configured) {
    throw new Error("The configured live store is unavailable.");
  }
  const authUser = await authProvider.getUserByEmail(command.email);
  if (!authUser) throw new Error(`No account exists for ${command.email}.`);
  const actorId = resolveXiaoyuSeedAccountId({
    authUserId: authUser.id,
    graph: await accountProvider.readAccountSessionGraph(),
  });
  const contacts = await contactsByName({ actorId, store: configured.store, workspaceId: configured.workspaceId });
  const allTaskKeys = [...seed.openTasks, ...seed.completedTasks].map((item) => item.key);
  const allScheduleKeys = seed.scheduleItems.map((item) => item.key);

  if (command.mode === "verify") {
    return {
      accountId: actorId,
      authUserId: authUser.id,
      mode: command.mode,
      ...(await verify({ actorId, expectedScheduleKeys: allScheduleKeys, expectedTaskKeys: allTaskKeys, fromDate: command.fromDate, store: configured.store, workspaceId: configured.workspaceId })),
    };
  }

  let linkedTasks = 0;
  for (const item of seed.openTasks) {
    const contactId = relatedContactId(item, contacts);
    if (contactId) linkedTasks += 1;
    const result = await applyTask({ actorId, ...(contactId ? { contactId } : {}), fromDate: command.fromDate, task: item });
    if (item.priority === "high" && Date.parse(item.dueAt) > Date.now()) {
      await createConfiguredReminderPlanService().create({
        actorId,
        body: item.title,
        channels: ["in_app", "ios_push"],
        createdBy: "user",
        deepLink: `/tasks/${encodeURIComponent(result.task.id)}`,
        fireAt: new Date(Date.parse(item.dueAt) - 60 * 60_000).toISOString(),
        idempotencyKey: `${PROVIDER}:reminder:${command.fromDate}:${item.key}`,
        targetId: result.task.id,
        targetType: "task",
        timeZone: "Asia/Tokyo",
        title: "待办提醒",
      });
    }
  }

  for (const item of seed.completedTasks) {
    const contactId = relatedContactId(item, contacts);
    if (contactId) linkedTasks += 1;
    const result = await applyTask({ actorId, ...(contactId ? { contactId } : {}), createdAt: `${item.plannedDate}T00:00:00.000Z`, fromDate: command.fromDate, task: item });
    await createConfiguredTaskService().complete({
      actorId,
      completedBy: actorId,
      completionSource: "user",
      idempotencyKey: `${PROVIDER}:complete:${command.fromDate}:${item.key}`,
      now: item.completedAt,
      taskId: result.task.id,
    });
  }

  let linkedSchedules = 0;
  for (const item of seed.scheduleItems) {
    const contactId = relatedContactId(item, contacts);
    if (contactId) linkedSchedules += 1;
    await upsertSchedule({ actorId, ...(contactId ? { contactId } : {}), fromDate: command.fromDate, item, store: configured.store, workspaceId: configured.workspaceId });
  }

  const verification = await verify({
    actorId,
    expectedScheduleKeys: allScheduleKeys,
    expectedTaskKeys: allTaskKeys,
    fromDate: command.fromDate,
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
  return {
    accountId: actorId,
    authUserId: authUser.id,
    completedTasksUpserted: seed.completedTasks.length,
    fromDate: seed.fromDate,
    linkedSchedules,
    linkedTasks,
    mode: command.mode,
    openTasksUpserted: seed.openTasks.length,
    scheduleItemsUpserted: seed.scheduleItems.length,
    throughDate: seed.throughDate,
    ...verification,
  };
}

async function main(): Promise<void> {
  const result = await runXiaoyuThreeMonthSeed(parseXiaoyuSeedCommand(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  if (
    Array.isArray(result.missingTasks) && result.missingTasks.length > 0 ||
    Array.isArray(result.missingSchedules) && result.missingSchedules.length > 0
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Xiao Yu planner seed failed.");
    process.exitCode = 1;
  });
}
