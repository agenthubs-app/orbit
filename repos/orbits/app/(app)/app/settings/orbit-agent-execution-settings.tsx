"use client";

import { useEffect, useState } from "react";

interface Preferences {
  autoPrepareMeetingNotes: boolean;
  postEventReminderPushEnabled: boolean;
  preEventBriefPushEnabled: boolean;
  quietHours: { start: string; end: string };
  timeZone: string;
}

interface IntegrationStatus {
  provider: "google_calendar" | "gmail" | "microsoft_graph";
  status: "active" | "expired" | "pending" | "revoked" | "unavailable";
  scopes: readonly string[];
  capabilities: readonly (
    | "calendar.read"
    | "calendar.write"
    | "mail.metadata.read"
  )[];
  healthStatus:
    | "healthy"
    | "not_checked"
    | "action_required"
    | "degraded"
    | "unavailable";
  healthMessage: string;
  lastCheckedAt?: string;
}

const DEFAULT_PREFERENCES: Preferences = {
  autoPrepareMeetingNotes: true,
  postEventReminderPushEnabled: true,
  preEventBriefPushEnabled: true,
  quietHours: { start: "22:00", end: "08:00" },
  timeZone: "Asia/Tokyo",
};

/**
 * Agent 执行、通知与外部连接设置。
 *
 * 设置写入 Agent preferences；外部集成仍独立 OAuth 授权，不复用登录身份。
 * 组件只出现在统一设置中心，操作账本只负责审计。
 */
function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        display: "flex",
        gap: 12,
        padding: "14px 0",
      }}
    >
      <span style={{ color: "var(--text)", flex: 1, fontSize: 14 }}>{label}</span>
      {/* globals.css 给裸 input 设了 width:100% + min-height，checkbox 必须显式覆盖。 */}
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ flexShrink: 0, height: 16, width: 16 }}
        type="checkbox"
      />
    </label>
  );
}

