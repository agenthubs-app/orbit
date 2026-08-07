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

  // 渲染成 iOrbit 简报卡（.brief）内部的 lede + 「现在最值得做」玻璃行，
  // 视觉照 docs/designs/journey/home-console-green.html；数据仍是真实信号。
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
      ) : visibleSignals.length > 0 ? (
        <>
          <p className="brief-lede">{visibleSignals[0].summary}</p>
          {visibleSignals.slice(0, 3).map((signal) => {
            const primary = signal.actions[0];
            const askAction = signal.actions.find(
              (action) => action.actionId === "ask_agent",
            );
            return (
              <div
                className="glass brief-suggest"
                data-orbit-agent-signal={signal.signalId}
                key={signal.signalId}
              >
                <Icon color="var(--accent)" name={signalIcon(signal)} size={19} />
                <div className="txt">
                  <b>{signal.title}</b>
                  <span>{signal.reason}</span>
                </div>
                {primary ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => navigate(primary.href)}
                    type="button"
                  >
                    {primary.label}
                    <Icon name="arrow" size={14} />
                  </button>
                ) : null}
                {askAction?.prompt ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onAsk(askAction.prompt!)}
                    type="button"
                  >
                    {askAction.label}
                  </button>
                ) : null}
                <button
                  aria-label={t({
                    en: `Snooze ${signal.title}`,
                    zh: `稍后处理 ${signal.title}`,
                  })}
                  className="brief-signal-quiet"
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
                  className="brief-signal-quiet"
                  disabled={updatingId === signal.signalId}
                  onClick={() => void updateStatus(signal, "dismissed")}
                  type="button"
                >
                  {t({ en: "Dismiss", zh: "忽略" })}
                </button>
              </div>
            );
          })}
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
