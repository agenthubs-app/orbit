/**
 * The optional reminder of a scheduled task's period (agent-design AG16; 设计稿 §5.3「用户从哪里收结果」「什么时候不打扰」;
 * PLANNER 易错边界 1–5).
 *
 * The result always goes to the in-app inbox (delivery.ts). On top of that, a task whose own switch is on gets one
 * reminder per period with a result, on the owner's phone (Expo) and browser (Web Push):
 * - only for a run whose rule asked for it (`delivery.push.state === "pending"`, set when the period was computed) and
 *   only after its result is in the inbox; a task without the switch never gets as far as here;
 * - before every send the task is looked at again (still there, not paused, the switch still on), and the owner's
 *   quiet hours and daily limit are respected — a reminder held back by them is not sent later, the history says why;
 * - the text is one fixed sentence in the owner's language. Title, body and data hold nothing of the result: no record
 *   title, time, place, name, and not the task's own name. The only data is an opaque id; what it points at is read
 *   after sign-in. The owner's "show content on the lock screen" setting does not apply to these;
 * - a send the push service explicitly refused is tried again at a later pass; one it did not answer is never sent
 *   again (it may have arrived); a device the push service no longer knows is revoked and not sent to again;
 * - sending again reads only this run's own record and changes only its `delivery.push` block. The result, its
 *   completion time (`computedAt`) and its inbox entry are never touched: no record is read, no model is called, and
 *   nothing is worked out a second time.
 */
import { emitTrace } from "../../agent-v1/observability/trace";
import type { OrbitPushMessage, OrbitPushReceipt } from "../../notifications/push-adapter";
import { agentAutomationNotify, type AgentAutomation } from "./contract";
import type { AutomationStorage } from "./due-index";
import {
  createAutomationRunStore,
  pushDeliveryIdOf,
  pushDueKeyOf,
  type AgentAutomationPushDelivery,
  type AgentAutomationPushReason,
  type AgentAutomationPushTarget,
  type AgentAutomationRunRecord,
} from "./runs";

export type RulePushLocale = "zh" | "en" | "ja";
export type RulePushPlatform = AgentAutomationPushTarget["platform"];

/** Rounds of sending per period (the first and four more), then a refused reminder is given up. */
export const RULE_PUSH_MAX_ATTEMPTS = 5;
/** How long after a ticket its receipt is asked for (Expo makes receipts available within about 15 minutes). */
export const RULE_PUSH_RECEIPT_DELAY_MS = 15 * 60_000;
/** After this long an unanswered receipt is no longer asked for. */
export const RULE_PUSH_RECEIPT_GIVE_UP_MS = 24 * 3_600_000;
/** A receipt saying the push service did not deliver brings at most this many further sends to that device per period. */
export const RULE_PUSH_RECEIPT_RESENDS = 1;
/** The safety row written with the inbox delivery: if the pass dies before sending, the reminder is picked up after this. */
export const RULE_PUSH_SAFETY_DELAY_MS = 5 * 60_000;

export const RULE_PUSH_TITLE = "Orbit";
/** The whole reminder (视觉稿 16-5, D16-2). Nothing else is ever written on it. */
export const RULE_PUSH_BODY: Record<RulePushLocale, string> = {
  en: "You have new results. Open Orbit to see them.",
  ja: "新しい結果があります。Orbit でご確認ください。",
  zh: "有新结果，请到 Orbit 查看。",
};

/** What a reminder carries: the fixed title, the fixed sentence and the opaque id. */
export function rulePushMessage(locale: RulePushLocale, runId: string): Pick<OrbitPushMessage, "title" | "body" | "data" | "sound"> {
  return { body: RULE_PUSH_BODY[locale] ?? RULE_PUSH_BODY.zh, data: { deliveryId: pushDeliveryIdOf(runId) }, sound: "default", title: RULE_PUSH_TITLE };
}

export interface RulePushDevice {
  deviceId: string;
  platform: RulePushPlatform;
  token: string;
}

export interface RulePushDeviceAccess {
  /** The owner's devices that allow notifications now: phones and browsers. */
  listActive(): Promise<readonly RulePushDevice[]>;
  /** The push service no longer knows this device: it is not sent to again until the owner allows it again. */
  revoke(deviceId: string): Promise<unknown>;
}

