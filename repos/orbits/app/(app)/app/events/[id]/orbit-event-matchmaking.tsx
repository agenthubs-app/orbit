"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useOrbitLanguage } from "../../orbit-language-context";
import { Avatar, Icon, gradientFromString } from "../../orbit-reference-primitives";
import { OrbitAppointmentNegotiation } from "./orbit-appointment-negotiation";
import { OrbitEncounterCapture } from "./orbit-encounter-capture";

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
    // Before the doors open there is nothing to press. A full-width disabled
    // sentence repeated down the grid was outshouting the people it sat under,
    // so the closed state degrades to a quiet status line and keeps the full
    // explanation on the title for anyone who wants it.
    if (!contactRequestsOpen) {
      return (
        <span
          className="orbit-attendee-wait"
          data-contact-request-state="none"
          title={t({ en: "Contact requests open when the event starts", zh: "活动开始后可申请交换联系方式" })}
        >
          <Icon name="lock" size={13} />
          {t({ en: "Opens at start", zh: "活动开始后开放" })}
        </span>
      );
    }
    return (
      <button
        className="btn btn-primary btn-sm"
        data-contact-request-state="none"
        disabled={busy}
        onClick={() => void onRequest(participantId, null)}
        type="button"
      >
        {t({ en: "Request business card", zh: "申请交换名片" })}
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
        {canWithdraw ? <button className={contactRequestsOpen ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} disabled={busy || !contactRequestsOpen} onClick={() => void onRequest(participantId, request.revision)} title={contactRequestsOpen ? undefined : t({ en: "Contact requests open when the event starts", zh: "活动开始后可再次申请交换联系方式" })} type="button">{contactRequestsOpen ? t({ en: "Request again", zh: "再次申请" }) : t({ en: "Opens at start", zh: "活动开始后开放" })}</button> : null}
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
  const panelRef = useRef<HTMLElement>(null);

  // Escape closes, focus moves into the dialog on open and back to whatever
  // opened it on close, and Tab cycles inside the panel. Without this the
  // dialog was reachable only by mouse: keyboard focus stayed on the card
  // behind the scrim, and Tab walked the page underneath rather than the thing
  // on top of it. The tabbable set is recomputed per keypress because the
  // footer swaps controls as a contact request changes state, and the accepted
  // state mounts two more forms below it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const tabbables = () => {
      const panel = panelRef.current;
      if (!panel) return [];
      const candidates = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      return Array.from(candidates).filter((node) => node.getClientRects().length > 0);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const stops = tabbables();
      // Nothing tabbable yet (or focus has escaped the panel): park it on the
      // panel itself rather than letting Tab fall through to the page behind.
      if (!stops.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // Lock the page behind the dialog. On the event journey the scroller is the
    // page shell, not the document, so locking <html> alone does nothing.
    const scroller = document.querySelector<HTMLElement>("[data-appscroll]") ?? document.documentElement;
    const previousOverflow = scroller.style.overflow;
    const previousPadding = scroller.style.paddingRight;
    const scrollbar = scroller === document.documentElement
      ? window.innerWidth - document.documentElement.clientWidth
      : scroller.offsetWidth - scroller.clientWidth;
    scroller.style.overflow = "hidden";
    if (scrollbar > 0) scroller.style.paddingRight = `${scrollbar}px`;

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      scroller.style.overflow = previousOverflow;
      scroller.style.paddingRight = previousPadding;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      aria-label={t({ en: "Participant detail", zh: "参会者详情" })}
      aria-modal="true"
      className="orbit-participant-dialog"
      data-event-participant-detail={detail.participantId}
      onClick={onClose}
      role="dialog"
      style={{
        alignItems: "center",
        backdropFilter: "blur(2px)",
        background: "var(--scrim)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        padding: 20,
        position: "fixed",
        WebkitBackdropFilter: "blur(2px)",
        zIndex: "var(--z-modal)",
      }}
    >
      <article
        className="card"
        onClick={(event) => event.stopPropagation()}
        ref={panelRef}
        tabIndex={-1}
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
          <button aria-label={t({ en: "Close", zh: "关闭" })} className="btn btn-ghost btn-sm hit-44" onClick={onClose} style={{ alignSelf: "start", padding: "0 10px" }} type="button">
            <Icon name="x" size={16} />
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

/**
 * Render-neutral digest of the published AI result, reported upward so the
 * event detail page can surface recommendations and my table placement near
 * the hero instead of only below the fold.
 */
export interface EventMatchmakingSummary {
  acceptedContacts: number;
  recommendationCount: number;
  resultsState: OperationsWorkspace["resultsState"];
  roundOneTable: { seat: string | null; tableNumber: number; theme: string } | null;
  roundTwoTable: { seat: string | null; tableNumber: number; theme: string } | null;
}

function tableSummaryFor(
  table: Table | null,
  meParticipantId: string,
): EventMatchmakingSummary["roundOneTable"] {
  if (!table) return null;
  return {
    seat: table.members.find((member) => member.participantId === meParticipantId)?.seat ?? null,
    tableNumber: table.tableNumber,
    theme: table.theme,
  };
}

export function OrbitEventMatchmaking({
  authenticated = true,
  contactRequestsOpen = true,
  eventId,
  onWorkspaceSummary,
  registrationOpen = true,
}: {
  authenticated?: boolean;
  contactRequestsOpen?: boolean;
  eventId: string;
  onWorkspaceSummary?: (summary: EventMatchmakingSummary | null) => void;
  registrationOpen?: boolean;
}) {
  const { t } = useOrbitLanguage();
  const sectionRef = useRef<HTMLElement>(null);
  // The detail dialog is fixed and full-screen, but it is authored inside this
  // section — which on the event journey sits inside the `.cardB` nite panel.
  // cardB re-binds --ink/--surface/--text for a small glass card on a dark
  // gradient, so the dialog inherited a white scrim, a 5.5%-alpha "surface"
  // and near-white body text: the whole page showed straight through it.
  // Re-parenting to the page root escapes those overrides. It has to be the
  // [data-orbit-real-page] element and not document.body, because the entire
  // Orbit override layer (.card, .chip, .btn accent) is scoped under it —
  // on body the primary button reverts to the prototype's indigo.
  const [dialogHost, setDialogHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    setDialogHost(sectionRef.current?.closest<HTMLElement>("[data-orbit-real-page]") ?? document.body);
  }, []);
  const [workspace, setWorkspace] = useState<OperationsWorkspace | null>(null);
  const [detail, setDetail] = useState<ParticipantDetail | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");
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

  // Search covers everything a card shows plus industry, so what someone reads
  // on a card is always something they can type back in. 64 confirmed profiles
  // is well past the point where scrolling the grid is the fastest way to find
  // one person.
  const directoryMatches = useMemo(() => {
    const directory = workspace?.directory ?? [];
    const needle = directoryQuery.trim().toLowerCase();
    if (!needle) return directory;
    return directory.filter((participant) =>
      [participant.displayName, participant.role, participant.company, participant.industry, ...participant.topics]
        .some((field) => field?.toLowerCase().includes(needle)));
  }, [directoryQuery, workspace]);

  // Notification deep links carry ?participant=… so the recipient lands with
  // the counterpart's profile drawer already open instead of scanning cards.
  const [focusParticipantId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("participant"),
  );
  const [focusConsumed, setFocusConsumed] = useState(false);
  useEffect(() => {
    if (!focusParticipantId || focusConsumed || !authenticated) return;
    setFocusConsumed(true);
    void openParticipant(focusParticipantId);
    // openParticipant is stable for this component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, focusConsumed, focusParticipantId]);

  useEffect(() => {
    if (!onWorkspaceSummary) return;
    if (!workspace) {
      onWorkspaceSummary(null);
      return;
    }
    onWorkspaceSummary({
      acceptedContacts: workspace.contactRequests.filter((request) => request.status === "accepted").length,
      recommendationCount: workspace.recommendations?.recommendations.length ?? 0,
      resultsState: workspace.resultsState,
      roundOneTable: tableSummaryFor(workspace.roundOneTable, workspace.me.participantId),
      roundTwoTable: tableSummaryFor(workspace.roundTwoTable, workspace.me.participantId),
    });
  }, [onWorkspaceSummary, workspace]);

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
    <section aria-labelledby="event-matchmaking-title" className="card" data-event-matchmaking ref={sectionRef} style={{ display: "grid", gap: 16, minWidth: 0, overflow: "hidden", padding: 16 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <span className="eyebrow">ORBIT MATCH</span>
        <h3 className="h-section" id="event-matchmaking-title" style={{ margin: 0 }}>{t({ en: "People worth meeting", zh: "值得认识的人" })}</h3>
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>{t({ en: "Matched from both sides' registration profiles, with the evidence behind every suggestion.", zh: "根据双方报名画像匹配，每条推荐都能查看依据。" })}</p>
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
                  <span className="chip">{t({ en: `Match ${recommendation.score}`, zh: `匹配 ${recommendation.score}` })}</span>
                </div>
                <ul style={{ color: "var(--text-2)", fontSize: 13, margin: "9px 0 0", paddingLeft: 18 }}>{recommendation.reasons.slice(0, 2).map((reason) => <li key={reason}>{reason}</li>)}</ul>
                {recommendation.reasons.length > 2 ? (
                  <p style={{ color: "var(--text-3)", fontSize: 12, margin: "6px 0 0" }}>{t({ en: `+ ${recommendation.reasons.length - 2} more reasons — open the profile for full evidence`, zh: `还有 ${recommendation.reasons.length - 2} 条匹配依据，点击查看完整画像` })}</p>
                ) : null}
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

      {workspace ? (
        <section
          className="card-flat"
          data-event-participant-directory
          style={{ display: "grid", gap: 12, padding: 14 }}
        >
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
            <div>
              <strong>{t({ en: `All participants · ${workspace.directory.length}`, zh: `全部参会者 · ${workspace.directory.length}` })}</strong>
              <p style={{ color: "var(--text-3)", fontSize: 12, margin: "4px 0 0" }}>
                {t({
                  en: "Everyone who has confirmed their registration. Open a card to read what they wrote about themselves.",
                  zh: "所有已确认报名的人都在这里。点开卡片可以看到 TA 自己填写的介绍。",
                })}
              </p>
            </div>
            <button
              aria-expanded={directoryOpen}
              className="btn btn-ghost btn-sm"
              onClick={() => setDirectoryOpen((open) => !open)}
              type="button"
            >
              {directoryOpen
                ? t({ en: "Collapse", zh: "收起" })
                : t({ en: "Show participants", zh: "展开参会者" })}
            </button>
          </div>
          {directoryOpen && workspace.directory.length ? (
            <div className="orbit-attendee-search">
              <Icon color="var(--text-3)" name="search" size={17} />
              <input
                aria-label={t({ en: "Search participants", zh: "搜索参会者" })}
                onChange={(event) => setDirectoryQuery(event.target.value)}
                placeholder={t({ en: "Name, company, or what they are looking for", zh: "姓名、公司，或 TA 想找的事" })}
                type="search"
                value={directoryQuery}
              />
              {directoryQuery.trim() ? (
                <span aria-live="polite" className="orbit-attendee-count">
                  {t({ en: `${directoryMatches.length} of ${workspace.directory.length}`, zh: `${directoryMatches.length} / ${workspace.directory.length} 人` })}
                </span>
              ) : null}
            </div>
          ) : null}
          {directoryOpen && !directoryMatches.length ? (
            <p className="orbit-attendee-empty" data-event-directory-empty>
              {directoryQuery.trim()
                ? t({
                    en: `No participant matches "${directoryQuery.trim()}". Try a company, an industry, or part of a name.`,
                    zh: `没有匹配「${directoryQuery.trim()}」的参会者。可以试试公司、行业，或名字的一部分。`,
                  })
                : t({
                    en: "No confirmed registration profiles yet.",
                    zh: "还没有已确认报名的参会者。",
                  })}
            </p>
          ) : null}
          {directoryOpen ? (
            <div className="orbit-attendee-grid">
              {directoryMatches.map((participant) => {
                const contactRequest = workspace.contactRequests.find(
                  (request) =>
                    request.requesterParticipantId === participant.participantId ||
                    request.targetParticipantId === participant.participantId,
                ) ?? null;
                const isMe = participant.participantId === workspace.me.participantId;
                // The registration profile lists the domain first and what the
                // person came to do after it. Kept apart, the card reads as
                // "who / what they want"; joined by "·" it read as one grey run.
                const [domain, ...intent] = participant.topics;
                const role = [participant.role, participant.company].filter(Boolean).join(" · ");
                return (
                  <article
                    className="orbit-attendee-card"
                    data-event-directory-participant={participant.participantId}
                    key={participant.participantId}
                  >
                    <button
                      aria-label={t({ en: `Open ${participant.displayName}'s profile`, zh: `打开 ${participant.displayName} 的画像` })}
                      className="orbit-attendee-open"
                      onClick={() => void openParticipant(participant.participantId)}
                      type="button"
                    />
                    <div className="orbit-attendee-head">
                      <div className="orbit-attendee-id">
                        <Avatar
                          g={gradientFromString(participant.participantId)}
                          letter={participant.displayName.slice(0, 1)}
                          size={36}
                        />
                        <div className="orbit-attendee-name" title={participant.displayName}>{participant.displayName}</div>
                        {isMe ? <span className="orbit-attendee-self">{t({ en: "You", zh: "你" })}</span> : null}
                      </div>
                      {role ? <div className="orbit-attendee-role" title={role}>{role}</div> : null}
                    </div>
                    <div className="orbit-attendee-focus">
                      {domain ? <span className="orbit-attendee-domain" title={domain}>{domain}</span> : null}
                      {intent.length ? <p className="orbit-attendee-intent">{intent.join(" · ")}</p> : null}
                    </div>
                    {!isMe ? (
                      <div className="orbit-attendee-act">
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
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {visibleError ? <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{visibleError}</p> : null}
      {detail && dialogHost ? createPortal(
        <ParticipantDetailPanel busy={working !== null} contactRequestsOpen={contactRequestsOpen} detail={detail} eventId={eventId} onClose={() => setDetail(null)} onRequest={requestContact} onRespond={respondContact} onWithdraw={withdrawContact} />,
        dialogHost,
      ) : null}
    </section>
  );
}
