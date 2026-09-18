import type { PersonalScheduleDraft } from "./personal-schedule-editor-model";
import { useState } from "react";
import { PersonalScheduleDateTimePicker } from "./personal-schedule-date-time-picker";
const reminders = [["", "不提醒"], ["0", "开始时"], ["5", "提前5分钟"], ["15", "提前15分钟"], ["30", "提前30分钟"], ["60", "提前1小时"], ["1440", "提前1天"]] as const;
const repetitions = [["", "不重复"], ["daily", "每天"], ["weekly", "每周"], ["monthly", "每月"]] as const;

export function PersonalScheduleRules({ draft, zone = "UTC", disabled, onChange }: { draft: PersonalScheduleDraft; zone?: string; disabled: boolean; onChange: (change: Partial<PersonalScheduleDraft>) => void }) {
  const [untilOpen, setUntilOpen] = useState(false);
  return <fieldset style={{ borderRadius: 12, padding: 16 }}><legend>提醒与重复</legend>
    <label>提醒<select aria-label="提醒" value={draft.reminderMinutes ?? ""} disabled={disabled} style={{ minHeight: 44 }} onChange={event => onChange({ reminderMinutes: event.target.value === "" ? null : Number(event.target.value) as NonNullable<PersonalScheduleDraft["reminderMinutes"]> })}>{reminders.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>重复<select aria-label="重复" value={draft.recurrence?.frequency ?? ""} disabled={disabled} style={{ minHeight: 44 }} onChange={event => onChange({ recurrence: event.target.value ? { frequency: event.target.value as "daily" | "weekly" | "monthly", ...(draft.recurrence?.until ? { until: draft.recurrence.until } : {}) } : null })}>{repetitions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {draft.recurrence ? <div><button type="button" className="btn btn-secondary" aria-label="重复结束日期（选填）" disabled={disabled} onClick={() => setUntilOpen(true)}>重复结束日期（选填） {draft.recurrence.until || "—"}</button><button type="button" className="btn btn-secondary" aria-label="不设结束日期" disabled={disabled} onClick={() => { if (!disabled) onChange({ recurrence: { frequency: draft.recurrence!.frequency } }); }}>不设结束日期</button></div> : null}
    {untilOpen && draft.recurrence ? <PersonalScheduleDateTimePicker kind="date" value={draft.recurrence.until || draft.startDate} zone={zone} disabled={disabled} onCancel={() => setUntilOpen(false)} onConfirm={until => { if (!disabled) onChange({ recurrence: { frequency: draft.recurrence!.frequency, until } }); setUntilOpen(false); }} /> : null}
    {draft.recurrence?.frequency === "monthly" ? <p>每月同一天；没有该日期的月份会跳过。</p> : null}
    {disabled ? <p>本次继承系列提醒和重复；修改规则请选择整个系列。</p> : null}
  </fieldset>;
}

export function personalScheduleRulesLabel(item: { reminderMinutes?: number; recurrence?: { frequency: string; until?: string } }) {
  const reminder = reminders.find(([value]) => value === String(item.reminderMinutes))?.[1] ?? "不提醒";
  const recurrence = repetitions.find(([value]) => value === item.recurrence?.frequency)?.[1] ?? "不重复";
  return `${reminder} · ${recurrence}${item.recurrence?.until ? ` · 至${item.recurrence.until}` : ""}`;
}
