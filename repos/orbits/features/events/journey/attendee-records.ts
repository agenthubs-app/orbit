/**
 * R27 参加者的三个小集合：興味なし（契约 9，`eventRecommendationFeedback`）、主办关注（`organizerFollows`，§10 A2）、
 * 会う準備清单（`eventPrepChecklists`，两端同步）。Owner: 甲 (R27).
 * - 興味なし：一人一场一条（record id = 人 × 活动）；同一幂等键重放返回第一次的结果，不重复写；换理由 = 覆盖。
 * - 关注：一人一主办一条；POST / DELETE 都幂等。
 * - 清单：固定 5 项模板；只存勾选与「資料」一项的文字；名刺余量从不进服务端。
 * - 会場メモ（自分だけ）：一人一场一条，存 参加者 id → 一行メモ（`eventVenueMemos`）。
 */
import { createHash } from "node:crypto";

import type { EventRecommendationDismissReason, EventRecommendationDismissResult } from "../../../shared/contract/event-recommendation-feedback";
import type { EventDiscoverArea, EventDiscoverTheme } from "../../../shared/contract/event-discover";
import type { EventPrepChecklistItem, EventPrepChecklistKey } from "../../../shared/contract/event-prep";
import type { OrganizerFollowResult } from "../../../shared/contract/organizer-follow";
import type { ActorRecordStore } from "../actor-records/store";
import type { DiscoverFeedbackEntry } from "./discover-core";

const digest = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);

interface FeedbackPayload extends Record<string, unknown> {
  eventId: string;
  organizerId: string | null;
  reason: EventRecommendationDismissReason;
  dismissedAt: string;
  idempotencyKey: string;
  startsAt: string | null;
  area: EventDiscoverArea | null;
  themes: EventDiscoverTheme[];
}

export const FEEDBACK_READ_LIMIT = 200;

export function createEventFeedbackService(deps: { store: ActorRecordStore; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());
  return {
    async dismiss(actorId: string, input: { eventId: string; reason: EventRecommendationDismissReason; idempotencyKey: string; facts: { organizerId?: string | null; startsAt?: string | null; area?: EventDiscoverArea | null; themes?: readonly EventDiscoverTheme[] } }): Promise<EventRecommendationDismissResult> {
      const recordId = `erf:${digest(actorId, input.eventId)}`;
      const existing = await deps.store.get<FeedbackPayload>("eventRecommendationFeedback", actorId, recordId);
      if (existing && !existing.deleted && (existing.payload.idempotencyKey === input.idempotencyKey || existing.payload.reason === input.reason)) {
        return { dismissedAt: existing.payload.dismissedAt, eventId: existing.payload.eventId, reason: existing.payload.reason };
      }
      const at = now().toISOString();
      const payload: FeedbackPayload = {
        area: input.facts.area ?? null,
        dismissedAt: at,
        eventId: input.eventId,
        idempotencyKey: input.idempotencyKey,
        organizerId: input.facts.organizerId ?? null,
        reason: input.reason,
        startsAt: input.facts.startsAt ?? null,
        themes: [...(input.facts.themes ?? [])],
      };
      await deps.store.put("eventRecommendationFeedback", actorId, recordId, payload, at);
      return { dismissedAt: at, eventId: input.eventId, reason: input.reason };
    },
    async entries(actorId: string): Promise<DiscoverFeedbackEntry[]> {
      const rows = await deps.store.list<FeedbackPayload>("eventRecommendationFeedback", actorId, FEEDBACK_READ_LIMIT);
      return rows.map(({ payload }) => ({ area: payload.area, eventId: payload.eventId, organizerId: payload.organizerId, reason: payload.reason, startsAt: payload.startsAt, themes: payload.themes }));
    },
  };
}

interface FollowPayload extends Record<string, unknown> { organizerId: string; followedAt: string }

