"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initializationRequest, initializationStageLabels, readContactInitialization, saveContactInitialization, type InitializationDraft, type InitializationView } from "./contact-relationship-initialization-view-model";

const blankDraft = (): InitializationDraft => ({ stage: "", goal: "", title: "", due: "" });

// The contact route keys its parent by owner + contact. Both responsive panels
// share this controller: one read, one intent, and no duplicate POSTs.
export function useContactRelationshipInitialization(contactId: string) {
  const [view, setView] = useState<InitializationView>({ state: "loading" });
  const [draft, setDraft] = useState(blankDraft);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<"saved" | "replayed" | null>(null);
  const [busy, setBusy] = useState(true);
  const [locked, setLocked] = useState(false);
  const inFlight = useRef(false);
  const epoch = useRef(0);
  const attempt = useRef<ReturnType<typeof initializationRequest> | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const scope = epoch.current;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const next = await readContactInitialization(contactId);
      if (scope !== epoch.current) return;
      setView(next);
      // Same revision after a lost ACK retains the exact original request.
      if (next.state !== "pending" || (attempt.current && next.revision !== attempt.current.expectedRevision)) {
        attempt.current = null; setLocked(false); setDraft(blankDraft());
      }
    } catch (cause) {
      if (scope !== epoch.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setView(previous => previous.state === "loading" ? { state: "error" } : previous);
    } finally {
      if (scope === epoch.current) { inFlight.current = false; setBusy(false); }
    }
  }, [contactId]);

  useEffect(() => {
    epoch.current += 1; inFlight.current = false; attempt.current = null;
    setView({ state: "loading" }); setDraft(blankDraft()); setLocked(false); setNotice(null);
    void refresh();
    return () => { epoch.current += 1; };
  }, [refresh]);

  const submit = async () => {
    if (inFlight.current || view.state !== "pending") return;
    const scope = epoch.current;
    try {
      attempt.current ??= initializationRequest(draft, view.revision);
      inFlight.current = true; setBusy(true); setLocked(true); setError("");
      const result = await saveContactInitialization(contactId, view.connectionId, attempt.current);
      if (scope !== epoch.current) return;
      setView(result.view); setNotice(result.replayed ? "replayed" : "saved");
      attempt.current = null; setLocked(false);
    } catch (cause) {
      if (scope === epoch.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (scope === epoch.current) { inFlight.current = false; setBusy(false); }
    }
  };
  return { view, draft, error, notice, busy, locked, refresh, submit,
    change: (field: keyof InitializationDraft, value: string) => {
      if (!inFlight.current && !attempt.current) { setDraft(previous => ({ ...previous, [field]: value })); setError(""); }
    } };
}

export type ContactInitializationController = ReturnType<typeof useContactRelationshipInitialization>;

export function ContactRelationshipInitializationPanel({ controller: c, language }: { controller: ContactInitializationController; language: "zh" | "en" }) {
  const zh = language === "zh";
  if (c.view.state === "hidden") return null;
  const text = (cn: string, en: string) => zh ? cn : en;
  const disabled = c.busy || c.locked;
  const fieldStyle = { display: "grid", gap: 6 };
  return <section className="nc-card" aria-label={text("我的关系设置", "My relationship settings")} style={{ padding: 20, marginBottom: 16 }}>
    <h2 className="h-section">{text("我的关系设置", "My relationship settings")}</h2>
    <p>{text("交换仅确认已认识。以下设置只属于你，不代表对方的选择，也不会发送消息。", "An exchange confirms you know each other. These settings are yours only; they do not represent the other person's choice or send a message.")}</p>
    {c.view.state === "loading" ? <p role="status">{text("正在读取关系状态…", "Loading relationship state…")}</p> : null}
    {c.error ? <p role="alert" style={{ color: "var(--danger, #b42318)", overflowWrap: "anywhere" }}>{c.error}</p> : null}
    {c.notice ? <p role="status">{c.notice === "replayed" ? text("已确认此前提交，未重复创建。", "Previous submission confirmed; nothing duplicated.") : text("已保存你的关系选择。", "Your relationship choice was saved.")}</p> : null}
    {c.view.state === "pending" ? <>
      <p><strong>{text("待设置关系", "Pending initialization")}</strong></p>
      <form onSubmit={async event => { event.preventDefault(); await c.submit(); }} style={{ display: "grid", gap: 14 }}>
        <label style={fieldStyle}>{text("关系阶段", "Relationship stage")}<select aria-label={text("关系阶段", "Relationship stage")} required value={c.draft.stage} disabled={disabled} onChange={event => c.change("stage", event.target.value)}>
          <option value="">{text("请明确选择", "Choose explicitly")}</option>
          {Object.entries(initializationStageLabels).map(([stage, label]) => <option key={stage} value={stage}>{label[language]}</option>)}
        </select></label>
        {c.draft.stage === "active" ? <label style={fieldStyle}>{text("关系目标", "Relationship goal")}<textarea aria-label={text("关系目标", "Relationship goal")} required maxLength={2000} value={c.draft.goal} disabled={disabled} onChange={event => c.change("goal", event.target.value)} /></label> : null}
        {c.draft.stage === "needs_follow_up" || c.draft.stage === "nurture" ? <>
          <label style={fieldStyle}>{text("跟进内容", "Next step")}<input aria-label={text("跟进内容", "Next step")} required maxLength={500} value={c.draft.title} disabled={disabled} onChange={event => c.change("title", event.target.value)} /></label>
          <label style={fieldStyle}>{text("下次跟进时间（当前设备时区）", "Next step date (device time zone)")}<input aria-label={text("下次跟进时间", "Next step date")} required type="datetime-local" value={c.draft.due} disabled={disabled} onChange={event => c.change("due", event.target.value)} /></label>
        </> : null}
        {c.draft.stage === "archived" ? <p>{text("保存后将归档你与此联系人的关系。", "Saving will archive your relationship with this contact.")}</p> : null}
        {c.locked ? <p>{text("提交尚待确认；重试将使用原提交，不会另建跟进。也可刷新读取最新状态。", "Submission needs confirmation. Retry reuses the original request; refresh reads the latest state.")}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={c.busy || !c.draft.stage}>{c.busy ? text("保存中…", "Saving…") : c.locked ? text("重试原提交", "Retry original submission") : text("确认我的选择", "Confirm my choice")}</button>
      </form>
    </> : null}
    {c.view.state === "initialized" ? <div>
      <p>{text("当前阶段：", "Current stage: ")}{initializationStageLabels[c.view.stage][language]}</p>
      {c.view.goal ? <p>{text("关系目标：", "Goal: ")}{c.view.goal}</p> : null}
      {c.view.tasks.map(task => <p key={task.id}>{task.title} · <time dateTime={task.dueAt}>{new Date(task.dueAt).toLocaleString(zh ? "zh-CN" : "en-US")}</time></p>)}
      {c.view.tasks.length ? <a href={c.view.taskHref}>{text("处理关系跟进", "Manage relationship follow-up")}</a> : null}
    </div> : null}
    <button className="btn btn-ghost" style={{ marginTop: 12 }} type="button" data-initialization-refresh disabled={c.busy} onClick={c.refresh}>{text("刷新关系状态", "Refresh relationship state")}</button>
  </section>;
}
