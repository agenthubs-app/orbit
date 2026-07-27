"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  EventMatchmakingRequestView,
  EventMatchmakingWorkspace,
} from "../../../../../features/events/matchmaking/context-service";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Icon } from "../../orbit-reference-primitives";

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

function RequestCard({
  onChanged,
  request,
  setError,
  setWorking,
  working,
}: {
  onChanged: () => Promise<void>;
  request: EventMatchmakingRequestView;
  setError: (value: string) => void;
  setWorking: (value: string | null) => void;
  working: string | null;
}) {
  const { t } = useOrbitLanguage();
  const [slot, setSlot] = useState("");
  const busy = working === request.requestId;

  const mutate = useCallback(
    async (url: string, init: RequestInit) => {
      setError("");
      setWorking(request.requestId);
      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            "content-type": "application/json",
            ...init.headers,
          },
        });
        const body = (await response.json().catch(() => ({}))) as unknown;
        if (!response.ok) throw new Error(messageFrom(body));
        await onChanged();
      } catch (error) {
        setError(error instanceof Error ? error.message : messageFrom(error));
      } finally {
        setWorking(null);
      }
    },
    [onChanged, request.requestId, setError, setWorking],
  );

  const other = request.otherParticipant;
  const isIncoming = request.direction === "incoming";

  return (
    <article
      className="card-flat"
      data-matchmaking-request={request.requestId}
      style={{ display: "grid", gap: 12, padding: 14 }}
    >
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <div>
          <strong style={{ color: "var(--ink)", fontSize: 15 }}>
            {other.displayName}
          </strong>
          {other.organization ? (
            <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 2 }}>
              {other.organization}
            </div>
          ) : null}
        </div>
        <span className="chip" style={{ fontSize: 12 }}>
          {isIncoming
            ? t({ en: "Incoming", zh: "对方申请" })
            : t({ en: "Your request", zh: "我的申请" })}
        </span>
      </div>

      {request.status === "awaiting_target_consent" && isIncoming ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() =>
              void mutate(
                `/api/agent/matchmaking/requests/${encodeURIComponent(request.requestId)}/respond`,
                { method: "POST", body: JSON.stringify({ accept: true }) },
              )
            }
            type="button"
          >
            {t({ en: "Accept introduction", zh: "同意认识" })}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() =>
              void mutate(
                `/api/agent/matchmaking/requests/${encodeURIComponent(request.requestId)}/respond`,
                { method: "POST", body: JSON.stringify({ accept: false }) },
              )
            }
            type="button"
          >
            {t({ en: "Decline", zh: "暂不认识" })}
          </button>
        </div>
      ) : null}

      {request.status === "awaiting_target_consent" && !isIncoming ? (
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
          {t({
            en: "Waiting for the other participant. No contact details have been shared.",
            zh: "等待对方决定，联系方式尚未披露。",
          })}
        </p>
      ) : null}

      {request.status === "accepted" && !isIncoming ? (
        <div style={{ display: "grid", gap: 8 }}>
          <label
            htmlFor={`match-slot-${request.requestId}`}
            style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 600 }}
          >
            {t({
              en: "Calendar is not connected. Propose a time manually",
              zh: "日历暂未连接，请手动提议时间",
            })}
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <input
              className="field"
              id={`match-slot-${request.requestId}`}
              onChange={(event) => setSlot(event.target.value)}
              style={{ flex: "1 1 210px" }}
              type="datetime-local"
              value={slot}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={busy || !slot}
              onClick={() => {
                const parsed = new Date(slot);
                if (!Number.isFinite(parsed.getTime())) return;
                void mutate(
                  `/api/agent/matchmaking/requests/${encodeURIComponent(request.requestId)}/slots`,
                  {
                    method: "POST",
                    body: JSON.stringify({ slots: [parsed.toISOString()] }),
                  },
                );
              }}
              type="button"
            >
              {t({ en: "Propose time", zh: "提议时间" })}
            </button>
          </div>
        </div>
      ) : null}

      {request.status === "accepted" && isIncoming ? (
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
          {t({
            en: "You both agreed. Waiting for the requester to propose a time.",
            zh: "双方已经同意，等待对方提议时间。",
          })}
        </p>
      ) : null}

      {request.status === "scheduling" && isIncoming ? (
        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "var(--text-2)", fontSize: 13 }}>
            {t({ en: "Choose one proposed time", zh: "选择一个合适时间" })}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {request.proposedSlots.map((value) => (
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy}
                key={value}
                onClick={() =>
                  void mutate(
                    `/api/agent/matchmaking/requests/${encodeURIComponent(request.requestId)}/slots`,
                    {
                      method: "PATCH",
                      body: JSON.stringify({ slot: value }),
                    },
                  )
                }
                type="button"
              >
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(value))}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {request.status === "scheduling" && !isIncoming ? (
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
          {t({
            en: "Time proposed. Waiting for the other participant to choose.",
            zh: "时间已经提议，等待对方选择。",
          })}
        </p>
      ) : null}

      {request.status === "scheduled" ? (
        <p style={{ color: "var(--success)", fontSize: 14, margin: 0 }}>
          {t({ en: "Confirmed for", zh: "已确认时间" })}{" "}
          {request.selectedSlot
            ? new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(request.selectedSlot))
            : null}
        </p>
      ) : null}

      {request.status === "declined" ? (
        <p style={{ color: "var(--text-3)", fontSize: 14, margin: 0 }}>
          {t({
            en: "This introduction was declined. No contact details were shared.",
            zh: "本次介绍未达成，联系方式没有披露。",
          })}
        </p>
      ) : null}

      <div
        style={{
          alignItems: "center",
          color: "var(--text-3)",
          display: "flex",
          fontSize: 12,
          gap: 8,
        }}
      >
        <Icon name={request.contactDetailsDisclosed ? "check" : "lock"} size={13} />
        {request.contactDetailsDisclosed
          ? t({
              en: "Mutual consent recorded; Orbit still sends no message automatically.",
              zh: "已记录双方同意；Orbit 仍不会自动发送消息。",
            })
          : t({
              en: "Contact details stay hidden until mutual consent.",
              zh: "双方同意前，联系方式保持隐藏。",
            })}
      </div>
    </article>
  );
}

