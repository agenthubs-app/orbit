"use client";

import { useEffect, useState } from "react";

import type { OrbitPartyPersonView } from "../orbit-party-route-view-model";
import { formatOrbitPartyDateTime } from "./party-date-time";
import { Icon } from "../orbit-reference-primitives";

type Translate = (copy: { en: string; zh: string }) => string;

interface ContactRequestStateDetail {
  contactId: string | null;
  eventId: string;
  participantId: string;
  requestId: string | null;
  status: OrbitPartyPersonView["contactRequestStatus"];
}

const contactRequestStateListeners = new Set<
  (detail: ContactRequestStateDetail) => void
>();

function publishContactRequestState(detail: ContactRequestStateDetail) {
  for (const listener of contactRequestStateListeners) {
    listener(detail);
  }
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success?: boolean;
}

async function postJson<T>(url: string, body?: Record<string, unknown>): Promise<T> {
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

export function EventContactRequestControl({
  eventId,
  person,
  t,
}: {
  eventId: string;
  person: OrbitPartyPersonView;
  t: Translate;
}) {
  const [localRequestId, setLocalRequestId] = useState<string | null>(null);
  const [localContactId, setLocalContactId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<
    OrbitPartyPersonView["contactRequestStatus"] | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = localRequestId ?? person.contactRequestId;
  const contactId = localContactId ?? person.contactId;
  // A contact id is the canonical, owner-scoped outcome of an accepted
  // exchange. It must win over a stale request projection so every Party
  // surface renders the same state after publication or refresh.
  const status = contactId
    ? "accepted"
    : (localStatus ?? person.contactRequestStatus);

  useEffect(() => {
    setLocalRequestId(null);
    setLocalContactId(null);
    setLocalStatus(null);
    setBusy(false);
    setError(null);
  }, [person.contactId, person.contactRequestId, person.contactRequestStatus, person.id]);

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
      const request = await postJson<{ requestId: string }>(
        `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests`,
        { targetParticipantId: person.id },
      );
      setLocalRequestId(request.requestId);
      setLocalStatus("awaiting_target_consent");
      publishContactRequestState({
        contactId: null,
        eventId,
        participantId: person.id,
        requestId: request.requestId,
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
          en: "This contact request is missing its persisted request id. Refresh Party before retrying.",
          zh: "此联系申请缺少已持久化的申请 ID，请刷新 Party 后重试。",
        }),
      );
      setBusy(false);
      return;
    }
    try {
      const request = await postJson<{
        contactId: string | null;
        status: OrbitPartyPersonView["contactRequestStatus"];
      }>(
        `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests/${encodeURIComponent(responseRequestId)}/respond`,
        { accept },
      );
      setLocalStatus(request.status);
      setLocalContactId(request.contactId);
      publishContactRequestState({
        contactId: request.contactId,
        eventId,
        participantId: person.id,
        requestId: responseRequestId,
        status: request.status,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Response failed.");
    } finally {
      setBusy(false);
    }
  }

  const canRespond =
    person.contactRequestDirection === "incoming" &&
    (status === "incoming" || status === "awaiting_target_consent");

  return (
    <div
      aria-busy={busy}
      data-event-contact-participant={person.id}
      data-event-contact-request-id={requestId ?? ""}
      style={{ display: "grid", gap: 6 }}
    >
      {status === "none" ? (
        <button className="btn btn-primary btn-sm" data-event-contact-action="request" disabled={busy} onClick={createRequest} type="button">
          <Icon color="var(--on-dark)" name="users" size={15} />
          {busy
            ? t({ en: "Sending…", zh: "发送中…" })
            : t({ en: "Request contact", zh: "申请交换联系信息" })}
        </button>
      ) : null}
      {canRespond ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button aria-busy={busy} className="btn btn-primary btn-sm" data-event-contact-action="accept" disabled={busy} onClick={() => respond(true)} type="button">
            {busy
              ? t({ en: "Saving…", zh: "保存中…" })
              : t({ en: "Accept", zh: "同意" })}
          </button>
          <button className="btn btn-ghost btn-sm" data-event-contact-action="decline" disabled={busy} onClick={() => respond(false)} type="button">
            {t({ en: "Decline", zh: "拒绝" })}
          </button>
        </div>
      ) : null}
      {status === "awaiting_target_consent" ? (
        <span className="chip">{t({ en: "Waiting for their consent", zh: "等待对方授权" })}</span>
      ) : null}
      {status === "accepted" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span className="chip chip-accent">{t({ en: "Contact exchange accepted", zh: "双方已同意交换联系信息" })}</span>
          {contactId ? (
            <a className="btn btn-primary btn-sm" href={`/app/contacts/${encodeURIComponent(contactId)}`}>
              {t({ en: "Open contact", zh: "打开联系人" })}
            </a>
          ) : null}
        </div>
      ) : null}
      {status === "declined" ? (
        <span className="chip">{t({ en: "Contact request declined", zh: "联系申请已拒绝" })}</span>
      ) : null}
      {error ? <span role="alert" style={{ color: "var(--rose)", fontSize: 12 }}>{error}</span> : null}
    </div>
  );
}

export function EventCheckInControl({
  checkedInAt,
  enabled,
  eventId,
  t,
}: {
  checkedInAt: string | null;
  enabled: boolean;
  eventId: string;
  t: Translate;
}) {
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

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {recordedAt ? (
        <div className="chip chip-accent" role="status">
          {t({ en: "Checked in", zh: "已签到" })} · {formatOrbitPartyDateTime(recordedAt)}
        </div>
      ) : (
        <button className="btn btn-primary btn-lg btn-block" disabled={!enabled || busy} onClick={checkIn} type="button">
          <Icon color="var(--on-accent)" name="ticket" size={18} />
          {busy
            ? t({ en: "Checking in…", zh: "签到中…" })
            : enabled
              ? t({ en: "Check in now", zh: "立即签到" })
              : t({ en: "Check-in window is closed", zh: "当前不在签到时间内" })}
        </button>
      )}
      <p style={{ color: "var(--text-3)", fontSize: 12, lineHeight: 1.6, margin: 0 }}>
        {t({
          en: "The same registration is written once; repeating this action returns the existing check-in record.",
          zh: "同一报名只写入一次；重复操作会返回已有签到记录。",
        })}
      </p>
      {error ? <span role="alert" style={{ color: "var(--rose)", fontSize: 12 }}>{error}</span> : null}
    </div>
  );
}