export interface RulePushChannel {
  /** Whether this deployment can send to this kind of device (Expo for phones, Web Push for browsers). */
  supports(platform: RulePushPlatform): boolean;
  send(message: OrbitPushMessage & { platform: RulePushPlatform }): Promise<{ receiptId: string; verified?: boolean }>;
  /** Whether accepted tickets of this kind of device have a receipt to ask for afterwards (Expo has; Web Push has none). */
  hasReceipts?(platform: RulePushPlatform): boolean;
  getReceipt?(receiptId: string, platform: RulePushPlatform): Promise<OrbitPushReceipt>;
}

export type RulePushHold = "quiet_hours" | "daily_cap" | "notifications_off";

export interface RulePushPolicy {
  /** The owner's own notification settings at this moment: send, or hold back and why. */
  check(ownerId: string, input: { now: string; eventKey: string }): Promise<{ send: true } | { send: false; reason: RulePushHold }>;
  /** A reminder went out: counted towards the day's limit (once per period, whatever the number of devices). */
  sent?(ownerId: string, input: { now: string; eventKey: string }): Promise<void>;
}

export interface RulePushDeps {
  storage: AutomationStorage;
  /** Null: this owner has no device store (nothing can be sent). */
  devices(ownerId: string): RulePushDeviceAccess | null;
  /** Null: no push channel is configured in this deployment. */
  channel: RulePushChannel | null;
  policy?: RulePushPolicy | null;
  now(): string;
}

export type RulePushState = AgentAutomationPushDelivery["state"] | "none";

/** 5 min, 10, 20 … up to 6 hours between rounds, like the inbox delivery. */
export function pushBackoffMs(attempts: number): number {
  return Math.min(5 * 60_000 * 2 ** Math.max(0, attempts - 1), 6 * 3_600_000);
}

/**
 * What a failed send means. Only an explicit refusal by the push service (`notAccepted`) may be sent again; anything
 * else may have arrived and is left alone.
 */
export function classifyPushError(error: unknown): { state: "revoked" | "retry" | "rejected" | "unknown"; message: string } {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  if ((error as { notAccepted?: boolean } | null)?.notAccepted !== true) return { message, state: "unknown" };
  if (/DeviceNotRegistered/u.test(message)) return { message, state: "revoked" };
  if (/InvalidCredentials|MessageTooBig|MismatchSenderId/u.test(message)) return { message, state: "rejected" };
  return { message, state: "retry" };
}

function reasonOf(targets: readonly AgentAutomationPushTarget[]): AgentAutomationPushReason {
  if (!targets.length) return "no_device";
  if (targets.some((target) => target.state === "unknown")) return "outcome_unknown";
  if (targets.every((target) => target.state === "revoked")) return "permission_revoked";
  return targets.some((target) => target.state === "rejected") ? "provider_rejected" : "permission_revoked";
}

/**
 * One round of a run's reminder. Returns the reminder's state afterwards. It never computes anything: it reads the
 * run's own record, the task's row of the due index (its state and switch), the owner's notification settings and
 * device registrations — never a contact, event, note, to-do or memory, and never a model.
 */