export function OrbitEventMatchmaking({ eventId }: { eventId: string }) {
  const { t } = useOrbitLanguage();
  const [workspace, setWorkspace] =
    useState<EventMatchmakingWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/events/${encodeURIComponent(eventId)}/matchmaking`,
      { cache: "no-store" },
    );
    if (response.status === 401) {
      setUnauthorized(true);
      setWorkspace(null);
      return;
    }
    const body = (await response.json().catch(() => ({}))) as {
      data?: EventMatchmakingWorkspace;
    };
    if (!response.ok || !body.data) throw new Error(messageFrom(body));
    setUnauthorized(false);
    setWorkspace(body.data);
  }, [eventId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load()
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : messageFrom(loadError),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  async function requestIntroduction(targetParticipantId: string) {
    setWorking(targetParticipantId);
    setError("");
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/matchmaking`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetParticipantId }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        data?: EventMatchmakingWorkspace;
      };
      if (!response.ok || !body.data) throw new Error(messageFrom(body));
      setWorkspace(body.data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : messageFrom(requestError),
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <section
      aria-labelledby="event-matchmaking-title"
      className="card"
      data-event-matchmaking
      style={{ display: "grid", gap: 16, padding: 16 }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <span className="eyebrow">ORBIT MATCH</span>
        <h3 className="h-section" id="event-matchmaking-title" style={{ margin: 0 }}>
          {t({ en: "People worth meeting", zh: "值得认识的人" })}
        </h3>
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
          {workspace?.privacyNotice ??
            t({
              en: "A small, explainable shortlist. No automatic messages.",
              zh: "只给少量、可解释的候选，不自动发送消息。",
            })}
        </p>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-3)", fontSize: 14, margin: 0 }}>
          {t({ en: "Loading matches…", zh: "正在读取撮合信息…" })}
        </p>
      ) : null}

      {unauthorized ? (
        <a
          className="btn btn-primary btn-sm"
          href={`/app/account/login?next=${encodeURIComponent(`/events/${eventId}`)}`}
          style={{ justifySelf: "start", textDecoration: "none" }}
        >
          {t({ en: "Sign in to use matching", zh: "登录后使用撮合" })}
        </a>
      ) : null}

      {workspace?.state === "registration_required" ? (
        <div className="card-flat" style={{ display: "grid", gap: 8, padding: 14 }}>
          <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
            {t({
              en: "Only confirmed event participants can appear in matching.",
              zh: "只有已确认报名的活动参与者才能进入撮合。",
            })}
          </p>
          <a
            className="btn btn-primary btn-sm"
            href={`/app/events/${encodeURIComponent(eventId)}/register`}
            style={{ justifySelf: "start", textDecoration: "none" }}
          >
            {t({ en: "Complete registration", zh: "完成报名资料" })}
          </a>
        </div>
      ) : null}

      {workspace?.recommendations.map((candidate) => (
        <article
          className="card-flat"
          data-matchmaking-candidate={candidate.participantId}
          key={candidate.participantId}
          style={{ display: "grid", gap: 8, padding: 14 }}
        >
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <div>
              <strong style={{ color: "var(--ink)", fontSize: 15 }}>
                {candidate.displayName}
              </strong>
              {candidate.organization ? (
                <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 2 }}>
                  {candidate.organization}
                </div>
              ) : null}
            </div>
            <span className="chip" style={{ fontSize: 12 }}>
              {candidate.score}
            </span>
          </div>
          <ul style={{ color: "var(--text-2)", fontSize: 13, margin: 0, paddingLeft: 18 }}>
            {candidate.reasons.slice(0, 3).map((reason) => (
              <li key={reason} style={{ marginTop: 3 }}>
                {reason}
              </li>
            ))}
          </ul>
          <p
            data-matchmaking-source
            style={{ color: "var(--text-3)", fontSize: 12, margin: 0 }}
          >
            {t({
              en: "Source: this event's registration profiles and matching goals",
              zh: "来源：本场报名画像与活动匹配目标",
            })}
          </p>
          <button
            className="btn btn-primary btn-sm"
            disabled={working === candidate.participantId}
            onClick={() => void requestIntroduction(candidate.participantId)}
            style={{ justifySelf: "start" }}
            type="button"
          >
            {t({ en: "Request an introduction", zh: "申请认识" })}
          </button>
        </article>
      ))}

      {workspace?.state === "no_matches" ? (
        <p style={{ color: "var(--text-3)", fontSize: 14, margin: 0 }}>
          {t({
            en: "No high-confidence match is available yet. Orbit will not pad the list.",
            zh: "暂时没有高置信候选，Orbit 不会为了凑数展示名单。",
          })}
        </p>
      ) : null}

      {workspace?.requests.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          <h4 style={{ color: "var(--ink)", fontSize: 14, margin: 0 }}>
            {t({ en: "Introduction requests", zh: "撮合进度" })}
          </h4>
          {workspace.requests.map((request) => (
            <RequestCard
              key={request.requestId}
              onChanged={load}
              request={request}
              setError={setError}
              setWorking={setWorking}
              working={working}
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
