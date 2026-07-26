"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AgentAutomation,
  AgentAutomationSchedule,
} from "../../../../features/agent/automations/contract";
import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";

type ScheduleKind = AgentAutomationSchedule["kind"];

const capabilityOptions = [
  {
    id: "followups.reviewQueue",
    en: "Follow-up review",
    zh: "跟进关系复核",
  },
  {
    id: "contacts.recommend",
    en: "Contact recommendations",
    zh: "人脉机会推荐",
  },
  {
    id: "events.recommend",
    en: "Event recommendations",
    zh: "活动机会推荐",
  },
  {
    id: "chat.context",
    en: "Relationship context review",
    zh: "关系上下文复核",
  },
] as const;

const weekdayOptions = [
  { value: 1, en: "Mon", zh: "一" },
  { value: 2, en: "Tue", zh: "二" },
  { value: 3, en: "Wed", zh: "三" },
  { value: 4, en: "Thu", zh: "四" },
  { value: 5, en: "Fri", zh: "五" },
  { value: 6, en: "Sat", zh: "六" },
  { value: 0, en: "Sun", zh: "日" },
] as const;

function defaultOnceValue(): string {
  const date = new Date(Date.now() + 24 * 60 * 60_000);
  date.setMinutes(0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatSchedule(
  automation: AgentAutomation,
  language: "en" | "zh",
): string {
  const { schedule } = automation;
  if (schedule.kind === "once") {
    return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(schedule.at));
  }
  if (schedule.kind === "daily") {
    return language === "zh"
      ? `每天 ${schedule.time} · ${schedule.timeZone}`
      : `Daily at ${schedule.time} · ${schedule.timeZone}`;
  }
  const labels = schedule.daysOfWeek
    .map(
      (day) =>
        weekdayOptions.find((option) => option.value === day)?.[language] ??
        String(day),
    )
    .join("、");
  return language === "zh"
    ? `每周${labels} ${schedule.time} · ${schedule.timeZone}`
    : `${labels} at ${schedule.time} · ${schedule.timeZone}`;
}

function formatNextRun(
  nextRunAt: string | null,
  language: "en" | "zh",
): string {
  if (!nextRunAt) {
    return language === "zh" ? "未安排下次运行" : "No next run";
  }
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(nextRunAt));
}

function apiError(value: unknown, fallback: string): string {
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
  return fallback;
}

const controlStyle = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--ink)",
  font: "inherit",
  minHeight: 42,
  padding: "9px 11px",
  width: "100%",
} as const;