export function OrbitAgentExecutionSettings() {
  const [preferences, setPreferences] =
    useState<Preferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [integrations, setIntegrations] =
    useState<readonly IntegrationStatus[]>([]);
  const [checkingProvider, setCheckingProvider] =
    useState<IntegrationStatus["provider"] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/agent/preferences", { signal: controller.signal }),
      fetch("/api/integrations", { signal: controller.signal }),
    ])
      .then(async ([preferencesResponse, integrationsResponse]) => {
        const preferencesBody =
          (await preferencesResponse.json()) as { data?: Preferences };
        const integrationsBody =
          (await integrationsResponse.json()) as {
            data?: readonly IntegrationStatus[];
          };
        if (preferencesResponse.ok && preferencesBody.data) {
          setPreferences(preferencesBody.data);
        }
        if (integrationsResponse.ok && integrationsBody.data) {
          setIntegrations(integrationsBody.data);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function save(): Promise<void> {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/agent/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(preferences),
      });
      if (!response.ok) throw new Error("save failed");
      setMessage("已保存");
    } catch {
      setMessage("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(provider: IntegrationStatus["provider"]) {
    setMessage(null);
    const response = await fetch(
      `/api/integrations/${encodeURIComponent(provider)}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setMessage("断开失败，请重试");
      return;
    }
    setIntegrations((current) =>
      current.map((integration) =>
        integration.provider === provider
          ? {
              ...integration,
              capabilities: [],
              healthMessage: "Connect this provider to enable its capabilities.",
              healthStatus: "action_required",
              lastCheckedAt: undefined,
              scopes: [],
              status: "revoked",
            }
          : integration,
      ),
    );
    setMessage("已断开连接");
  }

  async function checkIntegration(provider: IntegrationStatus["provider"]) {
    setCheckingProvider(provider);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(provider)}/health`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as
        | { data?: IntegrationStatus }
        | null;
      if (!response.ok || !body?.data) {
        throw new Error("health check failed");
      }
      setIntegrations((current) =>
        current.map((integration) =>
          integration.provider === provider ? body.data! : integration,
        ),
      );
      setMessage(
        body.data.healthStatus === "healthy"
          ? "连接检查通过"
          : "连接异常，请重新授权或稍后重试",
      );
    } catch {
      setMessage("连接检查失败，请重试");
    } finally {
      setCheckingProvider(null);
    }
  }

  return (
    <section
      aria-labelledby="orbit-agent-execution-settings-title"
      data-orbit-agent-execution-settings
      style={{ marginTop: 28 }}
    >
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        Agent 执行与通知
      </div>
      <h2
        id="orbit-agent-execution-settings-title"
        style={{
          color: "var(--ink)",
          fontSize: 22,
          lineHeight: 1.3,
          margin: "8px 0 6px",
        }}
      >
        安全执行与外部连接
      </h2>
      <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 8px" }}>
        读取与草稿自动完成；系统内写入逐次确认；对外消息永不自动发送。
      </p>

      <ToggleRow
        checked={preferences.autoPrepareMeetingNotes}
        label="自动准备会面笔记"
        onChange={(autoPrepareMeetingNotes) =>
          setPreferences((current) => ({
            ...current,
            autoPrepareMeetingNotes,
          }))
        }
      />
      <ToggleRow
        checked={preferences.postEventReminderPushEnabled}
        label="活动后推送跟进提醒"
        onChange={(postEventReminderPushEnabled) =>
          setPreferences((current) => ({
            ...current,
            postEventReminderPushEnabled,
          }))
        }
      />
      <ToggleRow
        checked={preferences.preEventBriefPushEnabled}
        label="重要活动前推送未查看的会前简报"
        onChange={(preEventBriefPushEnabled) =>
          setPreferences((current) => ({
            ...current,
            preEventBriefPushEnabled,
          }))
        }
      />

      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 12,
          padding: "14px 0",
        }}
      >
        <span style={{ color: "var(--text)", flex: 1, fontSize: 14 }}>安静时段</span>
        <input
          aria-label="安静时段开始"
          className="field"
          onInput={(event) => {
            const start = event.currentTarget.value;
            setPreferences((current) => ({
              ...current,
              quietHours: {
                ...current.quietHours,
                start,
              },
            }));
          }}
          style={{ minHeight: 36, width: 105 }}
          type="time"
          value={preferences.quietHours.start}
        />
        <span aria-hidden>–</span>
        <input
          aria-label="安静时段结束"
          className="field"
          onInput={(event) => {
            const end = event.currentTarget.value;
            setPreferences((current) => ({
              ...current,
              quietHours: {
                ...current.quietHours,
                end,
              },
            }));
          }}
          style={{ minHeight: 36, width: 105 }}
          type="time"
          value={preferences.quietHours.end}
        />
      </div>
      <label
        style={{
          alignItems: "center",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 12,
          padding: "14px 0",
        }}
      >
        <span style={{ color: "var(--text)", flex: 1, fontSize: 14 }}>
          通知时区
        </span>
        <input
          aria-label="通知时区"
          className="field"
          onChange={(event) => {
            const timeZone = event.currentTarget.value;
            setPreferences((current) => ({
              ...current,
              timeZone,
            }));
          }}
          placeholder="Asia/Tokyo"
          style={{ minHeight: 36, width: 180 }}
          value={preferences.timeZone}
        />
      </label>
      <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {message ? (
          <span aria-live="polite" style={{ color: "var(--text-3)", fontSize: 13 }}>
            {message}
          </span>
        ) : null}
        <button
          className="btn btn-primary"
          disabled={loading || saving}
          onClick={() => void save()}
          type="button"
        >
          {saving ? "保存中…" : "保存设置"}
        </button>
      </div>

      <div className="eyebrow" style={{ marginBottom: 4, marginTop: 28 }}>
        外部数据连接
      </div>
      <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 8px" }}>
        登录与数据授权分离。健康检查只发起只读请求；外部日历写入逐次确认并记录回执，Orbit 永不自动发信。
      </p>
      {integrations.map((integration) => {
        const label = {
          google_calendar: "Google Calendar",
          gmail: "Gmail 元数据",
          microsoft_graph: "Microsoft Calendar / Mail metadata",
        }[integration.provider];
        const connected = integration.status === "active";
        const healthLabel = {
          healthy: "连接正常",
          not_checked: "待检查",
          action_required: "需要授权",
          degraded: "连接异常",
          unavailable: "未配置",
        }[integration.healthStatus];
        const capabilityLabels = integration.capabilities.map((capability) => ({
          "calendar.read": "读取日历",
          "calendar.write": "写入日历",
          "mail.metadata.read": "读取邮件元数据",
        })[capability]);
        return (
          <div
            key={integration.provider}
            style={{
              alignItems: "center",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: 12,
              padding: "14px 0",
            }}
          >
            <span style={{ flex: 1 }}>
              <span style={{ color: "var(--text)", display: "block", fontSize: 14 }}>
                {label}
              </span>
              <span style={{ color: "var(--text-4)", display: "block", fontSize: 12, marginTop: 2 }}>
                {connected
                  ? `${healthLabel} · ${
                      capabilityLabels.length > 0
                        ? capabilityLabels.join("、")
                        : "没有可用权限"
                    }`
                  : integration.status === "unavailable"
                    ? "部署环境尚未配置"
                    : integration.status === "expired"
                      ? "授权已过期"
                      : "未连接"}
              </span>
              {connected ? (
                <span style={{ color: "var(--text-4)", display: "block", fontSize: 11, marginTop: 3 }}>
                  {integration.healthMessage}
                  {integration.lastCheckedAt
                    ? ` · ${new Date(integration.lastCheckedAt).toLocaleString("zh-CN")}`
                    : ""}
                </span>
              ) : null}
            </span>
            {connected ? (
              <span style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-ghost"
                  disabled={checkingProvider === integration.provider}
                  onClick={() => void checkIntegration(integration.provider)}
                  type="button"
                >
                  {checkingProvider === integration.provider
                    ? "检查中…"
                    : "检查连接"}
                </button>
                <button
                  className="btn btn-quiet"
                  disabled={checkingProvider === integration.provider}
                  onClick={() => void disconnect(integration.provider)}
                  type="button"
                >
                  断开
                </button>
              </span>
            ) : integration.status !== "unavailable" ? (
              <a
                className="btn btn-ghost"
                href={`/api/integrations/${integration.provider}/authorize`}
              >
                连接
              </a>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
