import { pathToFileURL } from "node:url";

import { createNoteAssociationReader } from "../features/notes/association-reader";
import { createNoteRepository } from "../features/notes/repository";
import { createNoteService, type NoteService } from "../features/notes/service";
import { createNotificationInteractionService, type NotificationInteractionService } from "../features/notifications/interaction-service";
import { createReminderPlanRepository, type ReminderPlanRepository } from "../features/notifications/reminder-plan-repository";
import {
  createReminderPlanService,
  ReminderPlanServiceError,
  type ReminderTargetAuthorizer,
  type ReminderPlanService,
} from "../features/notifications/reminder-plan-service";
import type {
  NotificationDeliveryDTO,
  ReminderPlanDTO,
} from "../features/notifications/reminder-plan-contract";
import type { PushProvider } from "../features/notifications/push-provider";
import { createStorageContactGraphProvider } from "../features/contacts/storage/contact-live-record-provider";
import type { ContactDTO } from "../shared/domain/contracts";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import { createTaskRepository } from "../features/tasks/repository";
import { createTaskService } from "../features/tasks/service";
import type { TaskItemDTO } from "../features/tasks/contract";
import { loadLocalEnv } from "./load-local-env";

/**
 * This verifier intentionally has no seed/cleanup operation. A write run is
 * one note create, one reminder-plan create, optionally one bounded dispatch,
 * and optionally one notification-interaction write.
 */
export const CLOUD_REMINDER_CHAIN_CHANNEL = "in_app" as const;
export const CLOUD_REMINDER_CHAIN_MAX_EXISTING_DUE_PLANS = 0;
export const CLOUD_REMINDER_CHAIN_MAX_SEARCH_ROWS = 50;

export function createCloudReminderTargetAuthorizer(
  listTask: (actorId: string) => Promise<readonly TaskItemDTO[]>,
): ReminderTargetAuthorizer {
  return {
    async assertOwned(input) {
      if (input.targetType !== "task") throw new ReminderPlanServiceError("TARGET_NOT_OWNED", "The verifier only accepts task reminder targets");
      const target = (await listTask(input.actorId)).find((item) => item.id === input.targetId);
      if (!target) throw new ReminderPlanServiceError("TARGET_NOT_OWNED", "target not owned");
    },
  };
}

export interface CloudReminderChainCommand {
  actorId: string;
  contactId: string;
  taskId: string;
  runId?: string;
  write: boolean;
  dispatch: boolean;
  markRead: boolean;
  fireAt: string;
  timeZone: string;
  noteTitle: string;
  noteBody: string;
  reminderTitle: string;
  reminderBody: string;
}

export interface CloudReminderChainLegacyNotification {
  id: string;
  status?: string;
  actionHref?: string;
}

export interface CloudReminderChainServices {
  notes: Pick<NoteService, "create" | "get" | "search">;
  reminders: Pick<ReminderPlanService, "create" | "list" | "dispatchDue" | "listDeliveries">;
  interactions: Pick<NotificationInteractionService, "list" | "set">;
  readContact: (actorId: string, contactId: string) => Promise<ContactDTO | null>;
  readTask: (actorId: string, taskId: string) => Promise<TaskItemDTO | null>;
  readLegacyNotifications?: (
    actorId: string,
    candidate?: { id: string; deepLink: string },
  ) => Promise<readonly CloudReminderChainLegacyNotification[]>;
}

export interface CloudReminderChainReport {
  mode: "dry-run" | "write";
  actorId: string;
  contactId: string;
  taskId: string;
  planned: {
    channel: typeof CLOUD_REMINDER_CHAIN_CHANNEL;
    fireAt: string;
    timeZone: string;
    noteTitle: string;
    reminderTitle: string;
  };
  preflight: {
    contactFound: boolean;
    taskFound: boolean;
    taskOwnerMatches: boolean;
    existingDueReminderCount: number;
    existingNotesForContact: number;
    legacyNotificationCount: number | null;
  };
  chain: {
    note: {
      id: string | null;
      contactLinked: boolean;
      reloaded: boolean;
    };
    reminderPlan: {
      id: string | null;
      status: ReminderPlanDTO["status"] | null;
      targetMatches: boolean;
      reloaded: boolean;
    };
    delivery: {
      id: string | null;
      status: NotificationDeliveryDTO["status"] | null;
      channel: NotificationDeliveryDTO["channel"] | null;
      reminderPlanMatches: boolean;
    };
    notification: {
      id: string | null;
      visibleFromReminderPlan: boolean;
      interactionState: "read" | "ignored" | null;
      legacyRecordMatched: boolean | null;
    };
    targetDetail: {
      id: string | null;
      title: string | null;
      ownerMatches: boolean;
      deepLink: string | null;
    };
  };
  sideEffects: {
    noteCreateRequested: boolean;
    reminderCreateRequested: boolean;
    dispatchRequested: boolean;
    markReadRequested: boolean;
    pushProviderCalls: number;
  };
  complete: boolean;
}

