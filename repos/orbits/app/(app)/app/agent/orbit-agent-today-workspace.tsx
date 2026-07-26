"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";

type SignalStatus =
  | "new"
  | "acknowledged"
  | "snoozed"
  | "dismissed"
  | "resolved";
type SignalStatusUpdate = Exclude<SignalStatus, "new" | "resolved">;

interface AgentTodaySignalView {
  signalId: string;
  type: "followup_due" | "event_upcoming" | "relationship_stale";
  title: string;
  summary: string;
  reason: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  status: SignalStatus;
  lastObservedAt: string;
  changes: readonly { field: string; before?: string; after?: string }[];
  sources: readonly {
    sourceLabel: string;
    capturedAt: string;
  }[];
  actions: readonly {
    actionId: "open" | "ask_agent" | "mark_done";
    label: string;
    href: string;
    prompt?: string;
  }[];
}

interface OrbitAgentTodayWorkspaceProps {
  navigate: (href: string) => void;
  onAsk: (query: string) => void;
  surface: "desktop" | "mobile";
}

function signalIcon(signal: AgentTodaySignalView): string {
  if (signal.type === "event_upcoming") return "calendar";
  if (signal.type === "followup_due") return "clock";
  return "users";
}

function sourceFreshness(capturedAt: string, language: "en" | "zh"): string {
  const captured = Date.parse(capturedAt);
  if (!Number.isFinite(captured)) {
    return language === "zh" ? "更新时间未知" : "Freshness unknown";
  }
  const minutes = Math.max(0, Math.floor((Date.now() - captured) / 60_000));
  if (minutes < 60) {
    return language === "zh"
      ? `${Math.max(1, minutes)} 分钟前更新`
      : `Updated ${Math.max(1, minutes)}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return language === "zh" ? `${hours} 小时前更新` : `Updated ${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return language === "zh" ? `${days} 天前更新` : `Updated ${days}d ago`;
}

function snoozeUntilTomorrow(): string {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next.toISOString();
}

function errorMessage(value: unknown): string | null {
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
  return null;
}

export function OrbitAgentTodayWorkspace({
  navigate,
  onAsk,
  surface,
}: OrbitAgentTodayWorkspaceProps) {
  const { language, t } = useOrbitLanguage();
  const activeLanguage = language === "zh" ? "zh" : "en";
  const [signals, setSignals] = useState<readonly AgentTodaySignalView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeSurface, setActiveSurface] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const apply = () => {
      setActiveSurface(
        surface === "mobile" ? media.matches : !media.matches,
      );
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [surface]);

  const refresh = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/signals", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: { signals?: readonly AgentTodaySignalView[] };
      } | null;
      if (!response.ok || !payload?.data?.signals) {
        throw new Error(
          errorMessage(payload) ??
            (activeLanguage === "zh"
              ? "暂时无法读取关系信号。"
              : "Relationship signals are unavailable."),
        );
      }
      setSignals(payload.data.signals);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : activeLanguage === "zh"
            ? "暂时无法读取关系信号。"
            : "Relationship signals are unavailable.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeLanguage]);

  useEffect(() => {
    if (activeSurface) void refresh();
  }, [activeSurface, refresh]);

  const visibleSignals = useMemo(
    () =>
      signals
        .filter(
          (signal) =>
            signal.status === "new" || signal.status === "acknowledged",
        )
        .slice(0, 8),
    [signals],
  );

  const updateStatus = async (
    signal: AgentTodaySignalView,
    status: SignalStatusUpdate,
  ) => {
    setUpdatingId(signal.signalId);
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/signals/${encodeURIComponent(signal.signalId)}`,
        {
          body: JSON.stringify({
            status,
            snoozedUntil:
              status === "snoozed" ? snoozeUntilTomorrow() : undefined,
          }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        data?: { signal?: AgentTodaySignalView };
      } | null;
      if (!response.ok || !payload?.data?.signal) {
        throw new Error(
          errorMessage(payload) ??
            (activeLanguage === "zh"
              ? "更新失败，请重试。"
              : "The update failed. Please retry."),
        );
      }
      const updated = payload.data.signal;
      setSignals((current) =>
        current.map((item) =>
          item.signalId === updated.signalId ? updated : item,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : activeLanguage === "zh"
            ? "更新失败，请重试。"
            : "The update failed. Please retry.",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  if (!activeSurface) return null;

  return (
    <section
      aria-labelledby="orbit-agent-today-title"
      className="orbit-agent-today-workspace"
      data-orbit-agent-today-workspace
      style={{ margin: "0 auto", maxWidth: 820, padding: "10px 0 24px" }}
    >
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: 16,
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <div>
          <div className="eyebrow">
            {t({ en: "Relationship command center", zh: "关系工作台" })}
          </div>
          <h1
            className="h-title"
            id="orbit-agent-today-title"
            style={{ margin: "5px 0 4px" }}
          >
            {t({ en: "What needs your attention", zh: "今天值得你关注的事" })}
          </h1>
          <p
            style={{
              color: "var(--text-3)",
              fontSize: 13,
              margin: 0,
            }}
          >
            {t({
              en: "Only meaningful changes from your relationships, follow-ups and calendar.",
              zh: "只呈现来自人脉、跟进和日程的重大变化。",
            })}
          </p>
        </div>
        <button
          className="btn btn-sm btn-quiet"
          data-orbit-agent-signals-refresh
          disabled={refreshing}
          onClick={() => void refresh(true)}
          type="button"
        >
          <Icon name="refresh" size={14} />
          {refreshing
            ? t({ en: "Refreshing", zh: "刷新中" })
            : t({ en: "Refresh", zh: "刷新" })}
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            background: "var(--amber-soft)",
            borderRadius: "var(--r-md)",
            color: "var(--amber-text)",
            fontSize: 13,
            marginBottom: 14,
            padding: "11px 13px",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div
          aria-live="polite"
          className="card"
          style={{ color: "var(--text-3)", padding: 24, textAlign: "center" }}
        >
          {t({
            en: "Checking relationship changes…",
            zh: "正在核对关系变化…",
          })}
        </div>
      ) : visibleSignals.length > 0 ? (
        <div style={{ display: "grid", gap: 12 }}>
          {visibleSignals.map((signal) => {
            const primary = signal.actions[0];
            const askAction = signal.actions.find(
              (action) => action.actionId === "ask_agent",
            );
            const changed = signal.changes.length > 0;
            return (
              <article
                className="card"
                data-orbit-agent-signal={signal.signalId}
                key={signal.signalId}
                style={{
                  borderColor: "var(--border-2)",
                  borderLeft:
                    signal.severity === "critical" ||
                    signal.severity === "high"
                      ? "3px solid var(--accent)"
                      : "1px solid var(--border-2)",
                  boxShadow: "var(--sh-card)",
                  padding: 16,
                }}
              >
                <div
                  style={{
                    alignItems: "flex-start",
                    display: "flex",
                    gap: 13,
                  }}
                >
                  <span
                    style={{
                      alignItems: "center",
                      background: "var(--accent-softer)",
                      borderRadius: "var(--r-md)",
                      color: "var(--accent)",
                      display: "inline-flex",
                      flexShrink: 0,
                      height: 38,
                      justifyContent: "center",
                      width: 38,
                    }}
                  >
                    <Icon name={signalIcon(signal)} size={18} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        alignItems: "center",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 7,
                      }}
                    >
                      <strong style={{ color: "var(--ink)", fontSize: 15 }}>
                        {signal.title}
                      </strong>
                      {changed ? (
                        <span
                          style={{
                            background: "var(--amber-soft)",
                            borderRadius: "var(--r-pill)",
                            color: "var(--amber-text)",
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "3px 7px",
                          }}
                        >
                          {t({ en: "Changed", zh: "有变化" })}
                        </span>
                      ) : null}
                    </div>
                    <p
                      style={{
                        color: "var(--text-2)",
                        fontSize: 13,
                        lineHeight: 1.55,
                        margin: "5px 0 0",
                      }}
                    >
                      {signal.summary}
                    </p>
                    <p
                      style={{
                        color: "var(--accent)",
                        fontSize: 12,
                        lineHeight: 1.5,
                        margin: "4px 0 0",
                      }}
                    >
                      {signal.reason}
                    </p>
                    <div
                      style={{
                        alignItems: "center",
                        color: "var(--text-4)",
                        display: "flex",
                        flexWrap: "wrap",
                        fontSize: 11,
                        gap: 6,
                        marginTop: 8,
                      }}
                    >
                      <span>{signal.sources[0]?.sourceLabel}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {sourceFreshness(
                          signal.sources[0]?.capturedAt ??
                            signal.lastObservedAt,
                          activeLanguage,
                        )}
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        {t({ en: "Confidence", zh: "置信度" })}{" "}
                        {Math.round(signal.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 13,
                    paddingLeft: 51,
                  }}
                >
                  {primary ? (
                    <button
                      className="btn btn-sm"
                      onClick={() => navigate(primary.href)}
                      type="button"
                    >
                      {primary.label}
                    </button>
                  ) : null}
                  {askAction?.prompt ? (
                    <button
                      className="btn btn-sm btn-quiet"
                      onClick={() => onAsk(askAction.prompt!)}
                      type="button"
                    >
                      <Icon name="sparkle" size={14} />
                      {askAction.label}
                    </button>
                  ) : null}
                  <button
                    aria-label={t({
                      en: `Snooze ${signal.title}`,
                      zh: `稍后处理 ${signal.title}`,
                    })}
                    className="btn btn-sm btn-quiet"
                    disabled={updatingId === signal.signalId}
                    onClick={() => void updateStatus(signal, "snoozed")}
                    type="button"
                  >
                    {t({ en: "Tomorrow", zh: "明天提醒" })}
                  </button>
                  <button
                    aria-label={t({
                      en: `Dismiss ${signal.title}`,
                      zh: `忽略 ${signal.title}`,
                    })}
                    className="btn btn-sm btn-quiet"
                    disabled={updatingId === signal.signalId}
                    onClick={() => void updateStatus(signal, "dismissed")}
                    type="button"
                  >
                    {t({ en: "Dismiss", zh: "忽略" })}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div
          className="card"
          data-orbit-agent-signals-empty
          style={{ padding: "28px 22px", textAlign: "center" }}
        >
          <span
            style={{
              alignItems: "center",
              background: "var(--live-soft)",
              borderRadius: "50%",
              color: "var(--live-text)",
              display: "inline-flex",
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <Icon name="check" size={19} />
          </span>
          <strong
            style={{
              color: "var(--ink)",
              display: "block",
              marginTop: 10,
            }}
          >
            {t({ en: "You are caught up", zh: "今天没有必须处理的变化" })}
          </strong>
          <p
            style={{
              color: "var(--text-3)",
              fontSize: 13,
              margin: "5px 0 0",
            }}
          >
            {t({
              en: "Orbit will surface the next meaningful relationship change here.",
              zh: "下一条重要的关系变化会出现在这里。",
            })}
          </p>
        </div>
      )}
    </section>
  );
}
