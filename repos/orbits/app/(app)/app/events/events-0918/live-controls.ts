"use client";

/**
 * 现场屏写操作：签到 + 交换联系方式（申请 / 同意 / 拒绝 / 撤回）。
 * fetch 逻辑与状态同步原样搬自旧 party/event-operations-controls.tsx（已于 2026-09-22 随 /app/party* 删除）；
 * 这里只剩数据与状态（hook），渲染在 event-live.tsx（Task 5 的弹窗复用同一 hook）。
 */
import { useEffect, useState } from "react";

import type { OrbitPartyPersonView } from "../../orbit-party-route-view-model";

type Translate = (copy: { en: string; zh: string }) => string;

export interface ContactRequestStateDetail {
  contactId: string | null;
  direction: OrbitPartyPersonView["contactRequestDirection"];
  eventId: string;
  participantId: string;
  requestId: string | null;
  revision: number | null;
  status: OrbitPartyPersonView["contactRequestStatus"];
}

const contactRequestStateListeners = new Set<
  (detail: ContactRequestStateDetail) => void
>();
/**
 * 最近一次写操作的结果，按 `<eventId> <participantId>` 缓存（终审 M1：原来按 person 对象 WeakMap，
 * 同一参会者在另一页签 / 弹窗里是另一个对象 → 读不到，只能靠监听器；晚挂载的实例会种子成旧状态）。
 */
const contactRequestStateByKey = new Map<string, ContactRequestStateDetail>();

export function contactRequestStateKey(eventId: string, participantId: string): string {
  return `${eventId} ${participantId}`;
}

/** 测试 / 页面卸载用：清空模块级缓存。 */
export function resetContactRequestStateCache(): void {
  contactRequestStateByKey.clear();
}

function publishContactRequestState(detail: ContactRequestStateDetail) {
  contactRequestStateByKey.set(contactRequestStateKey(detail.eventId, detail.participantId), detail);
  for (const listener of contactRequestStateListeners) {
    listener(detail);
  }
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success?: boolean;
}

export async function postJson<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
    method: "POST",
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !envelope?.data) {
    throw new Error(
      envelope?.error?.message ?? `Request failed with status ${response.status}.`,
    );
  }
  return envelope.data;
}

export interface ContactRequestControlState {
  busy: boolean;
  canRespond: boolean;
  canWithdraw: boolean;
  contactId: string | null;
  createRequest: () => Promise<void>;
  direction: OrbitPartyPersonView["contactRequestDirection"];
  error: string | null;
  requestId: string | null;
  respond: (accept: boolean) => Promise<void>;
  status: OrbitPartyPersonView["contactRequestStatus"];
  withdraw: () => Promise<void>;
}

/**
 * 一人一份的交换联系方式状态机（搬自 EventContactRequestControl）。
 * 同一参会者在推荐 / 名单 / 图谱多处渲染时，通过模块级监听器保持同步。
 */
