"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { OrbitAppointmentNegotiation } from "./orbit-appointment-negotiation";
import { OrbitEncounterCapture } from "./orbit-encounter-capture";
import { OrbitPostEventCenter } from "./orbit-post-event-center";

type Participant = {
  company: string | null;
  displayName: string;
  experienceHighlight: string | null;
  industry: string | null;
  languages: readonly string[];
  needs: readonly string[];
  offers: readonly string[];
  participantId: string;
  role: string | null;
  topics: readonly string[];
};

type ContactRequest = {
  contactId: string | null;
  requestId: string;
  revision: number;
  requesterParticipantId: string;
  status: "awaiting_target_consent" | "accepted" | "declined" | "withdrawn";
  targetParticipantId: string;
};

type Recommendation = {
  icebreakers: readonly string[];
  memberHint: string;
  reasons: readonly string[];
  score: number;
  targetParticipantId: string;
};

type Table = {
  icebreakers: readonly string[];
  memberPrompts: Readonly<Record<string, readonly string[]>>;
  memberRationales: Readonly<Record<string, string>>;
  members: readonly { participantId: string; seat: string }[];
  rationale: string;
  tableNumber: number;
  theme: string;
};

type OperationsWorkspace = {
  configuration: {
    eventEndsAt: string;
    profileEditDeadlineAt: string;
    resultsAvailableAt: string;
  };
  contactRequests: readonly ContactRequest[];
  directory: readonly Participant[];
  me: Participant;
  recommendations: {
    noMatchReason: string | null;
    recommendations: readonly Recommendation[];
    sourceParticipantId: string;
  } | null;
  resultsState: "locked" | "not_generated" | "processing" | "failed" | "ready";
  roundOneTable: Table | null;
  roundTwoTable: Table | null;
};

function CandidateContactAction({
  busy,
  canWithdraw,
  contactRequestsOpen,
  participantId,
  request,
  onRequest,
  onWithdraw,
}: {
  busy: boolean;
  canWithdraw: boolean;
  contactRequestsOpen: boolean;
  participantId: string;
  request: ContactRequest | null;
  onRequest: (participantId: string, expectedRevision: number | null) => Promise<void>;
  onWithdraw: (requestId: string, expectedRevision: number) => Promise<void>;
}) {
  const { t } = useOrbitLanguage();

  if (!request) {
    return (
      <button
        className={contactRequestsOpen ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
        data-contact-request-state="none"
        disabled={busy || !contactRequestsOpen}
        onClick={() => void onRequest(participantId, null)}
        type="button"
      >
        {contactRequestsOpen
          ? t({ en: "Request business card", zh: "申请交换名片" })
          : t({ en: "Contact requests open when the event starts", zh: "活动开始后可申请交换联系" })}
      </button>
    );
  }

  if (request.status === "awaiting_target_consent") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button aria-live="polite" className="btn btn-ghost btn-sm" data-contact-request-state="awaiting_target_consent" disabled type="button">{t({ en: "Waiting for their consent", zh: "等待对方同意" })}</button>
        {canWithdraw ? <button className="btn btn-ghost btn-sm" data-contact-request-action="withdraw" disabled={busy} onClick={() => void onWithdraw(request.requestId, request.revision)} type="button">{t({ en: "Withdraw request", zh: "撤回申请" })}</button> : null}
      </div>
    );
  }

  if (request.status === "accepted") {
    return (
      <a
        className="btn btn-primary btn-sm"
        data-contact-request-state="accepted"
        href={request.contactId
          ? `/app/contacts/${encodeURIComponent(request.contactId)}`
          : "/app/contacts"}
      >
        {t({ en: "Open contact", zh: "打开联系人" })}
      </a>
    );
  }

  if (request.status === "withdrawn") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <span className="chip" data-contact-request-state="withdrawn">{t({ en: "Request withdrawn", zh: "申请已撤回" })}</span>
        {canWithdraw ? <button className={contactRequestsOpen ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} disabled={busy || !contactRequestsOpen} onClick={() => void onRequest(participantId, request.revision)} type="button">{contactRequestsOpen ? t({ en: "Request again", zh: "再次申请" }) : t({ en: "Contact requests open when the event starts", zh: "活动开始后可再次申请" })}</button> : null}
      </div>
    );
  }

  return (
    <button
      className="btn btn-ghost btn-sm"
      data-contact-request-state="declined"
      disabled
      type="button"
    >
      {t({ en: "Request declined", zh: "对方暂不交换" })}
    </button>
  );
}

