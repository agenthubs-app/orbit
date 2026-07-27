"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AgentAutomation,
  AgentAutomationSchedule,
  AgentAutomationSignalType,
  AgentAutomationTrigger,
  CreateAgentAutomationInput,
} from "../../../../features/agent/automations/contract";
import type {
  AgentPlaybookDraft,
} from "../../../../features/agent/playbooks/contract";
import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";

type ScheduleKind = AgentAutomationSchedule["kind"];
type TriggerKind = AgentAutomationTrigger["kind"];

const capabilityOptions = [
  { id: "followups.reviewQueue", en: "Follow-up review", zh: "跟进关系复核" },
  { id: "contacts.recommend", en: "Contact recommendations", zh: "人脉机会推荐" },
  { id: "events.recommend", en: "Event recommendations", zh: "活动机会推荐" },
  { id: "chat.context", en: "Relationship context review", zh: "关系上下文复核" },
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

const signalOptions = [
  { value: "followup_due", en: "Follow-up becomes due", zh: "跟进到期" },
  { value: "event_upcoming", en: "Event is approaching", zh: "活动临近" },
  { value: "relationship_stale", en: "Relationship becomes stale", zh: "关系转冷" },
] as const satisfies readonly {
  value: AgentAutomationSignalType;
  en: string;
  zh: string;
}[];

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

function defaultOnceValue(): string {
  const date = new Date(Date.now() + 24 * 60 * 60_000);
  date.setMinutes(0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localDateTime(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatTrigger(
  trigger: AgentAutomationTrigger,
  language: "en" | "zh",
): string {
  if (trigger.kind === "signal") {
    const labels = trigger.signalTypes
      .map(
        (type) =>
          signalOptions.find((option) => option.value === type)?.[language] ??
          type,
      )
      .join("、");
    return language === "zh"
      ? `${labels} · 重要性 ≥ ${trigger.minimumImportance}`
      : `${labels} · importance ≥ ${trigger.minimumImportance}`;
  }
  const { schedule } = trigger;
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
  trigger: AgentAutomationTrigger,
) {
  if (!nextRunAt) {
    if (trigger.kind === "signal") {
      return language === "zh"
        ? "等待匹配信号"
        : "Waiting for a matching signal";
    }
    return language === "zh" ? "未安排下次运行" : "No next run scheduled";
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

export function OrbitAgentAutomationSettings() {
  const { language, t } = useOrbitLanguage();
  const displayLanguage = language === "zh" ? "zh" : "en";
  const [automations, setAutomations] = useState<AgentAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [trialing, setTrialing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [naturalRequest, setNaturalRequest] = useState("");
  const [draft, setDraft] = useState<AgentPlaybookDraft | null>(null);
  const [trial, setTrial] = useState<{
    summary: string;
    sourceModules: readonly string[];
    evidenceIds: readonly string[];
  } | null>(null);
  const [capabilityId, setCapabilityId] = useState("followups.reviewQueue");
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [triggerKind, setTriggerKind] = useState<TriggerKind>("schedule");
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("daily");
  const [onceAt, setOnceAt] = useState(defaultOnceValue);
  const [time, setTime] = useState("09:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]);
  const [signalTypes, setSignalTypes] = useState<AgentAutomationSignalType[]>([
    "relationship_stale",
  ]);
  const [minimumImportance, setMinimumImportance] = useState(60);
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
      const response = await fetch("/api/agent/automations", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as {
        data?: { automations?: AgentAutomation[] };
      } | null;
      if (!response.ok) {
        throw new Error(
          apiError(body, t({ en: "Playbooks could not be loaded.", zh: "Playbook 暂时无法读取。" })),
        );
      }
      setAutomations(Array.isArray(body?.data?.automations) ? body.data.automations : []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({ en: "Playbooks could not be loaded.", zh: "Playbook 暂时无法读取。" }),
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
      return { at: new Date(onceAt).toISOString(), kind: "once" };
    }
    if (scheduleKind === "weekly") {
      return { daysOfWeek, kind: "weekly", time, timeZone };
    }
    return { kind: "daily", time, timeZone };
  }

  function triggerPayload(): AgentAutomationTrigger {
    return triggerKind === "signal"
      ? { kind: "signal", minimumImportance, signalTypes }
      : { kind: "schedule", schedule: schedulePayload() };
  }

  function definitionPayload(): CreateAgentAutomationInput {
    return {
      capabilityId,
      delivery: "in_app",
      instruction,
      source: draft ? "natural_language" : "manual",
      title,
      trigger: triggerPayload(),
    };
  }

  function applyDefinition(definition: CreateAgentAutomationInput) {
    setCapabilityId(definition.capabilityId);
    setTitle(definition.title);
    setInstruction(definition.instruction);
    setTriggerKind(definition.trigger.kind);
    if (definition.trigger.kind === "signal") {
      setSignalTypes([...definition.trigger.signalTypes]);
      setMinimumImportance(definition.trigger.minimumImportance);
      return;
    }
    const schedule = definition.trigger.schedule;
    setScheduleKind(schedule.kind);
    if (schedule.kind === "once") {
      setOnceAt(localDateTime(schedule.at));
    } else {
      setTime(schedule.time);
      if (schedule.kind === "weekly") setDaysOfWeek([...schedule.daysOfWeek]);
    }
  }

  function resetEditor() {
    setEditingId(null);
    setDraft(null);
    setTrial(null);
    setTitle("");
    setInstruction("");
  }

  async function compileNaturalRequest() {
    setCompiling(true);
    setError(null);
    setNotice(null);
    setTrial(null);
    try {
      const response = await fetch("/api/agent/automations/compile", {
        body: JSON.stringify({
          locale: displayLanguage,
          request: naturalRequest,
          timeZone,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { draft?: AgentPlaybookDraft };
      } | null;
      if (!response.ok || !body?.data?.draft) {
        throw new Error(
          apiError(body, t({ en: "Orbit could not compile this Playbook.", zh: "Orbit 没能生成安全的 Playbook 草案。" })),
        );
      }
      setDraft(body.data.draft);
      applyDefinition(body.data.draft.definition);
      setNotice(
        t({ en: "Draft generated. Review it or run a trial before enabling.", zh: "草案已生成；请复核或先试运行，再启用。" }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Playbook compile failed.");
    } finally {
      setCompiling(false);
    }
  }

  async function dryRun() {
    setTrialing(true);
    setError(null);
    setTrial(null);
    try {
      const response = await fetch("/api/agent/automations/dry-run", {
        body: JSON.stringify(definitionPayload()),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        data?: {
          trial?: {
            summary?: string;
            sourceModules?: string[];
            evidenceIds?: string[];
          };
        };
      } | null;
      const result = body?.data?.trial;
      if (!response.ok || typeof result?.summary !== "string") {
        throw new Error(
          apiError(body, t({ en: "The Playbook trial failed.", zh: "Playbook 试运行失败。" })),
        );
      }
      setTrial({
        evidenceIds: result.evidenceIds ?? [],
        sourceModules: result.sourceModules ?? [],
        summary: result.summary,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Playbook trial failed.");
    } finally {
      setTrialing(false);
    }
  }

  async function savePlaybook() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const editing = editingId !== null;
      const response = await fetch(
        editing
          ? `/api/agent/automations/${encodeURIComponent(editingId)}`
          : "/api/agent/automations",
        {
          body: JSON.stringify({
            ...definitionPayload(),
            ...(editing
              ? {
                  changeNote:
                    naturalRequest.trim() ||
                    t({ en: "Updated from Settings.", zh: "从设置页更新。" }),
                }
              : {}),
          }),
          headers: { "content-type": "application/json" },
          method: editing ? "PATCH" : "POST",
        },
      );
      const body = (await response.json().catch(() => null)) as {
        data?: { automation?: AgentAutomation };
      } | null;
      const automation = body?.data?.automation;
      if (!response.ok || !automation) {
        throw new Error(
          apiError(body, t({ en: "The Playbook was not saved.", zh: "Playbook 没有保存成功。" })),
        );
      }
      setAutomations((current) =>
        editing
          ? current.map((item) =>
              item.automationId === automation.automationId ? automation : item,
            )
          : [...current, automation],
      );
      resetEditor();
      setNaturalRequest("");
      setNotice(
        editing
          ? t({ en: `Version ${automation.version} saved.`, zh: `已保存版本 ${automation.version}。` })
          : t({ en: "Playbook enabled.", zh: "Playbook 已启用。" }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Playbook save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(automation: AgentAutomation, status: "active" | "paused") {
    setPendingId(automation.automationId);
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/automations/${encodeURIComponent(automation.automationId)}`,
        {
          body: JSON.stringify({ status }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        },
      );
      const body = (await response.json().catch(() => null)) as {
        data?: { automation?: AgentAutomation };
      } | null;
      if (!response.ok || !body?.data?.automation) {
        throw new Error(apiError(body, t({ en: "Status was not changed.", zh: "状态没有更新成功。" })));
      }
      setAutomations((current) =>
        current.map((item) =>
          item.automationId === automation.automationId ? body.data!.automation! : item,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Status update failed.");
    } finally {
      setPendingId(null);
    }
  }

  async function runNow(automation: AgentAutomation) {
    setPendingId(automation.automationId);
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/automations/${encodeURIComponent(automation.automationId)}/run`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        data?: { automation?: AgentAutomation };
      } | null;
      if (!response.ok || !body?.data?.automation) {
        throw new Error(apiError(body, t({ en: "The Playbook did not run.", zh: "Playbook 没有运行成功。" })));
      }
      setAutomations((current) =>
        current.map((item) =>
          item.automationId === automation.automationId ? body.data!.automation! : item,
        ),
      );
      setNotice(t({ en: "Playbook finished.", zh: "Playbook 已完成。" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Playbook run failed.");
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
    try {
      const response = await fetch(
        `/api/agent/automations/${encodeURIComponent(automation.automationId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(
          apiError(await response.json().catch(() => null), t({ en: "The Playbook was not deleted.", zh: "Playbook 没有删除成功。" })),
        );
      }
      setAutomations((current) =>
        current.filter((item) => item.automationId !== automation.automationId),
      );
      setDeleteConfirmId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed.");
    } finally {
      setPendingId(null);
    }
  }

  function edit(automation: AgentAutomation) {
    setEditingId(automation.automationId);
    setDraft(null);
    setTrial(null);
    setNaturalRequest("");
    applyDefinition({
      capabilityId: automation.capabilityId,
      delivery: automation.delivery,
      instruction: automation.instruction,
      source: "manual",
      title: automation.title,
      trigger: automation.trigger,
    });
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

  function toggleSignal(signalType: AgentAutomationSignalType) {
    setSignalTypes((current) =>
      current.includes(signalType)
        ? current.length === 1
          ? current
          : current.filter((value) => value !== signalType)
        : [...current, signalType],
    );
  }

  const formReady =
    title.trim().length > 0 &&
    instruction.trim().length > 0 &&
    (triggerKind !== "signal" || signalTypes.length > 0);

  return (
    <section
      aria-labelledby="orbit-agent-automation-title"
      className="card"
      data-orbit-agent-automation-settings
      style={{ marginTop: 16, padding: 24 }}
    >
      <div style={{ alignItems: "flex-start", display: "flex", gap: 14 }}>
        <span
          aria-hidden
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
          <h2 id="orbit-agent-automation-title" style={{ color: "var(--ink)", fontSize: 18, margin: 0 }}>
            {t({ en: "Agent Playbooks", zh: "Agent Playbook" })}
          </h2>
          <p style={{ color: "var(--text-3)", fontSize: 14, lineHeight: 1.6, margin: "6px 0 18px" }}>
            {t({
              en: "Describe a recurring relationship review, inspect the compiled trigger, and trial it before enabling. Playbooks stay read-only.",
              zh: "用自然语言描述关系工作，复核生成的触发条件，并可先试运行再启用。Playbook 始终只读。",
            })}
          </p>

          <div
            data-agent-playbook-natural-language
            style={{
              background: "var(--bg-soft)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              display: "grid",
              gap: 8,
              marginBottom: 16,
              padding: 14,
            }}
          >
            <strong style={{ fontSize: 14 }}>
              {t({ en: "Describe a Playbook", zh: "用一句话创建 Playbook" })}
            </strong>
            <textarea
              aria-label={t({ en: "Natural-language Playbook", zh: "自然语言 Playbook" })}
              maxLength={4000}
              onChange={(event) => setNaturalRequest(event.target.value)}
              placeholder={t({
                en: "When a relationship becomes stale, review who needs attention first and explain why.",
                zh: "当关系转冷时，复核谁最需要跟进并说明原因。",
              })}
              rows={3}
              style={{ ...controlStyle, resize: "vertical" }}
              value={naturalRequest}
            />
            <div>
              <button
                className="btn btn-sm btn-primary"
                disabled={compiling || !naturalRequest.trim()}
                onClick={() => void compileNaturalRequest()}
                type="button"
              >
                {compiling
                  ? t({ en: "Compiling…", zh: "正在生成…" })
                  : t({ en: "Generate draft", zh: "生成草案" })}
              </button>
            </div>
            {draft ? (
              <div data-agent-playbook-draft style={{ color: "var(--text)", fontSize: 13, lineHeight: 1.55 }}>
                <strong>{t({ en: "Why this draft", zh: "草案说明" })}: </strong>
                {draft.explanation}
                {draft.assumptions.length > 0 ? (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {draft.assumptions.map((assumption) => (
                      <li key={assumption}>{assumption}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", fontSize: 13, gap: 8 }}>
              {t({ en: "Review type", zh: "复核类型" })}
              <select aria-label={t({ en: "Review type", zh: "复核类型" })} onChange={(event) => setCapabilityId(event.target.value)} style={controlStyle} value={capabilityId}>
                {capabilityOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option[language]}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", fontSize: 13, gap: 8 }}>
              {t({ en: "Name", zh: "名称" })}
              <input aria-label={t({ en: "Playbook name", zh: "Playbook 名称" })} maxLength={120} onChange={(event) => setTitle(event.target.value)} style={controlStyle} value={title} />
            </label>
            <label style={{ display: "grid", fontSize: 13, gap: 8 }}>
              {t({ en: "What should Orbit review?", zh: "希望 Orbit 复核什么？" })}
              <textarea aria-label={t({ en: "Playbook instruction", zh: "Playbook 指令" })} maxLength={4000} onChange={(event) => setInstruction(event.target.value)} rows={3} style={{ ...controlStyle, resize: "vertical" }} value={instruction} />
            </label>
            <label style={{ display: "grid", fontSize: 13, gap: 8 }}>
              {t({ en: "Trigger", zh: "触发方式" })}
              <select aria-label={t({ en: "Trigger", zh: "触发方式" })} onChange={(event) => setTriggerKind(event.target.value as TriggerKind)} style={controlStyle} value={triggerKind}>
                <option value="schedule">{t({ en: "Schedule", zh: "按时间" })}</option>
                <option value="signal">{t({ en: "Relationship signal", zh: "关系信号" })}</option>
              </select>
            </label>

            {triggerKind === "schedule" ? (
              <>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  <label style={{ display: "grid", fontSize: 13, gap: 8 }}>
                    {t({ en: "Frequency", zh: "运行频率" })}
                    <select aria-label={t({ en: "Frequency", zh: "运行频率" })} onChange={(event) => setScheduleKind(event.target.value as ScheduleKind)} style={controlStyle} value={scheduleKind}>
                      <option value="once">{t({ en: "One time", zh: "一次" })}</option>
                      <option value="daily">{t({ en: "Daily", zh: "每天" })}</option>
                      <option value="weekly">{t({ en: "Weekly", zh: "每周" })}</option>
                    </select>
                  </label>
                  {scheduleKind === "once" ? (
                    <label style={{ display: "grid", fontSize: 13, gap: 8 }}>
                      {t({ en: "Run at", zh: "运行时间" })}
                      <input aria-label={t({ en: "Run at", zh: "运行时间" })} onChange={(event) => setOnceAt(event.target.value)} style={controlStyle} type="datetime-local" value={onceAt} />
                    </label>
                  ) : (
                    <label style={{ display: "grid", fontSize: 13, gap: 8 }}>
                      {t({ en: "Local time", zh: "本地时间" })}
                      <input aria-label={t({ en: "Local time", zh: "本地时间" })} onChange={(event) => setTime(event.target.value)} style={controlStyle} type="time" value={time} />
                    </label>
                  )}
                </div>
                {scheduleKind === "weekly" ? (
                  <div aria-label={t({ en: "Weekdays", zh: "星期" })} role="group" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {weekdayOptions.map((option) => (
                      <button aria-pressed={daysOfWeek.includes(option.value)} className={`btn btn-sm ${daysOfWeek.includes(option.value) ? "btn-primary" : "btn-ghost"}`} key={option.value} onClick={() => toggleWeekday(option.value)} type="button">
                        {option[language]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <div aria-label={t({ en: "Signal types", zh: "信号类型" })} role="group" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {signalOptions.map((option) => (
                    <button aria-pressed={signalTypes.includes(option.value)} className={`btn btn-sm ${signalTypes.includes(option.value) ? "btn-primary" : "btn-ghost"}`} key={option.value} onClick={() => toggleSignal(option.value)} type="button">
                      {option[language]}
                    </button>
                  ))}
                </div>
                <label style={{ display: "grid", fontSize: 13, gap: 8 }}>
                  {t({ en: "Minimum importance", zh: "最低重要性" })}
                  <input aria-label={t({ en: "Minimum importance", zh: "最低重要性" })} max={100} min={0} onChange={(event) => setMinimumImportance(Number(event.target.value))} style={controlStyle} type="number" value={minimumImportance} />
                </label>
              </div>
            )}

            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-3)", fontSize: 12 }}>{timeZone}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {editingId ? (
                  <button className="btn btn-sm btn-quiet" onClick={resetEditor} type="button">
                    {t({ en: "Cancel edit", zh: "取消编辑" })}
                  </button>
                ) : null}
                <button className="btn btn-sm btn-ghost" disabled={trialing || !formReady} onClick={() => void dryRun()} type="button">
                  {trialing ? t({ en: "Running trial…", zh: "正在试运行…" }) : t({ en: "Trial run", zh: "试运行" })}
                </button>
                <button className="btn btn-primary" disabled={saving || !formReady} onClick={() => void savePlaybook()} type="button">
                  <Icon name={editingId ? "check" : "plus"} size={16} />
                  {saving
                    ? t({ en: "Saving…", zh: "正在保存…" })
                    : editingId
                      ? t({ en: "Save new version", zh: "保存新版本" })
                      : t({ en: "Enable Playbook", zh: "启用 Playbook" })}
                </button>
              </div>
            </div>
          </div>

          {trial ? (
            <div data-agent-playbook-trial style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13, lineHeight: 1.6, marginTop: 14, padding: 14 }}>
              <strong>{t({ en: "Trial result — no side effects", zh: "试运行结果 · 无副作用" })}</strong>
              <p style={{ margin: "7px 0" }}>{trial.summary}</p>
              <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                {trial.sourceModules.join(" · ") || "orbit-ai"} · {trial.evidenceIds.length} {t({ en: "evidence records", zh: "条依据" })}
              </span>
            </div>
          ) : null}
          {error ? <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p> : null}
          {notice ? <p role="status" style={{ color: "var(--accent)", fontSize: 13 }}>{notice}</p> : null}

          <div style={{ borderTop: "1px solid var(--border)", display: "grid", gap: 8, marginTop: 20, paddingTop: 18 }}>
            <strong style={{ fontSize: 14 }}>{t({ en: "Your Playbooks", zh: "你的 Playbook" })}</strong>
            {loading ? (
              <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>{t({ en: "Loading…", zh: "正在加载…" })}</p>
            ) : automations.length === 0 ? (
              <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>{t({ en: "No Playbooks yet.", zh: "还没有 Playbook。" })}</p>
            ) : (
              automations.map((automation) => {
                const pending = pendingId === automation.automationId;
                return (
                  <article data-agent-automation-id={automation.automationId} key={automation.automationId} style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 12, display: "grid", gap: 8, padding: 14 }}>
                    <div style={{ alignItems: "flex-start", display: "flex", gap: 8, justifyContent: "space-between" }}>
                      <div>
                        <div style={{ color: "var(--ink)", fontWeight: 600 }}>{automation.title}</div>
                        <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 3 }}>
                          {capabilityLabel[automation.capabilityId] ?? automation.capabilityId} · v{automation.version}
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
                    <p style={{ color: "var(--text)", fontSize: 13, lineHeight: 1.55, margin: 0 }}>{automation.instruction}</p>
                    <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                      {formatTrigger(automation.trigger, displayLanguage)} · {formatNextRun(automation.nextRunAt, displayLanguage, automation.trigger)} · {t({ en: `${automation.runCount} runs`, zh: `已运行 ${automation.runCount} 次` })}
                    </div>
                    {automation.lastRun ? (
                      <div data-agent-automation-last-result style={{ background: "var(--bg)", borderRadius: 9, color: "var(--text)", fontSize: 13, lineHeight: 1.55, padding: "9px 10px" }}>
                        <strong>{t({ en: "Latest result", zh: "最近结果" })}: </strong>
                        {automation.lastRun.summary}
                        <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 5 }}>
                          {(automation.lastRun.sourceModules ?? []).join(" · ") || "orbit-ai"} · {(automation.lastRun.evidenceIds ?? []).length} {t({ en: "evidence records", zh: "条依据" })}
                        </div>
                      </div>
                    ) : null}
                    <details>
                      <summary style={{ color: "var(--text-3)", cursor: "pointer", fontSize: 12 }}>
                        {t({ en: "Version history", zh: "版本记录" })} ({automation.revisions.length})
                      </summary>
                      <ol style={{ color: "var(--text-3)", fontSize: 12, margin: "7px 0 0", paddingLeft: 18 }}>
                        {[...automation.revisions].reverse().map((revision) => (
                          <li key={`${revision.version}:${revision.createdAt}`}>
                            v{revision.version} · {revision.changeNote}
                          </li>
                        ))}
                      </ol>
                    </details>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button className="btn btn-sm btn-primary" disabled={pending || automation.status === "running"} onClick={() => void runNow(automation)} type="button">{t({ en: "Run now", zh: "立即运行" })}</button>
                      <button className="btn btn-sm btn-ghost" disabled={pending || automation.status === "running"} onClick={() => edit(automation)} type="button">{t({ en: "Edit", zh: "编辑" })}</button>
                      <button className="btn btn-sm btn-ghost" disabled={pending || automation.status === "running"} onClick={() => void updateStatus(automation, automation.status === "paused" ? "active" : "paused")} type="button">
                        {automation.status === "paused" ? t({ en: "Resume", zh: "恢复" }) : t({ en: "Pause", zh: "暂停" })}
                      </button>
                      <button className="btn btn-sm btn-quiet" disabled={pending || automation.status === "running"} onClick={() => void remove(automation)} type="button">
                        {deleteConfirmId === automation.automationId ? t({ en: "Confirm delete", zh: "确认删除" }) : t({ en: "Delete", zh: "删除" })}
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
