"use client";

/**
 * agent-design AG15 (approved visual draft 15-3, 15-4; D15-1): 「定时任务」 on the web, under 设置. The list (running,
 * needs attention, paused, ended, or none yet), one task (switch, next and last run, its seven facts, the history in
 * every wording of 15-4, pause and delete), and the form (「改」, and 「用表单新建」 which is the same form, empty).
 * Every word about a task comes from the server; this file only lays it out. Reads follow the no-flash rules: the
 * last answer shows at once and is read again, bones of the same size the first time.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { AgentReferenceCandidateContract, AgentScheduledTaskContract, AgentScheduledTaskFormContract, AgentScheduledTaskHistoryContract, AgentScheduledTaskRunContract } from "../../../../../shared/contract/agent-v1";
import { namesResultTime, reminderLineOf, showsReminderLines } from "../../../../../shared/compute/agent-reminder";
import { lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Bone, Button, Chip, ConfirmDialog, Icon, MacTile, Toggle, useToast, type ChipTone } from "../ui";
import { browserTimeZone, deleteScheduledTask, readScheduledTask, readScheduledTasks, saveScheduledTaskForm, searchNotes, setScheduledTaskRunning, TASK_LIST_KEY, taskHistoryKey } from "./scheduled-tasks-client";
import { scheduledTaskCopy, TASK_TILE, UNIT_OF, WEEKDAYS } from "./scheduled-tasks-copy";
import { ReminderBlock } from "./ScheduledTaskReminder";
import s from "./ScheduledTasks.module.css";

type Words = ReturnType<typeof scheduledTaskCopy>;

export const TASKS_HREF = "/app/settings/tasks";
export const taskHref = (id: string) => `${TASKS_HREF}/${encodeURIComponent(id)}`;
/** Where a period's result or card is opened: the inbox selects the entry of that run or card. */
export const inboxHrefOf = (id: string) => `/app/inbox?tab=notifications&open=${encodeURIComponent(id)}`;

function statusOf(task: AgentScheduledTaskContract, t: Words): { label: string; tone: ChipTone } {
  if (task.status === "completed") return { label: t("ended"), tone: "neutral" };
  if (task.needsAttention) return { label: t("attention"), tone: "apricot" };
  if (task.status === "paused") return { label: t("paused"), tone: "neutral" };
  return { label: t("running"), tone: "teal" };
}

/** 「下次 11月27日（周五） · 上次 今天 9:04：有 2 场新活动」 with the day and the result in bold, as the draft. */
function StatusLine({ text }: { text: string }) {
  return <>{text.split(" · ").map((part, index) => {
    const next = /^(下次 |Next |次回 )(.+)$/u.exec(part);
    // 「上次 今天 9:04：有 2 场新活动」: the result after the full-width colon (English: after ": "), not inside the time.
    const last = /^(.+?：)(.+)$/u.exec(part) ?? /^(.+?: )(.+)$/u.exec(part);
    const body = next ? <>{next[1]}<b>{next[2]}</b></> : last ? <>{last[1]}<b>{last[2]}</b></> : part;
    return <span key={index}>{index ? " · " : ""}{body}</span>;
  })}</>;
}

function useTaskToggle(onDone: () => void) {
  const { language } = useOrbitLanguage();
  const t = scheduledTaskCopy(language);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (task: AgentScheduledTaskContract, running: boolean) => {
    if (busy) return;
    setBusy(task.id);
    try {
      await setScheduledTaskRunning(task.id, running);
      onDone();
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(null);
    }
  };
  return { busy, toggle };
}

/* ── the list (15-3) ─────────────────────────────────────────────────────────── */

function ListSkeleton() {
  return <div className={s.listCard} role="progressbar" aria-busy="true">{[0, 1, 2].map((key) => <div key={key} className={s.taskRow}><Bone width={40} height={40} /><div className={s.taskMain}><Bone width="45%" height={16} /><Bone width="35%" height={13} /><Bone width="60%" height={13} /></div></div>)}</div>;
}

