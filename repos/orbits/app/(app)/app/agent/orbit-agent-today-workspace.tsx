"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";
import {
  agentSignalsToNextActionRows,
  type AgentSignalStatus,
  type AgentTodaySignalView,
} from "./orbit-agent-next-actions";

type SignalStatusUpdate = Exclude<AgentSignalStatus, "new" | "resolved">;

interface OrbitAgentTodayWorkspaceProps {
  navigate: (href: string) => void;
  onAsk: (query: string) => void;
  surface: "desktop" | "mobile";
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
      const response = await fetch("/api/agent/signals?view=home", {
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

  const actionRows = useMemo(
    () => agentSignalsToNextActionRows(signals, activeLanguage),
    [activeLanguage, signals],
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
    <div className="brief-signals" data-orbit-agent-today-workspace>
      {error ? (
        <div
          role="alert"
          style={{
            background: "var(--amber-soft)",
            borderRadius: "var(--r-md)",
            color: "var(--amber-text)",
            fontSize: 13,
            marginBottom: 12,
            padding: "10px 13px",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p aria-live="polite" className="brief-lede">
          {t({ en: "Checking relationship changes…", zh: "正在核对关系变化…" })}
        </p>
      ) : actionRows.length > 0 ? (
        <>
          <p className="brief-lede">
            {t({
              en: "Based on what changed, start with these next steps.",
              zh: "根据你的真实状态，先处理这几件事。",
            })}
          </p>
          <div className="brief-action-list">
            {actionRows.map((row) => (
              <div
                className={`glass brief-action-row${row.completed ? " is-complete" : ""}`}
                data-orbit-agent-signal={row.signal.signalId}
                key={row.signal.signalId}
              >
                <span className="brief-action-index" aria-hidden="true">
                  {row.completed ? <Icon name="check" size={15} /> : row.index}
                </span>
                <div className="brief-action-copy">
                  <b>{row.title}</b>
                  <span className="brief-action-context" title={row.context}>
                    {row.context}
                  </span>
                </div>
                <div className="brief-action-buttons">
                  {[0, 1].map((actionIndex) => {
                    const action = row.actions[actionIndex];
                    if (!action) {
                      return (
                        <span
                          aria-hidden="true"
                          className="brief-action-button-spacer"
                          key={actionIndex}
                        />
                      );
                    }
                    return (
                      <button
                        className={`btn ${actionIndex === 0 ? "btn-primary" : "btn-ghost"} btn-sm`}
                        key={`${action.kind}:${action.label}`}
                        onClick={() => {
                          if (action.kind === "ask" && action.prompt) {
                            onAsk(action.prompt);
                          } else if (action.href) {
                            navigate(action.href);
                          }
                        }}
                        type="button"
                      >
                        <span>{action.label}</span>
                        {actionIndex === 0 ? (
                          <Icon name="arrow" size={14} />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {!row.completed ? (
                  <details className="brief-action-more">
                    <summary
                      aria-label={t({
                        en: `More options for ${row.title}`,
                        zh: `${row.title}的更多操作`,
                      })}
                    >
                      <Icon name="more" size={17} />
                    </summary>
                    <div>
                      <button
                        disabled={updatingId === row.signal.signalId}
                        onClick={() =>
                          void updateStatus(row.signal, "snoozed")
                        }
                        type="button"
                      >
                        {t({ en: "Remind tomorrow", zh: "明天提醒" })}
                      </button>
                      <button
                        disabled={updatingId === row.signal.signalId}
                        onClick={() =>
                          void updateStatus(row.signal, "dismissed")
                        }
                        type="button"
                      >
                        {t({ en: "Dismiss", zh: "忽略" })}
                      </button>
                    </div>
                  </details>
                ) : (
                  <span className="brief-action-more" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="brief-lede" data-orbit-agent-signals-empty>
          {t({
            en: "You are caught up — the next meaningful relationship change will land here.",
            zh: "今天没有必须处理的变化——下一条重要的关系变化会出现在这里。",
          })}
        </p>
      )}

      <button
        className="brief-refresh"
        data-orbit-agent-signals-refresh
        disabled={refreshing}
        onClick={() => void refresh(true)}
        type="button"
      >
        <Icon name="refresh" size={12} />
        {refreshing
          ? t({ en: "Refreshing", zh: "刷新中" })
          : t({ en: "Refresh", zh: "刷新" })}
      </button>
    </div>
  );
}