export function createOrganizerFollowService(deps: { store: ActorRecordStore; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());
  const recordId = (actorId: string, organizerId: string) => `ofl:${digest(actorId, organizerId)}`;
  return {
    async follow(actorId: string, organizerId: string): Promise<OrganizerFollowResult> {
      const existing = await deps.store.get<FollowPayload>("organizerFollows", actorId, recordId(actorId, organizerId));
      if (existing && !existing.deleted) return { followedAt: existing.payload.followedAt, following: true, organizerId };
      const at = now().toISOString();
      await deps.store.put("organizerFollows", actorId, recordId(actorId, organizerId), { followedAt: at, organizerId }, at);
      return { followedAt: at, following: true, organizerId };
    },
    async unfollow(actorId: string, organizerId: string): Promise<OrganizerFollowResult> {
      const existing = await deps.store.get<FollowPayload>("organizerFollows", actorId, recordId(actorId, organizerId));
      if (existing && !existing.deleted) await deps.store.remove("organizerFollows", actorId, recordId(actorId, organizerId), now().toISOString());
      return { followedAt: null, following: false, organizerId };
    },
    async followed(actorId: string): Promise<Set<string>> {
      const rows = await deps.store.list<FollowPayload>("organizerFollows", actorId, 500);
      return new Set(rows.map((row) => row.payload.organizerId));
    },
  };
}

export const PREP_CHECKLIST_TEMPLATE: readonly EventPrepChecklistKey[] = ["cards", "intro", "materials", "qr", "return"];

interface ChecklistPayload extends Record<string, unknown> { eventId: string; items: EventPrepChecklistItem[] }

export function normalizeChecklist(items: readonly EventPrepChecklistItem[] | null | undefined): EventPrepChecklistItem[] {
  return PREP_CHECKLIST_TEMPLATE.map((key) => {
    const found = items?.find((item) => item.key === key);
    const label = key === "materials" ? (found?.label?.trim() || null) : null;
    return { done: Boolean(found?.done), key, ...(label ? { label } : {}) };
  });
}

export function createPrepChecklistService(deps: { store: ActorRecordStore; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());
  const recordId = (actorId: string, eventId: string) => `epc:${digest(actorId, eventId)}`;
  return {
    async read(actorId: string, eventId: string): Promise<EventPrepChecklistItem[]> {
      const row = await deps.store.get<ChecklistPayload>("eventPrepChecklists", actorId, recordId(actorId, eventId));
      return normalizeChecklist(row && !row.deleted ? row.payload.items : null);
    },
    /** Merges the patched items over the stored ones (both clients can tick different rows). */
    async patch(actorId: string, eventId: string, items: readonly EventPrepChecklistItem[]): Promise<EventPrepChecklistItem[]> {
      const current = await this.read(actorId, eventId);
      const merged = normalizeChecklist(current.map((item) => items.find((patch) => patch.key === item.key) ?? item));
      const at = now().toISOString();
      await deps.store.put("eventPrepChecklists", actorId, recordId(actorId, eventId), { eventId, items: merged }, at);
      return merged;
    },
  };
}

interface VenueMemoPayload extends Record<string, unknown> {
  eventId: string;
  memos: Record<string, string>;
}

export function createVenueMemoService(deps: { store: ActorRecordStore; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());
  const recordId = (actorId: string, eventId: string) => `evm:${digest(actorId, eventId)}`;
  const read = async (actorId: string, eventId: string): Promise<Record<string, string>> => {
    const row = await deps.store.get<VenueMemoPayload>("eventVenueMemos", actorId, recordId(actorId, eventId));
    return row && !row.deleted ? { ...row.payload.memos } : {};
  };
  return {
    read,
    /** Empty text clears the memo. */
    async put(actorId: string, eventId: string, attendeeId: string, text: string): Promise<string | null> {
      const memos = await read(actorId, eventId);
      const value = text.trim();
      if (value) memos[attendeeId] = value; else delete memos[attendeeId];
      await deps.store.put("eventVenueMemos", actorId, recordId(actorId, eventId), { eventId, memos }, now().toISOString());
      return value || null;
    },
  };
}
