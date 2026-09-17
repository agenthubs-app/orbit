"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PersonalScheduleContract } from "../../../../shared/contract/tasks";
import { localParts, validTimeZone } from "../../../../features/tasks/local-date-time";
import { createPersonalScheduleClient } from "./personal-schedule-client";
import { applyPersonalScheduleDuration, buildPersonalScheduleChange, personalScheduleDraft } from "./personal-schedule-editor-model";
import { useTasksMutation, useTasksResource } from "./tasks-hooks";
import { PersonalScheduleRules, personalScheduleRulesLabel } from "./personal-schedule-rules";
import { PersonalScheduleAssociationSheet } from "./personal-schedule-association-sheet";
import { PersonalScheduleDateTimePicker } from "./personal-schedule-date-time-picker";
import { applyPersonalSchedulePicker } from "./personal-schedule-picker-model";

export function PersonalScheduleWorkspace({ actorId }: { actorId: string }) {
  const scope = useMemo(() => ({ controller: new AbortController() }), [actorId]);
  useEffect(() => {
    if (scope.controller.signal.aborted) scope.controller = new AbortController();
    return () => scope.controller.abort();
  }, [scope]);
  const client = useMemo(() => createPersonalScheduleClient(actorId, async (url, init) => {
    const controller = scope.controller;
    const response = await fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal });
    controller.signal.throwIfAborted();
    return response;
  }, scope.controller.signal), [actorId, scope]);
  const list = useTasksResource(() => client.list(), actorId);
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [lastSaved, setLastSaved] = useState<PersonalScheduleContract | null>(null);
  const zone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } })();
  const listed = selected ? list.data?.find(item => item.id === selected) : null;
  const item = selected ? lastSaved?.id === selected && (!listed || Date.parse(lastSaved.updatedAt) >= Date.parse(listed.updatedAt)) ? lastSaved : listed ?? null : null;
  return <section>
    <div className="task-controls"><button className="btn btn-primary" onClick={() => { setSelected(null); setEditing(true); }}>新建个人日程</button><button className="btn btn-secondary" onClick={list.refresh}>刷新个人日程</button></div>
    {list.error ? <p role="alert">个人日程读取失败，请重试。</p> : null}
    {list.loading ? <p role="status">正在读取个人日程…</p> : null}
    {!list.error && list.data?.length === 0 ? <p>暂无个人日程</p> : null}
    <div className="task-list">{list.data?.map(item => { const p = localParts(item.startsAt, item.timeZone ?? zone); return <button key={item.id} className="task-row" onClick={() => { setSelected(item.id); setEditing(false); }} style={{ display: "block", textAlign: "left", width: "100%", padding: 16 }}><strong>{item.title}</strong><span style={{ display: "block" }}>{[p.date + " " + (item.allDay ? "全天" : p.time), item.location, item.state === "ended" ? "已结束" : item.state === "ongoing" ? "进行中" : "已安排"].filter(Boolean).join(" · ")}</span></button>; })}</div>
    {lastSaved && selected === lastSaved.id && !editing ? <p role="status">个人日程已保存</p> : null}
    {selected !== undefined && (selected === null || item) ? editing ? <PersonalEditor key={actorId + ":" + (selected ?? "new")} item={item} client={client} onCancel={() => { setEditing(false); if (selected === null) setSelected(undefined); }} onSaved={value => { setLastSaved(value); setSelected(value?.id); setEditing(false); list.refresh(); }} /> : selected ? <PersonalDetail key={actorId + ":" + selected + ":" + item?.updatedAt} id={selected} client={client} onEdit={value => { setLastSaved(value); setEditing(true); }} /> : null : null}
  </section>;
}
function PersonalDetail({ id, client, onEdit }: { id: string; client: ReturnType<typeof createPersonalScheduleClient>; onEdit: (item: PersonalScheduleContract) => void }) {
  const [item, setItem] = useState<PersonalScheduleContract | null>(null); const [error, setError] = useState("");
  useEffect(() => { let active = true; setItem(null); void client.get(id).then(value => { if (active) setItem(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "日程读取失败"); }); return () => { active = false; }; }, [id, client]);
  if (!item) return <p role={error ? "alert" : "status"}>{error || "正在读取日程…"}</p>;
  const zone = item.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone; const start = localParts(item.startsAt, zone); const end = item.endsAt ? localParts(item.endsAt, zone) : null;
  const endDate = item.allDay && item.endsAt ? localParts(new Date(Date.parse(item.endsAt) - 1).toISOString(), zone).date : end?.date;
  let safeUrl: string | null = null; if (item.meetingMethod === "video" && item.meetingUrl) { try { const url = new URL(item.meetingUrl); if (["http:", "https:"].includes(url.protocol) && url.hostname && !url.username && !url.password) safeUrl = item.meetingUrl; } catch {} }
  return <section aria-label="个人日程详情"><p>个人日程 · 仅自己可见</p><h2 style={{ fontSize: 28, fontWeight: 800 }}>{item.title}</h2><p>{start.date} · {item.allDay ? "全天" : start.time}{item.allDay && endDate === start.date ? null : ` → ${end ? item.allDay ? endDate : `${end.date} ${end.time}` : "结束时间未设置"}`}</p><p>{zone}</p>{item.location ? <p>{item.location}</p> : null}<PersonalAssociations client={client} noteIds={item.noteIds ?? []} contactIds={item.contactIds ?? []} /><p>{personalScheduleRulesLabel(item)}</p>{safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer">进入会议</a> : null}<button className="btn btn-secondary" onClick={() => onEdit(item)}>编辑</button><button className="btn btn-secondary" onClick={() => onEdit(item)}>改期</button></section>;
}
function PersonalEditor({ item, client, onSaved, onCancel }: { item: PersonalScheduleContract | null; client: ReturnType<typeof createPersonalScheduleClient>; onSaved: (value: PersonalScheduleContract | null) => void; onCancel: () => void }) {
  const [zone] = useState(() => { if (item?.timeZone) return item.timeZone; try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } });
  const [baseline, setBaseline] = useState(item); const [draft, setDraft] = useState(() => personalScheduleDraft(item, validTimeZone(zone) ? zone : "UTC"));
  const [picker, setPicker] = useState<"startDate" | "startTime" | "endDate" | "endTime" | null>(null);
  const mutation = useTasksMutation(); const [validation, setValidation] = useState(""); const [confirm, setConfirm] = useState(false);
  const [editScope, setEditScope] = useState<"occurrence" | "series" | undefined>(); const [scopeBusy, setScopeBusy] = useState(false); const scopeGeneration = useRef(0);
  useEffect(() => () => { scopeGeneration.current++; }, []);
  const clean = JSON.stringify(draft) === JSON.stringify(personalScheduleDraft(baseline, validTimeZone(zone) ? zone : "UTC"));
  const stale = !!baseline && !!item && baseline.id === item.id && baseline.updatedAt !== item.updatedAt;
  const needsScope = !!item?.recurrence || !!item?.seriesId;
  useEffect(() => { if (clean && !mutation.busy && baseline?.id === item?.id) { setBaseline(item); setDraft(personalScheduleDraft(item, validTimeZone(zone) ? zone : "UTC")); } }, [item, clean, mutation.busy, zone, baseline?.id]);
  async function chooseScope(value: "occurrence" | "series") {
    if (mutation.busy || scopeBusy) return;
    if (!clean) { setValidation("草稿已保留，请先放弃草稿并载入最新内容，再切换修改范围。"); return; }
    setValidation(""); setConfirm(false);
    if (value === "occurrence") { setEditScope(value); setBaseline(item); setDraft(personalScheduleDraft(item, zone)); return; }
    const token = ++scopeGeneration.current; setScopeBusy(true);
    try { const series = await client.get(item!.seriesId ?? item!.id); if (token !== scopeGeneration.current) return; setBaseline(series); setDraft(personalScheduleDraft(series, zone)); setEditScope("series"); }
    catch (reason) { if (token === scopeGeneration.current) setValidation(reason instanceof Error ? reason.message : "系列读取失败，请重试。"); }
    finally { if (token === scopeGeneration.current) setScopeBusy(false); }
  }
  return <section aria-label="个人日程编辑"><h2>{baseline ? "编辑个人日程" : "新建个人日程"}</h2><p>时间使用 {zone || "UTC（只读）"}。结束时间和地点可以清空。</p>
    {needsScope ? <fieldset><legend>修改范围</legend><button type="button" className="btn btn-secondary" aria-pressed={editScope === "occurrence"} disabled={mutation.busy || scopeBusy || !item?.occurrenceDate} onClick={() => void chooseScope("occurrence")}>仅本次</button><button type="button" className="btn btn-secondary" aria-pressed={editScope === "series"} disabled={mutation.busy || scopeBusy} onClick={() => void chooseScope("series")}>整个系列</button>{scopeBusy ? <p role="status">正在读取整个系列…</p> : null}{!editScope ? <p>请选择修改范围后再保存或删除。</p> : null}{!clean ? <button type="button" className="btn btn-secondary" onClick={() => { setDraft(personalScheduleDraft(baseline, zone)); setValidation(""); }}>放弃草稿并载入最新内容</button> : null}</fieldset> : null}
    <form className="task-editor" onSubmit={async event => {
      event.preventDefault(); if (mutation.busy || stale || scopeBusy) return;
      if (needsScope && !editScope) { setValidation("请选择本次或整个系列的修改范围。"); return; }
      const change = buildPersonalScheduleChange(baseline, draft, zone);
      if (change.kind === "invalid") { setValidation(change.message); return; } if (change.kind === "unchanged") return;
      setValidation(""); await mutation.run(() => client.save(baseline, change.fields, editScope), updated => { setBaseline(updated); setDraft(personalScheduleDraft(updated, zone)); onSaved(updated); }, "个人日程已保存");
    }}>
      <label>日程标题<input aria-label="日程标题" type="text" value={draft.title} disabled={mutation.busy} style={{ fontSize: 28, fontWeight: 800, border: 0, borderBottom: "1px solid currentColor" }} onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))} /></label>
      <fieldset style={{ borderRadius: 12, padding: 16 }}><legend>时间</legend><p style={{ fontSize: 22, fontWeight: 800 }}>{draft.startDate} · {draft.allDay ? "全天" : `${draft.startTime || "—"} → ${draft.endTime || "—"}`}</p>
        <div>{([30, 60, 120] as const).map(minutes => <button className="btn btn-secondary" key={minutes} type="button" disabled={mutation.busy} onClick={() => { const result = applyPersonalScheduleDuration(draft, zone, minutes, baseline); if (result.kind === "ready") setDraft(result.draft); else setValidation(result.message); }}>{minutes === 30 ? "30分钟" : minutes === 60 ? "1小时" : "2小时"}</button>)}<button className="btn btn-secondary" type="button" aria-pressed={!!draft.allDay} disabled={mutation.busy} onClick={() => setDraft(previous => ({ ...previous, allDay: !previous.allDay, endDate: "", endTime: "" }))}>全天</button></div>
        <div>{([["startDate", "开始日期"], ["startTime", "开始时间"], ["endDate", "结束日期"], ["endTime", "结束时间"]] as const).filter(([field]) => !draft.allDay || field.endsWith("Date")).map(([field, label]) => <button key={field} type="button" className="btn btn-secondary" aria-label={label} disabled={mutation.busy || scopeBusy || !validTimeZone(zone)} onClick={() => setPicker(field)}>{label} {draft[field] || "—"}</button>)}</div>
        {!draft.allDay && (draft.endDate || draft.endTime) ? <button type="button" className="btn btn-secondary" aria-label="清除结束时间" disabled={mutation.busy || scopeBusy} onClick={() => { if (!mutation.busy && !scopeBusy) { const next = { ...draft, endDate: "", endTime: "" }; delete next.pickerEndInstant; setDraft(next); } }}>清除结束时间</button> : null}
      </fieldset><p>仅保存在 Orbit，不会写入外部日历。{zone || "时区不可用"}</p>
      <div>{(["video", "in_person"] as const).map(meetingMethod => <button className="btn btn-secondary" key={meetingMethod} type="button" aria-pressed={draft.meetingMethod === meetingMethod} disabled={mutation.busy} onClick={() => setDraft(previous => ({ ...previous, meetingMethod, ...(meetingMethod === "video" ? { location: "" } : { meetingUrl: "" }) }))}>{meetingMethod === "video" ? "线上" : "线下"}</button>)}</div>
      {draft.meetingMethod === "video" ? <label>会议链接（选填）<input aria-label="会议链接（选填）" type="url" value={draft.meetingUrl ?? ""} disabled={mutation.busy} onChange={event => setDraft(previous => ({ ...previous, meetingUrl: event.target.value }))} /></label> : <label>日程地点<input aria-label="日程地点" value={draft.location} disabled={mutation.busy} onChange={event => setDraft(previous => ({ ...previous, location: event.target.value }))} /></label>}
      <PersonalScheduleRules key={baseline?.id ?? "new"} draft={draft} zone={zone} disabled={mutation.busy || scopeBusy || (needsScope && editScope !== "series")} onChange={change => setDraft(previous => ({ ...previous, ...change }))} />
      <PersonalAssociations client={client} noteIds={draft.noteIds ?? []} contactIds={draft.contactIds ?? []} disabled={mutation.busy} onChange={(kind, ids) => setDraft(previous => ({ ...previous, [kind === "note" ? "noteIds" : "contactIds"]: ids }))} />
      <button className="btn btn-primary" type="submit" disabled={mutation.busy || stale || scopeBusy || (needsScope && !editScope)}>保存个人日程</button>
    </form>
    {picker ? <PersonalScheduleDateTimePicker key={`${baseline?.id ?? "new"}:${picker}`} kind={picker.endsWith("Date") ? "date" : "time"} value={draft[picker]} zone={zone} disabled={mutation.busy || scopeBusy} onCancel={() => setPicker(null)} onConfirm={value => { if (!mutation.busy && !scopeBusy) setDraft(previous => applyPersonalSchedulePicker(previous, baseline, zone, picker, value)); setPicker(null); }} /> : null}
    {stale ? <p role="alert">日程已更新，草稿已保留。<button className="btn btn-secondary" onClick={() => { setBaseline(item); setDraft(personalScheduleDraft(item, zone)); }}>放弃草稿并载入最新内容</button></p> : null}
    <button className="btn btn-secondary" disabled={mutation.busy} onClick={() => { if (clean || window.confirm("有未保存的修改，确认放弃？")) onCancel(); }}>取消</button>
    {baseline ? <button className="btn btn-secondary" disabled={mutation.busy || stale || scopeBusy || (needsScope && !editScope)} onClick={() => setConfirm(true)}>删除个人日程</button> : null}
    {confirm && baseline ? <div><p>{editScope === "occurrence" ? "只删除本次，其他日期的日程保留。" : editScope === "series" ? "删除整个系列，包括所有重复日期。" : "删除后，日程将从列表和日历移除。"}</p><button className="btn btn-secondary" disabled={mutation.busy || stale} onClick={() => void mutation.run(() => client.remove(baseline, editScope), () => onSaved(null), "个人日程已删除")}>确认删除个人日程</button><button className="btn btn-secondary" onClick={() => setConfirm(false)}>保留日程</button></div> : null}
    {validation || mutation.error ? <p role="alert">{validation || (mutation.error instanceof Error ? mutation.error.message : "操作未完成，草稿已保留。")}</p> : null}{mutation.message ? <p role="status">{mutation.message}</p> : null}
  </section>;
}

