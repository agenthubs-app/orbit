"use client";

import { useEffect, useState } from "react";

import type { OrbitPartyPersonView } from "../orbit-party-route-view-model";
import { OrbitAppointmentNegotiation } from "../events/[id]/orbit-appointment-negotiation";
import { OrbitEncounterCapture } from "../events/[id]/orbit-encounter-capture";
import { formatOrbitPartyDateTime } from "./party-date-time";
import { Icon } from "../orbit-reference-primitives";

type Translate = (copy: { en: string; zh: string }) => string;

interface ContactRequestStateDetail {
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
const contactRequestStateByPerson = new WeakMap<
  OrbitPartyPersonView,
  ContactRequestStateDetail
>();

function publishContactRequestState(
  person: OrbitPartyPersonView,
  detail: ContactRequestStateDetail,
) {
  contactRequestStateByPerson.set(person, detail);
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
  contactRequestsOpen = true,
  eventId,
  person,
  showAcceptedWorkflow = false,
  t,
}: {
  contactRequestsOpen?: boolean;
  eventId: string;
  person: OrbitPartyPersonView;
  showAcceptedWorkflow?: boolean;
  t: Translate;
}) {
  const cachedState = contactRequestStateByPerson.get(person);
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
  // exchange. It must win over a stale request projection so every Party
  // surface renders the same state after publication or refresh.
  const status = contactId
    ? "accepted"
    : (localStatus ?? person.contactRequestStatus);

  useEffect(() => {
    const latest = contactRequestStateByPerson.get(person);
    setLocalRequestId(latest?.requestId ?? null);
    setLocalContactId(latest?.contactId ?? null);
    setLocalDirection(latest?.direction ?? null);
    setLocalRevision(latest?.revision ?? null);
    setLocalStatus(latest?.status ?? null);
    setBusy(false);
    setError(null);
  }, [person.contactId, person.contactRequestId, person.contactRequestRevision, person.contactRequestStatus, person.id]);

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
      publishContactRequestState(person, {
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
          en: "This contact request is missing its persisted request id. Refresh Party before retrying.",
          zh: "此联系申请缺少已持久化的申请 ID，请刷新 Party 后重试。",
        }),
      );
      setBusy(false);
      return;
    }
    try {
      if (revision === null) {
        throw new Error("This contact request is missing its lifecycle revision. Refresh Party before retrying.");
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
      publishContactRequestState(person, {
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
          en: "This contact request is missing its persisted request id. Refresh Party before retrying.",
          zh: "此联系申请缺少已持久化的申请 ID，请刷新 Party 后重试。",
        }),
      );
      setBusy(false);
      return;
    }
    try {
      if (revision === null) {
        throw new Error("This contact request is missing its lifecycle revision. Refresh Party before retrying.");
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
      publishContactRequestState(person, {
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

  return (
    <div
      aria-busy={busy}
      data-event-contact-participant={person.id}
      data-event-contact-request-id={requestId ?? ""}
      style={{ display: "grid", gap: 6, minWidth: 0 }}
    >
      {status === "none" ? (
        <button className={contactRequestsOpen ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} data-event-contact-action="request" disabled={busy || !contactRequestsOpen} onClick={createRequest} type="button">
          <Icon color="var(--on-dark)" name="users" size={15} />
          {busy
            ? t({ en: "Sending…", zh: "发送中…" })
            : contactRequestsOpen
              ? t({ en: "Request contact", zh: "申请交换联系信息" })
              : t({ en: "Contact requests open when the event starts", zh: "活动开始后可申请交换联系" })}
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span className="chip">{t({ en: "Waiting for their consent", zh: "等待对方授权" })}</span>
          {canWithdraw ? <button className="btn btn-ghost btn-sm" data-event-contact-action="withdraw" disabled={busy} onClick={() => void withdraw()} type="button">{t({ en: "Withdraw request", zh: "撤回申请" })}</button> : null}
        </div>
      ) : null}
      {status === "accepted" ? (
        showAcceptedWorkflow ? (
          <div data-party-post-contact-workflow style={{ display: "grid", gap: 12 }}>
            <span className="chip chip-accent" style={{ justifySelf: "start" }}>{t({ en: "Contact exchange accepted", zh: "双方已同意交换联系信息" })}</span>
            {contactId ? (
              <>
              <OrbitEncounterCapture contactId={contactId} eventId={eventId} />
              <div data-party-appointment-action style={{ display: "grid", gap: 7 }}>
                <strong style={{ fontSize: 14 }}>{t({ en: "Start / manage appointment", zh: "发起/管理约谈" })}</strong>
                {requestId ? (
                  <OrbitAppointmentNegotiation
                    contactId={contactId}
                    eventContactRequestId={requestId}
                    eventId={eventId}
                  />
                ) : (
                  <p role="alert" style={{ color: "var(--text-3)", fontSize: 12, margin: 0 }}>
                    {t({
                      en: "The accepted exchange is missing its request id. Refresh Party before scheduling.",
                      zh: "这次已接受的名片交换缺少申请 ID，请刷新 Party 后再发起约谈。",
                    })}
                  </p>
                )}
              </div>
              <a className="btn btn-primary btn-sm" href={`/app/contacts/${encodeURIComponent(contactId)}`} style={{ justifySelf: "start" }}>
                {t({ en: "Open contact", zh: "打开联系人" })}
              </a>
              </>
            ) : null}
          </div>
        ) : (
          <div data-party-accepted-contact-summary style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span className="chip chip-accent">{t({ en: "Contact exchange accepted", zh: "双方已同意交换联系信息" })}</span>
            {contactId ? (
              <a className="btn btn-primary btn-sm" href={`/app/contacts/${encodeURIComponent(contactId)}`} style={{ justifySelf: "start" }}>
                {t({ en: "Open contact", zh: "打开联系人" })}
              </a>
            ) : null}
          </div>
        )
      ) : null}
      {status === "declined" ? (
        <span className="chip">{t({ en: "Contact request declined", zh: "联系申请已拒绝" })}</span>
      ) : null}
      {status === "withdrawn" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span className="chip">{t({ en: "Contact request withdrawn", zh: "联系申请已撤回" })}</span>
          {direction === "outgoing" ? <button className={contactRequestsOpen ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} data-event-contact-action="request-again" disabled={busy || !contactRequestsOpen} onClick={() => void createRequest()} type="button">{contactRequestsOpen ? t({ en: "Request contact again", zh: "再次申请交换联系信息" }) : t({ en: "Contact requests open when the event starts", zh: "活动开始后可再次申请交换联系" })}</button> : null}
        </div>
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
