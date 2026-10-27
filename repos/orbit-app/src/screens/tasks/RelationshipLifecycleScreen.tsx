import * as Crypto from "expo-crypto";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { RelationshipCompletionInput, RelationshipLifecycleSnapshotDTO } from "../../api/contract/relationship-lifecycle";
import { buildRelationshipCompletion, readRelationshipSnapshot, relationshipLifecyclePath, relationshipOpenTasks, relationshipReceiptMatches, type RelationshipCompletionDraft } from "../../api/relationship-lifecycle";
import { AppScreen } from "../../components/AppScreen";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Icon } from "../../components/ui/Icon";
import { PersonalScheduleDateTimePicker } from "../schedule/PersonalScheduleDateTimePicker";
import { localParts, shiftCalendarDate } from "../../time/date-time";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { keepsPageCopy } from "../../data/sync/page-copies";
import { usePageCopySession } from "../../hooks/usePageCopySession";
import { OfflineNotice } from "../../components/OfflineNotice";
import type { PageCopyStatus } from "../../data/sync/page-copies";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { OrbitLanguage } from "../../api/contract/language";
import { createTranslator, type MessageKey } from "../../i18n/messages";
import { createThemedStyles } from "../../design/theme";
import { useToast } from "../../components/ui/Toast";
import { useLocalContacts } from "../../hooks/useLocalContacts";

