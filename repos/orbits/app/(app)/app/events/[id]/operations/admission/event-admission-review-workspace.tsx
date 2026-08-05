"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EventAdmissionApplication,
  EventAdmissionApplicationStatus,
  EventAdmissionReviewListItem,
} from "../../../../../../../features/events/admission/contract";
import { EVENT_PARTICIPANT_PROFILE_FIELDS } from "../../../../../../../features/events/registration/contract";
import { EVENT_PROFILE_FIELD_LABELS } from "../../../../../../../features/events/registration/interview-response-contract";
import { PublicTopNav } from "../../../../orbit-public-shell";
import { EventAdmissionPolicyPanel } from "./event-admission-policy-panel";

type ReviewView = "pending" | "processed";

interface ReviewListPayload {
  items: readonly EventAdmissionReviewListItem[];
  nextCursor: string | null;
  total: number;
  view: ReviewView;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success: boolean;
}

class ReviewRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ReviewRequestError";
  }
}

const statusLabel: Record<EventAdmissionApplicationStatus, string> = {
  admitted: "已批准",
  pending_review: "待审核",
  rejected: "已拒绝",
  waitlisted: "候补",
  withdrawn: "已撤回",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
    throw new ReviewRequestError(
      envelope?.error?.message ?? "报名审核请求失败。",
      response.status,
    );
  }
  return envelope.data;
}

function timeLabel(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}

function ApplicantCard({
  active,
  application,
  opening,
  onOpen,
}: {
  active: boolean;
  application: EventAdmissionReviewListItem;
  opening: boolean;
  onOpen(): void;
}) {
  return (
    <button
      aria-busy={opening}
      aria-pressed={active}
      className="card-flat"
      data-admission-review-applicant={application.actorId}
      disabled={opening}
      onClick={onOpen}
      style={{
        background: active ? "var(--surface-2)" : "var(--surface)",
        borderColor: active ? "var(--accent)" : "var(--border)",
        cursor: "pointer",
        display: "grid",
        gap: 8,
        padding: 14,
        textAlign: "left",
        width: "100%",
      }}
      type="button"
    >
      <span style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" }}>
        <strong style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis" }}>
          {application.displayName || application.actorId}
        </strong>
        <span className={application.status === "pending_review" ? "badge badge-live" : "badge"}>
          {statusLabel[application.status]}
        </span>
      </span>
      {application.displayName ? (
        <small style={{ color: "var(--text-3)", overflowWrap: "anywhere" }}>{application.actorId}</small>
      ) : null}
      <small style={{ color: "var(--text-3)" }}>
        {opening ? "正在读取完整申请…" : `提交 ${timeLabel(application.submittedAt)} · v${application.applicationVersion}`}
      </small>
    </button>
  );
}

