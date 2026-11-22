"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { relationshipLifecycleMutationSchema, relationshipLifecycleReadSchema } from "../../../../../../shared/api-schema/relationship-lifecycle";
import type { RelationshipCompletionInput, RelationshipLifecycleSnapshotDTO } from "../../../../../../shared/contract/relationship-lifecycle";
import { useOrbitLanguage } from "../../../orbit-language-context";

const STAGE_LABELS: Record<string, { ja: string; zh: string; en: string }> = {
  captured: { ja: "記録済み", zh: "已记录", en: "Captured" },
  reviewing: { ja: "確認中", zh: "复核中", en: "Reviewing" },
  needs_follow_up: { ja: "フォローが必要", zh: "需要跟进", en: "Needs follow-up" },
  active: { ja: "進行中", zh: "进行中", en: "Active" },
  nurture: { ja: "関係を維持", zh: "培育中", en: "Nurture" },
  archived: { ja: "アーカイブ済み", zh: "已归档", en: "Archived" },
};

// Page-owned model: only fields rendered by this editor cross into its presenter.
type Model = { actorId: string; contactId: string; version: number; stage: string; tasks: { id: string; title: string; version: number; status: string; dueAt: string }[] };
function view(snapshot: { connection: Pick<RelationshipLifecycleSnapshotDTO["connection"], "actorId" | "contactId" | "version" | "stage">; tasks: RelationshipLifecycleSnapshotDTO["tasks"] }): Model {
  return { actorId: snapshot.connection.actorId, contactId: snapshot.connection.contactId, version: snapshot.connection.version, stage: snapshot.connection.stage, tasks: snapshot.tasks.map(task => ({ id: task.taskId, title: task.title, version: task.version, status: task.status, dueAt: task.dueAt })) };
}
const COPY = {
  doneTask: { ja: "今回完了したフォロー", zh: "本次完成的跟进", en: "Follow-up completed now" },
  goal: { ja: "関係の目標", zh: "关系目标", en: "Relationship goal" },
  nextStep: { ja: "関係の次のステップ", zh: "关系下一步", en: "Relationship next step" },
  nextTitle: { ja: "次回フォローの内容", zh: "下一次跟进内容", en: "Next follow-up" },
};