const emptyDraft: RelationshipCompletionDraft = { taskId: "", kind: "next_task", title: "", date: "", time: "", goal: "", archiveConfirmed: false };
function lifecycleFailureCopy(language: OrbitLanguage, error: { code: string; message: string; context?: Readonly<Record<string, string>> | undefined }, action: "read" | "save"): string {
  // QA-C3: a person saved with more than one relationship record can't be updated here (server 409);
  // "refresh to check" would not help, and zh showed the raw English server text.
  if (error.code === "CONFLICT" && (error.context?.lifecycleConflict === "duplicate_relationship" || /more than one relationship record/iu.test(error.message))) return createTranslator(language)("relationshipTasks.lifecycleDuplicate");
  if (language === "zh") return error.message;
  const key: MessageKey = error.code === "CONFLICT"
    ? action === "save" ? "relationshipTasks.lifecycleConflictSave" : "relationshipTasks.lifecycleConflictRead"
    : error.code === "UNAUTHORIZED" ? "relationshipTasks.lifecycleSignInAgain"
    : error.code === "NOT_FOUND" || error.code === "FORBIDDEN" ? "relationshipTasks.lifecycleRelationshipUnavailable"
    : error.code === "VALIDATION_ERROR" && action === "save" ? "relationshipTasks.lifecycleInvalidInput"
    : action === "save" ? "relationshipTasks.lifecycleSaveRetry" : "relationshipTasks.lifecycleReadFailed";
  return createTranslator(language)(key);
}
export function RelationshipLifecycleScreen() {
  const params = useLocalSearchParams<{ id: string | string[]; taskId?: string | string[]; contactId?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const taskId = Array.isArray(params.taskId) ? params.taskId.length === 1 ? params.taskId[0] : "" : params.taskId;
  const contactId = Array.isArray(params.contactId) ? params.contactId.length === 1 ? params.contactId[0] : "" : params.contactId;
  const auth = useOrbitAuthSession(), server = useOrbitApiBaseUrl();
  const scopeKey = JSON.stringify([auth.actorId, auth.cookieHeader, server.baseUrl, id, taskId, contactId]);
  const ready = auth.ready && auth.signedIn && server.ready && !!auth.actorId && !!id;
  return <LifecycleEditor key={scopeKey} scopeKey={scopeKey} ready={ready} actorId={auth.actorId ?? ""} connectionId={id ?? ""} targetTaskId={taskId} targetContactId={contactId} />;
}
function LifecycleEditor({ scopeKey, ready, actorId, connectionId, targetTaskId, targetContactId }: { scopeKey: string; ready: boolean; actorId: string; connectionId: string; targetTaskId: string | undefined; targetContactId: string | undefined }) {
  const client = useOrbitApiClient({ scopeKey });
  const { timeZone, canSave } = useOrbitTimeZone();
  const { language, t } = useOrbitLocale();
  const { colors, styles } = useStyles();
  const router = useRouter();
  const toast = useToast();
  const localContacts = useLocalContacts(false);
  // QA-C2: Reminders-style resolve page — real date / time pickers, plain option rows, a confirm before stopping.
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [saved, setSaved] = useState(false);
  const [snapshot, setSnapshot] = useState<RelationshipLifecycleSnapshotDTO | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  // Sprint 0131: the last online read of this relationship is the page copy "relationship-lifecycle" (the 20 most
  // recently opened are kept); offline it is shown with 截至 and saving needs the network.
  const { session: copySession, whenReady } = usePageCopySession(ready);
  const copySessionRef = useRef(copySession);
  copySessionRef.current = copySession;
  const [copy, setCopy] = useState<PageCopyStatus | null>(null);
  const offline = copy?.offline === true;
  const scope = useRef({ active: true, busy: false, controller: new AbortController() });
  const savedRef = useRef(false);
  const intent = useRef<{ fingerprint: string; body: RelationshipCompletionInput } | null>(null);
  useEffect(() => { const current = scope.current; current.active = true; if (current.controller.signal.aborted) current.controller = new AbortController(); return () => { current.active = false; current.controller.abort(); }; }, []);
  const load = useCallback(async () => {
    const current = scope.current;
    if (!ready || current.busy || !current.active) return;
    current.busy = true; setBusy(true);
    const session = copySessionRef.current;
    let saved: { value: RelationshipLifecycleSnapshotDTO; syncedAt: string } | null = null;
    let answered = false;
    const readFrom = (from: NonNullable<typeof session>) => from.readPageCopy("relationship-lifecycle", connectionId).then((stored) => {
      const value = stored ? readRelationshipSnapshot(stored.data, actorId, connectionId) : null;
      if (!stored || !value || answered || !current.active) return;
      saved = { value, syncedAt: stored.syncedAt };
      setSnapshot((previous) => previous ?? value);
      setDraft(previous => previous.taskId ? previous : defaultDraft(previous, value, targetTaskId, targetContactId, timeZone));
      setCopy({ lastSyncedAt: stored.syncedAt, offline: false, reason: null });
    }).catch(() => undefined);
    // The session may open only after this request started: offline, wait for it briefly rather than miss the copy.
    const copyRead = session ? readFrom(session) : null;
    try {
      const result = await client.get<unknown>(relationshipLifecyclePath(connectionId), { signal: current.controller.signal });
      if (!current.active) return;
      const value = result.success ? readRelationshipSnapshot(result.data, actorId, connectionId) : null;
      if (!value) {
        if (copyRead) await copyRead;
        else { const ready = await whenReady(); if (ready) await readFrom(ready); }
        answered = true;
        const reason = keepsPageCopy(result);
        const kept = saved as { value: RelationshipLifecycleSnapshotDTO; syncedAt: string } | null;
        if (kept && reason && current.active) { setSnapshot(kept.value); setCopy({ lastSyncedAt: kept.syncedAt, offline: true, reason }); setMessage(""); return; }
        setCopy(null);
        setSnapshot(null); setMessage(reason === "unreachable" ? t("relationshipTasks.resolveNotStored") : result.success ? createTranslator(language)("relationshipTasks.lifecycleReadMismatch") : lifecycleFailureCopy(language, result.error, "read")); return;
      }
      answered = true;
      setCopy(null);
      if (result.success) void whenReady().then((ready) => ready?.savePageCopy("relationship-lifecycle", connectionId, result.data)).catch(() => undefined);
      setSnapshot(value); intent.current = null;
      setDraft(previous => defaultDraft(previous, value, targetTaskId, targetContactId, timeZone));
      if (!savedRef.current) setMessage("");
    } catch { if (current.active) { setSnapshot(null); setCopy(null); setMessage(createTranslator(language)("relationshipTasks.lifecycleReadFailed")); } }
    finally { current.busy = false; if (current.active) setBusy(false); }
  }, [ready, client, actorId, connectionId, targetTaskId, targetContactId, whenReady, language, timeZone]);
  useEffect(() => { void load(); }, [load]);
  async function save(archiveConfirmed = false) {
    const current = scope.current;
    if (!snapshot || !ready || !canSave || offline || current.busy || !current.active) return;
    current.busy = true; setBusy(true); setMessage(""); setSaved(false); savedRef.current = false;
    try {
      const sending = { ...draft, archiveConfirmed: draft.kind === "archived" && archiveConfirmed };
      const fingerprint = JSON.stringify([snapshot.connection.version, sending, timeZone]);
      if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, body: buildRelationshipCompletion(snapshot, sending, timeZone, Crypto.randomUUID(), `relationship-task:${Crypto.randomUUID()}`) };
      const body = intent.current.body;
      const result = await client.post<unknown>(relationshipLifecyclePath(connectionId), { body, signal: current.controller.signal });
      if (!current.active) return;
      if (!result.success) { setMessage(lifecycleFailureCopy(language, result.error, "save")); return; }
      const after = relationshipReceiptMatches(result.data, snapshot, body);
      if (!after || result.status < 200 || result.status >= 300) { setMessage(t("relationshipTasks.lifecycleReceiptMismatch")); return; }
      setSnapshot(after); setDraft(defaultDraft(emptyDraft, after, undefined, targetContactId, timeZone)); intent.current = null;
      setSaved(true); savedRef.current = true;
      // Like completing a reminder: say it is done and go back to the list the user came from.
      if (router.canGoBack()) { toast.success(t("relationshipTasks.resolveSaved")); router.back(); return; }
      setMessage(t("relationshipTasks.resolveSaved"));
    } catch (error) { if (current.active) setMessage(language === "zh" && error instanceof Error ? error.message : t("relationshipTasks.lifecycleSaveFailed")); }
    finally { current.busy = false; if (current.active) setBusy(false); }
  }
  const open = snapshot ? relationshipOpenTasks(snapshot, targetTaskId, targetContactId) : [];
  const selected = open.find(task => task.taskId === draft.taskId) ?? null;
  const canContinue = snapshot ? ["needs_follow_up", "nurture"].includes(snapshot.connection.stage) : false;
  const history = snapshot ? snapshot.tasks.filter(task => !["open", "scheduled"].includes(task.status)) : [];
  const locked = busy || offline || !canSave;
  const options = ([
    ...(canContinue ? [["next_task", "resolveOptNext", "resolveOptNextSub"]] : []),
    ["nurture", "resolveOptNurture", "resolveOptNurtureSub"],
    ["active", "resolveOptActive", "resolveOptActiveSub"],
    ["archived", "resolveOptArchive", "resolveOptArchiveSub"],
  ] as const) as readonly (readonly [RelationshipCompletionDraft["kind"], string, string])[];
  const datedKind = draft.kind === "next_task" || draft.kind === "nurture";
  function submit() {
    if (!selected) return;
    if (datedKind && (!draft.title.trim() || !draft.date)) { setMessage(t("relationshipTasks.resolveFillNext")); return; }
    if (draft.kind === "active" && !draft.goal.trim()) { setMessage(t("relationshipTasks.resolveFillGoal")); return; }
    if (draft.kind === "archived") { setConfirmArchive(true); return; }
    void save();
  }
  return <AppScreen title={t("relationshipTasks.resolveTitle")} backLabel={t("relationshipTasks.resolveBack")} refreshControl={<RefreshControl onRefresh={() => void load()} refreshing={busy} />}>
    {offline ? <OfflineNotice lastSyncedAt={copy?.lastSyncedAt ?? null} reason={copy?.reason ?? null} /> : null}
    {message ? <Text accessibilityRole="alert" style={[styles.message, saved && styles.success]}>{message}</Text> : null}
    {/* QA-C3: a page that could not load said "Please retry" with nothing to tap (pull to refresh only). */}
    {!snapshot && message && !saved ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void load()} style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.primaryText}>{t("common.retry")}</Text>
    </Pressable> : null}
    {snapshot ? <>
      {selected ? <View style={[styles.card, styles.hero]}>
        <Text style={styles.heroTitle}>{selected.title}</Text>
        <Text style={[styles.heroSub, overdue(selected.dueAt) && styles.danger]}>{overdue(selected.dueAt) ? `${t("relationshipTasks.resolveOverdue")} · ` : `${t("relationshipTasks.resolveDue")} · `}{dateText(selected.dueAt, timeZone, language)}</Text>
        <Text style={styles.heroHint}>{t("relationshipTasks.resolveLead")}</Text>
      </View> : open.length === 0 ? <View style={[styles.card, styles.hero]}>
        <Text accessibilityRole={targetTaskId !== undefined ? "alert" : undefined} style={styles.heroSub}>{targetTaskId !== undefined ? t("relationshipTasks.lifecycleUnavailable") : t("relationshipTasks.resolveNone")}</Text>
      </View> : null}
      {open.length > 1 ? <>
        <Text style={styles.section}>{t("relationshipTasks.resolvePick")}</Text>
        <View style={styles.card}>{open.map((task, index) => <Pressable key={task.taskId} disabled={busy} accessibilityRole="radio" accessibilityLabel={task.title} accessibilityState={{ checked: draft.taskId === task.taskId }} aria-checked={draft.taskId === task.taskId} onPress={() => setDraft(previous => ({ ...previous, taskId: task.taskId, title: task.title }))} style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && styles.pressed]}>
          <View style={styles.rowBody}><Text style={styles.rowLabel}>{task.title}</Text><Text style={styles.rowSub}>{dateText(task.dueAt, timeZone, language)}</Text></View>
          {draft.taskId === task.taskId ? <Icon color={colors.accentText} name="check" size={20} strokeWidth={2.4} /> : null}
        </Pressable>)}</View>
      </> : null}
      {snapshot.connection.contactId ? <View style={styles.card}><Pressable accessibilityRole="button" accessibilityLabel={t("relationshipTasks.resolveContact")} onPress={() => router.push(`/contacts/${encodeURIComponent(snapshot.connection.contactId)}` as Href)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={[styles.rowIcon, { backgroundColor: colors.ink3Text }]}><Icon color={colors.onAccent} name="user" size={16} /></View>
        <Text style={[styles.rowLabel, styles.rowGrow]}>{localContacts.rows.find(row => row.id === snapshot.connection.contactId)?.card?.displayName?.trim() || t("relationshipTasks.resolveContact")}</Text>
        <Icon color={colors.ink3Text} name="right" size={16} />
      </Pressable></View> : null}
      {selected ? <>
        <Text style={styles.section}>{t("relationshipTasks.resolveNextHeader")}</Text>
        <View style={styles.card}>{options.map(([kind, label, sub], index) => <Pressable key={kind} disabled={busy} accessibilityRole="radio" accessibilityLabel={t(`relationshipTasks.${label}` as MessageKey)} accessibilityState={{ checked: draft.kind === kind }} aria-checked={draft.kind === kind} onPress={() => { setSaved(false); setMessage(""); setDraft(previous => ({ ...previous, kind })); }} style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && styles.pressed]}>
          <View style={styles.rowBody}><Text style={[styles.rowLabel, kind === "archived" && styles.danger]}>{t(`relationshipTasks.${label}` as MessageKey)}</Text><Text style={styles.rowSub}>{t(`relationshipTasks.${sub}` as MessageKey)}</Text></View>
          {draft.kind === kind ? <Icon color={colors.accentText} name="check" size={20} strokeWidth={2.4} /> : null}
        </Pressable>)}</View>
        {datedKind ? <View style={styles.card}>
          <View style={styles.row}><TextInput accessibilityLabel={t("relationshipTasks.resolveWhat")} editable={!locked} multiline scrollEnabled={false} placeholder={t("relationshipTasks.resolveWhat")} placeholderTextColor={colors.ink3Text} value={draft.title} onChangeText={value => setDraft(previous => ({ ...previous, title: value }))} style={styles.input} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel={t("relationshipTasks.resolveDate")} disabled={locked} onPress={() => setPicker("date")} style={({ pressed }) => [styles.row, styles.rowLine, pressed && styles.pressed]}>
            <View style={[styles.rowIcon, { backgroundColor: colors.coralText }]}><Icon color={colors.onAccent} name="calendar" size={16} /></View>
            <Text style={[styles.rowLabel, styles.rowGrow]}>{t("relationshipTasks.resolveDate")}</Text>
            <Text style={styles.rowValueLink}>{draft.date ? dayText(draft.date, language) : "—"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t("relationshipTasks.resolveTime")} disabled={locked} onPress={() => setPicker("time")} style={({ pressed }) => [styles.row, styles.rowLine, pressed && styles.pressed]}>
            <View style={[styles.rowIcon, { backgroundColor: colors.accentText }]}><Icon color={colors.onAccent} name="clock" size={16} /></View>
            <Text style={[styles.rowLabel, styles.rowGrow]}>{t("relationshipTasks.resolveTime")}</Text>
            <Text style={styles.rowValueLink}>{draft.time}</Text>
          </Pressable>
        </View> : null}
        {draft.kind === "active" ? <View style={styles.card}><View style={styles.row}><TextInput accessibilityLabel={t("relationshipTasks.resolveGoal")} editable={!locked} multiline scrollEnabled={false} placeholder={t("relationshipTasks.resolveGoal")} placeholderTextColor={colors.ink3Text} value={draft.goal} onChangeText={value => setDraft(previous => ({ ...previous, goal: value }))} style={styles.input} /></View></View> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: locked || !draft.taskId }} disabled={locked || !draft.taskId} onPress={submit} style={({ pressed }) => [styles.primary, draft.kind === "archived" && styles.primaryDanger, (locked || !draft.taskId) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>{t(draft.kind === "archived" ? "relationshipTasks.resolveStop" : "relationshipTasks.resolveDone")}{offline ? ` · ${t("relationshipTasks.resolveNeedsNetwork")}` : ""}</Text>
        </Pressable>
      </> : null}
      {history.length ? <>
        <Text style={styles.section}>{t("relationshipTasks.resolveHistory")}</Text>
        <View style={styles.card}>{history.map((task, index) => <View key={task.taskId} style={[styles.row, index > 0 && styles.rowLine]}>
          <View style={styles.rowBody}><Text style={[styles.rowLabel, styles.muted]}>{task.title}</Text><Text style={styles.rowSub}>{t(task.status === "completed" ? "relationshipTasks.resolveCompleted" : "relationshipTasks.resolveDismissed")}</Text></View>
        </View>)}</View>
      </> : null}
      {picker ? <PersonalScheduleDateTimePicker kind={picker} value={picker === "date" ? draft.date : draft.time} zone={timeZone} disabled={locked}
        onCancel={() => setPicker(null)} onConfirm={value => { setPicker(null); setDraft(previous => ({ ...previous, [picker]: value })); }} /> : null}
      <ConfirmDialog visible={confirmArchive && !busy} destructive title={t("relationshipTasks.resolveArchiveConfirmTitle")}
        message={open.length > 1 ? t("relationshipTasks.resolveArchiveConfirmBodyMore", { n: open.length - 1 }) : t("relationshipTasks.resolveArchiveConfirmBody")}
        confirmLabel={t("relationshipTasks.resolveStopShort")} onCancel={() => setConfirmArchive(false)}
        onConfirm={() => { setConfirmArchive(false); void save(true); }} />
    </> : null}
  </AppScreen>;
}

