import { randomUUID } from "node:crypto";
import { send } from "@vercel/queue";

export const EVENT_OPERATIONS_QUEUE_TOPIC = "event-operations";
const QUEUE_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export const EVENT_OPERATIONS_QUEUE_WAKE_REASONS = [
  "continuation",
  "generation",
  "maintenance",
  "outbox",
  "retry",
] as const;

export type EventOperationsQueueWakeReason =
  (typeof EVENT_OPERATIONS_QUEUE_WAKE_REASONS)[number];

export type EventOperationsWorkerWakeNotifier = (input: {
  reason: EventOperationsQueueWakeReason;
  workspaceId: string;
}) => Promise<void>;

export interface EventOperationsQueueWake {
  kind: "event-operations-wake";
  reason: EventOperationsQueueWakeReason;
  version: 1;
  wakeId: string;
  workspaceId: string;
}

export interface EventOperationsQueueSendOptions {
  delaySeconds?: number;
  idempotencyKey?: string;
  retentionSeconds?: number;
}

export interface EventOperationsQueueSendResult {
  messageId: string | null;
}

export type EventOperationsQueueSender = (
  topic: string,
  message: EventOperationsQueueWake,
  options: EventOperationsQueueSendOptions,
) => Promise<EventOperationsQueueSendResult>;

export interface PublishEventOperationsWakeInput {
  delaySeconds?: number;
  enabled?: boolean;
  id?: () => string;
  reason: EventOperationsQueueWakeReason;
  sendMessage?: EventOperationsQueueSender;
  workspaceId: string;
}

export interface PublishEventOperationsWakeResult {
  messageId: string | null;
  published: boolean;
  wake: EventOperationsQueueWake | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  );
}

function isWakeReason(value: unknown): value is EventOperationsQueueWakeReason {
  return (
    typeof value === "string" &&
    (EVENT_OPERATIONS_QUEUE_WAKE_REASONS as readonly string[]).includes(value)
  );
}

export function isEventOperationsQueueWake(
  value: unknown,
): value is EventOperationsQueueWake {
  if (!isRecord(value) || Object.keys(value).length !== 5) return false;
  return (
    value.kind === "event-operations-wake" &&
    value.reason !== undefined &&
    isWakeReason(value.reason) &&
    value.version === 1 &&
    isUuid(value.wakeId) &&
    typeof value.workspaceId === "string" &&
    value.workspaceId.trim().length > 0 &&
    value.workspaceId.length <= 240
  );
}

/**
 * Publish one small wake message. The database is the durable work ledger;
 * this message is only a bounded trigger. Queue delivery may be duplicated,
 * so the worker still relies on the database lease/fencing implementation.
 */
export async function publishEventOperationsWake({
  delaySeconds = 0,
  enabled = process.env.VERCEL === "1",
  id = randomUUID,
  reason,
  sendMessage = (topic, message, options) => send(topic, message, options),
  workspaceId,
}: PublishEventOperationsWakeInput): Promise<PublishEventOperationsWakeResult> {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) {
    throw new Error("Event operations queue wake requires a workspace.");
  }
  if (!enabled) return { messageId: null, published: false, wake: null };

  const wake: EventOperationsQueueWake = {
    kind: "event-operations-wake",
    reason,
    version: 1,
    wakeId: id(),
    workspaceId: normalizedWorkspaceId,
  };
  if (!isEventOperationsQueueWake(wake)) {
    throw new Error("Event operations queue wake identity is invalid.");
  }

  const result = await sendMessage(EVENT_OPERATIONS_QUEUE_TOPIC, wake, {
    delaySeconds: Math.max(0, Math.min(QUEUE_RETENTION_SECONDS, Math.floor(delaySeconds))),
    idempotencyKey: wake.wakeId,
    retentionSeconds: QUEUE_RETENTION_SECONDS,
  });
  return { messageId: result.messageId, published: true, wake };
}