export async function pushRun(deps: RulePushDeps, ref: { ownerId: string; runId: string }): Promise<RulePushState> {
  const { storage } = deps;
  const dueRef = { key: pushDueKeyOf(ref.runId), kind: "delivery" as const, ownerId: ref.ownerId };
  const run = await createAutomationRunStore(storage.direct.store, storage.workspaceId).get(ref.ownerId, ref.runId);
  if (!run) {
    await storage.direct.due.remove(dueRef);
    return "none";
  }
  const push = run.delivery.push;
  const now = deps.now();
  const targets = new Map((push.targets ?? []).map((target) => [target.deviceId, target]));
  const open = push.state === "pending" || [...targets.values()].some((target) => target.state === "retry" || target.receipt === "pending");
  if (!open) {
    await storage.direct.due.remove(dueRef);
    return push.state;
  }

  /** Writes the reminder block only, onto the run as it is stored now, with the row that brings the next round. */
  const finish = async (next: AgentAutomationPushDelivery, again: string | null): Promise<RulePushState> => {
    await storage.transaction(async (tx) => {
      const store = createAutomationRunStore(tx.store, storage.workspaceId);
      const fresh: AgentAutomationRunRecord = (await store.get(ref.ownerId, ref.runId)) ?? run;
      await store.save({ ...fresh, delivery: { ...fresh.delivery, push: next } });
      if (again) await tx.due.put({ definition: { automationId: run.automationId, channel: "push", version: run.version }, key: dueRef.key, kind: "delivery", nextRunAt: again, ownerId: ref.ownerId, status: "active", updatedAt: now, version: run.version });
      else await tx.due.remove(dueRef);
    });
    return next.state;
  };
  const trace = (next: AgentAutomationPushDelivery, extra: Record<string, unknown> = {}) => emitTrace({
    attempts: next.attempts,
    automationId: run.automationId,
    computedAt: run.computedAt,
    note: "a reminder round: reads this run's own record, the task's state and switch, the owner's notification settings and device registrations; no record content is read, no model is called, nothing is worked out again",
    outcome: next.state,
    reason: next.reason ?? null,
    runId: run.runId,
    scheduledAt: run.scheduledAt,
    targets: (next.targets ?? []).map((target) => ({ attempts: target.attempts, platform: target.platform, state: target.state })),
    type: "push.delivery",
    ...extra,
  });
  const skip = async (reason: AgentAutomationPushReason) => {
    const next: AgentAutomationPushDelivery = { ...push, lastAttemptAt: now, reason, state: "skipped" };
    trace(next);
    return finish(next, null);
  };

  // The reminder never goes out before its result: it points at the inbox entry.
  const inbox = run.delivery.inbox.state;
  if (push.state === "pending" && inbox !== "delivered") {
    if (inbox === "pending") return finish(push, new Date(Date.parse(now) + RULE_PUSH_SAFETY_DELAY_MS).toISOString());
    return skip("result_not_sent");
  }

  // 1. Receipts of tickets the push service accepted earlier.
  const access = deps.devices(ref.ownerId);
  for (const target of [...targets.values()]) {
    if (target.receipt !== "pending" || !target.receiptId || !target.deliveredAt) continue;
    const age = Date.parse(now) - Date.parse(target.deliveredAt);
    if (age < RULE_PUSH_RECEIPT_DELAY_MS) continue;
    const channel = deps.channel;
    if (!channel?.getReceipt || !channel.hasReceipts?.(target.platform)) {
      const { receipt: _receipt, ...rest } = target;
      targets.set(target.deviceId, rest);
      continue;
    }
    try {
      const receipt = await channel.getReceipt(target.receiptId, target.platform);
      if (receipt.status === "ok") targets.set(target.deviceId, { ...target, receipt: "verified" });
      else if (receipt.status === "error") {
        // The push service says it did not deliver. A device that is gone, or a refusal that will not change, is not
        // sent again; any other failure is sent once more — at most one resend per device per period.
        const gone = /DeviceNotRegistered/u.test(receipt.error ?? "");
        const lasting = /InvalidCredentials|MessageTooBig|MismatchSenderId/u.test(receipt.error ?? "");
        if (gone) await access?.revoke(target.deviceId).catch(() => undefined);
        const { deliveredAt: _deliveredAt, receipt: _receipt, ...rest } = target;
        const state = gone ? "revoked" : !lasting && (target.attempts ?? 1) < RULE_PUSH_RECEIPT_RESENDS + 1 ? "retry" : "rejected";
        targets.set(target.deviceId, { ...rest, error: (receipt.error ?? "provider receipt error").slice(0, 300), state });
      } else if (age >= RULE_PUSH_RECEIPT_GIVE_UP_MS) {
        const { receipt: _receipt, ...rest } = target;
        targets.set(target.deviceId, rest);
      }
    } catch {
      // A receipt that cannot be read is asked for again later; it never causes a second send.
      if (age >= RULE_PUSH_RECEIPT_GIVE_UP_MS) {
        const { receipt: _receipt, ...rest } = target;
        targets.set(target.deviceId, rest);
      }
    }
  }

  // 2. Sending: the first round, or again to devices the push service explicitly refused.
  let attempts = push.attempts;
  let lastError = push.lastError;
  const wantsSend = push.state === "pending" || [...targets.values()].some((target) => target.state === "retry");
  if (wantsSend) {
    // Looked at again before every send: the task is still there, not paused, and its reminder is still on.
    const ruleRow = await storage.direct.due.get({ key: run.automationId, kind: "rule", ownerId: ref.ownerId });
    const rule = ruleRow ? (ruleRow.definition as unknown as AgentAutomation) : null;
    const off: AgentAutomationPushReason | null = !ruleRow || !rule ? "rule_removed" : ruleRow.status === "paused" ? "rule_paused" : !agentAutomationNotify(rule).push ? "reminder_off" : null;
    if (off && push.state === "pending") return skip(off);
    if (off) {
      for (const target of [...targets.values()]) if (target.state === "retry") targets.set(target.deviceId, { ...target, error: off, state: "rejected" });
    } else {
      const eventKey = pushDeliveryIdOf(run.runId);
      if (push.state === "pending" && deps.policy) {
        const decision = await deps.policy.check(ref.ownerId, { eventKey, now });
        if (decision.send === false) return skip(decision.reason);
      }
      const active = access ? await access.listActive() : [];
      const reachable = deps.channel ? active.filter((device) => deps.channel!.supports(device.platform)) : [];
      // A device that joined after the first round is not sent an old reminder; a refused one is tried again.
      const toSend = reachable.filter((device) => (targets.has(device.deviceId) ? targets.get(device.deviceId)!.state === "retry" : push.state === "pending" && push.attempts === 0));
      // A refused device that is no longer registered has nothing to be retried on.
      for (const target of [...targets.values()]) {
        if (target.state === "retry" && !toSend.some((device) => device.deviceId === target.deviceId)) targets.set(target.deviceId, { ...target, state: "rejected" });
      }
      if (!toSend.length && !targets.size) {
        const next: AgentAutomationPushDelivery = { ...push, lastAttemptAt: now, reason: active.length ? "not_configured" : "no_device", state: "failed", targets: [] };
        trace(next);
        return finish(next, null);
      }
      if (toSend.length) {
        attempts += 1;
        // Counted towards the day's limit once per period: a resend after a receipt does not count again.
        const hadDelivery = push.state === "delivered" || (push.targets ?? []).some((target) => target.state === "delivered");
        // The sentence is in the language of this period's result — the inbox entry it points at — never a language
        // stored with the switch (older records may still carry one; it is ignored).
        const locale: RulePushLocale = run.locale;
        const message = rulePushMessage(locale, run.runId);
        for (const device of toSend) {
          const before = targets.get(device.deviceId);
          const base = { attempts: (before?.attempts ?? 0) + 1, deviceId: device.deviceId, lastAttemptAt: now, platform: device.platform };
          try {
            const ticket = await deps.channel!.send({ ...message, platform: device.platform, token: device.token });
            if (!ticket.receiptId) throw new Error("Missing provider ticket");
            const checkable = !ticket.verified && Boolean(deps.channel!.getReceipt) && deps.channel!.hasReceipts?.(device.platform) === true;
            targets.set(device.deviceId, { ...base, deliveredAt: now, receiptId: ticket.receiptId.slice(0, 200), state: "delivered", ...(ticket.verified ? { receipt: "verified" as const } : checkable ? { receipt: "pending" as const } : {}) });
          } catch (error) {
            const failure = classifyPushError(error);
            lastError = failure.message;
            if (failure.state === "revoked") await access?.revoke(device.deviceId).catch(() => undefined);
            targets.set(device.deviceId, { ...base, error: failure.message, state: failure.state === "retry" && attempts >= RULE_PUSH_MAX_ATTEMPTS ? "rejected" : failure.state });
          }
        }
        if (!hadDelivery && [...targets.values()].some((target) => target.state === "delivered")) await deps.policy?.sent?.(ref.ownerId, { eventKey, now }).catch(() => undefined);
      }
    }
  }

  // 3. The reminder's state from what each device answered.
  const list = [...targets.values()];
  const delivered = list.filter((target) => target.state === "delivered");
  const retry = list.some((target) => target.state === "retry");
  const pendingReceipts = list.filter((target) => target.receipt === "pending" && target.deliveredAt);
  const { reason: _reason, deliveredAt: _deliveredAt, lastError: _lastError, ...kept } = push;
  const base: AgentAutomationPushDelivery = { ...kept, attempts, deliveryId: pushDeliveryIdOf(run.runId), targets: list, ...(attempts > push.attempts ? { lastAttemptAt: now } : {}), ...(lastError ? { lastError } : {}) };
  const next: AgentAutomationPushDelivery = delivered.length
    ? { ...base, deliveredAt: delivered.map((target) => target.deliveredAt!).sort()[0], state: "delivered" }
    : retry
      ? { ...base, state: "pending" }
      : { ...base, reason: reasonOf(list), state: "failed" };
  const again = retry
    ? new Date(Date.parse(now) + pushBackoffMs(attempts)).toISOString()
    : pendingReceipts.length
      ? new Date(Math.max(Date.parse(now) + 60_000, Math.min(...pendingReceipts.map((target) => Date.parse(target.deliveredAt!) + RULE_PUSH_RECEIPT_DELAY_MS)))).toISOString()
      : null;
  trace(next, { nextAttemptAt: again });
  return finish(next, again);
}