export function cloudReminderChainHelp(): string {
  return [
    "Cloud reminder chain verifier (dry-run by default)",
    "",
    "Required:",
    "  --actor-id <id>       actor/account that owns the synthetic records",
    "  --contact-id <id>     one actor-owned contact for the note",
    "  --task-id <id>        one actor-owned task for the reminder target",
    "",
    "Optional:",
    "  --run-id <id>         required with --write; becomes both idempotency suffixes",
    "  --fire-at <ISO>       reminder time; write+dispatch requires it to be due",
    "  --time-zone <IANA>    default Asia/Shanghai",
    "  --note-title <text>   default R2 云端提醒链验收笔记",
    "  --note-body <text>    default synthetic verification note",
    "  --reminder-title <text> / --reminder-body <text>",
    "  --write               enable one note and one reminder-plan write",
    "  --dispatch            execute the due reminder (requires --write)",
    "  --mark-read           persist read state (requires --dispatch)",
    "",
    "The verifier only uses the in_app channel. It never sends email or push.",
  ].join("\n");
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value.trim();
}

function requiredText(value: string | undefined, name: string, max = 256): string {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > max) {
    throw new Error(`${name} is required and must be at most ${max} characters`);
  }
  return normalized;
}

function parseIso(value: string, name: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be a valid ISO date-time`);
  }
  return value;
}

function rejectUnknownOptions(args: readonly string[]): void {
  const flags = new Set(["--help", "--write", "--dispatch", "--mark-read"]);
  const values = new Set([
    "--actor-id",
    "--contact-id",
    "--task-id",
    "--run-id",
    "--fire-at",
    "--time-zone",
    "--note-title",
    "--note-body",
    "--reminder-title",
    "--reminder-body",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    if (flags.has(arg)) continue;
    if (values.has(arg)) {
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
}

export function parseCloudReminderChainCommand(
  args: readonly string[],
  now = new Date(),
): CloudReminderChainCommand | { help: true } {
  if (args.includes("--help")) return { help: true };
  rejectUnknownOptions(args);

  const write = args.includes("--write");
  const dispatch = args.includes("--dispatch");
  const markRead = args.includes("--mark-read");
  if (dispatch && !write) throw new Error("--dispatch requires --write");
  if (markRead && !dispatch) throw new Error("--mark-read requires --dispatch");

  const actorId = requiredText(optionValue(args, "--actor-id"), "--actor-id");
  const contactId = requiredText(optionValue(args, "--contact-id"), "--contact-id");
  const taskId = requiredText(optionValue(args, "--task-id"), "--task-id");
  const runIdValue = optionValue(args, "--run-id");
  const runId = runIdValue ? requiredText(runIdValue, "--run-id", 80) : undefined;
  if (runId && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId)) {
    throw new Error("--run-id may contain only letters, numbers, dot, underscore and hyphen");
  }
  if (write && !runId) throw new Error("--run-id is required with --write");

  const defaultFireAt = new Date(now.getTime() + 15 * 60_000).toISOString();
  const fireAt = parseIso(optionValue(args, "--fire-at") ?? defaultFireAt, "--fire-at");
  const timeZone = requiredText(optionValue(args, "--time-zone") ?? "Asia/Shanghai", "--time-zone", 80);
  const noteTitle = requiredText(optionValue(args, "--note-title") ?? "R2 云端提醒链验收笔记", "--note-title", 200);
  const noteBody = requiredText(
    optionValue(args, "--note-body") ?? "合成验收：验证联系人笔记与任务提醒的云端持久化，不发送外部消息。",
    "--note-body",
    5_000,
  );
  const reminderTitle = requiredText(optionValue(args, "--reminder-title") ?? "R2 云端任务提醒", "--reminder-title", 160);
  const reminderBody = requiredText(
    optionValue(args, "--reminder-body") ?? "合成验收：请打开任务详情确认提醒目标可达。",
    "--reminder-body",
    5_000,
  );

  return {
    actorId,
    contactId,
    taskId,
    ...(runId ? { runId } : {}),
    write,
    dispatch,
    markRead,
    fireAt,
    timeZone,
    noteTitle,
    noteBody,
    reminderTitle,
    reminderBody,
  };
}

function duePlans(plans: readonly ReminderPlanDTO[], now: string): readonly ReminderPlanDTO[] {
  const nowMs = Date.parse(now);
  return plans.filter(
    (plan) => plan.status === "scheduled" && Number.isFinite(Date.parse(plan.fireAt)) && Date.parse(plan.fireAt) <= nowMs,
  );
}

function deepLinkForTask(taskId: string): string {
  return `/app/tasks/${encodeURIComponent(taskId)}`;
}

function planIdempotencyKey(command: CloudReminderChainCommand): string {
  return `r2-cloud-reminder-chain:${command.runId}:reminder`;
}

function noteIdempotencyKey(command: CloudReminderChainCommand): string {
  return `r2-cloud-reminder-chain:${command.runId}:note`;
}

function noOpPushProvider(counter: { calls: number }): PushProvider {
  return {
    async send() {
      counter.calls += 1;
      return { ok: false, code: "CLOUD_REMINDER_CHAIN_PUSH_DISABLED" };
    },
  };
}

function legacyMatch(
  notifications: readonly CloudReminderChainLegacyNotification[] | null,
  plan: ReminderPlanDTO | null,
): boolean | null {
  if (!notifications || !plan) return notifications ? false : null;
  return notifications.some(
    (notification) => notification.id === plan.id || notification.actionHref === plan.deepLink,
  );
}

function emptyReport(command: CloudReminderChainCommand): CloudReminderChainReport {
  return {
    mode: command.write ? "write" : "dry-run",
    actorId: command.actorId,
    contactId: command.contactId,
    taskId: command.taskId,
    planned: {
      channel: CLOUD_REMINDER_CHAIN_CHANNEL,
      fireAt: command.fireAt,
      timeZone: command.timeZone,
      noteTitle: command.noteTitle,
      reminderTitle: command.reminderTitle,
    },
    preflight: {
      contactFound: false,
      taskFound: false,
      taskOwnerMatches: false,
      existingDueReminderCount: 0,
      existingNotesForContact: 0,
      legacyNotificationCount: null,
    },
    chain: {
      note: { id: null, contactLinked: false, reloaded: false },
      reminderPlan: { id: null, status: null, targetMatches: false, reloaded: false },
      delivery: { id: null, status: null, channel: null, reminderPlanMatches: false },
      notification: { id: null, visibleFromReminderPlan: false, interactionState: null, legacyRecordMatched: null },
      targetDetail: { id: null, title: null, ownerMatches: false, deepLink: null },
    },
    sideEffects: {
      noteCreateRequested: false,
      reminderCreateRequested: false,
      dispatchRequested: false,
      markReadRequested: false,
      pushProviderCalls: 0,
    },
    complete: false,
  };
}

export async function runCloudReminderChain(
  command: CloudReminderChainCommand,
  services: CloudReminderChainServices,
  now: () => string = () => new Date().toISOString(),
): Promise<CloudReminderChainReport> {
  const report = emptyReport(command);
  const startedAt = now();
  const contact = await services.readContact(command.actorId, command.contactId);
  const task = await services.readTask(command.actorId, command.taskId);
  const existingPlans = await services.reminders.list({
    actorId: command.actorId,
    includeCancelled: true,
    targetId: command.taskId,
    targetType: "task",
  });
  if (existingPlans.length > CLOUD_REMINDER_CHAIN_MAX_SEARCH_ROWS) {
    throw new Error("Refusing an unbounded reminder-plan verification; narrow the synthetic actor first.");
  }
  const existingNotes = await services.notes.search({
    actorId: command.actorId,
    association: "contacts",
    contactId: command.contactId,
    limit: CLOUD_REMINDER_CHAIN_MAX_SEARCH_ROWS,
    sort: "updated_desc",
  });
  // The legacy collection check is intentionally deferred until a canonical
  // plan id exists. The configured implementation then performs one exact
  // getRecord instead of scanning the workspace's notification graph.
  const legacyBefore: readonly CloudReminderChainLegacyNotification[] | null = null;

  report.preflight.contactFound = Boolean(contact);
  report.preflight.taskFound = Boolean(task);
  report.preflight.taskOwnerMatches = Boolean(task && task.ownerUserId === command.actorId);
  report.preflight.existingDueReminderCount = duePlans(existingPlans, startedAt).length;
  report.preflight.existingNotesForContact = Math.min(existingNotes.total, CLOUD_REMINDER_CHAIN_MAX_SEARCH_ROWS);
  report.preflight.legacyNotificationCount = legacyBefore?.length ?? null;

  if (!contact) throw new Error(`Contact ${command.contactId} is not owned by actor ${command.actorId}`);
  if (!task || task.ownerUserId !== command.actorId) {
    throw new Error(`Task ${command.taskId} is not owned by actor ${command.actorId}`);
  }
  if (command.dispatch && Date.parse(command.fireAt) > Date.parse(startedAt)) {
    throw new Error("--dispatch requires --fire-at to be due now or in the past");
  }
  if (command.dispatch && report.preflight.existingDueReminderCount > CLOUD_REMINDER_CHAIN_MAX_EXISTING_DUE_PLANS) {
    throw new Error("Refusing to dispatch because this actor already has a due reminder; use an isolated synthetic account or clear the preflight first.");
  }

  report.chain.targetDetail = {
    id: task.id,
    title: task.title,
    ownerMatches: task.ownerUserId === command.actorId,
    deepLink: deepLinkForTask(task.id),
  };
  report.chain.notification.legacyRecordMatched = legacyMatch(legacyBefore, null);
  if (!command.write) return report;

  const note = await services.notes.create({
    actorId: command.actorId,
    body: command.noteBody,
    idempotencyKey: noteIdempotencyKey(command),
    manualContactIds: [command.contactId],
    now: startedAt,
    title: command.noteTitle,
  });
  report.sideEffects.noteCreateRequested = true;
  const reloadedNote = await services.notes.get({ actorId: command.actorId, noteId: note.id });
  report.chain.note = {
    id: note.id,
    contactLinked: note.contactIds.includes(command.contactId),
    reloaded: Boolean(reloadedNote && reloadedNote.id === note.id && reloadedNote.contactIds.includes(command.contactId)),
  };

  const plan = await services.reminders.create({
    actorId: command.actorId,
    body: command.reminderBody,
    channels: [CLOUD_REMINDER_CHAIN_CHANNEL],
    createdBy: "user",
    deepLink: deepLinkForTask(command.taskId),
    fireAt: command.fireAt,
    idempotencyKey: planIdempotencyKey(command),
    targetId: command.taskId,
    targetType: "task",
    timeZone: command.timeZone,
    title: command.reminderTitle,
  });
  report.sideEffects.reminderCreateRequested = true;
  const reloadedPlan = (await services.reminders.list({
    actorId: command.actorId,
    includeCancelled: true,
    targetId: command.taskId,
    targetType: "task",
  })).find((item) => item.id === plan.id) ?? null;
  report.chain.reminderPlan = {
    id: plan.id,
    status: reloadedPlan?.status ?? plan.status,
    targetMatches: plan.targetId === command.taskId && plan.targetType === "task",
    reloaded: Boolean(reloadedPlan && reloadedPlan.id === plan.id),
  };

  const pushCalls = { calls: 0 };
  let delivery: NotificationDeliveryDTO | null = null;
  if (command.dispatch) {
    report.sideEffects.dispatchRequested = true;
    await services.reminders.dispatchDue({
      now: now(),
      provider: noOpPushProvider(pushCalls),
    });
    const deliveries = (await services.reminders.listDeliveries({ actorId: command.actorId }))
      .filter((item) => item.reminderPlanId === plan.id && item.channel === CLOUD_REMINDER_CHAIN_CHANNEL);
    if (deliveries.length !== 1) {
      throw new Error(`Expected exactly one in-app delivery for ${plan.id}; found ${deliveries.length}`);
    }
    delivery = deliveries[0] ?? null;
    if (delivery.status !== "delivered") {
      throw new Error(`Expected in-app delivery ${delivery.id} to be delivered; got ${delivery.status}`);
    }
  }
  report.sideEffects.pushProviderCalls = pushCalls.calls;
  report.chain.delivery = {
    id: delivery?.id ?? null,
    status: delivery?.status ?? null,
    channel: delivery?.channel ?? null,
    reminderPlanMatches: Boolean(delivery && delivery.reminderPlanId === plan.id),
  };

  if (command.markRead) {
    report.sideEffects.markReadRequested = true;
    await services.interactions.set({
      actorId: command.actorId,
      notificationId: plan.id,
      state: "read",
    });
  }
  const interactionState = (await services.interactions.list(command.actorId, [plan.id]))[plan.id] ?? null;
  const finalPlan = (await services.reminders.list({
    actorId: command.actorId,
    includeCancelled: true,
    targetId: command.taskId,
    targetType: "task",
  })).find((item) => item.id === plan.id) ?? plan;
  const legacyAfter = services.readLegacyNotifications
    ? await services.readLegacyNotifications(command.actorId, {
        id: finalPlan.id,
        deepLink: finalPlan.deepLink,
      })
    : null;
  const legacyRecordMatched = legacyMatch(legacyAfter, finalPlan);
  report.chain.reminderPlan.status = finalPlan.status;
  report.chain.reminderPlan.reloaded = finalPlan.id === plan.id;
  report.chain.notification = {
    id: finalPlan.id,
    visibleFromReminderPlan: finalPlan.status === "delivered" || finalPlan.status === "failed",
    interactionState,
    legacyRecordMatched,
  };
  report.complete = Boolean(
    report.chain.note.reloaded &&
      report.chain.note.contactLinked &&
      report.chain.reminderPlan.reloaded &&
      report.chain.reminderPlan.targetMatches &&
      (!command.dispatch || (
        report.chain.delivery.status === "delivered" &&
        report.chain.delivery.channel === CLOUD_REMINDER_CHAIN_CHANNEL &&
        report.chain.delivery.reminderPlanMatches &&
        report.chain.notification.visibleFromReminderPlan
      )) &&
      (!command.markRead || report.chain.notification.interactionState === "read") &&
      report.chain.targetDetail.ownerMatches &&
      report.sideEffects.pushProviderCalls === 0,
  );
  return report;
}

function createDisabledReminderPushDevices() {
  return {
    async listActive() {
      return [];
    },
    async register() {
      throw new Error("Push registration is disabled for the cloud reminder-chain verifier");
    },
    async revoke() {
      return null;
    },
    async invalidate() {
      return null;
    },
  };
}

export function createConfiguredCloudReminderChainServices(actorId: string) {
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!configured) {
    throw new Error("Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL first");
  }
  const { store, workspaceId } = configured;
  const contactProvider = createStorageContactGraphProvider({ store, workspaceId });
  const noteService = createNoteService({
    repository: createNoteRepository({ store, workspaceId }),
    associationReader: createNoteAssociationReader({
      contactProvider,
      store,
      workspaceId,
    }),
  });
  const taskService = createTaskService({
    repository: createTaskRepository({ store, workspaceId }),
  });
  const reminderRepository = createReminderPlanRepository({ store, workspaceId });
  const scopedReminderRepository: ReminderPlanRepository = {
    ...reminderRepository,
    async listDuePlans(now) {
      return (await reminderRepository.listDuePlans(now)).filter((plan) => plan.ownerUserId === actorId);
    },
  };
  const reminderService = createReminderPlanService({
    now: () => new Date().toISOString(),
    pushDevices: createDisabledReminderPushDevices(),
    repository: scopedReminderRepository,
    targetAuthorizer: createCloudReminderTargetAuthorizer((requestedActorId) => taskService.list({ actorId: requestedActorId })),
  });
  const interactions = createNotificationInteractionService({ store, workspaceId });

  return {
    workspaceId,
    services: {
      notes: noteService,
      reminders: reminderService,
      interactions,
      async readContact(requestedActorId: string, contactId: string) {
        const graph = contactProvider.readContactGraphForContact
          ? await contactProvider.readContactGraphForContact(contactId, requestedActorId)
          : await contactProvider.readContactGraph(requestedActorId);
        return graph.contacts.find((contact) => contact.id === contactId) ?? null;
      },
      async readTask(requestedActorId: string, taskId: string) {
        return (await taskService.list({ actorId: requestedActorId })).find((task) => task.id === taskId) ?? null;
      },
      async readLegacyNotifications(requestedActorId: string, candidate) {
        if (!candidate) return [];
        const record = await store.getRecord({
          collectionName: "notifications",
          recordId: candidate.id,
          workspaceId,
        });
        if (!record || record.userId !== requestedActorId) return [];
        const payload = record.payload;
        return [{
          id: record.recordId,
          ...(typeof payload.status === "string" ? { status: payload.status } : {}),
          ...(typeof payload.actionHref === "string" ? { actionHref: payload.actionHref } : {}),
        }];
      },
    } satisfies CloudReminderChainServices,
    close: () => configured.client.close(),
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const parsed = parseCloudReminderChainCommand(process.argv.slice(2));
  if ("help" in parsed) {
    process.stdout.write(`${cloudReminderChainHelp()}\n`);
    return;
  }
  const configured = createConfiguredCloudReminderChainServices(parsed.actorId);
  try {
    const report = await runCloudReminderChain(parsed, configured.services);
    process.stdout.write(`${JSON.stringify({ workspaceId: configured.workspaceId, ...report }, null, 2)}\n`);
    if (parsed.write && !report.complete) process.exitCode = 1;
  } finally {
    await configured.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
