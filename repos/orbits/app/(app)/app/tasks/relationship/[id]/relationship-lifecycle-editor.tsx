"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { relationshipLifecycleMutationSchema, relationshipLifecycleReadSchema } from "../../../../../../shared/api-schema/relationship-lifecycle";
import type { RelationshipCompletionInput, RelationshipLifecycleSnapshotDTO } from "../../../../../../shared/contract/relationship-lifecycle";

// Page-owned model: only fields rendered by this editor cross into its presenter.
type Model = { actorId: string; contactId: string; version: number; stage: string; tasks: { id: string; title: string; version: number; status: string; dueAt: string }[] };
function view(snapshot: { connection: Pick<RelationshipLifecycleSnapshotDTO["connection"], "actorId" | "contactId" | "version" | "stage">; tasks: RelationshipLifecycleSnapshotDTO["tasks"] }): Model {
  return { actorId: snapshot.connection.actorId, contactId: snapshot.connection.contactId, version: snapshot.connection.version, stage: snapshot.connection.stage, tasks: snapshot.tasks.map(task => ({ id: task.taskId, title: task.title, version: task.version, status: task.status, dueAt: task.dueAt })) };
}
export function RelationshipLifecycleEditor({ connectionId }: { connectionId: string }) {
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
      if (!response.ok || !envelope.success) throw new Error(envelope.error?.message ?? "读取失败，请重试。");
      const { snapshot } = relationshipLifecycleReadSchema.parse(envelope.data);
      if (snapshot.connection.connectionId !== connectionId) throw new Error("返回的关系不一致。");
      setModel(view(snapshot));
      setTaskId(current => snapshot.tasks.some(task => task.taskId === current && ["open", "scheduled"].includes(task.status)) ? current : snapshot.tasks.find(task => ["open", "scheduled"].includes(task.status))?.taskId ?? "");
      intent.current = null;
    } catch (error) { setModel(null); setMessage(error instanceof Error ? error.message : "读取失败。"); }
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
      if (kind === "archived" && !archiveConfirmed) throw new Error("请确认归档并忽略其余未完成跟进。");
      const fingerprint = JSON.stringify({ connectionId, taskId, version: model.version, taskVersion: task.version, kind, title, due, goal, archiveConfirmed });
      if (intent.current?.fingerprint !== fingerprint) {
        const outcome: RelationshipCompletionInput["outcome"] = kind === "active" ? { kind, activeGoal: goal.trim() }
          : kind === "archived" ? { kind, dismissTaskIds: currentTasks.filter(item => item.id !== taskId).map(item => item.id) }
          : { kind, nextTask: { taskId: `relationship-task:${crypto.randomUUID()}`, title: title.trim(), dueAt: new Date(due).toISOString() } };
        intent.current = { fingerprint, body: { taskId, expectedConnectionVersion: model.version, expectedTaskVersion: task.version, idempotencyKey: crypto.randomUUID(), outcome } };
      }
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(intent.current.body) });
      const envelope = await response.json();
      if (!response.ok || !envelope.success) throw new Error(envelope.error?.message ?? "保存失败；输入已保留，可重试或刷新核对。");
      const { snapshot } = relationshipLifecycleMutationSchema.parse(envelope.data);
      if (snapshot.connection.connectionId !== connectionId || snapshot.connection.actorId !== model.actorId || !snapshot.tasks.some(item => item.taskId === taskId && item.status === "completed")) throw new Error("保存回执不一致，请刷新核对。");
      setModel(view(snapshot)); setTaskId(""); intent.current = null;
      setTitle(""); setDue(""); setGoal(""); setArchiveConfirmed(false);
      setMessage("跟进已完成，关系下一步已保存。刷新可重新核对。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，输入已保留。"); }
    finally { setBusy(false); }
  }
  return <section className="tasks-workspace" style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
    <a href="/app/tasks">返回待办</a><h1>处理人脉跟进</h1>
    <p>完成当前跟进时，一并确认关系下一步；不会向联系人发送消息。</p>
    <button className="btn btn-ghost" disabled={busy} onClick={() => { setMessage(""); void load(); }}>刷新关系状态</button>
    {message ? <p role="status">{message}</p> : null}
    {model ? <><p>当前阶段：{({ captured: "已记录", reviewing: "复核中", needs_follow_up: "需要跟进", active: "进行中", nurture: "培育中", archived: "已归档" } as Record<string, string>)[model.stage]} · <a href={`/app/contacts/${encodeURIComponent(model.contactId)}`}>查看联系人</a></p>
      {currentTasks.length ? <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <label>本次完成的跟进<select aria-label="本次完成的跟进" required disabled={busy} value={taskId} onChange={event => setTaskId(event.target.value)}><option value="">请选择</option>{currentTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
        <label>关系下一步<select aria-label="关系下一步" disabled={busy} value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
          <option value="next_task" disabled={!["needs_follow_up", "nurture"].includes(model.stage)}>继续跟进</option><option value="active">转为进行中</option><option value="nurture">定期维护</option><option value="archived">归档关系</option>
        </select></label>
        {kind === "next_task" || kind === "nurture" ? <><label>下一次跟进内容<input required maxLength={500} aria-label="下一次跟进内容" value={title} disabled={busy} onChange={event => setTitle(event.target.value)} /></label><label>下次时间（当前设备时区）<input required aria-label="下次跟进时间" type="datetime-local" value={due} disabled={busy} onChange={event => setDue(event.target.value)} /></label></> : null}
        {kind === "active" ? <label>关系目标<input required maxLength={2000} aria-label="关系目标" value={goal} disabled={busy} onChange={event => setGoal(event.target.value)} /></label> : null}
        {kind === "archived" ? <label><input type="checkbox" required checked={archiveConfirmed} disabled={busy} onChange={event => setArchiveConfirmed(event.target.checked)} />确认归档，并忽略其余 {Math.max(0, currentTasks.length - 1)} 条未完成跟进</label> : null}
        <button className="btn btn-primary" disabled={busy || !taskId} type="submit">{busy ? "保存中…" : "完成并保存下一步"}</button>
      </form> : <p>没有待处理的人脉跟进。</p>}
      <h2>历史跟进</h2><ul>{model.tasks.filter(task => !["open", "scheduled"].includes(task.status)).map(task => <li key={task.id}>{task.title} · {task.status === "completed" ? "已完成" : "已忽略"}</li>)}</ul>
    </> : <p>{busy ? "正在读取…" : "暂不可读取此关系。"}</p>}
  </section>;
}