/** The follow-up to resolve (the tapped one, else the first open) and a ready next step: same title, a week out at 09:00. */
function defaultDraft(previous: RelationshipCompletionDraft, snapshot: RelationshipLifecycleSnapshotDTO, taskId: string | undefined, contactId: string | undefined, timeZone: string): RelationshipCompletionDraft {
  const open = relationshipOpenTasks(snapshot, taskId, contactId);
  const task = open.find(item => item.taskId === previous.taskId) ?? open[0];
  if (!task) return { ...emptyDraft };
  if (task.taskId === previous.taskId) return previous;
  const canContinue = ["needs_follow_up", "nurture"].includes(snapshot.connection.stage);
  let today = "";
  try { today = localParts(new Date(), timeZone).date; } catch { today = new Date().toISOString().slice(0, 10); }
  return { ...emptyDraft, taskId: task.taskId, kind: canContinue ? "next_task" : "nurture", title: task.title, date: shiftCalendarDate(today, 7), time: "09:00" };
}

function overdue(dueAt: string): boolean {
  const time = Date.parse(dueAt);
  return Number.isFinite(time) && time < Date.now();
}

function dateText(value: string, timeZone: string, language: OrbitLanguage): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { timeZone, month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  } catch { return date.toISOString().slice(0, 16).replace("T", " "); }
}

