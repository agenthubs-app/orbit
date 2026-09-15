"use client";
import { useEffect, useState } from "react";
import { calendarDate, localParts, resolveLocalDateTime, validTimeZone } from "../../../../features/tasks/local-date-time";
import type { TasksClient } from "./tasks-client";
import { useTasksMutation } from "./tasks-hooks";
import { TasksFeedback } from "./tasks-controls";
import type { TaskView } from "./tasks-view-model";

function draftFor(task: TaskView, zone: string) {
  const due = task.dueAt ? localParts(task.dueAt, zone) : { date: "", time: "" };
  return { plannedDate: task.plannedDate ?? "", dueDate: due.date, dueTime: due.time, location: task.location ?? "" };
}

export function TaskScheduleEditor({ task, client, onSaved }: { task: TaskView; client: TasksClient; onSaved: (task: TaskView) => void }) {
  const [zone, setZone] = useState(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } });
  const [baseline, setBaseline] = useState(task);
  const [draft, setDraft] = useState(() => draftFor(task, validTimeZone(zone) ? zone : "UTC"));
  const [validation, setValidation] = useState("");
  const mutation = useTasksMutation();
  const clean = JSON.stringify(draft) === JSON.stringify(draftFor(baseline, validTimeZone(zone) ? zone : "UTC"));
  useEffect(() => {
    if (clean && !mutation.busy) { setBaseline(task); setDraft(draftFor(task, validTimeZone(zone) ? zone : "UTC")); }
  }, [task, clean, zone, mutation.busy]);
  const stale = baseline.updatedAt !== task.updatedAt;
  const discard = () => { let next = zone; try { next = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {} setZone(next); setBaseline(task); setDraft(draftFor(task, validTimeZone(next) ? next : "UTC")); setValidation(""); };
  return <section aria-label="日期、时间和地点"><h2>日期、时间和地点</h2>
    <p>截止时间使用 {zone || "UTC（只读）"}。只安排日期时不必填写截止时间。清空后保存即可移除。已有提醒保持原定时间。</p>
    <form className="task-editor" onSubmit={async event => {
      event.preventDefault(); if (stale || mutation.busy || task.status === "cancelled") return;
      if (!validTimeZone(zone)) { setValidation("无法读取设备时区，草稿已保留。"); return; }
      const previous = draftFor(baseline, zone);
      if ((draft.plannedDate && !calendarDate(draft.plannedDate)) || Boolean(draft.dueDate) !== Boolean(draft.dueTime)) { setValidation("请输入有效日期，截止日期和时间需一起填写。"); return; }
      const patch: { plannedDate?: string | null; dueAt?: string | null; location?: string | null } = {};
      if (draft.plannedDate !== previous.plannedDate) patch.plannedDate = draft.plannedDate || null;
      if (draft.location.trim() !== previous.location) patch.location = draft.location.trim() || null;
      if (draft.dueDate !== previous.dueDate || draft.dueTime !== previous.dueTime) {
        if (!draft.dueDate && !draft.dueTime) patch.dueAt = null;
        else { const instant = resolveLocalDateTime(draft.dueDate, draft.dueTime, zone); if (!instant) { setValidation("此当地时间不存在或有两个可能的时刻，请选择明确时间。"); return; } patch.dueAt = instant; }
      }
      if (!Object.keys(patch).length) return;
      setValidation(""); await mutation.run(() => client.updateSchedule(baseline, patch), updated => { setBaseline(updated); setDraft(draftFor(updated, zone)); onSaved(updated); }, "日期、时间和地点已保存");
    }}>
      {([["plannedDate", "安排日期", "date"], ["dueDate", "截止日期", "date"], ["dueTime", "截止时间", "time"], ["location", "地点", "text"]] as const).map(([field, label, type]) => <label key={field}>{label}<input aria-label={label} type={type} value={draft[field]} disabled={mutation.busy || task.status === "cancelled"} onChange={event => { const value = event.target.value; setDraft(previous => ({ ...previous, [field]: value })); }} /></label>)}
      <button className="btn btn-primary" type="submit" disabled={mutation.busy || stale || clean || task.status === "cancelled"}>保存日期和地点</button>
    </form>
    {stale ? <div role="alert">事项已更新，草稿已保留。<button type="button" onClick={discard}>放弃日期草稿并载入最新内容</button></div> : null}
    {validation ? <p role="alert">{validation}</p> : null}<TasksFeedback error={mutation.error} message={mutation.message} />
  </section>;
}
