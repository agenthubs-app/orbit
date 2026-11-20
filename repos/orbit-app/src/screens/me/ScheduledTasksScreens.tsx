/**
 * agent-design AG15 (approved visual draft 15-3, 15-4; D15-1): 「定时任务」 on the App, under 我的 › 设置 — the list (running,
 * needs attention, paused, ended; or none yet), one task (switch, next and last run, its seven facts, the history in
 * every wording of 15-4, pause, delete) and the form (「改」, and 「用表单新建」 which is the same form, empty). Every
 * word about a task is the server's; the App lays it out and formats nothing.
 */
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { AgentReferenceCandidateContract, AgentScheduledTaskContract, AgentScheduledTaskFormContract, AgentScheduledTaskHistoryContract, AgentScheduledTaskRunContract } from "../../api/contract/agent-v1";
import { searchAgentReferences } from "../../api/agent-v1-client";
import { namesResultTime, reminderLineOf, showsReminderLines } from "../../api/compute/agent-reminder";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Chip, MacTile, Radio, Segmented, Skeleton, Toggle, UiPressable, UiText, presentConfirm, useToast, type ChipTone } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { spacing } from "../../design/tokens";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { OrbitTranslator } from "../../i18n/messages";
import { deleteScheduledTask, deviceTimeZone, readScheduledTask, readScheduledTasks, saveScheduledTaskForm, setScheduledTaskRunning } from "./scheduled-tasks-api";
import { ReminderCard } from "./ScheduledTaskReminder";

export const TASKS_PATH = "/settings/tasks";
export const taskPath = (id: string) => `${TASKS_PATH}/${encodeURIComponent(id)}`;
/** A period's result or card in the inbox: the inbox opens the entry of that run or card. */
export const inboxPathOf = (id: string) => `/inbox?tab=notifications&open=${encodeURIComponent(id)}`;

const TILE: Record<"event" | "contact" | "todo", { emoji: string; tone: "pink" | "apricot" | "blue" }> = { contact: { emoji: "🤝", tone: "apricot" }, event: { emoji: "🎟️", tone: "pink" }, todo: { emoji: "🗓️", tone: "blue" } };
const UNIT_KEY = { contact: "scheduledTasks.unitContact", event: "scheduledTasks.unitEvent", todo: "scheduledTasks.unitTodo" } as const;
const DAY_KEY = ["scheduledTasks.day0", "scheduledTasks.day1", "scheduledTasks.day2", "scheduledTasks.day3", "scheduledTasks.day4", "scheduledTasks.day5", "scheduledTasks.day6"] as const;

function statusOf(task: AgentScheduledTaskContract, t: OrbitTranslator): { label: string; tone: ChipTone } {
  if (task.status === "completed") return { label: t("scheduledTasks.ended"), tone: "neutral" };
  if (task.needsAttention) return { label: t("scheduledTasks.attention"), tone: "apricot" };
  if (task.status === "paused") return { label: t("scheduledTasks.paused"), tone: "neutral" };
  return { label: t("scheduledTasks.running"), tone: "teal" };
}

/** 「下次 11月27日（周五） · 上次 今天 9:04：有 2 场新活动」 with the day and the result in bold (draft 15-3). */
function StatusLine({ text }: { text: string }) {
  const { styles } = useStyles();
  return <UiText style={styles.line}>{text.split(" · ").map((part, index) => {
    const next = /^(下次 |Next |次回 )(.+)$/u.exec(part);
    const last = /^(.+?：)(.+)$/u.exec(part) ?? /^(.+?: )(.+)$/u.exec(part);
    const split = next ?? last;
    return <UiText key={index} style={styles.line}>{index ? " · " : ""}{split ? <>{split[1]}<UiText style={styles.lineStrong}>{split[2]}</UiText></> : part}</UiText>;
  })}</UiText>;
}

/* ── the list (15-3) ───────────────────────────────────────────────── */