function EmptyTasks({ t }: { t: Words }) {
  return (
    <div className={s.empty} data-orbit-scheduled-empty>
      <span className={s.emptyIcon} aria-hidden><Icon name="clock" size={20} /></span>
      <b>{t("emptyTitle")}</b>
      <p>{t("emptyBody")}</p>
      <div className={s.emptyActions}>
        <Link prefetch className={`btn ${s.darkPill}`} href="/app/agent">{t("goIorbit")}</Link>
        <Link prefetch className={`btn ${s.softPill}`} href={`${TASKS_HREF}/new`}>{t("useForm")}</Link>
      </div>
    </div>
  );
}

export function ScheduledTaskList() {
  const { language } = useOrbitLanguage();
  const t = scheduledTaskCopy(language);
  const key = `${TASK_LIST_KEY}:${language}`;
  const [tasks, setTasks] = useState<AgentScheduledTaskContract[] | null>(() => lastAnswer<AgentScheduledTaskContract[]>(key) ?? null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readScheduledTasks(language, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setTasks(next);
      setFailed(false);
      rememberAnswer(key, next);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [language, key, attempt]);
  const { busy, toggle } = useTaskToggle(() => setAttempt((n) => n + 1));
  if (!tasks) return failed ? <div className={s.retry} role="alert">{t("loadFailed")} <Button size="sm" label={t("retry")} onClick={() => setAttempt((n) => n + 1)} /></div> : <ListSkeleton />;
  const running = tasks.filter((task) => task.status === "active").length;
  return (
    <div className={s.page} data-orbit-scheduled-list>
      <div className={s.toolbar}>
        <span className={s.count}>{tasks.length ? t("count", { m: running, n: tasks.length }) : ""}</span>
        <Link prefetch className={`btn ${s.darkPill}`} href={`${TASKS_HREF}/new`}><Icon name="plus" size={16} />{t("newTask")}</Link>
      </div>
      {tasks.length === 0 ? <EmptyTasks t={t} /> : (
        <div className={s.listCard}>
          {tasks.map((task) => {
            const status = statusOf(task, t);
            const tile = TASK_TILE[task.domain ?? "event"];
            return (
              <div key={task.id} className={s.taskRow} data-orbit-scheduled-task={task.id}>
                <MacTile emoji={tile.emoji} tone={tile.tone} size="sm" />
                <Link prefetch className={s.taskMain} href={taskHref(task.id)}>
                  <b className={s.taskTitle}>{task.title}</b>
                  <span className={s.taskLine}>{task.summary?.schedule}{task.notify.push ? <span className={s.listMarker} data-orbit-scheduled-reminder-marker>{" · "}{t("reminderMarker")}</span> : null}</span>
                  {task.summary?.status ? <span className={s.taskLine}><StatusLine text={task.summary.status} /></span> : null}
                  {task.summary?.attention ? <span className={s.attention}>{task.summary.attention}</span> : null}
                </Link>
                <div className={s.taskSide}>
                  <Chip label={status.label} tone={status.tone} />
                  {task.status === "completed" ? null : <Toggle checked={task.status === "active"} disabled={busy === task.id} label={t("toggle", { title: task.title })} onChange={(next) => void toggle(task, next)} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {failed ? <div className={s.retry} role="alert">{t("loadFailed")} <Button size="sm" label={t("retry")} onClick={() => setAttempt((n) => n + 1)} /></div> : null}
    </div>
  );
}

/* ── one task (15-4) ─────────────────────────────────────────────────────────── */

const FIRST_RUNS = 6;

/** AG16 (16-4): with reminders, a second line says whether the reminder arrived — apart from when the result was ready. */
function HistoryRow({ run, t, reminderLines = false }: { run: AgentScheduledTaskRunContract; t: Words; reminderLines?: boolean }) {
  const display = run.display;
  const opens = display?.opens ?? null;
  const strong = run.outcome === "delivered";
  const reminder = reminderLines ? reminderLineOf(run) : null;
  const time = display?.time ? (namesResultTime(run, reminderLines) ? `${t("resultAt")} ${display.time} · ` : `${display.time} · `) : "";
  return (
    <>
      <div className={s.historyRow} data-orbit-scheduled-run={run.runId}>
        <span className={s.historyDay}>{display?.day ?? run.scheduledAt.slice(0, 10)}</span>
        <span className={s.historyLines}>
          <span className={strong ? s.historyStrong : s.historyText}>
            {time}{display?.text ?? run.line}
            {opens ? <Link prefetch className={s.historyLink} href={inboxHrefOf(opens === "card" ? run.cardId ?? run.runId : run.runId)}>{opens === "card" ? t("seeCard") : t("seeResult")} ›</Link> : null}
          </span>
          {reminder ? <span className={`${s.pushLine} ${reminder.tone === "delivered" ? s.pushDelivered : reminder.tone === "missed" ? s.pushMissed : ""}`} data-orbit-scheduled-push={reminder.tone}>{reminder.tone === "delivered" ? <>✓ <span className={s.pushText}>{reminder.text}</span></> : reminder.text}</span> : null}
        </span>
      </div>
      {display?.skippedNote ? <div className={s.skipped}>{display.skippedNote}</div> : null}
    </>
  );
}

function DetailSkeleton() {
  return <div className={s.page} role="progressbar" aria-busy="true"><div className={s.boxes}><div className={s.box}><Bone width={60} height={13} /><Bone width="60%" height={18} /></div><div className={s.box}><Bone width={60} height={13} /><Bone width="70%" height={18} /></div></div><div className={s.section}><Bone width={120} height={16} />{[0, 1, 2, 3, 4, 5].map((key) => <Bone key={key} width="80%" height={16} />)}</div></div>;
}

export function ScheduledTaskDetail({ id, onTitle }: { id: string; onTitle(title: string | null): void }) {
  const { language } = useOrbitLanguage();
  const t = scheduledTaskCopy(language);
  const router = useRouter();
  const toast = useToast();
  const key = `${taskHistoryKey(id)}:${language}`;
  const [history, setHistory] = useState<AgentScheduledTaskHistoryContract | null | undefined>(() => lastAnswer<AgentScheduledTaskHistoryContract>(key));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [allRuns, setAllRuns] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef(onTitle);
  titleRef.current = onTitle;
  useEffect(() => {
    const controller = new AbortController();
    readScheduledTask(id, language, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setHistory(next);
      setFailed(false);
      if (next) rememberAnswer(key, next);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [id, language, key, attempt]);
  useEffect(() => { titleRef.current(history?.task.title ?? null); }, [history?.task.title]);
  const { busy: toggling, toggle } = useTaskToggle(() => setAttempt((n) => n + 1));
  if (history === null) return <div className={s.retry} role="status">{t("notFound")} <Link prefetch href={TASKS_HREF}>{t("back")} ›</Link></div>;
  if (!history) return failed ? <div className={s.retry} role="alert">{t("loadFailed")} <Button size="sm" label={t("retry")} onClick={() => setAttempt((n) => n + 1)} /></div> : <DetailSkeleton />;
  const { task, runs } = history;
  const status = statusOf(task, t);
  // AG16 (16-1): with the reminder on, the reminder block says how you are told; the fact row is not repeated.
  const facts = task.rows.filter((row) => row.field !== "nextRunAt" && !(row.field === "notify" && task.notify.push));
  const shownRuns = allRuns ? runs : runs.slice(0, FIRST_RUNS);
  const reminderLines = showsReminderLines(task, runs);
  const remove = async () => {
    setBusy(true);
    try {
      await deleteScheduledTask(task.id);
      router.push(TASKS_HREF);
    } catch {
      toast.error(t("failed"));
      setBusy(false);
    }
    setDeleting(false);
  };
  const pauseOrResume = () => void toggle(task, task.status !== "active");
  return (
    <div className={s.page} data-orbit-scheduled-detail={task.id}>
      <div className={s.detailHead}>
        <Chip label={status.label} tone={status.tone} />
        {task.status === "completed" ? null : <span className={s.switch}>{task.status === "active" ? t("on") : t("off")}<Toggle checked={task.status === "active"} disabled={toggling === task.id} label={t("toggle", { title: task.title })} onChange={(next) => void toggle(task, next)} /></span>}
      </div>
      {task.summary?.attention ? <div className={s.attentionBox}>{task.summary.attention}</div> : null}
      <div className={s.boxes}>
        <div className={s.box} data-orbit-scheduled-next>
          <span className={s.boxLabel}>{t("nextRun")}</span>
          {task.next ? <><b className={s.boxValue}>{task.next.day}</b><span className={s.boxNote}>{task.next.time}</span></> : <b className={s.boxValue}>{t("noNext")}</b>}
        </div>
        <div className={s.box} data-orbit-scheduled-last>
          <span className={s.boxLabel}>{t("lastResult")}</span>
          {task.last ? <><b className={s.boxValue}>{task.last.when}：{task.last.text}</b>{task.last.opens ? <Link prefetch className={s.boxLink} href={inboxHrefOf(task.last.opens === "card" ? task.lastRun?.cardId ?? task.last.runId : task.last.runId)}>{t("inInbox")} ›</Link> : null}</> : <b className={s.boxValue}>{t("noLast")}</b>}
        </div>
      </div>
      {/* AG16 (draft 16-1): the reminder block, between the next/last boxes and 「这条任务怎么跑」. An ended task runs no more. */}
      {task.status === "completed" ? null : <ReminderBlock task={task} runs={runs} language={language} onChanged={() => setAttempt((n) => n + 1)} />}
      {editing && task.form ? (
        <ScheduledTaskForm initial={task.form} id={task.id} zoneNote={task.rows.find((row) => row.field === "schedule")?.note ?? null} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setAttempt((n) => n + 1); toast.success(t("saved")); }} />
      ) : (
        <section className={s.section} aria-label={t("howItRuns")}>
          <div className={s.sectionHead}><h2>{t("howItRuns")}</h2>{task.form && task.status !== "completed" ? <button type="button" className={`btn ${s.roundButton}`} onClick={() => setEditing(true)}>{t("edit")}</button> : null}</div>
          {facts.map((row) => (
            <div key={row.field} className={s.fact}>
              <span className={s.factLabel}>{row.label}</span>
              <span className={s.factValue}><b>{row.value}</b>{row.note ? <span className={s.factNote}>{row.note}</span> : null}</span>
            </div>
          ))}
        </section>
      )}
      <section className={s.section} aria-label={t("history")}>
        <div className={s.sectionHead}><h2>{t("history")}</h2><span className={s.sectionMeta}>{reminderLines ? t("twoThings") : t("perRun")}</span></div>
        {runs.length ? shownRuns.map((run) => <HistoryRow key={run.runId} run={run} t={t} reminderLines={reminderLines} />) : <p className={s.sectionMeta}>{t("noHistory")}</p>}
        {!allRuns && runs.length > FIRST_RUNS ? <button type="button" className={`btn ${s.earlier}`} onClick={() => setAllRuns(true)}>{t("earlier")} ›</button> : null}
      </section>
      <div className={s.bottom}>
        {task.status === "completed" ? null : <Button label={task.status === "active" ? t("pause") : t("resume")} disabled={toggling === task.id} onClick={pauseOrResume} />}
        <Button variant="dangerGhost" label={t("delete")} disabled={busy} onClick={() => setDeleting(true)} />
      </div>
      <ConfirmDialog open={deleting} destructive title={t("deleteTitle")} message={t("deleteBody")} confirmLabel={t("deleteConfirm")} cancelLabel={t("cancel")} onConfirm={() => void remove()} onCancel={() => setDeleting(false)} />
    </div>
  );
}

/* ── the form (15-4 「点「改」之后」; 「用表单新建」) ──────────────────────────────── */

type Scope = "weekend" | "week" | "month" | "upcoming" | "contact" | "todo";

const emptyForm = (): AgentScheduledTaskFormContract => ({ basis: { field: "startsAt", kind: "field" }, domain: "event", maxItems: 3, push: false, schedule: { daysOfWeek: [5], kind: "weekly", time: "09:00", timeZone: browserTimeZone() }, title: "", validUntil: null, window: "weekend" });

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className={s.formRow}><span className={s.formLabel}>{label}</span><div className={s.formControl}>{children}</div></div>;
}

export function ScheduledTaskForm({ initial, id, zoneNote, onCancel, onSaved }: { initial?: AgentScheduledTaskFormContract; id?: string; zoneNote?: string | null; onCancel(): void; onSaved(id: string): void }) {
  const { language } = useOrbitLanguage();
  const t = scheduledTaskCopy(language);
  const [form, setForm] = useState<AgentScheduledTaskFormContract>(() => initial ?? emptyForm());
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<AgentReferenceCandidateContract[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scope: Scope = form.domain === "event" ? form.window ?? "weekend" : form.domain;
  const unit = UNIT_OF[form.domain][language];
  const weekly = form.schedule.kind === "weekly" ? form.schedule : null;
  const set = (patch: Partial<AgentScheduledTaskFormContract>) => setForm((current) => ({ ...current, ...patch }));
  const setScope = (next: Scope) => {
    if (next === "contact") set({ basis: form.basis.kind === "field" ? { field: "lastInteraction", kind: "field" } : form.basis, domain: "contact", window: undefined });
    else if (next === "todo") set({ basis: { field: "plannedDate", kind: "field" }, domain: "todo", window: undefined });
    else set({ basis: form.basis.kind === "field" ? { field: "startsAt", kind: "field" } : form.basis, domain: "event", window: next });
  };
  useEffect(() => {
    if (form.basis.kind !== "note" || form.basis.noteId || !query.trim()) { setNotes([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => { searchNotes(query, controller.signal).then((found) => { if (!controller.signal.aborted) setNotes(found.slice(0, 6)); }).catch(() => undefined); }, 150);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, form.basis]);
  const scopes = useMemo(() => [
    { key: "weekend" as const, label: t("windowWeekend") }, { key: "week" as const, label: t("windowWeek") }, { key: "month" as const, label: t("windowMonth") }, { key: "upcoming" as const, label: t("windowUpcoming") },
    { key: "contact" as const, label: t("contacts") }, { key: "todo" as const, label: t("todos") },
  ], [t]);
  const fieldBasis = form.domain === "contact" ? { field: "lastInteraction" as const, label: t("byQuiet") } : { field: "startsAt" as const, label: t("byStart") };
  const valid = (!weekly || weekly.daysOfWeek.length > 0) && /^\d{2}:\d{2}$/u.test(form.schedule.time) && (form.basis.kind !== "note" || Boolean(form.basis.noteId)) && (form.basis.kind !== "topic" || Boolean(form.basis.words.trim())) && (form.validUntil === null || /^\d{4}-\d{2}-\d{2}$/u.test(form.validUntil));
  const save = async () => {
    if (!valid) { setError(t("formIncomplete")); return; }
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveScheduledTaskForm(form, language, id));
    } catch (failure) {
      setError(failure instanceof Error && failure.message === "NOTE_UNREADABLE" ? t("noteUnreadable") : failure instanceof Error && failure.message === "VALIDATION_ERROR" ? t("formIncomplete") : t("failed"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className={s.section} aria-label={id ? t("formEdit") : t("formNew")} data-orbit-scheduled-form>
      <div className={s.sectionHead}><h2>{id ? t("formEdit") : t("formNew")}</h2></div>
      <Field label={t("what")}><input className={s.input} value={form.title} placeholder={t("whatHint")} maxLength={120} onChange={(event) => set({ title: event.target.value })} aria-label={t("what")} /></Field>
      <Field label={t("when")}>
        <div className={s.inline}>
          <select className={s.select} aria-label={t("when")} value={form.schedule.kind} onChange={(event) => set({ schedule: event.target.value === "daily" ? { kind: "daily", time: form.schedule.time, timeZone: form.schedule.timeZone } : { daysOfWeek: [5], kind: "weekly", time: form.schedule.time, timeZone: form.schedule.timeZone } })}>
            <option value="weekly">{t("weekly")}</option><option value="daily">{t("daily")}</option>
          </select>
          {weekly ? WEEKDAYS[language].map(({ day, label }) => {
            const on = weekly.daysOfWeek.includes(day);
            return <button key={day} type="button" aria-pressed={on} className={`btn ${s.day} ${on ? s.dayOn : ""}`} onClick={() => set({ schedule: { ...weekly, daysOfWeek: on ? weekly.daysOfWeek.filter((value) => value !== day) : [...weekly.daysOfWeek, day] } })}>{label}</button>;
          }) : null}
          <input className={`${s.input} ${s.time}`} type="time" aria-label={t("when")} value={form.schedule.time} onChange={(event) => set({ schedule: { ...form.schedule, time: event.target.value } })} />
        </div>
        <span className={s.formNote}>{t("whenNote")}{zoneNote ? ` ${zoneNote.split(/(?<=[。.])/u)[0]}` : ""}</span>
      </Field>
      <Field label={t("from")}>
        <select className={s.select} aria-label={t("from")} value={scope} onChange={(event) => setScope(event.target.value as Scope)}>
          {scopes.map((option) => <option key={option.key} value={option.key}>{initial && option.key === (initial.domain === "event" ? initial.window : initial.domain) && initial.scopeText ? initial.scopeText : option.label}</option>)}
        </select>
      </Field>
      <Field label={t("by")}>
        {form.domain === "todo" ? <span className={s.formFixed}>{t("byPlanned")}</span> : (
          <div className={s.choices}>
            <label className={s.choice}>
              <input type="radio" name="basis" checked={form.basis.kind === "note"} onChange={() => set({ basis: { kind: "note", noteId: "", title: "" } })} />
              <span>{t("byNote")}</span>
              {form.basis.kind === "note" && form.basis.noteId ? <span className={s.noteChip}>{form.basis.title}<button type="button" className={`btn ${s.noteRemove}`} aria-label={t("removeNote")} onClick={() => set({ basis: { kind: "note", noteId: "", title: "" } })}>×</button></span> : null}
            </label>
            {form.basis.kind === "note" && !form.basis.noteId ? (
              <div className={s.noteSearch}>
                <input className={s.input} value={query} placeholder={t("notePlaceholder")} aria-label={t("notePlaceholder")} onChange={(event) => setQuery(event.target.value)} />
                {notes.map((note) => <button key={note.id} type="button" className={`btn ${s.noteOption}`} onClick={() => { set({ basis: { kind: "note", noteId: note.id, title: note.name } }); setQuery(""); }}>{note.name}</button>)}
              </div>
            ) : null}
            <label className={s.choice}><input type="radio" name="basis" checked={form.basis.kind === "field"} onChange={() => set({ basis: { field: fieldBasis.field, kind: "field" } })} /><span>{fieldBasis.label}</span></label>
            <label className={s.choice}>
              <input type="radio" name="basis" checked={form.basis.kind === "topic"} onChange={() => set({ basis: { kind: "topic", words: "" } })} />
              <span>{t("byWords")}</span>
            </label>
            {form.basis.kind === "topic" ? <input className={s.input} value={form.basis.words} placeholder={t("wordsPlaceholder")} aria-label={t("byWords")} maxLength={200} onChange={(event) => set({ basis: { kind: "topic", words: event.target.value } })} /> : null}
          </div>
        )}
      </Field>
      <Field label={t("count2")}>
        <label className={s.inline}>{t("upTo")}<input className={`${s.input} ${s.number}`} type="number" min={1} max={20} value={form.maxItems} aria-label={t("count2")} onChange={(event) => set({ maxItems: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} />{unit}</label>
      </Field>
      <Field label={t("until")}>
        <div className={s.inline}>
          <label className={s.choice}><input type="radio" name="until" checked={form.validUntil === null} onChange={() => set({ validUntil: null })} /><span>{t("forever")}</span></label>
          <label className={s.choice}><input type="radio" name="until" checked={form.validUntil !== null} onChange={() => set({ validUntil: form.validUntil ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) })} /><span>{t("untilDay")}</span></label>
          {form.validUntil !== null ? <input className={`${s.input} ${s.date}`} type="date" aria-label={t("untilDay")} value={form.validUntil} onChange={(event) => set({ validUntil: event.target.value || null })} /> : null}
        </div>
      </Field>
      <p className={s.formNote}>{t("saveNote")}</p>
      {error ? <p className={s.formError} role="alert">{error}</p> : null}
      <div className={s.formButtons}>
        <Button variant="primary" label={t("save")} loading={saving} onClick={() => void save()} />
        <Button label={t("cancel")} disabled={saving} onClick={onCancel} />
      </div>
    </section>
  );
}

/** 「用表单新建」: the empty form on its own page; saved, it opens the new task. */
export function NewScheduledTask() {
  const router = useRouter();
  return <ScheduledTaskForm onCancel={() => router.push(TASKS_HREF)} onSaved={(id) => router.push(taskHref(id))} />;
}