export function OrbitAgentAutomationSettings() {
  const { language, t } = useOrbitLanguage();
  const displayLanguage = language === "zh" ? "zh" : "en";
  const [automations, setAutomations] = useState<AgentAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [capabilityId, setCapabilityId] = useState("followups.reviewQueue");
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("daily");
  const [onceAt, setOnceAt] = useState(defaultOnceValue);
  const [time, setTime] = useState("09:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]);
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );

  const capabilityLabel = useMemo(
    () =>
      Object.fromEntries(
        capabilityOptions.map((option) => [option.id, option[language]]),
      ),
    [language],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/automations", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { automations?: AgentAutomation[] };
      } | null;
      if (!response.ok) {
        throw new Error(
          apiError(
            body,
            t({
              en: "Automations could not be loaded.",
              zh: "自动任务暂时无法读取。",
            }),
          ),
        );
      }
      setAutomations(
        Array.isArray(body?.data?.automations)
          ? body.data.automations
          : [],
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({
              en: "Automations could not be loaded.",
              zh: "自动任务暂时无法读取。",
            }),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function schedulePayload(): AgentAutomationSchedule {
    if (scheduleKind === "once") {
      return { kind: "once", at: new Date(onceAt).toISOString() };
    }
    if (scheduleKind === "weekly") {
      return { kind: "weekly", daysOfWeek, time, timeZone };
    }
    return { kind: "daily", time, timeZone };
  }

  async function createAutomation() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/agent/automations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          capabilityId,
          delivery: "in_app",
          instruction,
          schedule: schedulePayload(),
          title,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { automation?: AgentAutomation };
      } | null;
      const automation = body?.data?.automation;
      if (!response.ok || !automation) {
        throw new Error(
          apiError(
            body,
            t({
              en: "The automation could not be created.",
              zh: "自动任务没有创建成功。",
            }),
          ),
        );
      }
      setAutomations((current) => [...current, automation]);
      setTitle("");
      setInstruction("");
      setNotice(
        t({
          en: "Automation created. Orbit will run it on schedule.",
          zh: "自动任务已创建，Orbit 会按计划运行。",
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({
              en: "The automation could not be created.",
              zh: "自动任务没有创建成功。",
            }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(
    automation: AgentAutomation,
    status: "active" | "paused",
  ) {
    setPendingId(automation.automationId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/agent/automations/${encodeURIComponent(automation.automationId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        data?: { automation?: AgentAutomation };
      } | null;
      const updatedAutomation = body?.data?.automation;
      if (!response.ok || !updatedAutomation) {
        throw new Error(
          apiError(
            body,
            t({ en: "The status was not changed.", zh: "状态没有更新成功。" }),
          ),
        );
      }
      setAutomations((current) =>
        current.map((item) =>
          item.automationId === automation.automationId
            ? updatedAutomation
            : item,
        ),
      );
      setNotice(
        status === "paused"
          ? t({ en: "Automation paused.", zh: "自动任务已暂停。" })
          : t({ en: "Automation resumed.", zh: "自动任务已恢复。" }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({ en: "The status was not changed.", zh: "状态没有更新成功。" }),
      );
    } finally {
      setPendingId(null);
    }
  }

  async function runNow(automation: AgentAutomation) {
    setPendingId(automation.automationId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/agent/automations/${encodeURIComponent(automation.automationId)}/run`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        data?: { automation?: AgentAutomation };
      } | null;
      const completedAutomation = body?.data?.automation;
      if (!response.ok || !completedAutomation) {
        throw new Error(
          apiError(
            body,
            t({ en: "The automation did not run.", zh: "自动任务没有运行成功。" }),
          ),
        );
      }
      setAutomations((current) =>
        current.map((item) =>
          item.automationId === automation.automationId
            ? completedAutomation
            : item,
        ),
      );
      setNotice(
        t({
          en: "Automation finished. Its result is saved below.",
          zh: "自动任务已完成，结果已保存在下方。",
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({ en: "The automation did not run.", zh: "自动任务没有运行成功。" }),
      );
    } finally {
      setPendingId(null);
    }
  }

  async function remove(automation: AgentAutomation) {
    if (deleteConfirmId !== automation.automationId) {
      setDeleteConfirmId(automation.automationId);
      return;
    }
    setPendingId(automation.automationId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/agent/automations/${encodeURIComponent(automation.automationId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          apiError(
            body,
            t({ en: "The automation was not deleted.", zh: "自动任务没有删除成功。" }),
          ),
        );
      }
      setAutomations((current) =>
        current.filter(
          (item) => item.automationId !== automation.automationId,
        ),
      );
      setDeleteConfirmId(null);
      setNotice(
        t({
          en: "Automation deleted.",
          zh: "自动任务已删除。",
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({ en: "The automation was not deleted.", zh: "自动任务没有删除成功。" }),
      );
    } finally {
      setPendingId(null);
    }
  }

  function toggleWeekday(day: number) {
    setDaysOfWeek((current) =>
      current.includes(day)
        ? current.length === 1
          ? current
          : current.filter((value) => value !== day)
        : [...current, day],
    );
  }

  return (
    <section
      aria-labelledby="orbit-agent-automation-title"
      className="card"
      data-orbit-agent-automation-settings
      style={{ marginTop: 16, padding: 24 }}
    >
      <div style={{ alignItems: "flex-start", display: "flex", gap: 14 }}>
        <span
          aria-hidden="true"
          style={{
            alignItems: "center",
            background: "var(--accent-soft)",
            borderRadius: 12,
            color: "var(--accent)",
            display: "inline-flex",
            flex: "0 0 auto",
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Icon name="clock" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            id="orbit-agent-automation-title"
            style={{ color: "var(--ink)", fontSize: 18, margin: 0 }}
          >
            {t({ en: "Agent automations", zh: "Agent 自动任务" })}
          </h2>
          <p
            style={{
              color: "var(--text-3)",
              fontSize: 13.5,
              lineHeight: 1.6,
              margin: "6px 0 18px",
            }}
          >
            {t({
              en: "Create one-time or recurring relationship reviews. Results stay in Orbit; external actions still require confirmation.",
              zh: "创建一次性或周期性的关系复核。结果保留在 Orbit 内，对外操作仍需确认。",
            })}
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", fontSize: 13, gap: 6 }}>
              {t({ en: "Task type", zh: "任务类型" })}
              <select
                aria-label={t({ en: "Task type", zh: "任务类型" })}
                onChange={(event) => setCapabilityId(event.target.value)}
                style={controlStyle}
                value={capabilityId}
              >
                {capabilityOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option[language]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", fontSize: 13, gap: 6 }}>
              {t({ en: "Name", zh: "名称" })}
              <input
                aria-label={t({ en: "Automation name", zh: "自动任务名称" })}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t({
                  en: "Friday relationship review",
                  zh: "周五关系复盘",
                })}
                style={controlStyle}
                value={title}
              />
            </label>
            <label style={{ display: "grid", fontSize: 13, gap: 6 }}>
              {t({ en: "What should Orbit do?", zh: "希望 Orbit 做什么？" })}
              <textarea
                aria-label={t({
                  en: "Automation instruction",
                  zh: "自动任务指令",
                })}
                maxLength={4000}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={t({
                  en: "Review people I have not followed up with this week and explain who needs attention first.",
                  zh: "复核本周尚未跟进的人，说明应该优先关注谁以及原因。",
                })}
                rows={3}
                style={{ ...controlStyle, resize: "vertical" }}
                value={instruction}
              />
            </label>
            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              }}
            >
              <label style={{ display: "grid", fontSize: 13, gap: 6 }}>
                {t({ en: "Schedule", zh: "运行频率" })}
                <select
                  aria-label={t({ en: "Schedule", zh: "运行频率" })}
                  onChange={(event) =>
                    setScheduleKind(event.target.value as ScheduleKind)
                  }
                  style={controlStyle}
                  value={scheduleKind}
                >
                  <option value="once">
                    {t({ en: "One time", zh: "一次" })}
                  </option>
                  <option value="daily">
                    {t({ en: "Daily", zh: "每天" })}
                  </option>
                  <option value="weekly">
                    {t({ en: "Weekly", zh: "每周" })}
                  </option>
                </select>
              </label>
              {scheduleKind === "once" ? (
                <label style={{ display: "grid", fontSize: 13, gap: 6 }}>
                  {t({ en: "Run at", zh: "运行时间" })}
                  <input
                    aria-label={t({ en: "Run at", zh: "运行时间" })}
                    onChange={(event) => setOnceAt(event.target.value)}
                    style={controlStyle}
                    type="datetime-local"
                    value={onceAt}
                  />
                </label>
              ) : (
                <label style={{ display: "grid", fontSize: 13, gap: 6 }}>
                  {t({ en: "Local time", zh: "本地时间" })}
                  <input
                    aria-label={t({ en: "Local time", zh: "本地时间" })}
                    onChange={(event) => setTime(event.target.value)}
                    style={controlStyle}
                    type="time"
                    value={time}
                  />
                </label>
              )}
            </div>
            {scheduleKind === "weekly" ? (
              <div>
                <div style={{ fontSize: 13, marginBottom: 7 }}>
                  {t({ en: "Weekdays", zh: "星期" })}
                </div>
                <div
                  aria-label={t({ en: "Weekdays", zh: "星期" })}
                  role="group"
                  style={{ display: "flex", flexWrap: "wrap", gap: 7 }}
                >
                  {weekdayOptions.map((option) => {
                    const selected = daysOfWeek.includes(option.value);
                    return (
                      <button
                        aria-pressed={selected}
                        className={`btn btn-sm ${selected ? "btn-primary" : "btn-ghost"}`}
                        key={option.value}
                        onClick={() => toggleWeekday(option.value)}
                        type="button"
                      >
                        {option[language]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div
              style={{
                alignItems: "center",
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "space-between",
              }}
            >
              <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                {timeZone}
              </span>
              <button
                className="btn btn-primary"
                disabled={saving || !title.trim() || !instruction.trim()}
                onClick={() => void createAutomation()}
                type="button"
              >
                <Icon name="plus" size={16} />
                {saving
                  ? t({ en: "Creating…", zh: "正在创建…" })
                  : t({ en: "Create automation", zh: "创建自动任务" })}
              </button>
            </div>
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" style={{ color: "var(--accent)", fontSize: 13 }}>
              {notice}
            </p>
          ) : null}

          <div
            style={{
              borderTop: "1px solid var(--border)",
              display: "grid",
              gap: 10,
              marginTop: 20,
              paddingTop: 18,
            }}
          >
            <strong style={{ fontSize: 14 }}>
              {t({ en: "Your automations", zh: "你的自动任务" })}
            </strong>
            {loading ? (
              <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>
                {t({ en: "Loading…", zh: "正在加载…" })}
              </p>
            ) : automations.length === 0 ? (
              <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>
                {t({
                  en: "No automations yet. Create one above.",
                  zh: "还没有自动任务，可以在上方创建。",
                })}
              </p>
            ) : (
              automations.map((automation) => {
                const pending = pendingId === automation.automationId;
                return (
                  <article
                    data-agent-automation-id={automation.automationId}
                    key={automation.automationId}
                    style={{
                      background: "var(--bg-soft)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      display: "grid",
                      gap: 9,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        alignItems: "flex-start",
                        display: "flex",
                        gap: 10,
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div style={{ color: "var(--ink)", fontWeight: 650 }}>
                          {automation.title}
                        </div>
                        <div
                          style={{
                            color: "var(--text-3)",
                            fontSize: 12,
                            marginTop: 3,
                          }}
                        >
                          {capabilityLabel[automation.capabilityId] ??
                            automation.capabilityId}
                        </div>
                      </div>
                      <span className="chip">
                        {automation.status === "active"
                          ? t({ en: "Enabled", zh: "已启用" })
                          : automation.status === "paused"
                            ? t({ en: "Paused", zh: "已暂停" })
                            : automation.status === "running"
                              ? t({ en: "Running", zh: "执行中" })
                              : automation.status === "completed"
                                ? t({ en: "Completed", zh: "已完成" })
                                : t({ en: "Failed", zh: "失败" })}
                      </span>
                    </div>
                    <p
                      style={{
                        color: "var(--text)",
                        fontSize: 13,
                        lineHeight: 1.55,
                        margin: 0,
                      }}
                    >
                      {automation.instruction}
                    </p>
                    <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                      {formatSchedule(automation, displayLanguage)}
                      {" · "}
                      {t({ en: "Next", zh: "下次" })}:{" "}
                      {formatNextRun(
                        automation.nextRunAt,
                        displayLanguage,
                      )}
                    </div>
                    {automation.lastRun ? (
                      <div
                        data-agent-automation-last-result
                        style={{
                          background: "var(--bg)",
                          borderRadius: 9,
                          color: "var(--text)",
                          fontSize: 12.5,
                          lineHeight: 1.55,
                          padding: "9px 10px",
                        }}
                      >
                        <strong>
                          {t({ en: "Latest result", zh: "最近结果" })}:{" "}
                        </strong>
                        {automation.lastRun.summary}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={pending || automation.status === "running"}
                        onClick={() => void runNow(automation)}
                        type="button"
                      >
                        {t({ en: "Run now", zh: "立即运行" })}
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={pending || automation.status === "running"}
                        onClick={() =>
                          void updateStatus(
                            automation,
                            automation.status === "paused"
                              ? "active"
                              : "paused",
                          )
                        }
                        type="button"
                      >
                        {automation.status === "paused"
                          ? t({ en: "Resume", zh: "恢复" })
                          : t({ en: "Pause", zh: "暂停" })}
                      </button>
                      <button
                        className="btn btn-sm btn-quiet"
                        disabled={pending || automation.status === "running"}
                        onClick={() => void remove(automation)}
                        type="button"
                      >
                        {deleteConfirmId === automation.automationId
                          ? t({ en: "Confirm delete", zh: "确认删除" })
                          : t({ en: "Delete", zh: "删除" })}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
