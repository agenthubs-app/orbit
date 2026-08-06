"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  EventOperationsLimitedCheckInRoster,
  EventOperationsLimitedCheckInRosterItem,
} from "../../../../../../../features/events/event-operations/check-in-roster";
import { PublicTopNav } from "../../../../orbit-public-shell";
import { Icon } from "../../../../orbit-reference-primitives";

interface ApiEnvelope<TValue> {
  data?: TValue;
  error?: { message?: string };
  success: boolean;
}

class CheckInRosterRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CheckInRosterRequestError";
  }
}

async function responseData<TValue>(response: Response): Promise<TValue> {
  let body: ApiEnvelope<TValue>;
  try {
    body = (await response.json()) as ApiEnvelope<TValue>;
  } catch {
    throw new CheckInRosterRequestError(
      "签到服务返回了无法识别的响应，请重试。",
      response.status,
    );
  }
  if (!response.ok || !body.success || !body.data) {
    throw new CheckInRosterRequestError(
      body.error?.message ?? "签到服务暂时不可用，请重试。",
      response.status,
    );
  }
  return body.data;
}

function formattedTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function CheckInAction({
  busy,
  onCheckIn,
  participant,
}: {
  busy: boolean;
  onCheckIn: (participant: EventOperationsLimitedCheckInRosterItem) => void;
  participant: EventOperationsLimitedCheckInRosterItem;
}) {
  return (
    <button
      aria-label={
        participant.checkedIn
          ? `${participant.displayName} 已签到`
          : `将 ${participant.displayName} 标记为已签到`
      }
      className={participant.checkedIn ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"}
      disabled={participant.checkedIn || busy}
      onClick={() => onCheckIn(participant)}
      type="button"
    >
      {participant.checkedIn ? "已签到" : busy ? "记录中…" : "标记已到场"}
    </button>
  );
}

type RosterSegment = "all" | "pending" | "done";

export function LimitedCheckInRoster({ eventId }: { eventId: string }) {
  const [roster, setRoster] =
    useState<EventOperationsLimitedCheckInRoster | null>(null);
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<RosterSegment>("all");
  const [loading, setLoading] = useState(true);
  const [loginRedirectPending, setLoginRedirectPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingParticipantIds, setPendingParticipantIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const endpoint = `/api/events/${encodeURIComponent(eventId)}/operations/admin/check-ins`;
  const loginHref = `/app/account/login?next=${encodeURIComponent(
    `/app/events/${encodeURIComponent(eventId)}/operations/check-in`,
  )}`;

  const handleRequestError = useCallback(
    (
      cause: unknown,
      options: { clearRosterOnReadFailure?: boolean } = {},
    ) => {
      const status =
        cause instanceof CheckInRosterRequestError ? cause.status : null;
      if (
        options.clearRosterOnReadFailure ||
        status === 401 ||
        status === 403 ||
        status === 404 ||
        status === 503
      ) {
        setRoster(null);
      }
      if (cause instanceof CheckInRosterRequestError && cause.status === 401) {
        setError("登录状态已失效，正在返回登录页。");
        setLoginRedirectPending(true);
        return;
      }
      if (cause instanceof CheckInRosterRequestError && cause.status === 403) {
        setRoster(null);
        setError("你没有该活动的签到权限。名单已从当前页面清除。");
        return;
      }
      if (cause instanceof CheckInRosterRequestError && cause.status === 404) {
        setError("没有找到这个活动。");
        return;
      }
      if (cause instanceof CheckInRosterRequestError && cause.status === 409) {
        setError("该活动当前不允许签到，请确认签到时间窗口。");
        return;
      }
      if (cause instanceof CheckInRosterRequestError && cause.status === 503) {
        setError("活动权限或签到存储暂时不可用，请稍后重试。");
        return;
      }
      setError(
        cause instanceof Error ? cause.message : "签到服务暂时不可用，请重试。",
      );
    },
    [],
  );

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      setRoster(
        await responseData<EventOperationsLimitedCheckInRoster>(response),
      );
    } catch (cause) {
      handleRequestError(cause, { clearRosterOnReadFailure: true });
    } finally {
      setLoading(false);
    }
  }, [endpoint, handleRequestError]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    if (loginRedirectPending) window.location.assign(loginHref);
  }, [loginHref, loginRedirectPending]);

  async function markArrived(
    participant: EventOperationsLimitedCheckInRosterItem,
  ) {
    setPendingParticipantIds((current) =>
      new Set([...current, participant.participantId]),
    );
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ participantId: participant.participantId }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      await responseData<unknown>(response);
      setNotice(`${participant.displayName} 已标记为到场。`);
      await loadRoster();
    } catch (cause) {
      handleRequestError(cause);
    } finally {
      setPendingParticipantIds((current) => {
        const next = new Set(current);
        next.delete(participant.participantId);
        return next;
      });
    }
  }

  return (
    <div data-orbit-real-page="event-operations-check-in" style={{ minHeight: "100dvh" }}>
      <PublicTopNav active="events" />
      <main
        style={{
          margin: "0 auto",
          maxWidth: 980,
          padding: "28px clamp(16px,4vw,42px) 80px",
        }}
      >
        <a
          href={`/app/events/${encodeURIComponent(eventId)}`}
          style={{
            alignItems: "center",
            color: "var(--text-2)",
            display: "inline-flex",
            gap: 6,
            textDecoration: "none",
          }}
        >
          <Icon name="chevL" size={16} /> 返回活动
        </a>
        <div
          style={{
            alignItems: "end",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "space-between",
            marginTop: 18,
          }}
        >
          <div>
            <div className="eyebrow">EVENT CHECK-IN · 现场签到</div>
            <h1 className="h-display" style={{ margin: "8px 0 0" }}>
              活动签到台
            </h1>
            <p style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
              逐位确认参会者到场；签到时间以服务器首次记录为准。
            </p>
            <div className="mono" style={{ color: "var(--text-3)", marginTop: 8 }}>
              {eventId}
            </div>
          </div>
          <button className="btn btn-ghost" disabled={loading} onClick={() => void loadRoster()} type="button">
            <Icon name="refresh" size={16} /> {loading ? "刷新中…" : "刷新名单"}
          </button>
        </div>

        <div aria-live="polite" role="status">
          {notice ? (
            <div className="card" style={{ color: "var(--accent)", marginTop: 18, padding: 14 }}>
              {notice}
            </div>
          ) : null}
        </div>
        {error ? (
          <div className="card" role="alert" style={{ borderColor: "var(--rose)", marginTop: 18, padding: 18 }}>
            <strong>{error}</strong>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => void loadRoster()} type="button">
                重试
              </button>
            </div>
          </div>
        ) : null}

        {loading && !roster ? (
          <section aria-label="正在加载签到名单" className="card roster-skeleton" style={{ marginTop: 18, minHeight: 360, padding: 20 }}>
            {Array.from({ length: 6 }, (_, index) => (
              <div aria-hidden="true" className="skeleton-row" key={index} />
            ))}
          </section>
        ) : null}

        {roster ? (() => {
          const checkedCount = roster.participants.filter((participant) => participant.checkedIn).length;
          const totalCount = roster.participants.length;
          const trimmedQuery = query.trim().toLowerCase();
          const visibleParticipants = roster.participants.filter((participant) => {
            if (segment === "pending" && participant.checkedIn) return false;
            if (segment === "done" && !participant.checkedIn) return false;
            if (!trimmedQuery) return true;
            return (
              participant.displayName.toLowerCase().includes(trimmedQuery) ||
              participant.participantId.toLowerCase().endsWith(trimmedQuery)
            );
          });
          return (
          <section className="card" style={{ marginTop: 18, padding: 20 }}>
            <div className="eyebrow">LIMITED ROSTER · 最小权限名单</div>
            <div style={{ alignItems: "baseline", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
              <h2 className="h-title" style={{ margin: "8px 0 0" }}>
                参会者到场状态
              </h2>
              <strong aria-live="polite" style={{ color: "var(--accent)", fontSize: 15 }}>
                已签到 {checkedCount} / {totalCount}
              </strong>
            </div>
            <p style={{ color: "var(--text-3)", fontSize: 13 }}>
              本页面只显示签到所需的姓名、参会者编号和到场时间。
            </p>

            <div className="roster-controls">
              <input
                aria-label="按姓名搜索参会者"
                className="field"
                onInput={(input) => setQuery(input.currentTarget.value)}
                placeholder="输入姓名快速查找…"
                type="search"
                value={query}
              />
              <div aria-label="签到状态筛选" className="roster-segments" role="group">
                {([
                  ["all", `全部 ${totalCount}`],
                  ["pending", `未签到 ${totalCount - checkedCount}`],
                  ["done", `已签到 ${checkedCount}`],
                ] as const).map(([value, label]) => (
                  <button
                    aria-pressed={segment === value}
                    className={segment === value ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
                    key={value}
                    onClick={() => setSegment(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {visibleParticipants.length === 0 ? (
              <p role="status" style={{ color: "var(--text-3)", fontSize: 14, marginTop: 16 }}>
                没有匹配的参会者。换一个姓名试试，或清空筛选。
              </p>
            ) : null}

            <div className="roster-table-wrap">
              <table className="roster-table">
                <caption className="sr-only">活动签到名单</caption>
                <thead>
                  <tr>
                    <th scope="col">参会者</th>
                    <th scope="col">状态</th>
                    <th scope="col">签到时间</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleParticipants.map((participant) => {
                    const busy = pendingParticipantIds.has(
                      participant.participantId,
                    );
                    return (
                      <tr aria-busy={busy} key={participant.participantId}>
                        <td>
                          <strong title={participant.participantId}>{participant.displayName}</strong>
                          <span className="mono participant-id">#{participant.participantId.slice(-6)}</span>
                        </td>
                        <td>{participant.checkedIn ? "已签到" : "未签到"}</td>
                        <td>
                          {participant.checkedInAt ? (
                            <time dateTime={participant.checkedInAt}>
                              {formattedTime(participant.checkedInAt)}
                            </time>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <CheckInAction busy={busy} onCheckIn={markArrived} participant={participant} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="roster-cards">
              {visibleParticipants.map((participant) => {
                const busy = pendingParticipantIds.has(participant.participantId);
                return (
                  <article aria-busy={busy} className="roster-card" key={participant.participantId}>
                    <strong title={participant.participantId}>{participant.displayName}</strong>
                    <span className="mono participant-id">#{participant.participantId.slice(-6)}</span>
                    <div className="roster-card-row">
                      <span>{participant.checkedIn ? "已签到" : "未签到"}</span>
                      {participant.checkedInAt ? (
                        <time dateTime={participant.checkedInAt}>
                          {formattedTime(participant.checkedInAt)}
                        </time>
                      ) : null}
                    </div>
                    <CheckInAction busy={busy} onCheckIn={markArrived} participant={participant} />
                  </article>
                );
              })}
            </div>
          </section>
          );
        })() : null}
      </main>
      <style jsx>{`
        .roster-controls { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
        .roster-controls :global(input.field) { flex: 1 1 220px; max-width: 340px; }
        .roster-segments { display: flex; flex-wrap: wrap; gap: 8px; }
        .roster-table-wrap { margin-top: 16px; }
        .roster-table { border-collapse: collapse; width: 100%; }
        .roster-table th, .roster-table td {
          border-bottom: 1px solid var(--border);
          padding: 12px 10px;
          text-align: left;
          vertical-align: middle;
        }
        .roster-table th { color: var(--text-3); font-size: 11px; }
        .participant-id { color: var(--text-3); font-size: 10px; margin-left: 8px; }
        .roster-cards { display: none; }
        .roster-card { border-top: 1px solid var(--border); display: grid; gap: 10px; padding: 16px 0; }
        .roster-card-row { align-items: center; color: var(--text-2); display: flex; flex-wrap: wrap; font-size: 12px; gap: 8px; justify-content: space-between; }
        .skeleton-row { animation: pulse 1.4s ease-in-out infinite; background: var(--surface-2); border-radius: 10px; height: 42px; margin-bottom: 12px; }
        .sr-only { height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; width: 1px; clip: rect(0, 0, 0, 0); white-space: nowrap; }
        @keyframes pulse { 50% { opacity: 0.45; } }
        @media (max-width: 680px) {
          .roster-table-wrap { display: none; }
          .roster-cards { display: grid; margin-top: 12px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .skeleton-row { animation: none; }
        }
      `}</style>
    </div>
  );
}
