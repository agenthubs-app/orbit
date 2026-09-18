"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  EventOperationsLimitedCheckInRoster,
  EventOperationsLimitedCheckInRosterItem,
} from "../../../../../../../features/events/event-operations/check-in-roster";
import { ORBIT_0918_COLORS as C, ORBIT_0918_FONTS } from "../../../../orbit-0918-tokens";
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
      className={participant.checkedIn ? "ci-btn ci-btn-done" : "ci-btn ci-btn-dark"}
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
    <div data-orbit-real-page="event-operations-check-in" style={{ background: C.pageBg, color: C.ink, fontFamily: ORBIT_0918_FONTS.sans, minHeight: "100dvh" }}>
      <style>{CI_0918_CSS}</style>
      <PublicTopNav active="events" />
      <main className="ci-main">
        <nav className="ci-crumb">
          <a href={`/app/events/${encodeURIComponent(eventId)}/operations`}>运营台</a>
          {" / "}
          <span>签到</span>
        </nav>
        <div className="ci-head">
          <div className="ci-head-title">
            <h1>签到</h1>
            <p>面向现场工作人员的最小签到视图，仅显示签到所需信息；签到时间以服务器首次记录为准。</p>
            <div className="ci-eid">{eventId}</div>
          </div>
          <button className="ci-btn ci-btn-ghost" disabled={loading} onClick={() => void loadRoster()} type="button">
            <Icon name="refresh" size={16} /> {loading ? "刷新中…" : "刷新名单"}
          </button>
        </div>

        <div aria-live="polite" role="status">
          {notice ? <div className="ci-notice">{notice}</div> : null}
        </div>
        {error ? (
          <div className="ci-alert" role="alert">
            <strong>{error}</strong>
            <button className="ci-btn ci-btn-ghost ci-btn-sm" onClick={() => void loadRoster()} type="button">
              重试
            </button>
          </div>
        ) : null}

        {loading && !roster ? (
          <section aria-label="正在加载签到名单" className="ci-card ci-skeleton">
            {Array.from({ length: 6 }, (_, index) => (
              <div aria-hidden="true" className="ci-skeleton-row" key={index} />
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
          <>
            <section className="ci-stats">
              <div className="ci-stat">
                <span className="ci-stat-icon">◷</span>
                <span className="ci-stat-meta"><span>未签到</span><strong>{totalCount - checkedCount}</strong></span>
              </div>
              <div className="ci-stat">
                <span className="ci-stat-icon ci-stat-icon-green">✓</span>
                <span className="ci-stat-meta"><span>已签到</span><strong>{checkedCount}</strong></span>
              </div>
              <div className="ci-stat ci-stat-note">
                <span className="ci-stat-icon">ⓘ</span>
                <span className="ci-stat-note-text">
                  <strong>此页面仅显示签到所需信息</strong>
                  <span>重复签到保留服务器首次记录时间</span>
                </span>
              </div>
            </section>

            <section className="ci-card">
              <div className="ci-card-head">
                <div className="ci-card-title">
                  <span className="ci-eyebrow">LIMITED ROSTER · 最小权限名单</span>
                  <h2>参会者到场状态</h2>
                </div>
                <strong aria-live="polite" className="ci-progress">已签到 {checkedCount} / {totalCount}</strong>
              </div>
              <p className="ci-note">本页面只显示签到所需的姓名、参会者编号和到场时间。</p>

              <div className="ci-controls">
                <span className="ci-search">
                  <span aria-hidden="true" className="ci-search-icon">⌕</span>
                  <input
                    aria-label="按姓名搜索参会者"
                    className="ci-search-input"
                    onInput={(input) => setQuery(input.currentTarget.value)}
                    placeholder="输入姓名快速查找…"
                    type="search"
                    value={query}
                  />
                </span>
                <div aria-label="签到状态筛选" className="ci-segments" role="group">
                  {([
                    ["all", `全部 ${totalCount}`],
                    ["pending", `未签到 ${totalCount - checkedCount}`],
                    ["done", `已签到 ${checkedCount}`],
                  ] as const).map(([value, label]) => (
                    <button
                      aria-pressed={segment === value}
                      className={segment === value ? "ci-segment ci-segment-on" : "ci-segment"}
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
                <p role="status" className="ci-empty">
                  没有匹配的参会者。换一个姓名试试，或清空筛选。
                </p>
              ) : null}

              <div className="ci-table-wrap">
                <table className="ci-table">
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
                            <span className="ci-person">
                              <span aria-hidden="true" className="ci-ava">{participant.displayName.slice(0, 1)}</span>
                              <span className="ci-person-meta">
                                <strong title={participant.participantId}>{participant.displayName}</strong>
                                <span className="ci-pid">#{participant.participantId.slice(-6)}</span>
                              </span>
                            </span>
                          </td>
                          <td>
                            <span className={participant.checkedIn ? "ci-pill ci-pill-green" : "ci-pill"}>
                              ● {participant.checkedIn ? "已签到" : "未签到"}
                            </span>
                          </td>
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

              <div className="ci-cards">
                {visibleParticipants.map((participant) => {
                  const busy = pendingParticipantIds.has(participant.participantId);
                  return (
                    <article aria-busy={busy} className="ci-row-card" key={participant.participantId}>
                      <span className="ci-person">
                        <span aria-hidden="true" className="ci-ava">{participant.displayName.slice(0, 1)}</span>
                        <span className="ci-person-meta">
                          <strong title={participant.participantId}>{participant.displayName}</strong>
                          <span className="ci-pid">#{participant.participantId.slice(-6)}</span>
                        </span>
                      </span>
                      <div className="ci-row-card-meta">
                        <span className={participant.checkedIn ? "ci-pill ci-pill-green" : "ci-pill"}>
                          ● {participant.checkedIn ? "已签到" : "未签到"}
                        </span>
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
          </>
          );
        })() : null}
      </main>
    </div>
  );
}

/** Orbit_0918 签到台作用域样式（属性选择器不写引号，避免静态渲染转义失效）。 */
const CI_0918_CSS = `
[data-orbit-real-page=event-operations-check-in] .ci-main { margin: 0 auto; max-width: 1080px; padding: 14px clamp(16px,4vw,40px) 72px; display: flex; flex-direction: column; gap: 22px; }
[data-orbit-real-page=event-operations-check-in] .ci-crumb { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page=event-operations-check-in] .ci-crumb a { color: #6B6F99; text-decoration: none; }
[data-orbit-real-page=event-operations-check-in] .ci-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 18px; }
[data-orbit-real-page=event-operations-check-in] .ci-head-title h1 { margin: 0; font-family: 'Noto Serif SC','Songti SC','SimSun',serif; font-weight: 900; font-size: clamp(28px,3.4vw,40px); letter-spacing: -0.03em; }
[data-orbit-real-page=event-operations-check-in] .ci-head-title p { margin: 10px 0 0; font-size: 15px; color: #3B3F7A; max-width: 560px; }
[data-orbit-real-page=event-operations-check-in] .ci-eid { margin-top: 10px; font-size: 11px; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
[data-orbit-real-page=event-operations-check-in] .ci-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 18px; border-radius: 10px; font-size: 14px; font-family: inherit; cursor: pointer; border: 1px solid transparent; background: transparent; color: #3B3F7A; }
[data-orbit-real-page=event-operations-check-in] .ci-btn:disabled { opacity: .55; cursor: default; }
[data-orbit-real-page=event-operations-check-in] .ci-btn-dark { background: #0E1225; border-color: #0E1225; color: #FFFFFF; font-weight: 500; }
[data-orbit-real-page=event-operations-check-in] .ci-btn-dark:hover:not(:disabled) { background: #2E3270; border-color: #2E3270; }
[data-orbit-real-page=event-operations-check-in] .ci-btn-ghost { background: #FFFFFF; border-color: #DDDEFA; color: #3B3F7A; }
[data-orbit-real-page=event-operations-check-in] .ci-btn-ghost:hover:not(:disabled) { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page=event-operations-check-in] .ci-btn-done { background: #F1F1FA; border-color: #F1F1FA; color: #9FA3C4; }
[data-orbit-real-page=event-operations-check-in] .ci-btn-sm { padding: 9px 14px; font-size: 13px; border-radius: 9px; }
[data-orbit-real-page=event-operations-check-in] .ci-notice { border: 1px solid #DDDEFA; background: #ECEEFB; color: #2E3270; border-radius: 14px; padding: 13px 16px; font-size: 14px; }
[data-orbit-real-page=event-operations-check-in] .ci-alert { border: 1px solid #FBECEA; background: #FBECEA; color: #B5473A; border-radius: 14px; padding: 16px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; }
[data-orbit-real-page=event-operations-check-in] .ci-stats { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); gap: 16px; }
[data-orbit-real-page=event-operations-check-in] .ci-stat { display: flex; align-items: center; gap: 16px; padding: 20px; border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; }
[data-orbit-real-page=event-operations-check-in] .ci-stat-icon { width: 44px; height: 44px; flex: none; border-radius: 50%; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 17px; }
[data-orbit-real-page=event-operations-check-in] .ci-stat-icon-green { background: #E6F1EC; color: #2F6B4F; }
[data-orbit-real-page=event-operations-check-in] .ci-stat-meta { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page=event-operations-check-in] .ci-stat-meta > span { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page=event-operations-check-in] .ci-stat-meta > strong { font-family: 'Noto Serif SC','Songti SC','SimSun',serif; font-weight: 900; font-size: 28px; letter-spacing: -0.02em; }
[data-orbit-real-page=event-operations-check-in] .ci-stat-note { background: #F7F7FD; align-items: flex-start; }
[data-orbit-real-page=event-operations-check-in] .ci-stat-note-text { display: flex; flex-direction: column; gap: 5px; }
[data-orbit-real-page=event-operations-check-in] .ci-stat-note-text strong { font-size: 13px; font-weight: 500; }
[data-orbit-real-page=event-operations-check-in] .ci-stat-note-text span { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page=event-operations-check-in] .ci-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page=event-operations-check-in] .ci-card-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
[data-orbit-real-page=event-operations-check-in] .ci-card-title { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page=event-operations-check-in] .ci-eyebrow { font-size: 10px; letter-spacing: .14em; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
[data-orbit-real-page=event-operations-check-in] .ci-card-title h2 { margin: 0; font-family: 'Noto Serif SC','Songti SC','SimSun',serif; font-weight: 900; font-size: 20px; letter-spacing: -0.02em; }
[data-orbit-real-page=event-operations-check-in] .ci-progress { font-size: 15px; color: #4B4FC7; }
[data-orbit-real-page=event-operations-check-in] .ci-note { margin: 0; font-size: 13px; color: #6B6F99; }
[data-orbit-real-page=event-operations-check-in] .ci-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; }
[data-orbit-real-page=event-operations-check-in] .ci-search { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; flex: 1 1 240px; max-width: 360px; }
[data-orbit-real-page=event-operations-check-in] .ci-search-icon { color: #9FA3C4; }
[data-orbit-real-page=event-operations-check-in] .ci-search-input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font-size: 13px; font-family: inherit; color: #0E1225; }
[data-orbit-real-page=event-operations-check-in] .ci-segments { display: flex; gap: 6px; padding: 5px; border-radius: 10px; background: #F7F7FD; }
[data-orbit-real-page=event-operations-check-in] .ci-segment { padding: 9px 18px; border: 0; border-radius: 8px; background: transparent; color: #6B6F99; font-size: 13px; font-family: inherit; cursor: pointer; }
[data-orbit-real-page=event-operations-check-in] .ci-segment-on { background: #DDDEFA; color: #2E3270; font-weight: 500; }
[data-orbit-real-page=event-operations-check-in] .ci-empty { margin: 4px 0 0; font-size: 14px; color: #9FA3C4; }
[data-orbit-real-page=event-operations-check-in] .ci-table { border-collapse: collapse; width: 100%; }
[data-orbit-real-page=event-operations-check-in] .ci-table th, [data-orbit-real-page=event-operations-check-in] .ci-table td { border-bottom: 1px solid #F1F1FA; padding: 13px 8px; text-align: left; vertical-align: middle; font-size: 14px; }
[data-orbit-real-page=event-operations-check-in] .ci-table th { color: #9FA3C4; font-size: 12px; font-weight: 400; border-bottom: 1px solid #E8E9F6; }
[data-orbit-real-page=event-operations-check-in] .ci-person { display: inline-flex; align-items: center; gap: 12px; min-width: 0; }
[data-orbit-real-page=event-operations-check-in] .ci-ava { width: 36px; height: 36px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
[data-orbit-real-page=event-operations-check-in] .ci-person-meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
[data-orbit-real-page=event-operations-check-in] .ci-person-meta strong { font-size: 14px; font-weight: 500; }
[data-orbit-real-page=event-operations-check-in] .ci-pid { font-size: 10px; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
[data-orbit-real-page=event-operations-check-in] .ci-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; background: #F1F1FA; color: #6B6F99; font-size: 12px; white-space: nowrap; }
[data-orbit-real-page=event-operations-check-in] .ci-pill-green { background: #E6F1EC; color: #2F6B4F; }
[data-orbit-real-page=event-operations-check-in] .ci-cards { display: none; }
[data-orbit-real-page=event-operations-check-in] .ci-row-card { border-top: 1px solid #F1F1FA; display: grid; gap: 12px; padding: 16px 0; }
[data-orbit-real-page=event-operations-check-in] .ci-row-card-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 12px; color: #6B6F99; }
[data-orbit-real-page=event-operations-check-in] .ci-skeleton { min-height: 320px; }
[data-orbit-real-page=event-operations-check-in] .ci-skeleton-row { animation: ci-pulse 1.4s ease-in-out infinite; background: #F7F7FD; border-radius: 10px; height: 42px; }
[data-orbit-real-page=event-operations-check-in] .sr-only { height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; width: 1px; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@keyframes ci-pulse { 50% { opacity: 0.45; } }
@media (max-width: 680px) {
  [data-orbit-real-page=event-operations-check-in] .ci-table-wrap { display: none; }
  [data-orbit-real-page=event-operations-check-in] .ci-cards { display: grid; margin-top: 4px; }
}
@media (prefers-reduced-motion: reduce) {
  [data-orbit-real-page=event-operations-check-in] .ci-skeleton-row { animation: none; }
}
`;