export function ScheduledTasksScreen() {
  const { t, language } = useOrbitLocale();
  const client = useOrbitApiClient();
  const router = useRouter();
  const toast = useToast();
  const { styles } = useStyles();
  const [tasks, setTasks] = useState<AgentScheduledTaskContract[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void readScheduledTasks(client, language).then((read) => { if (!alive) return; if (read.kind === "ok") { setTasks(read.value); setFailed(false); } else setFailed(true); });
    return () => { alive = false; };
  }, [client, language, version]);
  const toggle = async (task: AgentScheduledTaskContract, running: boolean) => {
    if (busy) return;
    setBusy(task.id);
    if (!(await setScheduledTaskRunning(client, task.id, running))) toast.error(t("scheduledTasks.failed"));
    setBusy(null);
    setVersion((value) => value + 1);
  };
  const running = tasks?.filter((task) => task.status === "active").length ?? 0;
  return <AppScreen inset="kit" title={t("scheduledTasks.title")}>
    <UiText style={styles.intro}>{t("scheduledTasks.subtitle")}</UiText>
    {!tasks ? (failed ? <Card><UiText accessibilityRole="alert">{t("scheduledTasks.loadFailed")}</UiText><Button label={t("scheduledTasks.retry")} onPress={() => setVersion((value) => value + 1)} /></Card> : <Skeleton />) : <>
      <View style={styles.toolbar}>
        <UiText style={styles.meta}>{tasks.length ? t("scheduledTasks.count", { m: running, n: tasks.length }) : ""}</UiText>
        <Button label={`+ ${t("scheduledTasks.newTask")}`} variant="primary" size="sm" onPress={() => router.push(`${TASKS_PATH}/new` as Href)} />
      </View>
      {tasks.length === 0 ? <Card style={styles.empty}>
        <UiText style={styles.emptyTitle}>{t("scheduledTasks.emptyTitle")}</UiText>
        <UiText style={styles.emptyBody}>{t("scheduledTasks.emptyBody")}</UiText>
        <View style={styles.row}><Button label={t("scheduledTasks.goIorbit")} variant="primary" size="sm" onPress={() => router.push("/ai" as Href)} /><Button label={t("scheduledTasks.useForm")} size="sm" onPress={() => router.push(`${TASKS_PATH}/new` as Href)} /></View>
      </Card> : <Card style={styles.list}>
        {tasks.map((task, index) => {
          const status = statusOf(task, t);
          const tile = TILE[task.domain ?? "event"];
          return <View key={task.id} style={[styles.taskRow, index > 0 && styles.divider]} testID={`scheduled-task-${task.id}`}>
            <MacTile emoji={tile.emoji} tone={tile.tone} size="sm" />
            <UiPressable accessibilityRole="button" accessibilityLabel={task.title} style={styles.taskMain} onPress={() => router.push(taskPath(task.id) as Href)}>
              <UiText style={styles.taskTitle}>{task.title}</UiText>
              <UiText style={styles.line}>{task.summary?.schedule ?? ""}{task.notify.push ? <UiText style={styles.line} testID={`scheduled-reminder-marker-${task.id}`}>{" · "}{t("scheduledTasks.reminderMarker")}</UiText> : null}</UiText>
              {task.summary?.status ? <StatusLine text={task.summary.status} /> : null}
              {task.summary?.attention ? <UiText style={styles.attention}>{task.summary.attention}</UiText> : null}
            </UiPressable>
            <View style={styles.side}>
              <Chip label={status.label} tone={status.tone} presentation="kit" />
              {task.status === "completed" ? null : <Toggle value={task.status === "active"} disabled={busy === task.id} accessibilityLabel={t("scheduledTasks.toggle", { title: task.title })} onValueChange={(next) => void toggle(task, next)} />}
            </View>
          </View>;
        })}
      </Card>}
    </>}
  </AppScreen>;
}

/* ── one task (15-4) ────────────────────────────────────────────────── */

const FIRST_RUNS = 6;

