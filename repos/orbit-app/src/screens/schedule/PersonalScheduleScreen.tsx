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
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function PersonalScheduleScreen() {
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const actorId = auth.actorId ?? ""; const ready = auth.ready && auth.signedIn && server.ready && !!actorId;
  const scopeKey = JSON.stringify([actorId, server.baseUrl, id, ready]);
  return <PersonalScheduleEditor key={scopeKey} id={id} actorId={actorId} ready={ready} scopeKey={scopeKey} />;
}
function PersonalScheduleEditor({ id, actorId, ready, scopeKey }: { id: string; actorId: string; ready: boolean; scopeKey: string }) {
  const router = useRouter(); const { timeZone, canSave } = useOrbitTimeZone(); const { styles, colors } = useStyles();
  const locale = useOrbitLocale();
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
      if (!item || item.id !== id || item.ownerUserId !== actorId || item.accountId !== actorId) { setError(result.success ? locale.t("schedule.readUnconfirmed") : result.error.message); return; }
      setLatest(item); setError("");
      if (!stateRef.current.baseline || stateRef.current.clean) { setBaseline(item); setDraft(personalScheduleDraft(item, stateRef.current.editZone)); }
    }).catch(() => { if (active && scope.active) setError(locale.t("schedule.readFailed")); }).finally(() => { if (active && scope.active) setLoading(false); });
    return () => { active = false; };
  }, [ready, id, actorId, client, scope, revision]);
  useEffect(() => { if (clean && !saving && editZone !== timeZone) { setEditZone(timeZone); setDraft(personalScheduleDraft(baseline, timeZone)); } }, [timeZone, editZone, clean, saving, baseline]);
  const discard = () => { setBaseline(latest); setEditZone(timeZone); setDraft(personalScheduleDraft(latest, timeZone)); setError(""); };
  async function save(remove = false) {
    if (!ready || !scope.active || current.current !== scope || scope.busy || stale || (id && !baseline)) return;
    if (!remove && !canSave) { setError(locale.t("schedule.timezoneUnavailable")); return; }
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
      if (result.status < 200 || result.status >= 300 || !item || !personalScheduleReceiptMatches(result.data, actorId, id || undefined, change.fields, remove) || (baseline && Date.parse(item.updatedAt) <= Date.parse(baseline.updatedAt))) { setError(locale.t("schedule.saveUnconfirmed")); return; }
      scope.keys.delete(fingerprint);
      if (remove) { router.replace("/schedule" as Href); return; }
      setBaseline(item); setLatest(item); setDraft(personalScheduleDraft(item, editZone)); setMessage(locale.t("schedule.saved"));
      if (!id) router.replace(`/schedule/personal/${encodeURIComponent(item.id)}` as Href); else setRevision(value => value + 1);
    } catch { if (scope.active && current.current === scope) setError(locale.t("schedule.operationFailed")); }
    finally { scope.busy = false; if (scope.active && current.current === scope) setSaving(false); }
  }
  return <AppScreen backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("schedule.title") })} backLabel={locale.t("schedule.title")} title={locale.t(id ? "schedule.personalTitle" : "schedule.newPersonalTitle")} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => setRevision(value => value + 1)} />}>
    {loading && !baseline ? <LoadingState /> : null}
    <Text style={styles.hint}>{locale.t("schedule.editorHint", { timeZone: editZone })}</Text>
    {editZone !== timeZone ? <Text accessibilityRole="alert" style={styles.hint}>{locale.t("schedule.draftZone", { timeZone: editZone })}</Text> : null}
    {stale ? <View><Text accessibilityRole="alert" style={styles.error}>{locale.t("schedule.newVersion")}</Text><Pressable accessibilityRole="button" onPress={discard} style={styles.secondary}><Text>{locale.t("schedule.discardDraft")}</Text></Pressable></View> : null}
    {(!id || baseline) && ready ? <>
      {([["title", locale.t("schedule.fieldTitle"), locale.t("schedule.fieldTitlePlaceholder")], ["startDate", locale.t("schedule.fieldStartDate"), "YYYY-MM-DD"], ["startTime", locale.t("schedule.fieldStartTime"), "HH:mm"], ["endDate", locale.t("schedule.fieldEndDate"), locale.t("schedule.fieldEndDatePlaceholder")], ["endTime", locale.t("schedule.fieldEndTime"), locale.t("schedule.fieldEndTimePlaceholder")], ["location", locale.t("schedule.fieldLocation"), locale.t("schedule.fieldLocationPlaceholder")]] as const).map(([field, label, placeholder]) => <View key={field} style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={draft[field]} placeholder={placeholder} placeholderTextColor={colors.text4} style={styles.input} editable={!saving} autoCapitalize="none" autoCorrect={false} onChangeText={value => { if (!scope.busy && scope.active) setDraft(previous => ({ ...previous, [field]: value })); }} /></View>)}
      <Pressable accessibilityRole="button" accessibilityLabel={locale.t("schedule.save")} disabled={saving || stale} onPress={() => void save()} style={styles.primary}><Text style={styles.primaryText}>{locale.t(saving ? "schedule.saving" : "schedule.save")}</Text></Pressable>
      {baseline ? <Pressable accessibilityRole="button" disabled={saving || stale} onPress={() => setConfirmDelete(true)} style={styles.secondary}><Text style={styles.error}>{locale.t("schedule.deletePersonal")}</Text></Pressable> : null}
      {confirmDelete ? <View><Text style={styles.hint}>{locale.t("schedule.deleteHint")}</Text><Pressable accessibilityRole="button" disabled={saving || stale} onPress={() => void save(true)} style={styles.secondary}><Text style={styles.error}>{locale.t("schedule.confirmDelete")}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setConfirmDelete(false)} style={styles.secondary}><Text>{locale.t("schedule.keep")}</Text></Pressable></View> : null}
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