export function useEventContactRequest({
  eventId,
  person,
  t,
}: {
  eventId: string;
  person: OrbitPartyPersonView;
  t: Translate;
}): ContactRequestControlState {
  const cachedState = contactRequestStateByKey.get(contactRequestStateKey(eventId, person.id));
  const [localRequestId, setLocalRequestId] = useState<string | null>(
    cachedState?.requestId ?? null,
  );
  const [localContactId, setLocalContactId] = useState<string | null>(
    cachedState?.contactId ?? null,
  );
  const [localDirection, setLocalDirection] = useState<
    OrbitPartyPersonView["contactRequestDirection"] | null
  >(cachedState?.direction ?? null);
  const [localRevision, setLocalRevision] = useState<number | null>(
    cachedState?.revision ?? null,
  );
  const [localStatus, setLocalStatus] = useState<
    OrbitPartyPersonView["contactRequestStatus"] | null
  >(cachedState?.status ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = localRequestId ?? person.contactRequestId;
  const revision = localRevision ?? person.contactRequestRevision;
  const contactId = localContactId ?? person.contactId;
  const direction = localDirection ?? person.contactRequestDirection;
  // A contact id is the canonical, owner-scoped outcome of an accepted
  // exchange. It must win over a stale request projection so every live
  // surface renders the same state after publication or refresh.
  const status = contactId
    ? "accepted"
    : (localStatus ?? person.contactRequestStatus);

  useEffect(() => {
    const latest = contactRequestStateByKey.get(contactRequestStateKey(eventId, person.id));
    setLocalRequestId(latest?.requestId ?? null);
    setLocalContactId(latest?.contactId ?? null);
    setLocalDirection(latest?.direction ?? null);
    setLocalRevision(latest?.revision ?? null);
    setLocalStatus(latest?.status ?? null);
    setBusy(false);
    setError(null);
  }, [eventId, person, person.contactId, person.contactRequestId, person.contactRequestRevision, person.contactRequestStatus, person.id]);

  useEffect(() => {
    const synchronize = (detail: ContactRequestStateDetail) => {
      if (
        detail.eventId !== eventId ||
        detail.participantId !== person.id
      ) {
        return;
      }
      setLocalRequestId(detail.requestId);
      setLocalContactId(detail.contactId);
      setLocalDirection(detail.direction);
      setLocalRevision(detail.revision);
      setLocalStatus(detail.status);
    };
    contactRequestStateListeners.add(synchronize);
    return () => {
      contactRequestStateListeners.delete(synchronize);
    };
  }, [eventId, person.id]);

  async function createRequest() {
    setBusy(true);
    setError(null);
    try {
      const request = await postJson<{ requestId: string; revision: number }>(
        `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests`,
        { expectedRevision: revision, targetParticipantId: person.id },
      );
      setLocalRequestId(request.requestId);
      setLocalDirection("outgoing");
      setLocalRevision(request.revision);
      setLocalStatus("awaiting_target_consent");
      publishContactRequestState({
        contactId: null,
        direction: "outgoing",
        eventId,
        participantId: person.id,
        requestId: request.requestId,
        revision: request.revision,
        status: "awaiting_target_consent",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function respond(accept: boolean) {
    setBusy(true);
    setError(null);
    const responseRequestId = requestId ?? person.contactRequestId;
    if (!responseRequestId) {
      setError(
        t({
          en: "This contact request is missing its persisted request id. Refresh the live screen before retrying.",
          zh: "此联系申请缺少已持久化的申请 ID，请刷新现场页后重试。",
        }),
      );
      setBusy(false);
      return;
    }
    try {
      if (revision === null) {
        throw new Error("This contact request is missing its lifecycle revision. Refresh the live screen before retrying.");
      }
      const request = await postJson<{
        contactId: string | null;
        revision: number;
        status: OrbitPartyPersonView["contactRequestStatus"];
      }>(
        `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests/${encodeURIComponent(responseRequestId)}/respond`,
        { accept, expectedRevision: revision },
      );
      setLocalStatus(request.status);
      setLocalContactId(request.contactId);
      setLocalRevision(request.revision);
      publishContactRequestState({
        contactId: request.contactId,
        direction: person.contactRequestDirection,
        eventId,
        participantId: person.id,
        requestId: responseRequestId,
        revision: request.revision,
        status: request.status,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Response failed.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setError(null);
    if (!requestId) {
      setError(
        t({
          en: "This contact request is missing its persisted request id. Refresh the live screen before retrying.",
          zh: "此联系申请缺少已持久化的申请 ID，请刷新现场页后重试。",
        }),
      );
      setBusy(false);
      return;
    }
    try {
      if (revision === null) {
        throw new Error("This contact request is missing its lifecycle revision. Refresh the live screen before retrying.");
      }
      const request = await postJson<{
        contactId: string | null;
        revision: number;
        status: OrbitPartyPersonView["contactRequestStatus"];
      }>(
        `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests/${encodeURIComponent(requestId)}/withdraw`,
        { expectedRevision: revision },
      );
      setLocalContactId(request.contactId);
      setLocalRevision(request.revision);
      setLocalStatus(request.status);
      publishContactRequestState({
        contactId: request.contactId,
        direction: "outgoing",
        eventId,
        participantId: person.id,
        requestId,
        revision: request.revision,
        status: request.status,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Withdrawal failed.");
    } finally {
      setBusy(false);
    }
  }

  const canRespond =
    direction === "incoming" &&
    (status === "incoming" || status === "awaiting_target_consent");
  const canWithdraw =
    direction === "outgoing" &&
    status === "awaiting_target_consent";

  return { busy, canRespond, canWithdraw, contactId, createRequest, direction, error, requestId, respond, status, withdraw };
}

export interface CheckInControlState {
  busy: boolean;
  checkIn: () => Promise<void>;
  error: string | null;
  recordedAt: string | null;
}

/** 签到（搬自 EventCheckInControl）：同一报名只写入一次；重复操作返回已有记录（the same registration is written once; repeating returns the existing check-in record）。 */
export function useEventCheckIn({
  checkedInAt,
  eventId,
}: {
  checkedInAt: string | null;
  eventId: string;
}): CheckInControlState {
  const [recordedAt, setRecordedAt] = useState(checkedInAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkIn() {
    setBusy(true);
    setError(null);
    try {
      const record = await postJson<{ checkedInAt: string }>(
        `/api/events/${encodeURIComponent(eventId)}/operations/check-in`,
      );
      setRecordedAt(record.checkedInAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, checkIn, error, recordedAt };
}