/** AG16 (16-4): with reminders, a second line says whether the reminder arrived — apart from when the result was ready. */
function HistoryRow({ run, t, onOpen, reminderLines = false }: { run: AgentScheduledTaskRunContract; t: OrbitTranslator; onOpen(path: string): void; reminderLines?: boolean }) {
  const { styles } = useStyles();
  const display = run.display;
  const opens = display?.opens ?? null;
  const reminder = reminderLines ? reminderLineOf(run) : null;
  const time = display?.time ? (namesResultTime(run, reminderLines) ? `${t("scheduledTasks.resultAt")} ${display.time} · ` : `${display.time} · `) : "";
  return <View testID={`scheduled-run-${run.runId}`}>
    <View style={styles.historyRow}>
      <UiText style={styles.meta}>{display?.day ?? run.scheduledAt.slice(0, 10)}</UiText>
      <UiText style={run.outcome === "delivered" ? styles.lineStrong : styles.line}>{time}{display?.text ?? run.line}{opens && reminderLines ? <UiText accessibilityRole="link" style={styles.link} onPress={() => onOpen(inboxPathOf(opens === "card" ? run.cardId ?? run.runId : run.runId))}>{"  "}{opens === "card" ? t("scheduledTasks.seeCard") : t("scheduledTasks.seeResult")} ›</UiText> : null}</UiText>
      {opens && !reminderLines ? <UiPressable accessibilityRole="link" onPress={() => onOpen(inboxPathOf(opens === "card" ? run.cardId ?? run.runId : run.runId))}><UiText style={styles.link}>{opens === "card" ? t("scheduledTasks.seeCard") : t("scheduledTasks.seeResult")} ›</UiText></UiPressable> : null}
      {reminder ? <UiText testID={`scheduled-push-${reminder.tone}`} style={reminder.tone === "missed" ? styles.pushMissed : styles.pushLine}>{reminder.tone === "delivered" ? <UiText style={styles.pushTick}>✓ </UiText> : null}{reminder.text}</UiText> : null}
    </View>
    {display?.skippedNote ? <UiText style={styles.skipped}>{display.skippedNote}</UiText> : null}
  </View>;
}

