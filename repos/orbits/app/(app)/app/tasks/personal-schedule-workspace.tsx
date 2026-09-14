"use client";
import { useEffect, useMemo, useState } from "react";
import type { PersonalScheduleContract } from "../../../../shared/contract/tasks";
import { localParts, validTimeZone } from "../../../../features/tasks/local-date-time";
import { createPersonalScheduleClient } from "./personal-schedule-client";
import { buildPersonalScheduleChange, personalScheduleDraft } from "./personal-schedule-editor-model";
import { useTasksMutation, useTasksResource } from "./tasks-hooks";

export function PersonalScheduleWorkspace({ actorId }: { actorId: string }) {
  const scope = useMemo(() => ({ controller: new AbortController() }), [actorId]);
  useEffect(() => {
    if (scope.controller.signal.aborted) scope.controller = new AbortController();
    return () => scope.controller.abort();
  }, [scope]);
  const client = useMemo(() => createPersonalScheduleClient(actorId, async (url, init) => {
    const controller = scope.controller;
    const response = await fetch(url, { ...init, signal: controller.signal });
    controller.signal.throwIfAborted();
    return response;
  }), [actorId, scope]);
  const list = useTasksResource(() => client.list(), actorId);
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  const [lastSaved, setLastSaved] = useState<PersonalScheduleContract | null>(null);
  const zone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } })();
  const item = selected ? list.data?.find(item => item.id === selected) ?? (lastSaved?.id === selected ? lastSaved : null) : null;
  return <section>
    <div className="task-controls"><button className="btn btn-primary" onClick={() => setSelected(null)}>新建个人日程</button><button className="btn btn-secondary" onClick={list.refresh}>刷新个人日程</button></div>
    {list.error ? <p role="alert">个人日程读取失败，请重试。</p> : null}
    {list.loading ? <p role="status">正在读取个人日程…</p> : null}
    {list.data?.length === 0 ? <p>暂无个人日程</p> : null}
    <div className="task-list">{list.data?.map(item => { const p = localParts(item.startsAt, zone); return <button key={item.id} className="task-row" onClick={() => setSelected(item.id)} style={{ display: "block", textAlign: "left", width: "100%", padding: 16 }}><strong>{item.title}</strong><span style={{ display: "block" }}>{[p.date + " " + p.time, item.location, item.state === "ended" ? "已结束" : item.state === "ongoing" ? "进行中" : "已安排"].filter(Boolean).join(" · ")}</span></button>; })}</div>
    {selected !== undefined && (selected === null || item) ? <PersonalEditor key={actorId + ":" + (selected ?? "new")} item={item} client={client} onSaved={value => { setLastSaved(value); setSelected(value?.id); list.refresh(); }} /> : null}
  </section>;
}
function PersonalEditor({ item, client, onSaved }: { item: PersonalScheduleContract | null; client: ReturnType<typeof createPersonalScheduleClient>; onSaved: (value: PersonalScheduleContract | null) => void }) {
  const [zone] = useState(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } });
  const [baseline, setBaseline] = useState(item); const [draft, setDraft] = useState(() => personalScheduleDraft(item, validTimeZone(zone) ? zone : "UTC"));
  const mutation = useTasksMutation(); const [validation, setValidation] = useState(""); const [confirm, setConfirm] = useState(false);
  const clean = JSON.stringify(draft) === JSON.stringify(personalScheduleDraft(baseline, validTimeZone(zone) ? zone : "UTC"));
  const stale = !!baseline && !!item && baseline.updatedAt !== item.updatedAt;
  useEffect(() => { if (clean && !mutation.busy) { setBaseline(item); setDraft(personalScheduleDraft(item, validTimeZone(zone) ? zone : "UTC")); } }, [item, clean, mutation.busy, zone]);
  return <section aria-label="个人日程编辑"><h2>{baseline ? "编辑个人日程" : "新建个人日程"}</h2><p>时间使用 {zone || "UTC（只读）"}。结束时间和地点可以清空。</p>
    <form className="task-editor" onSubmit={async event => {
      event.preventDefault(); if (mutation.busy || stale) return;
      const change = buildPersonalScheduleChange(baseline, draft, zone);
      if (change.kind === "invalid") { setValidation(change.message); return; } if (change.kind === "unchanged") return;
      setValidation(""); await mutation.run(() => client.save(baseline, change.fields), updated => { setBaseline(updated); setDraft(personalScheduleDraft(updated, zone)); onSaved(updated); }, "个人日程已保存");
    }}>
      {([["title", "日程标题", "text"], ["startDate", "开始日期", "date"], ["startTime", "开始时间", "time"], ["endDate", "结束日期", "date"], ["endTime", "结束时间", "time"], ["location", "日程地点", "text"]] as const).map(([field, label, type]) => <label key={field}>{label}<input aria-label={label} type={type} value={draft[field]} disabled={mutation.busy} onChange={event => { const value = event.target.value; setDraft(previous => ({ ...previous, [field]: value })); }} /></label>)}
      <button className="btn btn-primary" type="submit" disabled={mutation.busy || stale}>保存个人日程</button>
    </form>
    {stale ? <p role="alert">日程已更新，草稿已保留。<button onClick={() => { setBaseline(item); setDraft(personalScheduleDraft(item, zone)); }}>放弃草稿并载入最新内容</button></p> : null}
    {baseline ? <button className="btn btn-secondary" disabled={mutation.busy || stale} onClick={() => setConfirm(true)}>删除个人日程</button> : null}
    {confirm && baseline ? <div><p>删除后，日程将从列表和日历移除。</p><button disabled={mutation.busy || stale} onClick={() => void mutation.run(() => client.remove(baseline), () => onSaved(null), "个人日程已删除")}>确认删除个人日程</button><button onClick={() => setConfirm(false)}>保留日程</button></div> : null}
    {validation || mutation.error ? <p role="alert">{validation || (mutation.error instanceof Error ? mutation.error.message : "操作未完成，草稿已保留。")}</p> : null}{mutation.message ? <p role="status">{mutation.message}</p> : null}
  </section>;
}
