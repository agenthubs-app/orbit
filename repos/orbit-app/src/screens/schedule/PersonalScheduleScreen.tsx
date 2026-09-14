import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import * as Crypto from "expo-crypto";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { AppScreen } from "../../components/AppScreen";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { createThemedStyles } from "../../design/theme";
import { createControlStyles } from "../../design/controls";
import { LoadingState } from "../../components/LoadingState";
import { personalSchedulePath, readPersonalSchedule, personalScheduleReceiptMatches } from "../../api/personal-schedule";
import type { PersonalScheduleContract } from "../../api/contract/tasks";
import { buildPersonalScheduleChange, personalScheduleDraft, type PersonalScheduleDraft } from "../../view-models/personal-schedule-editor";

export function PersonalScheduleScreen() {
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const actorId = auth.user?.id ?? ""; const ready = auth.ready && auth.signedIn && server.ready && !!actorId;
  const scopeKey = JSON.stringify([actorId, server.baseUrl, id, ready]);
  return <PersonalScheduleEditor key={scopeKey} id={id} actorId={actorId} ready={ready} scopeKey={scopeKey} />;
}
function PersonalScheduleEditor({ id, actorId, ready, scopeKey }: { id: string; actorId: string; ready: boolean; scopeKey: string }) {
  const router = useRouter(); const { timeZone, canSave } = useOrbitTimeZone(); const { styles, colors } = useStyles();
  const [editZone, setEditZone] = useState(timeZone);
  const client = useOrbitApiClient({ scopeKey });
  const scope = useMemo(() => ({ active: true, busy: false, controller: new AbortController(), keys: new Map<string, string>() }), [client]);
  const current = useRef(scope); current.current = scope;
  const [baseline, setBaseline] = useState<PersonalScheduleContract | null>(null);
  const [latest, setLatest] = useState<PersonalScheduleContract | null>(null);
  const [draft, setDraft] = useState(() => personalScheduleDraft(null, editZone));
  const [loading, setLoading] = useState(!!id); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [confirmDelete, setConfirmDelete] = useState(false);
  const [revision, setRevision] = useState(0);
  const clean = JSON.stringify(draft) === JSON.stringify(personalScheduleDraft(baseline, editZone));
  const stateRef = useRef({ baseline, draft, clean, editZone }); stateRef.current = { baseline, draft, clean, editZone };
  const stale = !!baseline && !!latest && baseline.updatedAt !== latest.updatedAt;
  useEffect(() => {
    scope.active = true;
    if (scope.controller.signal.aborted) scope.controller = new AbortController();
    return () => { scope.active = false; scope.controller.abort(); };
  }, [scope]);
  useEffect(() => {
    if (!ready || !id) { setLoading(false); return; }
    let active = true; setLoading(true);
    void client.get<unknown>(personalSchedulePath(id), { signal: scope.controller.signal }).then(result => {
      if (!active || !scope.active || current.current !== scope) return;
      const item = result.success ? readPersonalSchedule(result.data) : null;
      if (!item || item.id !== id || item.ownerUserId !== actorId || item.accountId !== actorId) { setError(result.success ? "无法确认日程数据，请重新读取。" : result.error.message); return; }
      setLatest(item); setError("");
      if (!stateRef.current.baseline || stateRef.current.clean) { setBaseline(item); setDraft(personalScheduleDraft(item, stateRef.current.editZone)); }
    }).catch(() => { if (active && scope.active) setError("日程读取失败，请重试。"); }).finally(() => { if (active && scope.active) setLoading(false); });
    return () => { active = false; };
  }, [ready, id, actorId, client, scope, revision]);
  useEffect(() => { if (clean && !saving && editZone !== timeZone) { setEditZone(timeZone); setDraft(personalScheduleDraft(baseline, timeZone)); } }, [timeZone, editZone, clean, saving, baseline]);
  const discard = () => { setBaseline(latest); setEditZone(timeZone); setDraft(personalScheduleDraft(latest, timeZone)); setError(""); };
  async function save(remove = false) {
    if (!ready || !scope.active || current.current !== scope || scope.busy || stale || (id && !baseline)) return;
    if (!remove && !canSave) { setError("无法读取设备时区，草稿已保留。"); return; }
    const change = remove ? { kind: "ready" as const, fields: {} } : buildPersonalScheduleChange(baseline, draft, editZone);
    if (change.kind === "invalid") { setError(change.message); return; } if (change.kind === "unchanged") return;
    const body = baseline ? { expectedUpdatedAt: baseline.updatedAt, ...(remove ? {} : { patch: change.fields }) } : change.fields;
    const method = remove ? "delete" : baseline ? "patch" : "post";
    const path = personalSchedulePath(id || undefined); const fingerprint = JSON.stringify([method, path, body]);
    const key = scope.keys.get(fingerprint) ?? `ios:personal:${Crypto.randomUUID()}`; scope.keys.set(fingerprint, key);
    scope.busy = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = await client[method]<unknown>(path, { body: { ...body, idempotencyKey: key }, signal: scope.controller.signal });
      if (!scope.active || current.current !== scope) return;
      if (!result.success) { setError(result.error.message); return; }
      const item = readPersonalSchedule(result.data);
      if (result.status < 200 || result.status >= 300 || !item || !personalScheduleReceiptMatches(result.data, actorId, id || undefined, change.fields, remove) || (baseline && Date.parse(item.updatedAt) <= Date.parse(baseline.updatedAt))) { setError("未能确认保存结果，草稿已保留，请重试。"); return; }
      scope.keys.delete(fingerprint);
      if (remove) { router.replace("/schedule" as Href); return; }
      setBaseline(item); setLatest(item); setDraft(personalScheduleDraft(item, editZone)); setMessage("个人日程已保存");
      if (!id) router.replace(`/schedule/personal/${encodeURIComponent(item.id)}` as Href); else setRevision(value => value + 1);
    } catch { if (scope.active && current.current === scope) setError("操作未完成，草稿已保留，请重试。"); }
    finally { scope.busy = false; if (scope.active && current.current === scope) setSaving(false); }
  }
  return <AppScreen title={id ? "个人日程" : "新建个人日程"} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => setRevision(value => value + 1)} />}>
    {loading && !baseline ? <LoadingState /> : null}
    <Text style={styles.hint}>时间使用 {editZone}。这条日程只保存在 Orbit，不会写入外部日历。</Text>
    {editZone !== timeZone ? <Text accessibilityRole="alert" style={styles.hint}>未保存草稿仍按 {editZone} 解释。</Text> : null}
    {stale ? <View><Text accessibilityRole="alert" style={styles.error}>日程已有新版本，草稿已保留。</Text><Pressable accessibilityRole="button" onPress={discard} style={styles.secondary}><Text>放弃草稿并载入最新内容</Text></Pressable></View> : null}
    {(!id || baseline) && ready ? <>
      {([["title", "日程标题", "填写标题"], ["startDate", "开始日期", "YYYY-MM-DD"], ["startTime", "开始时间", "HH:mm"], ["endDate", "结束日期", "可选 YYYY-MM-DD"], ["endTime", "结束时间", "可选 HH:mm"], ["location", "日程地点", "可选地点"]] as const).map(([field, label, placeholder]) => <View key={field} style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={draft[field]} placeholder={placeholder} placeholderTextColor={colors.text4} style={styles.input} editable={!saving} autoCapitalize="none" autoCorrect={false} onChangeText={value => { if (!scope.busy && scope.active) setDraft(previous => ({ ...previous, [field]: value })); }} /></View>)}
      <Pressable accessibilityRole="button" accessibilityLabel="保存个人日程" disabled={saving || stale} onPress={() => void save()} style={styles.primary}><Text style={styles.primaryText}>{saving ? "正在保存…" : "保存个人日程"}</Text></Pressable>
      {baseline ? <Pressable accessibilityRole="button" disabled={saving || stale} onPress={() => setConfirmDelete(true)} style={styles.secondary}><Text style={styles.error}>删除个人日程</Text></Pressable> : null}
      {confirmDelete ? <View><Text style={styles.hint}>删除后，这条个人日程将从列表和日历移除。</Text><Pressable accessibilityRole="button" disabled={saving || stale} onPress={() => void save(true)} style={styles.secondary}><Text style={styles.error}>确认删除个人日程</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setConfirmDelete(false)} style={styles.secondary}><Text>保留日程</Text></Pressable></View> : null}
    </> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{message ? <Text style={styles.hint}>{message}</Text> : null}
  </AppScreen>;
}
const useStyles = createThemedStyles(colors => ({
  hint: { color: colors.text2, fontSize: 14, lineHeight: 22, marginBottom: 12 }, field: { gap: 6, marginBottom: 14 }, label: { color: colors.text, fontSize: 15 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, color: colors.text, fontSize: 16 },
  primary: { ...createControlStyles(colors).primaryButton, minHeight: 48, marginBottom: 12 }, primaryText: { color: colors.onAccent, fontWeight: "600" as const },
  secondary: { minHeight: 44, justifyContent: "center" as const, marginBottom: 8 }, error: { color: colors.rose, fontSize: 14, lineHeight: 22 },
}));