export function ScheduledTaskScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] ?? "" : params.id ?? "";
  const { t, language } = useOrbitLocale();
  const client = useOrbitApiClient();
  const router = useRouter();
  const toast = useToast();
  const { styles } = useStyles();
  const [history, setHistory] = useState<AgentScheduledTaskHistoryContract | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let alive = true;
    void readScheduledTask(client, id, language).then((read) => { if (!alive) return; if (read.kind === "ok") { setHistory(read.value); setFailed(false); } else if (read.kind === "missing") setHistory(null); else setFailed(true); });
    return () => { alive = false; };
  }, [client, id, language, version]);
  const open = useCallback((path: string) => router.push(path as Href), [router]);
  const task = history?.task;
  const reminderLines = task && history ? showsReminderLines(task, history.runs) : false;
  const toggle = async (running: boolean) => {
    if (!task || busy) return;
    setBusy(true);
    if (!(await setScheduledTaskRunning(client, task.id, running))) toast.error(t("scheduledTasks.failed"));
    setBusy(false);
    setVersion((value) => value + 1);
  };
  const remove = async () => {
    if (!task || busy || !(await presentConfirm({ cancelLabel: t("scheduledTasks.cancel"), confirmLabel: t("scheduledTasks.deleteConfirm"), destructive: true, message: t("scheduledTasks.deleteBody"), title: t("scheduledTasks.deleteTitle") }))) return;
    setBusy(true);
    if (await deleteScheduledTask(client, task.id)) router.replace(TASKS_PATH as Href);
    else { toast.error(t("scheduledTasks.failed")); setBusy(false); }
  };
  return <AppScreen inset="kit" title={t("scheduledTasks.title")}>
    {history === null ? <Card><UiText>{t("scheduledTasks.notFound")}</UiText></Card> : null}
    {history === undefined ? (failed ? <Card><UiText accessibilityRole="alert">{t("scheduledTasks.loadFailed")}</UiText><Button label={t("scheduledTasks.retry")} onPress={() => setVersion((value) => value + 1)} /></Card> : <Skeleton />) : null}
    {task && history ? <View style={styles.stack}>
      {/* Draft 15-4 (App): 「定时任务」 in the top bar, the task's own name as the page heading. */}
      <UiText accessibilityRole="header" style={styles.pageTitle}>{task.title}</UiText>
      <View style={styles.headRow}>
        <Chip label={statusOf(task, t).label} tone={statusOf(task, t).tone} presentation="kit" />
        {task.status === "completed" ? null : <View style={styles.row}><UiText style={styles.meta}>{task.status === "active" ? t("scheduledTasks.on") : t("scheduledTasks.off")}</UiText><Toggle value={task.status === "active"} disabled={busy} accessibilityLabel={t("scheduledTasks.toggle", { title: task.title })} onValueChange={(next) => void toggle(next)} /></View>}
      </View>
      {task.summary?.attention ? <UiText style={styles.attention}>{task.summary.attention}</UiText> : null}
      <Card style={styles.boxes}>
        <View style={styles.box} testID="scheduled-next"><UiText style={styles.meta}>{t("scheduledTasks.nextRun")}</UiText>{task.next ? <><UiText style={styles.boxValue}>{task.next.day}</UiText><UiText style={styles.meta}>{task.next.time}</UiText></> : <UiText style={styles.boxValue}>{t("scheduledTasks.noNext")}</UiText>}</View>
        <View style={styles.box} testID="scheduled-last"><UiText style={styles.meta}>{t("scheduledTasks.lastResult")}</UiText>{task.last ? <><UiText style={styles.boxValue}>{task.last.when}：{task.last.text}</UiText>{task.last.opens ? <UiPressable accessibilityRole="link" onPress={() => open(inboxPathOf(task.last!.opens === "card" ? task.lastRun?.cardId ?? task.last!.runId : task.last!.runId))}><UiText style={styles.link}>{t("scheduledTasks.inInbox")} ›</UiText></UiPressable> : null}</> : <UiText style={styles.boxValue}>{t("scheduledTasks.noLast")}</UiText>}</View>
      </Card>
      {/* AG16 (draft 16-1): the reminder block, between the next/last boxes and 「这条任务怎么跑」. An ended task runs no more. */}
      {task.status === "completed" ? null : <ReminderCard task={task} client={client} onChanged={() => setVersion((value) => value + 1)} />}
      {editing && task.form ? <ScheduledTaskForm initial={task.form} id={task.id} zoneNote={task.rows.find((row) => row.field === "schedule")?.note ?? null} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setVersion((value) => value + 1); toast.success(t("scheduledTasks.saved")); }} /> : <Card style={styles.section}>
        <View style={styles.sectionHead}><UiText style={styles.sectionTitle}>{t("scheduledTasks.howItRuns")}</UiText>{task.form && task.status !== "completed" ? <Button label={t("scheduledTasks.edit")} size="sm" onPress={() => setEditing(true)} /> : null}</View>
        {task.rows.filter((row) => row.field !== "nextRunAt" && !(row.field === "notify" && task.notify.push)).map((row) => <View key={row.field} style={styles.fact}>
          <UiText style={styles.meta}>{row.label}</UiText>
          <UiText style={styles.lineStrong}>{row.value}</UiText>
          {row.note ? <UiText style={styles.meta}>{row.note}</UiText> : null}
        </View>)}
      </Card>}
      <Card style={styles.section}>
        <View style={styles.sectionHead}><UiText style={styles.sectionTitle}>{t("scheduledTasks.history")}</UiText><UiText style={[styles.meta, styles.sectionMeta]}>{reminderLines ? t("scheduledTasks.twoThings") : t("scheduledTasks.perRun")}</UiText></View>
        {history.runs.length ? (all ? history.runs : history.runs.slice(0, FIRST_RUNS)).map((run) => <HistoryRow key={run.runId} run={run} t={t} onOpen={open} reminderLines={reminderLines} />) : <UiText style={styles.meta}>{t("scheduledTasks.noHistory")}</UiText>}
        {!all && history.runs.length > FIRST_RUNS ? <UiPressable accessibilityRole="button" onPress={() => setAll(true)}><UiText style={styles.link}>{t("scheduledTasks.earlier")} ›</UiText></UiPressable> : null}
      </Card>
      <View style={styles.row}>
        {task.status === "completed" ? null : <Button label={task.status === "active" ? t("scheduledTasks.pause") : t("scheduledTasks.resume")} disabled={busy} onPress={() => void toggle(task.status !== "active")} />}
        <Button label={t("scheduledTasks.delete")} variant="dangerGhost" disabled={busy} onPress={() => void remove()} />
      </View>
    </View> : null}
  </AppScreen>;
}

/* ── the form (15-4 「点「改」之后」; 「用表单新建」) ─────────────────────────── */

type Scope = "weekend" | "week" | "month" | "upcoming" | "contact" | "todo";
const emptyForm = (): AgentScheduledTaskFormContract => ({ basis: { field: "startsAt", kind: "field" }, domain: "event", maxItems: 3, push: false, schedule: { daysOfWeek: [5], kind: "weekly", time: "09:00", timeZone: deviceTimeZone() }, title: "", validUntil: null, window: "weekend" });

