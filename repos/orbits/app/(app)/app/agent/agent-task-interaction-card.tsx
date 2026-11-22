"use client";

import { useOrbitLanguage } from "../orbit-language-context";
import { tasksErrorMessage } from "../tasks/tasks-client";
import type { AgentTaskInteractionView } from "./agent-task-interaction-view-model";

export function AgentTaskInteractionCard({ interaction, language, busy, error, onResolve }: {
  interaction: AgentTaskInteractionView;
  language: "en" | "ja" | "zh";
  busy: boolean;
  error?: unknown;
  onResolve: (action: "accept" | "dismiss") => Promise<void>;
}) {
  const { preserveHref } = useOrbitLanguage();
  const english = language === "en";
  const pick = (copy: { en: string; ja: string; zh: string }) => copy[language];
  const failed = interaction.state === "failed" || interaction.state === "unavailable";
  const status = {
    created: pick({ ja: "タスクを作成しました", zh: "已创建待办", en: "Task created" }),
    suggested: pick({ ja: "タスクに追加しますか？", zh: "加入待办吗？", en: "Add this to your tasks?" }),
    failed: pick({ ja: "タスクを作成できませんでした", zh: "未能创建待办", en: "Task could not be created" }),
    dismissed: pick({ ja: "この提案は見送りました", zh: "已忽略这条建议", en: "Suggestion dismissed" }),
    unavailable: pick({ ja: "タスクの情報を読み込めません", zh: "待办信息暂时无法读取", en: "Task details are unavailable" }),
  }[interaction.state];

  return (
    <section data-agent-task-state={interaction.state} aria-label={status} aria-busy={busy}
      style={{ background: "var(--surface-2)", border: `1px solid ${failed ? "var(--coral-text)" : "var(--line)"}`, borderRadius: 12, marginTop: 12, padding: 14, minWidth: 0, overflowWrap: "anywhere" }}>
      <div role={failed ? "alert" : "status"} style={{ color: "var(--ink-3-text)", fontSize: 12 }}>{status}</div>
      {interaction.title ? <div style={{ color: "var(--ink)", fontWeight: 600, marginTop: 5 }}>{interaction.title}</div> : null}
      {interaction.dueAt ? <div style={{ color: "var(--ink-3-text)", fontSize: 12, marginTop: 5 }}>
        {pick({ ja: "期限：", zh: "到期：", en: "Due: " })}<time dateTime={interaction.dueAt}>{new Intl.DateTimeFormat(pick({ ja: "ja-JP", zh: "zh-CN", en: "en-US" }), {
          timeZone: "Asia/Tokyo", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        }).format(new Date(interaction.dueAt))} JST</time>
      </div> : null}
      {interaction.reason && interaction.state === "suggested" ? <p style={{ color: "var(--ink-3-text)", fontSize: 13, margin: "6px 0 0" }}>{interaction.reason}</p> : null}
      {failed ? <p style={{ color: "var(--ink-3-text)", fontSize: 13, margin: "6px 0 0" }}>
        {pick({ ja: "「すべてのタスク」で確認してから、もう一度お試しください。", zh: "请先在全部待办中核实，再重试。", en: "Check All tasks before trying again." })}
      </p> : null}
      {error ? <p role="alert" style={{ color: "var(--coral-text)", fontSize: 13, margin: "8px 0 0" }}>{tasksErrorMessage(error, language)}</p> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {interaction.state === "suggested" ? <>
          <button className="btn btn-primary" type="button" disabled={busy} aria-label={`${pick({ ja: "タスクに追加", zh: "加入待办", en: "Add task" })}${english ? ": " : "："}${interaction.title}`} onClick={() => onResolve("accept")}>
            {busy ? pick({ ja: "保存中…", zh: "正在保存…", en: "Saving…" }) : pick({ ja: "タスクに追加", zh: "加入待办", en: "Add task" })}
          </button>
          <button className="btn btn-quiet" type="button" disabled={busy} aria-label={`${pick({ ja: "今はしない", zh: "暂不需要", en: "Not now" })}${english ? ": " : "："}${interaction.title}`} onClick={() => onResolve("dismiss")}>
            {pick({ ja: "今はしない", zh: "暂不需要", en: "Not now" })}
          </button>
        </> : null}
        {interaction.state === "created" && interaction.taskId ? <a className="btn btn-quiet" href={preserveHref(`/app/tasks/${encodeURIComponent(interaction.taskId)}`)}>{pick({ ja: "タスクを見る", zh: "查看待办", en: "View task" })}</a> : null}
        {failed ? <a className="btn btn-quiet" href={preserveHref("/app/tasks")}>{pick({ ja: "すべてのタスク", zh: "全部待办", en: "All tasks" })}</a> : null}
      </div>
    </section>
  );
}
