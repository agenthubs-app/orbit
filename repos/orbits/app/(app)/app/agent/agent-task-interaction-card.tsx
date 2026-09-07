"use client";

import { useOrbitLanguage } from "../orbit-language-context";
import { tasksErrorMessage } from "../tasks/tasks-client";
import type { AgentTaskInteractionView } from "./agent-task-interaction-view-model";

export function AgentTaskInteractionCard({ interaction, language, busy, error, onResolve }: {
  interaction: AgentTaskInteractionView;
  language: "en" | "zh";
  busy: boolean;
  error?: unknown;
  onResolve: (action: "accept" | "dismiss") => Promise<void>;
}) {
  const { preserveHref } = useOrbitLanguage();
  const english = language === "en";
  const failed = interaction.state === "failed" || interaction.state === "unavailable";
  const status = {
    created: english ? "Task created" : "已创建待办",
    suggested: english ? "Add this to your tasks?" : "加入待办吗？",
    failed: english ? "Task could not be created" : "未能创建待办",
    dismissed: english ? "Suggestion dismissed" : "已忽略这条建议",
    unavailable: english ? "Task details are unavailable" : "待办信息暂时无法读取",
  }[interaction.state];

  return (
    <section data-agent-task-state={interaction.state} aria-label={status} aria-busy={busy}
      style={{ background: "var(--surface-2)", border: `1px solid ${failed ? "var(--rose)" : "var(--border)"}`, borderRadius: 12, marginTop: 12, padding: 14, minWidth: 0, overflowWrap: "anywhere" }}>
      <div role={failed ? "alert" : "status"} style={{ color: "var(--text-3)", fontSize: 12 }}>{status}</div>
      {interaction.title ? <div style={{ color: "var(--text)", fontWeight: 600, marginTop: 5 }}>{interaction.title}</div> : null}
      {interaction.dueAt ? <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 5 }}>
        {english ? "Due: " : "到期："}<time dateTime={interaction.dueAt}>{new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", {
          timeZone: "Asia/Tokyo", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        }).format(new Date(interaction.dueAt))} JST</time>
      </div> : null}
      {interaction.reason && interaction.state === "suggested" ? <p style={{ color: "var(--text-3)", fontSize: 13, margin: "6px 0 0" }}>{interaction.reason}</p> : null}
      {failed ? <p style={{ color: "var(--text-3)", fontSize: 13, margin: "6px 0 0" }}>
        {english ? "Check All tasks before trying again." : "请先在全部待办中核实，再重试。"}
      </p> : null}
      {error ? <p role="alert" style={{ color: "var(--rose)", fontSize: 13, margin: "8px 0 0" }}>{tasksErrorMessage(error, english)}</p> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {interaction.state === "suggested" ? <>
          <button className="btn btn-primary" type="button" disabled={busy} aria-label={`${english ? "Add task" : "加入待办"}：${interaction.title}`} onClick={() => onResolve("accept")}>
            {busy ? (english ? "Saving…" : "正在保存…") : (english ? "Add task" : "加入待办")}
          </button>
          <button className="btn btn-quiet" type="button" disabled={busy} aria-label={`${english ? "Not now" : "暂不需要"}：${interaction.title}`} onClick={() => onResolve("dismiss")}>
            {english ? "Not now" : "暂不需要"}
          </button>
        </> : null}
        {interaction.state === "created" && interaction.taskId ? <a className="btn btn-quiet" href={preserveHref(`/app/tasks/${encodeURIComponent(interaction.taskId)}`)}>{english ? "View task" : "查看待办"}</a> : null}
        {failed ? <a className="btn btn-quiet" href={preserveHref("/app/tasks")}>{english ? "All tasks" : "全部待办"}</a> : null}
      </div>
    </section>
  );
}