function Choice({ selected, label, onSelect, children }: { selected: boolean; label: string; onSelect(): void; children?: React.ReactNode }) {
  const { styles } = useStyles();
  return <View style={styles.choice}><Radio selected={selected} onSelect={onSelect} accessibilityLabel={label} /><UiPressable accessibilityRole="radio" onPress={onSelect}><UiText style={styles.line}>{label}</UiText></UiPressable>{children}</View>;
}

export function ScheduledTaskForm({ initial, id, zoneNote, onCancel, onSaved }: { initial?: AgentScheduledTaskFormContract; id?: string; zoneNote?: string | null; onCancel(): void; onSaved(id: string): void }) {
  const { t, language } = useOrbitLocale();
  const client = useOrbitApiClient();
  const { styles } = useStyles();
  const [form, setForm] = useState<AgentScheduledTaskFormContract>(() => initial ?? emptyForm());
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<AgentReferenceCandidateContract[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<AgentScheduledTaskFormContract>) => setForm((current) => ({ ...current, ...patch }));
  const scope: Scope = form.domain === "event" ? form.window ?? "weekend" : form.domain;
  const weekly = form.schedule.kind === "weekly" ? form.schedule : null;
  useEffect(() => {
    if (form.basis.kind !== "note" || form.basis.noteId || !query.trim()) { setNotes([]); return; }
    let alive = true;
    const timer = setTimeout(() => { void searchAgentReferences(client, query, "memo").then((found) => { if (alive && found.kind === "ok") setNotes(found.value.groups.flatMap((group) => (group.type === "memo" ? [...group.items] : [])).slice(0, 6)); }); }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [client, query, form.basis]);
  const scopes = useMemo(() => ([["weekend", "windowWeekend"], ["week", "windowWeek"], ["month", "windowMonth"], ["upcoming", "windowUpcoming"], ["contact", "contacts"], ["todo", "todos"]] as const).map(([key, word]) => ({ key, label: initial && initial.scopeText && key === (initial.domain === "event" ? initial.window : initial.domain) ? initial.scopeText : t(`scheduledTasks.${word}`) })), [t, initial]);
  const setScope = (next: Scope) => {
    if (next === "contact") set({ basis: form.basis.kind === "field" ? { field: "lastInteraction", kind: "field" } : form.basis, domain: "contact", window: undefined });
    else if (next === "todo") set({ basis: { field: "plannedDate", kind: "field" }, domain: "todo", window: undefined });
    else set({ basis: form.basis.kind === "field" ? { field: "startsAt", kind: "field" } : form.basis, domain: "event", window: next });
  };
  const fieldBasis = form.domain === "contact" ? { field: "lastInteraction" as const, label: t("scheduledTasks.byQuiet") } : { field: "startsAt" as const, label: t("scheduledTasks.byStart") };
  const valid = (!weekly || weekly.daysOfWeek.length > 0) && /^\d{2}:\d{2}$/u.test(form.schedule.time) && (form.basis.kind !== "note" || Boolean(form.basis.noteId)) && (form.basis.kind !== "topic" || Boolean(form.basis.words.trim())) && (form.validUntil === null || /^\d{4}-\d{2}-\d{2}$/u.test(form.validUntil));
  const save = async () => {
    if (!valid) { setError(t("scheduledTasks.formIncomplete")); return; }
    setSaving(true); setError(null);
    const result = await saveScheduledTaskForm(client, form, language, id);
    setSaving(false);
    if (result.ok) onSaved(result.id);
    else setError(result.code === "NOTE_UNREADABLE" ? t("scheduledTasks.noteUnreadable") : result.code === "VALIDATION_ERROR" ? t("scheduledTasks.formIncomplete") : t("scheduledTasks.failed"));
  };
  return <Card style={styles.section}>
    <UiText style={styles.sectionTitle}>{id ? t("scheduledTasks.formEdit") : t("scheduledTasks.formNew")}</UiText>
    <UiText style={styles.meta}>{t("scheduledTasks.what")}</UiText>
    <TextInput style={styles.input} value={form.title} placeholder={t("scheduledTasks.whatHint")} maxLength={120} accessibilityLabel={t("scheduledTasks.what")} onChangeText={(title) => set({ title })} />
    <UiText style={styles.meta}>{t("scheduledTasks.when")}</UiText>
    <Segmented accessibilityLabel={t("scheduledTasks.when")} segments={[{ key: "weekly", label: t("scheduledTasks.weekly") }, { key: "daily", label: t("scheduledTasks.daily") }]} value={form.schedule.kind} onChange={(kind) => set({ schedule: kind === "daily" ? { kind: "daily", time: form.schedule.time, timeZone: form.schedule.timeZone } : { daysOfWeek: [5], kind: "weekly", time: form.schedule.time, timeZone: form.schedule.timeZone } })} />
    {weekly ? <View style={styles.days}>{[1, 2, 3, 4, 5, 6, 0].map((day) => {
      const on = weekly.daysOfWeek.includes(day);
      return <UiPressable key={day} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.day, on && styles.dayOn]} onPress={() => set({ schedule: { ...weekly, daysOfWeek: on ? weekly.daysOfWeek.filter((value) => value !== day) : [...weekly.daysOfWeek, day] } })}><UiText style={on ? styles.dayOnText : styles.line}>{t(DAY_KEY[day] ?? "scheduledTasks.day0")}</UiText></UiPressable>;
    })}</View> : null}
    <TextInput style={[styles.input, styles.short]} value={form.schedule.time} accessibilityLabel={t("scheduledTasks.time")} placeholder="09:00" maxLength={5} keyboardType="numbers-and-punctuation" onChangeText={(time) => set({ schedule: { ...form.schedule, time } })} />
    <UiText style={styles.meta}>{t("scheduledTasks.whenNote")}{zoneNote ? ` ${zoneNote.split(/(?<=[。.])/u)[0]}` : ""}</UiText>
    <UiText style={styles.meta}>{t("scheduledTasks.from")}</UiText>
    {scopes.map((option) => <Choice key={option.key} selected={scope === option.key} label={option.label} onSelect={() => setScope(option.key)} />)}
    <UiText style={styles.meta}>{t("scheduledTasks.by")}</UiText>
    {form.domain === "todo" ? <UiText style={styles.lineStrong}>{t("scheduledTasks.byPlanned")}</UiText> : <>
      <Choice selected={form.basis.kind === "note"} label={t("scheduledTasks.byNote")} onSelect={() => set({ basis: { kind: "note", noteId: "", title: "" } })}>
        {form.basis.kind === "note" && form.basis.noteId ? <UiPressable accessibilityRole="button" accessibilityLabel={t("scheduledTasks.removeNote")} style={styles.noteChip} onPress={() => set({ basis: { kind: "note", noteId: "", title: "" } })}><UiText style={styles.noteChipText}>{form.basis.title} ×</UiText></UiPressable> : null}
      </Choice>
      {form.basis.kind === "note" && !form.basis.noteId ? <View style={styles.indent}>
        <TextInput style={styles.input} value={query} placeholder={t("scheduledTasks.notePlaceholder")} accessibilityLabel={t("scheduledTasks.notePlaceholder")} onChangeText={setQuery} />
        {notes.map((note) => <UiPressable key={note.id} accessibilityRole="button" style={styles.noteOption} onPress={() => { set({ basis: { kind: "note", noteId: note.id, title: note.name } }); setQuery(""); }}><UiText style={styles.line}>{note.name}</UiText></UiPressable>)}
      </View> : null}
      <Choice selected={form.basis.kind === "field"} label={fieldBasis.label} onSelect={() => set({ basis: { field: fieldBasis.field, kind: "field" } })} />
      <Choice selected={form.basis.kind === "topic"} label={t("scheduledTasks.byWords")} onSelect={() => set({ basis: { kind: "topic", words: "" } })} />
      {form.basis.kind === "topic" ? <TextInput style={styles.input} value={form.basis.words} placeholder={t("scheduledTasks.wordsPlaceholder")} accessibilityLabel={t("scheduledTasks.byWords")} maxLength={200} onChangeText={(words) => set({ basis: { kind: "topic", words } })} /> : null}
    </>}
    <UiText style={styles.meta}>{t("scheduledTasks.howMany")}</UiText>
    <View style={styles.row}><UiText style={styles.line}>{t("scheduledTasks.upTo")}</UiText><TextInput style={[styles.input, styles.short]} value={String(form.maxItems)} keyboardType="number-pad" maxLength={2} accessibilityLabel={t("scheduledTasks.howMany")} onChangeText={(value) => set({ maxItems: Math.max(1, Math.min(20, Number(value) || 1)) })} /><UiText style={styles.line}>{t(UNIT_KEY[form.domain])}</UiText></View>
    <UiText style={styles.meta}>{t("scheduledTasks.until")}</UiText>
    <Choice selected={form.validUntil === null} label={t("scheduledTasks.forever")} onSelect={() => set({ validUntil: null })} />
    <Choice selected={form.validUntil !== null} label={t("scheduledTasks.untilDay")} onSelect={() => set({ validUntil: form.validUntil ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) })} />
    {form.validUntil !== null ? <TextInput style={[styles.input, styles.indent]} value={form.validUntil} maxLength={10} accessibilityLabel={t("scheduledTasks.untilDay")} onChangeText={(validUntil) => set({ validUntil })} /> : null}
    <UiText style={styles.meta}>{t("scheduledTasks.saveNote")}</UiText>
    {error ? <UiText accessibilityRole="alert" style={styles.error}>{error}</UiText> : null}
    <View style={styles.row}><Button label={t("scheduledTasks.save")} variant="primary" disabled={saving} onPress={() => void save()} /><Button label={t("scheduledTasks.cancel")} disabled={saving} onPress={onCancel} /></View>
  </Card>;
}

