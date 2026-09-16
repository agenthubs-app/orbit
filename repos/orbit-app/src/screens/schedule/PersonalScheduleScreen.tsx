import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { PersonalScheduleTimeBlock } from "./PersonalScheduleTimeBlock";
import { PersonalScheduleAssociations } from "./PersonalScheduleAssociations";

export function PersonalScheduleScreen() {
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const params = useLocalSearchParams<{ id?: string | string[]; focus?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const actorId = auth.actorId ?? ""; const ready = auth.ready && auth.signedIn && server.ready && !!actorId;
  const scopeKey = JSON.stringify([actorId, server.baseUrl, id, ready]);
  return <PersonalScheduleEditor key={scopeKey} id={id} actorId={actorId} ready={ready} scopeKey={scopeKey} focusTime={(Array.isArray(params.focus) ? params.focus[0] : params.focus) === "time"} />;
}
function PersonalScheduleEditor({ id, actorId, ready, scopeKey, focusTime }: { id: string; actorId: string; ready: boolean; scopeKey: string; focusTime: boolean }) {
  const router = useRouter(); const { timeZone, canSave } = useOrbitTimeZone(); const { styles, colors } = useStyles();
  const insets = useSafeAreaInsets();
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
  const [confirmExit, setConfirmExit] = useState(false);
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
    void client.get<unknown>(personalSchedulePath(id), { headers: { "x-orbit-personal-schedule-version": "2" }, signal: scope.controller.signal }).then(result => {
      if (!active || !scope.active || current.current !== scope) return;
      const item = result.success ? readPersonalSchedule(result.data) : null;
      if (!item || item.id !== id || item.ownerUserId !== actorId || item.accountId !== actorId) { setError(result.success ? locale.t("schedule.readUnconfirmed") : result.error.message); return; }
      setLatest(item); setError("");
      if (!stateRef.current.baseline || stateRef.current.clean) { const savedZone = item.timeZone ?? stateRef.current.editZone; setEditZone(savedZone); setBaseline(item); setDraft(personalScheduleDraft(item, savedZone)); }
    }).catch(() => { if (active && scope.active) setError(locale.t("schedule.readFailed")); }).finally(() => { if (active && scope.active) setLoading(false); });
    return () => { active = false; };
  }, [ready, id, actorId, client, scope, revision]);
  useEffect(() => { if (!baseline?.timeZone && clean && !saving && editZone !== timeZone) { setEditZone(timeZone); setDraft(personalScheduleDraft(baseline, timeZone)); } }, [timeZone, editZone, clean, saving, baseline]);
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
      const result = await client[method]<unknown>(path, { headers: { "x-orbit-personal-schedule-version": "2" }, body: { ...body, idempotencyKey: key }, signal: scope.controller.signal });
      if (!scope.active || current.current !== scope) return;
      if (!result.success) { setError(result.error.message); return; }
      const item = readPersonalSchedule(result.data);
      if (result.status < 200 || result.status >= 300 || !item || !personalScheduleReceiptMatches(result.data, actorId, id || undefined, change.fields, remove) || (baseline && Date.parse(item.updatedAt) <= Date.parse(baseline.updatedAt))) { setError(locale.t("schedule.saveUnconfirmed")); return; }
      if (remove) { scope.keys.delete(fingerprint); router.replace("/schedule" as Href); return; }
      const readback = await client.get<unknown>(personalSchedulePath(item.id), { headers: { "x-orbit-personal-schedule-version": "2" }, signal: scope.controller.signal });
      if (!scope.active || current.current !== scope) return;
      const verified = readback.success ? readPersonalSchedule(readback.data) : null;
      if (!verified || !readback.success || verified.updatedAt !== item.updatedAt || !personalScheduleReceiptMatches(readback.data, actorId, item.id, change.fields)) { setError(locale.t("schedule.saveUnconfirmed")); return; }
      scope.keys.delete(fingerprint);
      setBaseline(verified); setLatest(verified); setDraft(personalScheduleDraft(verified, verified.timeZone ?? editZone)); setMessage(locale.t("schedule.saved"));
      router.replace(`/schedule/personal/${encodeURIComponent(verified.id)}?saved=${encodeURIComponent(verified.updatedAt)}` as Href);
    } catch { if (scope.active && current.current === scope) setError(locale.t("schedule.operationFailed")); }
    finally { scope.busy = false; if (scope.active && current.current === scope) setSaving(false); }
  }
  const exit = () => { if (router.canGoBack()) router.back(); else router.replace((id ? `/schedule/personal/${encodeURIComponent(id)}` : "/schedule") as Href); };
  const cancel = () => { if (saving) return; if (clean) exit(); else setConfirmExit(true); };
  return <View style={styles.screen}><AppScreen onBack={cancel} backLabel={locale.t("personal53.cancel")} backAccessibilityLabel={locale.t("personal53.cancel")} title={locale.t(id ? "schedule.personalTitle" : "schedule.newPersonalTitle")} headerActions={<Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal53.save")} disabled={saving || stale || confirmExit} onPress={() => void save()} style={styles.secondary}><Text style={styles.headerSave}>{locale.t("personal53.save")}</Text></Pressable>} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => setRevision(value => value + 1)} />}>
    {loading && !baseline ? <LoadingState /> : null}
    {editZone !== timeZone ? <Text accessibilityRole="alert" style={styles.hint}>{locale.t("schedule.draftZone", { timeZone: editZone })}</Text> : null}
    {stale ? <View><Text accessibilityRole="alert" style={styles.error}>{locale.t("schedule.newVersion")}</Text><Pressable accessibilityRole="button" onPress={discard} style={styles.secondary}><Text>{locale.t("schedule.discardDraft")}</Text></Pressable></View> : null}
    {(!id || baseline) && ready ? <>
      <View style={styles.field}><TextInput accessibilityLabel={locale.t("schedule.fieldTitle")} value={draft.title} placeholder={locale.t("schedule.fieldTitlePlaceholder")} placeholderTextColor={colors.text4} style={styles.titleInput} editable={!saving} onChangeText={title => { if (!scope.busy) setDraft(previous => ({ ...previous, title })); }} /></View>
      <PersonalScheduleTimeBlock draft={draft} zone={editZone} disabled={saving} initialExpanded={focusTime} onError={setError} onChange={next => { if (!scope.busy && scope.active) setDraft({ ...next, ...(next.endTime !== draft.endTime ? { endDate: next.endTime ? next.endDate || next.startDate : "" } : {}) }); }} />
      <View style={styles.field}><Text style={styles.label}>{locale.t("schedule.fieldLocation")}</Text><View style={styles.modeRow}>{(["video", "in_person"] as const).map(meetingMethod => <Pressable key={meetingMethod} accessibilityRole="button" accessibilityState={{ selected: draft.meetingMethod === meetingMethod }} disabled={saving} onPress={() => setDraft(previous => ({ ...previous, meetingMethod, ...(meetingMethod === "video" ? { location: "" } : { meetingUrl: "" }) }))} style={styles.mode}><Text style={styles.headerSave}>{locale.t(meetingMethod === "video" ? "personal53.online" : "personal53.offline")}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel={locale.t(draft.meetingMethod === "video" ? "personal53.url" : "schedule.fieldLocation")} value={draft.meetingMethod === "video" ? draft.meetingUrl : draft.location} placeholder={locale.t(draft.meetingMethod === "video" ? "personal53.url" : "schedule.fieldLocationPlaceholder")} placeholderTextColor={colors.text4} style={styles.input} editable={!saving} autoCapitalize="none" autoCorrect={false} onChangeText={value => { if (!scope.busy) setDraft(previous => ({ ...previous, ...(previous.meetingMethod === "video" ? { meetingUrl: value } : { location: value }) })); }} /></View>
      <PersonalScheduleAssociations actorId={actorId} scopeKey={scopeKey} noteIds={draft.noteIds ?? []} contactIds={draft.contactIds ?? []} disabled={saving} onNotesChange={noteIds => { if (!scope.busy && scope.active) setDraft(previous => ({ ...previous, noteIds })); }} onContactsChange={contactIds => { if (!scope.busy && scope.active) setDraft(previous => ({ ...previous, contactIds })); }} />
      <Text style={styles.hint}>{locale.t("personal53.unsupported")}</Text>
      {baseline ? <Pressable accessibilityRole="button" disabled={saving || stale} onPress={() => setConfirmDelete(true)} style={styles.secondary}><Text style={styles.error}>{locale.t("schedule.deletePersonal")}</Text></Pressable> : null}
      {confirmDelete ? <View><Text style={styles.hint}>{locale.t("schedule.deleteHint")}</Text><Pressable accessibilityRole="button" disabled={saving || stale} onPress={() => void save(true)} style={styles.secondary}><Text style={styles.error}>{locale.t("schedule.confirmDelete")}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setConfirmDelete(false)} style={styles.secondary}><Text>{locale.t("schedule.keep")}</Text></Pressable></View> : null}
    </> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{message ? <Text style={styles.hint}>{message}</Text> : null}
    {confirmExit ? <View><Text accessibilityRole="alert" style={styles.hint}>{locale.t("personal53.unsaved")}</Text><Pressable accessibilityRole="button" disabled={saving} onPress={() => setConfirmExit(false)} style={styles.secondary}><Text style={styles.headerSave}>{locale.t("schedule.keep")}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal53.cancel")} disabled={saving} onPress={exit} style={styles.secondary}><Text style={styles.error}>{locale.t("personal53.cancel")}</Text></Pressable></View> : null}
    <View style={{ height: 100 + insets.bottom }} />
  </AppScreen>{ready && (!id || baseline) ? <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}><Pressable accessibilityRole="button" accessibilityLabel={locale.t("schedule.save")} disabled={saving || stale || confirmExit} onPress={() => void save()} style={styles.primary}><Text style={styles.primaryText}>{locale.t(saving ? "schedule.saving" : "schedule.save")}</Text></Pressable></View> : null}</View>;
}
const useStyles = createThemedStyles(colors => ({
  screen: { flex: 1, position: "relative" as const }, bottom: { position: "absolute" as const, bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border },
  titleInput: { minHeight: 48, borderBottomWidth: 1, borderColor: colors.text, color: colors.text, fontSize: 26, fontWeight: "800" as const, marginBottom: 12 }, headerSave: { color: colors.accent, fontSize: 16 }, modeRow: { flexDirection: "row" as const, gap: 8 }, mode: { flex: 1, minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  hint: { color: colors.text2, fontSize: 14, lineHeight: 22, marginBottom: 12 }, field: { gap: 6, marginBottom: 14 }, label: { color: colors.text, fontSize: 15 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, color: colors.text, fontSize: 16 },
  primary: { ...createControlStyles(colors).primaryButton, backgroundColor: colors.text, minHeight: 48 }, primaryText: { color: colors.surface, fontWeight: "600" as const },
  secondary: { minHeight: 44, justifyContent: "center" as const, marginBottom: 8 }, error: { color: colors.rose, fontSize: 14, lineHeight: 22 },
}));