type ParticipantDetail = {
  company: string | null;
  contactRequest: {
    contactId: string | null;
    direction: "incoming" | "outgoing" | null;
    requestId: string | null;
    revision: number | null;
    status: "none" | "awaiting_target_consent" | "accepted" | "declined" | "withdrawn";
  };
  displayName: string;
  industry: string | null;
  participantId: string;
  placements: readonly {
    groupingRationale: string | null;
    icebreakers: readonly string[];
    roundNumber: 1 | 2;
    seat: string;
    tableNumber: number;
    theme: string;
  }[];
  profileVersion: number | null;
  recommendation: {
    icebreakers: readonly string[];
    memberHint: string;
    reasons: readonly string[];
    score: number;
  } | null;
  responses: readonly {
    answer: string;
    fieldKey: string;
    label: { en: string; zh: string };
    prompt: string | null;
  }[];
  role: string | null;
  sourceContext: "current_profile" | "published_generation";
  topics: readonly string[];
};

function messageFrom(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "message" in value.error &&
    typeof value.error.message === "string"
  ) {
    return value.error.message;
  }
  return "请求没有完成，请稍后再试。";
}

function formatGate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ParticipantDetailPanel({
  busy,
  contactRequestsOpen,
  detail,
  onClose,
  onRequest,
  onRespond,
  onWithdraw,
  eventId,
}: {
  busy: boolean;
  contactRequestsOpen: boolean;
  detail: ParticipantDetail;
  onClose: () => void;
  onRequest: (participantId: string, expectedRevision: number | null) => Promise<void>;
  onRespond: (requestId: string, accept: boolean, expectedRevision: number) => Promise<void>;
  onWithdraw: (requestId: string, expectedRevision: number) => Promise<void>;
  eventId: string;
}) {
  const { language, t } = useOrbitLanguage();
  const contact = detail.contactRequest;

  return (
    <div
      aria-label={t({ en: "Participant detail", zh: "参会者详情" })}
      aria-modal="true"
      data-event-participant-detail={detail.participantId}
      onClick={onClose}
      role="dialog"
      style={{
        alignItems: "center",
        background: "color-mix(in srgb, var(--ink) 38%, transparent)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        padding: 20,
        position: "fixed",
        zIndex: "var(--z-modal)",
      }}
    >
      <article
        className="card"
        onClick={(event) => event.stopPropagation()}
        style={{
          display: "grid",
          gap: 18,
          maxHeight: "min(760px, calc(100dvh - 40px))",
          maxWidth: 720,
          overflow: "auto",
          padding: 20,
          width: "100%",
        }}
      >
        <header style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
          <div>
            <div className="eyebrow">
              {detail.sourceContext === "published_generation"
                ? t({ en: "PUBLISHED EVENT PROFILE", zh: "已发布活动画像" })
                : t({ en: "EVENT PROFILE", zh: "活动画像" })}
            </div>
            <h3 className="h-section" style={{ margin: "4px 0 0" }}>
              {detail.displayName}
            </h3>
            <p style={{ color: "var(--text-3)", fontSize: 13, margin: "4px 0 0" }}>
              {[detail.role, detail.company, detail.industry].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button aria-label={t({ en: "Close", zh: "关闭" })} className="btn btn-ghost btn-sm" onClick={onClose} type="button">
            ×
          </button>
        </header>

        {detail.recommendation ? (
          <section className="card-flat" style={{ display: "grid", gap: 9, padding: 14 }}>
            <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
              <strong>{t({ en: "Why Orbit recommends this person", zh: "Orbit 为什么推荐 TA" })}</strong>
              <span className="chip">{detail.recommendation.score}</span>
            </div>
            <ul style={{ color: "var(--text-2)", fontSize: 13, margin: 0, paddingLeft: 18 }}>
              {detail.recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            {detail.recommendation.icebreakers.length ? (
              <p style={{ color: "var(--text-2)", fontSize: 13, margin: 0 }}>
                <strong>{t({ en: "Opening", zh: "开场建议" })}：</strong>{detail.recommendation.icebreakers.join(" · ")}
              </p>
            ) : null}
          </section>
        ) : null}

        {detail.placements.length ? (
          <section style={{ display: "grid", gap: 8 }}>
            <strong>{t({ en: "Table and seat", zh: "分桌与座位" })}</strong>
            {detail.placements.map((placement) => (
              <div className="card-flat" key={`${placement.roundNumber}-${placement.tableNumber}`} style={{ display: "grid", gap: 6, padding: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  <span className="chip">{t({ en: `Round ${placement.roundNumber}`, zh: `第 ${placement.roundNumber} 轮` })}</span>
                  <span className="chip">{t({ en: `Table ${placement.tableNumber}`, zh: `${placement.tableNumber} 号桌` })}</span>
                  <span className="chip">{t({ en: `Seat ${placement.seat}`, zh: `座位 ${placement.seat}` })}</span>
                </div>
                <strong style={{ fontSize: 14 }}>{placement.theme}</strong>
                {placement.groupingRationale ? <p style={{ color: "var(--text-2)", fontSize: 13, margin: 0 }}>{placement.groupingRationale}</p> : null}
                {placement.icebreakers.length ? <p style={{ color: "var(--text-3)", fontSize: 12, margin: 0 }}>{placement.icebreakers.join(" · ")}</p> : null}
              </div>
            ))}
          </section>
        ) : null}

        <section style={{ display: "grid", gap: 8 }}>
          <strong>{t({ en: "Registration profile", zh: "报名画像" })}</strong>
          {detail.responses.length ? detail.responses.map((response) => (
            <div key={response.fieldKey} style={{ borderTop: "1px solid var(--border)", paddingTop: 9 }}>
              <div style={{ color: "var(--text-3)", fontSize: 12 }}>{response.label[language]}</div>
              {response.prompt ? <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>{response.prompt}</div> : null}
              <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.55, margin: "5px 0 0" }}>{response.answer}</p>
            </div>
          )) : <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>{t({ en: "No shareable profile answers.", zh: "暂无可展示的画像回答。" })}</p>}
        </section>

        <footer style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {contact.status === "none" ? (
            <button className={contactRequestsOpen ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} disabled={busy || !contactRequestsOpen} onClick={() => void onRequest(detail.participantId, null)} type="button">
              {contactRequestsOpen
                ? t({ en: "Request business card", zh: "申请交换名片" })
                : t({ en: "Contact requests open when the event starts", zh: "活动开始后可申请交换联系" })}
            </button>
          ) : null}
          {contact.status === "awaiting_target_consent" && contact.direction === "incoming" && contact.requestId ? (
            <>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void onRespond(contact.requestId!, true, contact.revision!)} type="button">
                {t({ en: "Accept", zh: "同意交换" })}
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void onRespond(contact.requestId!, false, contact.revision!)} type="button">
                {t({ en: "Decline", zh: "暂不交换" })}
              </button>
            </>
          ) : null}
          {contact.status === "awaiting_target_consent" && contact.direction === "outgoing" ? <span style={{ color: "var(--text-2)", fontSize: 13 }}>{t({ en: "Waiting for consent. Contact details remain hidden.", zh: "等待对方同意，联系方式仍保持隐藏。" })}</span> : null}
          {contact.status === "awaiting_target_consent" && contact.direction === "outgoing" && contact.requestId && contact.revision ? <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void onWithdraw(contact.requestId!, contact.revision!)} type="button">{t({ en: "Withdraw request", zh: "撤回申请" })}</button> : null}
          {contact.status === "accepted" ? <a className="btn btn-primary btn-sm" href={contact.contactId ? `/app/contacts/${encodeURIComponent(contact.contactId)}` : "/app/contacts"}>{t({ en: "Open contact", zh: "打开联系人" })}</a> : null}
          {contact.status === "declined" ? <span style={{ color: "var(--text-3)", fontSize: 13 }}>{t({ en: "This request was declined.", zh: "这次名片申请已被婉拒。" })}</span> : null}
          {contact.status === "withdrawn" ? <><span style={{ color: "var(--text-3)", fontSize: 13 }}>{t({ en: "This request was withdrawn.", zh: "这次名片申请已撤回。" })}</span>{contact.direction === "outgoing" && contact.revision ? <button className={contactRequestsOpen ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} disabled={busy || !contactRequestsOpen} onClick={() => void onRequest(detail.participantId, contact.revision)} type="button">{contactRequestsOpen ? t({ en: "Request again", zh: "再次申请" }) : t({ en: "Contact requests open when the event starts", zh: "活动开始后可再次申请" })}</button> : null}</> : null}
        </footer>
        {contact.status === "accepted" && contact.contactId && contact.requestId ? (
          <>
            <OrbitEncounterCapture contactId={contact.contactId} eventId={eventId} />
            <OrbitAppointmentNegotiation
              contactId={contact.contactId}
              eventContactRequestId={contact.requestId}
              eventId={eventId}
            />
          </>
        ) : null}
      </article>
    </div>
  );
}