export function NewScheduledTaskScreen() {
  const { t } = useOrbitLocale();
  const router = useRouter();
  return <AppScreen inset="kit" title={t("scheduledTasks.formNew")}>
    <ScheduledTaskForm onCancel={() => router.back()} onSaved={(id) => router.replace(taskPath(id) as Href)} />
  </AppScreen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  intro: { color: colors.ink2, fontSize: 14, lineHeight: 21 },
  toolbar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  meta: { color: colors.ink3Text, fontSize: 13, lineHeight: 19 },
  line: { color: colors.ink2, fontSize: 14, lineHeight: 21 },
  lineStrong: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  link: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 22 },
  list: { paddingVertical: 0 },
  taskRow: { alignItems: "flex-start", flexDirection: "row", gap: 12, paddingVertical: 14 },
  divider: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  taskMain: { flex: 1, gap: 3 },
  taskTitle: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 23 },
  attention: { backgroundColor: colors.macApricot, borderRadius: 10, color: colors.macApricotText, fontSize: 13, lineHeight: 19, marginTop: 6, paddingHorizontal: 12, paddingVertical: 8 },
  side: { alignItems: "flex-end", gap: 10 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 28 },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  emptyBody: { color: colors.ink2, fontSize: 14, lineHeight: 21, textAlign: "center" },
  row: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stack: { gap: spacing.md },
  headRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  pageTitle: { color: colors.ink, fontSize: 22, fontWeight: "800", lineHeight: 30 },
  boxes: { gap: 10 },
  box: { backgroundColor: colors.surface2, borderRadius: 14, gap: 4, padding: 14 },
  boxValue: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 24 },
  section: { gap: 8 },
  sectionHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingBottom: 4 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  fact: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: 2, paddingVertical: 10 },
  historyRow: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: 2, paddingVertical: 10 },
  sectionMeta: { flexShrink: 1, marginLeft: 12, textAlign: "right" },
  pushLine: { color: colors.ink2, fontSize: 13, lineHeight: 20 },
  pushTick: { color: colors.macTealText, fontSize: 13, fontWeight: "700" },
  pushMissed: { color: colors.coralText, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  skipped: { backgroundColor: colors.surface3, borderRadius: 10, color: colors.ink2, fontSize: 13, lineHeight: 19, marginBottom: 6, padding: 12 },
  input: { backgroundColor: colors.surface2, borderColor: colors.line, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, color: colors.ink, fontSize: 16, minHeight: 44, paddingHorizontal: 12 },
  short: { minWidth: 84 },
  days: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  day: { alignItems: "center", borderColor: colors.line, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", minHeight: 40, minWidth: 48, paddingHorizontal: 8 },
  dayOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayOnText: { color: colors.surface, fontSize: 14, fontWeight: "700" },
  choice: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, minHeight: 40 },
  indent: { gap: 6, marginLeft: 32 },
  noteChip: { backgroundColor: colors.macLav, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  noteChipText: { color: colors.macLavText, fontSize: 14, fontWeight: "700" },
  noteOption: { borderColor: colors.line, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8 },
  error: { color: colors.coralText, fontSize: 14 },
}));