function PersonalAssociations({ client, noteIds, contactIds, disabled = false, onChange }: { client: ReturnType<typeof createPersonalScheduleClient>; noteIds: readonly string[]; contactIds: readonly string[]; disabled?: boolean; onChange?: (kind: "note" | "contact", ids: string[]) => void }) {
  const [kind, setKind] = useState<"note" | "contact" | null>(null); const [names, setNames] = useState<Record<string, string>>({}); const [missing, setMissing] = useState<string[]>([]);
  const idsKey = JSON.stringify([noteIds, contactIds]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null); const [note, setNote] = useState<{ id: string; title: string; body: string } | null>(null); const [noteError, setNoteError] = useState(""); const noteGeneration = useRef(0);
  useEffect(() => { noteGeneration.current++; setSelectedNoteId(null); setNote(null); setNoteError(""); return () => { noteGeneration.current++; }; }, [client, idsKey]);
  async function openNote(id: string) {
    if (disabled || !noteIds.includes(id)) return;
    const token = ++noteGeneration.current; setSelectedNoteId(id); setNote(null); setNoteError("");
    try { const value = await client.noteDetail(id); if (token === noteGeneration.current) setNote(value); }
    catch { if (token === noteGeneration.current) setNoteError("关联对象不可用，请移除或重试"); }
  }
  useEffect(() => {
    let active = true; setMissing([]);
    void Promise.all((["contact"] as const).flatMap(type => contactIds.map(async id => {
      try { return { key: `${type}:${id}`, title: (await client.association(type, id)).title }; } catch { return { key: `${type}:${id}`, title: null }; }
    }))).then(items => { if (!active) return; setNames(previous => ({ ...previous, ...Object.fromEntries(items.filter(item => item.title !== null).map(item => [item.key, item.title!])) })); setMissing(items.filter(item => item.title === null).map(item => item.key)); });
    return () => { active = false; };
  }, [client, idsKey]);
  return <section aria-label="仅你可见的日程关联"><p>仅你可见的日程关联</p>{(["note", "contact"] as const).map(type => <div key={type}>
    {onChange ? <button className="btn btn-secondary" type="button" disabled={disabled} onClick={() => setKind(type)}>{type === "note" ? "关联笔记" : "关联人脉"}</button> : null}
    {(type === "note" ? noteIds : contactIds).map(id => <div key={id} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 }}>{type === "note" ? <><span>{names[`${type}:${id}`] ?? "已关联笔记"}</span><button className="btn btn-secondary" type="button" disabled={disabled} onClick={() => void openNote(id)}>查看关联笔记</button></> : names[`${type}:${id}`] && !missing.includes(`${type}:${id}`) ? <a href={`/app/contacts/${encodeURIComponent(id)}`}>{names[`${type}:${id}`]}</a> : null}{missing.includes(`${type}:${id}`) ? <p role="alert">关联对象不可用，请移除或重试</p> : null}{onChange ? <button className="btn btn-secondary" type="button" disabled={disabled} aria-label={`移除${type === "note" ? "笔记" : "人脉"}关联`} onClick={() => onChange(type, (type === "note" ? noteIds : contactIds).filter(value => value !== id))}>移除</button> : null}</div>)}
  </div>)}{kind && onChange ? <PersonalScheduleAssociationSheet key={kind} kind={kind} client={client} ids={kind === "note" ? noteIds : contactIds} disabled={disabled} onClose={() => setKind(null)} onToggle={(id, title) => { const ids = kind === "note" ? noteIds : contactIds; setNames(previous => ({ ...previous, [`${kind}:${id}`]: title })); onChange(kind, ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]); }} /> : null}
    {selectedNoteId ? <section role="region" aria-label="关联笔记详情">{note ? <><h3>{note.title}</h3><p style={{ whiteSpace: "pre-wrap" }}>{note.body}</p></> : <p role={noteError ? "alert" : "status"}>{noteError || "正在读取笔记…"}</p>}<button className="btn btn-secondary" type="button" onClick={() => { noteGeneration.current++; setSelectedNoteId(null); setNote(null); setNoteError(""); }}>关闭笔记</button></section> : null}
  </section>;
}