function ApplicationDetail({
  application,
  busy,
  onDecision,
}: {
  application: EventAdmissionApplication;
  busy: boolean;
  onDecision(decision: "approve" | "reject"): void;
}) {
  const responses = application.profilePayload.interviewResponses ?? [];
  return (
    <section
      aria-label="报名申请详情"
      className="card-flat"
      data-admission-review-detail={application.actorId}
      style={{ display: "grid", gap: 18, minWidth: 0, padding: 20 }}
    >
      <header style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">APPLICATION · v{application.applicationVersion}</span>
        <h2 style={{ color: "var(--ink)", fontSize: "clamp(1.4rem, 3vw, 2rem)", margin: 0 }}>
          {application.profilePayload.displayName || application.actorId}
        </h2>
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span className={application.status === "pending_review" ? "badge badge-live" : "badge"}>
            {statusLabel[application.status]}
          </span>
          <small style={{ color: "var(--text-3)" }}>提交于 {timeLabel(application.submittedAt)}</small>
        </div>
      </header>

      <section aria-labelledby="profile-answers-title" style={{ display: "grid", gap: 10 }}>
        <h3 id="profile-answers-title" style={{ margin: 0 }}>完整报名画像</h3>
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>
          审核工作区展示本次报名提交的全部八项画像答案，不按可见性做选择隐藏。
        </p>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
          {EVENT_PARTICIPANT_PROFILE_FIELDS.map((field) => (
            <article className="card-flat" data-admission-profile-field={field} key={field} style={{ padding: 12 }}>
              <strong style={{ display: "block", fontSize: 13 }}>{EVENT_PROFILE_FIELD_LABELS[field].zh}</strong>
              <p style={{ color: "var(--text-2)", margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                {application.profilePayload.answers[field]?.trim() || "未填写"}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="adaptive-answers-title" style={{ display: "grid", gap: 10 }}>
        <h3 id="adaptive-answers-title" style={{ margin: 0 }}>自适应访谈记录</h3>
        {responses.length === 0 ? (
          <div className="card-flat" data-admission-adaptive-empty style={{ color: "var(--text-3)", padding: 12 }}>
            该申请没有自适应访谈快照；上方仍完整展示已提交画像字段。
          </div>
        ) : responses.map((response) => (
          <article className="card-flat" data-admission-adaptive-response={response.responseId} key={response.responseId} style={{ display: "grid", gap: 7, padding: 12 }}>
            <strong>{response.question?.prompt || EVENT_PROFILE_FIELD_LABELS[response.field].zh}</strong>
            <p style={{ color: "var(--text-2)", margin: 0, whiteSpace: "pre-wrap" }}>{response.answer.displayText}</p>
            <small style={{ color: "var(--text-3)" }}>
              {EVENT_PROFILE_FIELD_LABELS[response.field].zh} · {response.questionSource} · {response.visibility} · {timeLabel(response.answeredAt)}
            </small>
          </article>
        ))}
      </section>

      {application.status === "pending_review" ? (
        <div style={{ borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: 10, paddingTop: 16 }}>
          <button
            className="btn btn-primary"
            data-admission-review-decision="approve"
            disabled={busy}
            onClick={() => onDecision("approve")}
            type="button"
          >
            {busy ? "处理中…" : "批准报名"}
          </button>
          <button
            className="btn btn-ghost"
            data-admission-review-decision="reject"
            disabled={busy}
            onClick={() => onDecision("reject")}
            type="button"
          >
            拒绝报名
          </button>
        </div>
      ) : (
        <div className="card-flat" data-admission-decision-readonly style={{ color: "var(--text-3)", padding: 12 }}>
          该申请已处理。处理人 {application.decisionActorId || "—"}，处理时间 {timeLabel(application.decidedAt)}。
        </div>
      )}
    </section>
  );
}

export function EventAdmissionReviewWorkspace({
  canConfigurePolicy = false,
  eventId,
  eventTitle,
}: {
  canConfigurePolicy?: boolean;
  eventId: string;
  eventTitle: string;
}) {
  const baseUrl = `/api/events/${encodeURIComponent(eventId)}/admission/reviews`;
  const [view, setView] = useState<ReviewView>("pending");
  const [items, setItems] = useState<readonly EventAdmissionReviewListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<EventAdmissionApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openingActorId, setOpeningActorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(async (append = false, cursor?: string | null) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const query = new URLSearchParams({ limit: "30", view });
      if (cursor) query.set("cursor", cursor);
      const page = await requestJson<ReviewListPayload>(`${baseUrl}?${query}`);
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
      setTotal(page.total);
      setError(null);
      if (!append) setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取报名审核队列。");
      if (!append) {
        setItems([]);
        setNextCursor(null);
        setTotal(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [baseUrl, view]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const selectedId = selected?.actorId ?? null;
  const processed = useMemo(
    () => view === "processed",
    [view],
  );

  async function openApplication(actorId: string) {
    setError(null);
    setSelected(null);
    setOpeningActorId(actorId);
    try {
      setSelected(await requestJson<EventAdmissionApplication>(
        `${baseUrl}/${encodeURIComponent(actorId)}`,
      ));
    } catch (cause) {
      setSelected(null);
      setError(cause instanceof Error ? cause.message : "无法读取报名申请详情。");
    } finally {
      setOpeningActorId(null);
    }
  }

  async function decide(decision: "approve" | "reject") {
    if (!selected || selected.status !== "pending_review") return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await requestJson<EventAdmissionApplication>(
        `${baseUrl}/${encodeURIComponent(selected.actorId)}/decision`,
        {
          body: JSON.stringify({
            decision,
            expectedApplicationVersion: selected.applicationVersion,
          }),
          method: "POST",
        },
      );
      setSelected(next);
      setNotice(decision === "approve" ? "报名已批准。" : "报名已拒绝。");
      await loadList();
    } catch (cause) {
      if (cause instanceof ReviewRequestError && cause.status === 409) {
        setError("申请已被其他审核员处理，列表已刷新。请查看最新状态。");
        await loadList();
      } else {
        setError(cause instanceof Error ? cause.message : "报名决定未能保存。");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PublicTopNav active="events" />
      <main data-orbit-real-page="event-admission-review" style={{ margin: "0 auto", maxWidth: 1240, padding: "clamp(20px, 4vw, 48px) clamp(16px, 3vw, 28px) 64px" }}>
        <header style={{ display: "grid", gap: 10, marginBottom: 22 }}>
          <div className="eyebrow">EVENT ADMISSION · REVIEW</div>
          <h1 className="h-display" style={{ margin: 0 }}>报名审核</h1>
          <p style={{ color: "var(--text-2)", margin: 0 }}>{eventTitle}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <a className="btn btn-ghost btn-sm" href="/app/events/center">运营活动中心</a>
            <a className="btn btn-ghost btn-sm" href={`/app/events/${encodeURIComponent(eventId)}`}>活动详情</a>
          </div>
        </header>

        <EventAdmissionPolicyPanel
          canConfigurePolicy={canConfigurePolicy}
          eventId={eventId}
        />

        <div aria-label="报名审核视图" role="tablist" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button aria-selected={!processed} className={!processed ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setView("pending")} role="tab" type="button">待审核</button>
          <button aria-selected={processed} className={processed ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setView("processed")} role="tab" type="button">已处理</button>
        </div>

        {notice ? <p className="card-flat" role="status" style={{ color: "var(--success, #147d64)", padding: 12 }}>{notice}</p> : null}
        {error ? (
          <div className="card-flat" role="alert" style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", marginBottom: 14, padding: 12 }}>
            <span>{error}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => void loadList()} type="button">重试</button>
          </div>
        ) : null}

        <div style={{ alignItems: "start", display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 390px), 1fr))" }}>
          <section aria-label={processed ? "已处理报名" : "待审核报名"} className="card-flat" style={{ display: "grid", gap: 12, minWidth: 0, padding: 16 }}>
            <div style={{ alignItems: "baseline", display: "flex", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0 }}>{processed ? "已处理" : "待审核"}</h2>
              <span className="badge">{total}</span>
            </div>
            {loading ? <p aria-live="polite" style={{ color: "var(--text-3)" }}>正在读取真实报名记录…</p> : null}
            {!loading && items.length === 0 && !error ? (
              <div className="card-flat" data-admission-review-empty={view} style={{ color: "var(--text-3)", padding: 18 }}>
                {processed ? "还没有已处理的报名。" : "当前没有待审核报名。"}
              </div>
            ) : null}
            {items.map((application) => (
              <ApplicantCard
                active={selectedId === application.actorId || openingActorId === application.actorId}
                application={application}
                key={`${application.actorId}:${application.applicationVersion}`}
                opening={openingActorId === application.actorId}
                onOpen={() => void openApplication(application.actorId)}
              />
            ))}
            {nextCursor ? (
              <button className="btn btn-ghost" disabled={loadingMore} onClick={() => void loadList(true, nextCursor)} type="button">
                {loadingMore ? "正在加载…" : "加载更多"}
              </button>
            ) : null}
          </section>

          {selected ? (
            <ApplicationDetail application={selected} busy={busy} onDecision={(decision) => void decide(decision)} />
          ) : openingActorId ? (
            <aside aria-live="polite" className="card-flat" data-admission-review-detail-loading style={{ color: "var(--text-3)", padding: 20 }}>
              正在读取完整画像与自适应访谈记录…
            </aside>
          ) : (
            <aside className="card-flat" data-admission-review-detail-empty style={{ color: "var(--text-3)", padding: 20 }}>
              从左侧选择申请，查看完整画像答案与自适应访谈记录。
            </aside>
          )}
        </div>
      </main>
    </>
  );
}