function dayText(day: string, language: OrbitLanguage): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return day;
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric", weekday: "short" }).format(date);
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, paddingLeft: 14, marginBottom: 14, overflow: "hidden" },
  danger: { color: colors.coralText },
  disabled: { opacity: 0.5 },
  hero: { paddingVertical: 14, paddingRight: 14, gap: 4 },
  heroHint: { color: colors.ink3Text, fontSize: 14, lineHeight: 20, marginTop: 4 },
  heroSub: { color: colors.ink2, fontSize: 16, lineHeight: 22 },
  heroTitle: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: "700" },
  input: { flex: 1, minHeight: 44, color: colors.ink, fontSize: 17, lineHeight: 22, paddingVertical: 10, textAlignVertical: "top" },
  message: { color: colors.ink, fontSize: 16, lineHeight: 22, marginBottom: 12 },
  muted: { color: colors.ink3Text },
  pressed: { opacity: 0.68 },
  primary: { alignItems: "center", justifyContent: "center", minHeight: 50, borderRadius: 14, backgroundColor: colors.accentText, marginBottom: 14, paddingHorizontal: 16 },
  primaryDanger: { backgroundColor: colors.coralText },
  primaryText: { color: colors.onAccent, fontSize: 17, fontWeight: "600", textAlign: "center" },
  row: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 52, paddingVertical: 8, paddingRight: 14 },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowGrow: { flex: 1 },
  rowIcon: { alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8 },
  rowLabel: { color: colors.ink, fontSize: 17, lineHeight: 22 },
  rowLine: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  rowSub: { color: colors.ink3Text, fontSize: 14, lineHeight: 19 },
  rowValue: { color: colors.ink3Text, fontSize: 16, flexShrink: 1 },
  rowValueLink: { color: colors.accentText, fontSize: 16, flexShrink: 1, textAlign: "right" },
  section: { color: colors.ink3Text, fontSize: 13, fontWeight: "600", textTransform: "uppercase", marginBottom: 6, marginLeft: 14 },
  success: { color: colors.accentText },
}));