export function RelationshipLifecycleEditor({ connectionId }: { connectionId: string }) {
  const { t } = useOrbitLanguage();
  // Read through a ref so a new `t` (no provider) never re-triggers the load effect.
  const tRef = useRef(t);
  tRef.current = t;
  const [model, setModel] = useState<Model | null>(null);
  const [taskId, setTaskId] = useState("");
  const [kind, setKind] = useState<RelationshipCompletionInput["outcome"]["kind"]>("next_task");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [goal, setGoal] = useState("");
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const intent = useRef<{ fingerprint: string; body: RelationshipCompletionInput } | null>(null);
  const endpoint = `/api/connections/${encodeURIComponent(connectionId)}/lifecycle`;
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const envelope = await response.json();
      if (!response.ok || !envelope.success) throw new Error(envelope.error?.message ?? tRef.current({ ja: "読み込めませんでした。もう一度お試しください。", zh: "读取失败，请重试。", en: "Couldn't load. Please try again." }));
      const { snapshot } = relationshipLifecycleReadSchema.parse(envelope.data);
      if (snapshot.connection.connectionId !== connectionId) throw new Error(tRef.current({ ja: "返ってきた関係が一致しません。", zh: "返回的关系不一致。", en: "The returned relationship doesn't match." }));
      setModel(view(snapshot));
      setTaskId(current => snapshot.tasks.some(task => task.taskId === current && ["open", "scheduled"].includes(task.status)) ? current : snapshot.tasks.find(task => ["open", "scheduled"].includes(task.status))?.taskId ?? "");
      intent.current = null;
    } catch (error) { setModel(null); setMessage(error instanceof Error ? error.message : tRef.current({ ja: "読み込めませんでした。", zh: "读取失败。", en: "Couldn't load." })); }
    finally { setBusy(false); }
  }, [endpoint, connectionId]);
  useEffect(() => { void load(); }, [load]);
  const currentTasks = model?.tasks.filter(task => ["open", "scheduled"].includes(task.status)) ?? [];
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const task = currentTasks.find(item => item.id === taskId);
    if (!model || !task || busy) return;
    setBusy(true); setMessage("");
    try {
      if (kind === "archived" && !archiveConfirmed) throw new Error(t({ ja: "アーカイブして、残りの未完了フォローを無視することを確認してください。", zh: "请确认归档并忽略其余未完成跟进。", en: "Confirm archiving and dismissing the other open follow-ups." }));
      const fingerprint = JSON.stringify({ connectionId, taskId, version: model.version, taskVersion: task.version, kind, title, due, goal, archiveConfirmed });
      if (intent.current?.fingerprint !== fingerprint) {
        const outcome: RelationshipCompletionInput["outcome"] = kind === "active" ? { kind, activeGoal: goal.trim() }
          : kind === "archived" ? { kind, dismissTaskIds: currentTasks.filter(item => item.id !== taskId).map(item => item.id) }
          : { kind, nextTask: { taskId: `relationship-task:${crypto.randomUUID()}`, title: title.trim(), dueAt: new Date(due).toISOString() } };
        intent.current = { fingerprint, body: { taskId, expectedConnectionVersion: model.version, expectedTaskVersion: task.version, idempotencyKey: crypto.randomUUID(), outcome } };
      }
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(intent.current.body) });
      const envelope = await response.json();
      if (!response.ok || !envelope.success) throw new Error(envelope.error?.message ?? t({ ja: "保存できませんでした。入力は残っています。再試行するか、再読み込みして確認してください。", zh: "保存失败；输入已保留，可重试或刷新核对。", en: "Couldn't save. Your input is kept; retry or refresh to check." }));
      const { snapshot } = relationshipLifecycleMutationSchema.parse(envelope.data);
      if (snapshot.connection.connectionId !== connectionId || snapshot.connection.actorId !== model.actorId || !snapshot.tasks.some(item => item.taskId === taskId && item.status === "completed")) throw new Error(t({ ja: "保存結果が一致しません。再読み込みして確認してください。", zh: "保存回执不一致，请刷新核对。", en: "The save receipt doesn't match. Refresh to check." }));
      setModel(view(snapshot)); setTaskId(""); intent.current = null;
      setTitle(""); setDue(""); setGoal(""); setArchiveConfirmed(false);
      setMessage(t({ ja: "フォローを完了し、次のステップを保存しました。再読み込みで確認できます。", zh: "跟进已完成，关系下一步已保存。刷新可重新核对。", en: "Follow-up done and next step saved. Refresh to check again." }));
    } catch (error) { setMessage(error instanceof Error ? error.message : t({ ja: "保存できませんでした。入力は残っています。", zh: "保存失败，输入已保留。", en: "Couldn't save. Your input is kept." })); }
    finally { setBusy(false); }
  }
  return <section className="tasks-workspace" style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
    <a href="/app/tasks">{t({ ja: "タスクに戻る", zh: "返回待办", en: "Back to tasks" })}</a><h1>{t({ ja: "人脈のフォロー", zh: "处理人脉跟进", en: "Relationship follow-up" })}</h1>
    <p>{t({ ja: "フォローを完了するときに、関係の次のステップも決めます。相手にメッセージは送られません。", zh: "完成当前跟进时，一并确认关系下一步；不会向联系人发送消息。", en: "When you complete a follow-up, confirm the relationship's next step too. No message is sent to the contact." })}</p>
    <button className="btn btn-ghost" disabled={busy} onClick={() => { setMessage(""); void load(); }}>{t({ ja: "関係の状態を再読み込み", zh: "刷新关系状态", en: "Refresh relationship status" })}</button>
    {message ? <p role="status">{message}</p> : null}
    {model ? <><p>{t({ ja: "現在の段階：", zh: "当前阶段：", en: "Current stage: " })}{STAGE_LABELS[model.stage] ? t(STAGE_LABELS[model.stage]!) : model.stage} · <a href={`/app/contacts/${encodeURIComponent(model.contactId)}`}>{t({ ja: "連絡先を見る", zh: "查看联系人", en: "View contact" })}</a></p>
      {currentTasks.length ? <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <label>{t(COPY.doneTask)}<select aria-label={t(COPY.doneTask)} required disabled={busy} value={taskId} onChange={event => setTaskId(event.target.value)}><option value="">{t({ ja: "選択してください", zh: "请选择", en: "Select" })}</option>{currentTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
        <label>{t(COPY.nextStep)}<select aria-label={t(COPY.nextStep)} disabled={busy} value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
          <option value="next_task" disabled={!["needs_follow_up", "nurture"].includes(model.stage)}>{t({ ja: "フォローを続ける", zh: "继续跟进", en: "Keep following up" })}</option><option value="active">{t({ ja: "進行中にする", zh: "转为进行中", en: "Make active" })}</option><option value="nurture">{t({ ja: "定期的に連絡を保つ", zh: "定期维护", en: "Keep in touch regularly" })}</option><option value="archived">{t({ ja: "関係をアーカイブ", zh: "归档关系", en: "Archive relationship" })}</option>
        </select></label>
        {kind === "next_task" || kind === "nurture" ? <><label>{t(COPY.nextTitle)}<input required maxLength={500} aria-label={t(COPY.nextTitle)} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} /></label><label>{t({ ja: "次回の日時（この端末のタイムゾーン）", zh: "下次时间（当前设备时区）", en: "Next time (this device's time zone)" })}<input required aria-label={t({ ja: "次回フォローの日時", zh: "下次跟进时间", en: "Next follow-up time" })} type="datetime-local" value={due} disabled={busy} onChange={event => setDue(event.target.value)} /></label></> : null}
        {kind === "active" ? <label>{t(COPY.goal)}<input required maxLength={2000} aria-label={t(COPY.goal)} value={goal} disabled={busy} onChange={event => setGoal(event.target.value)} /></label> : null}
        {kind === "archived" ? <label><input type="checkbox" required checked={archiveConfirmed} disabled={busy} onChange={event => setArchiveConfirmed(event.target.checked)} />{t({ ja: `アーカイブして、残り ${Math.max(0, currentTasks.length - 1)} 件の未完了フォローを無視する`, zh: `确认归档，并忽略其余 ${Math.max(0, currentTasks.length - 1)} 条未完成跟进`, en: `Archive and dismiss the other ${Math.max(0, currentTasks.length - 1)} open follow-ups` })}</label> : null}
        <button className="btn btn-primary" disabled={busy || !taskId} type="submit">{busy ? t({ ja: "保存中…", zh: "保存中…", en: "Saving…" }) : t({ ja: "完了して次のステップを保存", zh: "完成并保存下一步", en: "Complete and save next step" })}</button>
      </form> : <p>{t({ ja: "対応待ちのフォローはありません。", zh: "没有待处理的人脉跟进。", en: "No pending relationship follow-ups." })}</p>}
      <h2>{t({ ja: "これまでのフォロー", zh: "历史跟进", en: "Past follow-ups" })}</h2><ul>{model.tasks.filter(task => !["open", "scheduled"].includes(task.status)).map(task => <li key={task.id}>{task.title} · {task.status === "completed" ? t({ ja: "完了", zh: "已完成", en: "Completed" }) : t({ ja: "無視", zh: "已忽略", en: "Dismissed" })}</li>)}</ul>
    </> : <p>{busy ? t({ ja: "読み込み中…", zh: "正在读取…", en: "Loading…" }) : t({ ja: "この関係は今は読み込めません。", zh: "暂不可读取此关系。", en: "This relationship can't be loaded right now." })}</p>}
  </section>;
}