export function OrbitEventMatchmaking({
  authenticated = true,
  contactRequestsOpen = true,
  eventId,
  registrationOpen = true,
}: {
  authenticated?: boolean;
  contactRequestsOpen?: boolean;
  eventId: string;
  registrationOpen?: boolean;
}) {
  const { t } = useOrbitLanguage();
  const [workspace, setWorkspace] = useState<OperationsWorkspace | null>(null);
  const [detail, setDetail] = useState<ParticipantDetail | null>(null);
  const [loading, setLoading] = useState(authenticated);
  const [unauthorized, setUnauthorized] = useState(!authenticated);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const visibleError = error
    ? t({
        en: "The published event operations data is temporarily unavailable.",
        zh: "当前活动的已发布运营数据暂时不可用。",
      })
    : "";

  const load = useCallback(async () => {
    if (!authenticated) {
      setUnauthorized(true);
      setWorkspace(null);
      return;
    }
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/operations`, { cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      setUnauthorized(true);
      setWorkspace(null);
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { data?: OperationsWorkspace };
    if (!response.ok || !body.data) throw new Error(messageFrom(body));
    setUnauthorized(false);
    setWorkspace(body.data);
  }, [authenticated, eventId]);

  useEffect(() => {
    let active = true;
    setLoading(authenticated);
    setError("");
    void load().catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : messageFrom(loadError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [authenticated, load]);

  const participants = useMemo(() => {
    const byId = new Map(workspace?.directory.map((participant) => [participant.participantId, participant]) ?? []);
    return workspace?.recommendations?.recommendations.map((recommendation) => ({
      participant: byId.get(recommendation.targetParticipantId) ?? null,
      recommendation,
    })) ?? [];
  }, [workspace]);

  async function openParticipant(participantId: string) {
    setWorking(`detail:${participantId}`);
    setError("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/operations/participants/${encodeURIComponent(participantId)}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { data?: ParticipantDetail };
      if (!response.ok || !body.data) throw new Error(messageFrom(body));
      setDetail(body.data);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : messageFrom(detailError));
    } finally {
      setWorking(null);
    }
  }

  async function mutateContact(url: string, body: object, key: string) {
    setWorking(key);
    setError("");
    try {
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const value = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) throw new Error(messageFrom(value));
      await load();
      if (detail) await openParticipant(detail.participantId);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : messageFrom(mutationError));
    } finally {
      setWorking(null);
    }
  }

  const requestContact = (participantId: string, expectedRevision: number | null) => mutateContact(
    `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests`,
    { expectedRevision, targetParticipantId: participantId },
    `request:${participantId}`,
  );
  const respondContact = (requestId: string, accept: boolean, expectedRevision: number) => mutateContact(
    `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests/${encodeURIComponent(requestId)}/respond`,
    { accept, expectedRevision },
    `respond:${requestId}`,
  );
  const withdrawContact = (requestId: string, expectedRevision: number) => mutateContact(
    `/api/events/${encodeURIComponent(eventId)}/operations/contact-requests/${encodeURIComponent(requestId)}/withdraw`,
    { expectedRevision },
    `withdraw:${requestId}`,
  );

  return (
    <section aria-labelledby="event-matchmaking-title" className="card" data-event-matchmaking style={{ display: "grid", gap: 16, minWidth: 0, overflow: "hidden", padding: 16 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <span className="eyebrow">ORBIT MATCH · PUBLISHED</span>
        <h3 className="h-section" id="event-matchmaking-title" style={{ margin: 0 }}>{t({ en: "People worth meeting", zh: "值得认识的人" })}</h3>
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>{t({ en: "Only the organizer-published AI result appears here. Orbit does not locally rank or pad the list.", zh: "这里只展示主办方已发布的 AI 结果；Orbit 不在本地排序，也不会用候选名单补位。" })}</p>
      </div>

      {loading ? <p style={{ color: "var(--text-3)", fontSize: 14, margin: 0 }}>{t({ en: "Loading the published result…", zh: "正在读取已发布结果…" })}</p> : null}
      {unauthorized ? (
        <div className="card-flat" style={{ display: "grid", gap: 9, padding: 14 }}>
          <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>{t({ en: "Only confirmed participants can see event matching.", zh: "只有已确认报名的参与者可以查看活动匹配。" })}</p>
          {authenticated && registrationOpen ? <a className="btn btn-primary btn-sm" href={`/app/events/${encodeURIComponent(eventId)}/register`} style={{ justifySelf: "start" }}>{t({ en: "Complete registration", zh: "完成报名" })}</a> : !authenticated ? <a className="btn btn-primary btn-sm" href={`/app/account/login?next=${encodeURIComponent(`/app/events/${eventId}`)}`} style={{ justifySelf: "start" }}>{t({ en: "Sign in", zh: "登录" })}</a> : null}
        </div>
      ) : null}

      {workspace?.resultsState === "locked" ? <div className="card-flat" data-operations-state="locked" style={{ padding: 14 }}><strong>{t({ en: "Results are not open yet", zh: "匹配结果尚未开放" })}</strong><p style={{ color: "var(--text-2)", fontSize: 13, margin: "6px 0 0" }}>{t({ en: `Available at ${formatGate(workspace.configuration.resultsAvailableAt)}.`, zh: `将在 ${formatGate(workspace.configuration.resultsAvailableAt)} 开放。` })}</p></div> : null}
      {workspace?.resultsState === "processing" ? <div className="card-flat" data-operations-state="processing" style={{ padding: 14 }}><strong>{t({ en: "AI matching is being generated", zh: "AI 匹配正在生成" })}</strong><p style={{ color: "var(--text-2)", fontSize: 13, margin: "6px 0 0" }}>{t({ en: "The organizer has not published a result. No fallback list is shown.", zh: "主办方尚未发布结果，因此不会展示备用名单。" })}</p></div> : null}
      {workspace?.resultsState === "failed" ? <div className="card-flat" data-operations-state="failed" style={{ padding: 14 }}><strong>{t({ en: "Generation failed", zh: "匹配生成失败" })}</strong><p style={{ color: "var(--text-2)", fontSize: 13, margin: "6px 0 0" }}>{t({ en: "The organizer can retry. Orbit will not synthesize a replacement.", zh: "主办方可以重试；Orbit 不会合成替代结果。" })}</p></div> : null}
      {workspace?.resultsState === "not_generated" ? <div className="card-flat" data-operations-state="not_generated" style={{ padding: 14 }}><strong>{t({ en: "Matching has not been generated", zh: "尚未生成匹配" })}</strong><p style={{ color: "var(--text-2)", fontSize: 13, margin: "6px 0 0" }}>{t({ en: "Wait for the organizer to run and publish the AI result.", zh: "请等待主办方运行并发布 AI 结果。" })}</p></div> : null}

      {workspace?.resultsState === "ready" ? (
        <>
          {participants.map(({ participant, recommendation }) => participant ? (() => {
            const contactRequest = workspace.contactRequests.find(
              (request) =>
                request.requesterParticipantId === participant.participantId ||
                request.targetParticipantId === participant.participantId,
            ) ?? null;
            return (
            <article className="card-flat" data-matchmaking-candidate={participant.participantId} key={participant.participantId} style={{ display: "grid", gap: 9, minWidth: 0, overflowWrap: "anywhere", padding: 14 }}>
              <button aria-label={t({ en: `Open ${participant.displayName}'s profile`, zh: `打开 ${participant.displayName} 的画像` })} onClick={() => void openParticipant(participant.participantId)} style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", padding: 0, textAlign: "left" }} type="button">
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                  <div><strong style={{ color: "var(--ink)", fontSize: 15 }}>{participant.displayName}</strong><div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 2 }}>{[participant.role, participant.company].filter(Boolean).join(" · ")}</div></div>
                  <span className="chip">{recommendation.score}</span>
                </div>
                <ul style={{ color: "var(--text-2)", fontSize: 13, margin: "9px 0 0", paddingLeft: 18 }}>{recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                <p style={{ color: "var(--text-3)", fontSize: 12, margin: "8px 0 0" }}>{recommendation.memberHint}</p>
              </button>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" disabled={working === `detail:${participant.participantId}`} onClick={() => void openParticipant(participant.participantId)} type="button">{t({ en: "View evidence and profile", zh: "查看依据与画像" })}</button>
                <CandidateContactAction
                  busy={working === `request:${participant.participantId}`}
                  canWithdraw={contactRequest?.requesterParticipantId === workspace.me.participantId}
                  contactRequestsOpen={contactRequestsOpen}
                  onRequest={requestContact}
                  onWithdraw={withdrawContact}
                  participantId={participant.participantId}
                  request={contactRequest}
                />
              </div>
            </article>
            );
          })() : null)}
          {!participants.length ? <p data-operations-state="ready-empty" style={{ color: "var(--text-3)", fontSize: 14, margin: 0 }}>{workspace.recommendations?.noMatchReason ?? t({ en: "The published result contains no recommendation for you.", zh: "已发布结果中没有适合你的推荐。" })}</p> : null}
        </>
      ) : null}

      {workspace && !registrationOpen ? <OrbitPostEventCenter acceptedContacts={workspace.contactRequests.filter((request) => request.status === "accepted").length} eventId={eventId} /> : null}

      {visibleError ? <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{visibleError}</p> : null}
      {detail ? <ParticipantDetailPanel busy={working !== null} contactRequestsOpen={contactRequestsOpen} detail={detail} eventId={eventId} onClose={() => setDetail(null)} onRequest={requestContact} onRespond={respondContact} onWithdraw={withdrawContact} /> : null}
    </section>
  );
}
