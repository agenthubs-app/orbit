import * as Crypto from "expo-crypto";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { RelationshipCompletionInput, RelationshipLifecycleSnapshotDTO } from "../../api/contract/relationship-lifecycle";
import { buildRelationshipCompletion, readRelationshipSnapshot, relationshipLifecyclePath, relationshipReceiptMatches, type RelationshipCompletionDraft } from "../../api/relationship-lifecycle";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { keepsPageCopy } from "../../data/sync/page-copies";
import { usePageCopySession } from "../../hooks/usePageCopySession";
import { OfflineNotice } from "../../components/OfflineNotice";
import type { PageCopyStatus } from "../../data/sync/page-copies";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTheme as useTheme } from "../../design/theme";

const emptyDraft: RelationshipCompletionDraft = { taskId: "", kind: "next_task", title: "", date: "", time: "", goal: "", archiveConfirmed: false };
export function RelationshipLifecycleScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const auth = useOrbitAuthSession(), server = useOrbitApiBaseUrl();
  const scopeKey = JSON.stringify([auth.actorId, auth.cookieHeader, server.baseUrl, id]);
  const ready = auth.ready && auth.signedIn && server.ready && !!auth.actorId && !!id;
  return <LifecycleEditor key={scopeKey} scopeKey={scopeKey} ready={ready} actorId={auth.actorId ?? ""} connectionId={id ?? ""} />;
}
function LifecycleEditor({ scopeKey, ready, actorId, connectionId }: { scopeKey: string; ready: boolean; actorId: string; connectionId: string }) {
  const client = useOrbitApiClient({ scopeKey });
  const { timeZone, canSave } = useOrbitTimeZone();
  const { language } = useOrbitLocale();
  const { colors } = useTheme();
  const text = (zh: string, en: string, ja: string) => language === "zh" ? zh : language === "ja" ? ja : en;
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
        setSnapshot(null); setMessage(reason === "unreachable" ? text("这项内容还没保存在这台设备上，联网打开一次后断网也能看。", "This isn't stored on this device yet. Open it once while connected and it will be readable offline.", "この内容はまだこの端末に保存されていません。接続中に一度開くと、オフラインでも読めます。") : result.success ? "返回的关系不一致，请重试。" : result.error.message); return;
      }
      answered = true;
      setCopy(null);
      if (result.success) void whenReady().then((ready) => ready?.savePageCopy("relationship-lifecycle", connectionId, result.data)).catch(() => undefined);
      setSnapshot(value); intent.current = null;
      setDraft(previous => ({ ...previous, taskId: value.tasks.find(task => ["open", "scheduled"].includes(task.status))?.taskId ?? "" }));
      setMessage("");
    } catch { if (current.active) { setSnapshot(null); setCopy(null); setMessage("读取失败，请重试。"); } }
    finally { current.busy = false; if (current.active) setBusy(false); }
  }, [ready, client, actorId, connectionId, whenReady]);
  useEffect(() => { void load(); }, [load]);
  async function save() {
    const current = scope.current;
    if (!snapshot || !ready || !canSave || offline || current.busy || !current.active) return;
    current.busy = true; setBusy(true); setMessage("");
    try {
      const fingerprint = JSON.stringify([snapshot.connection.version, draft, timeZone]);
      if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, body: buildRelationshipCompletion(snapshot, draft, timeZone, Crypto.randomUUID(), `relationship-task:${Crypto.randomUUID()}`) };
      const body = intent.current.body;
      const result = await client.post<unknown>(relationshipLifecyclePath(connectionId), { body, signal: current.controller.signal });
      if (!current.active) return;
      if (!result.success) { setMessage(result.error.message); return; }
      const after = relationshipReceiptMatches(result.data, snapshot, body);
      if (!after || result.status < 200 || result.status >= 300) { setMessage("保存回执不一致，请刷新核对。输入已保留。"); return; }
      setSnapshot(after); setDraft(emptyDraft); intent.current = null;
      setMessage(text("跟进已完成，关系下一步已保存。", "Follow-up completed and next step saved.", "フォローアップと次のステップを保存しました。"));
    } catch (error) { if (current.active) setMessage(error instanceof Error ? error.message : "保存失败，输入已保留。"); }
    finally { current.busy = false; if (current.active) setBusy(false); }
  }
  const open = snapshot?.tasks.filter(task => ["open", "scheduled"].includes(task.status)) ?? [];
  const fields: ["title" | "date" | "time" | "goal", string, string][] = draft.kind === "next_task" || draft.kind === "nurture"
    ? [["title", text("下一次跟进内容", "Next follow-up", "次の内容"), ""], ["date", text("下次日期", "Next date", "次の日付"), "YYYY-MM-DD"], ["time", text("下次时间", "Next time", "次の時刻"), "HH:mm"]]
    : draft.kind === "active" ? [["goal", text("关系目标", "Relationship goal", "関係の目標"), ""]] : [];
  return <AppScreen title={text("处理人脉跟进", "Resolve follow-up", "フォローアップを完了")} backLabel={text("待办", "Tasks", "タスク")} refreshControl={<RefreshControl onRefresh={() => void load()} refreshing={busy} />}>
    <Text style={{ color: colors.ink3Text }}>{text("选择关系下一步；不会向联系人发送消息。", "Choose the next step. No message will be sent.", "次のステップを選択します。相手には送信されません。")}</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void load()}><Text style={{ color: colors.accentText }}>{text("刷新关系状态", "Refresh relationship", "関係を更新")}</Text></Pressable>
    {offline ? <OfflineNotice lastSyncedAt={copy?.lastSyncedAt ?? null} reason={copy?.reason ?? null} /> : null}
    {message ? <Text accessibilityRole="alert" style={{ color: colors.ink }}>{message}</Text> : null}
    {snapshot ? <><DataCard title={text("本次完成的跟进", "Follow-up to complete", "完了するフォローアップ")}>
      {open.length ? open.map(task => <Pressable key={task.taskId} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: draft.taskId === task.taskId }} onPress={() => setDraft(previous => ({ ...previous, taskId: task.taskId }))}><Text style={{ color: draft.taskId === task.taskId ? colors.accentText : colors.ink, paddingVertical: 10 }}>{draft.taskId === task.taskId ? "● " : "○ "}{task.title}</Text></Pressable>) : <Text style={{ color: colors.ink3Text }}>{text("没有待处理的跟进", "No open follow-ups", "未完了のフォローアップはありません")}</Text>}
    </DataCard>{open.length ? <DataCard title={text("关系下一步", "Relationship next step", "関係の次のステップ")}>
      {([ ["next_task", text("继续跟进", "Continue following up", "フォローアップを継続")], ["active", text("转为进行中", "Set active goal", "進行中にする")], ["nurture", text("定期维护", "Keep in touch", "定期的に連絡")], ["archived", text("归档关系", "Archive relationship", "関係をアーカイブ")] ] as const).map(([kind, label]) => <Pressable key={kind} disabled={busy || (kind === "next_task" && !["needs_follow_up", "nurture"].includes(snapshot.connection.stage))} accessibilityRole="radio" accessibilityState={{ checked: draft.kind === kind }} onPress={() => setDraft(previous => ({ ...previous, kind }))}><Text style={{ color: draft.kind === kind ? colors.accentText : colors.ink, paddingVertical: 8 }}>{draft.kind === kind ? "● " : "○ "}{label}</Text></Pressable>)}
      {fields.map(([field, label, placeholder]) => <View key={field}><Text style={{ color: colors.ink }}>{label}</Text><TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.ink3Text} editable={!busy && !offline} value={draft[field]} onChangeText={value => setDraft(previous => ({ ...previous, [field]: value }))} style={{ color: colors.ink, borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 12 }} /></View>)}
      {draft.kind === "next_task" || draft.kind === "nurture" ? <Text style={{ color: colors.ink3Text }}>{timeZone}</Text> : null}
      {draft.kind === "archived" ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.archiveConfirmed }} disabled={busy} onPress={() => setDraft(previous => ({ ...previous, archiveConfirmed: !previous.archiveConfirmed }))}><Text style={{ color: colors.ink }}>{draft.archiveConfirmed ? "☑ " : "☐ "}{text(`确认归档，并忽略其余 ${Math.max(0, open.length - 1)} 条未完成跟进`, `Archive and dismiss the other ${Math.max(0, open.length - 1)} open follow-ups`, `アーカイブし、残り${Math.max(0, open.length - 1)}件を終了`)}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || offline || !draft.taskId || !canSave }} disabled={busy || offline || !draft.taskId || !canSave} onPress={() => void save()} style={{ padding: 14, backgroundColor: colors.accentText, borderRadius: 8, opacity: busy || offline || !draft.taskId ? 0.5 : 1 }}><Text style={{ color: colors.onAccent }}>{text("完成并保存下一步", "Complete and save next step", "完了して次を保存")}{offline ? " · " + text("需要联网", "Needs a connection", "接続が必要です") : ""}</Text></Pressable>
    </DataCard> : null}<DataCard title={text("历史跟进", "Follow-up history", "フォローアップ履歴")}>{snapshot.tasks.filter(task => !["open", "scheduled"].includes(task.status)).map(task => <Text key={task.taskId} style={{ color: colors.ink3Text }}>{task.title} · {task.status === "completed" ? text("已完成", "Completed", "完了") : text("已忽略", "Dismissed", "終了")}</Text>)}</DataCard></> : null}
  </AppScreen>;
}
