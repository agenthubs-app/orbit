import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, RefreshControl, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { buildOfflineScheduleMutation, isOfflineScheduleEditable } from "../../data/sync/schedule-outbox-mutation";
import { NOTE_DEPENDENCY_FAILED } from "../../data/sync/schedule-outbox-upload";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { AppScreen } from "../../components/AppScreen";
import { LoadingState } from "../../components/LoadingState";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { OfflineNotice } from "../../components/OfflineNotice";
import { usePersonalScheduleItem } from "./personal-schedule-source";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createThemedStyles } from "../../design/theme";
import { personalScheduleDetail } from "../../view-models/personal-schedule-detail";
import { PersonalScheduleAssociations } from "./PersonalScheduleAssociations";
import { PersonalScheduleRules } from "./PersonalScheduleRules";
import { personalScheduleDraft } from "../../view-models/personal-schedule-editor";

export function PersonalScheduleDetailScreen() {
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const params = useLocalSearchParams<{ id?: string | string[]; saved?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && !!auth.actorId;
  const scopeKey = JSON.stringify([auth.actorId, server.baseUrl, id, ready]);
  return <Detail key={scopeKey} actorId={auth.actorId ?? ""} id={id} ready={ready} scopeKey={scopeKey} savedVersion={(Array.isArray(params.saved) ? params.saved[0] : params.saved) ?? ""} />;
}
function Detail({ actorId, id, ready, scopeKey, savedVersion }: { actorId: string; id: string; ready: boolean; scopeKey: string; savedVersion: string }) {
  const { timeZone } = useOrbitTimeZone(); const locale = useOrbitLocale(); const router = useRouter(); const { styles } = useStyles();
  // Native reads the device mirror (sprint 0108); the browser is mirror-first or the network.
  const source = usePersonalScheduleItem({ actorId, ready, scopeKey, id });
  const [view, setView] = useState<ReturnType<typeof personalScheduleDetail>>(null); const [error, setError] = useState("");
  const [rules, setRules] = useState<ReturnType<typeof personalScheduleDraft> | null>(null);
  const loading = source.loading;
  // Sprint 0134: a one-off personal schedule stays editable offline on the phone (its change queues); a series does not.
  const editBlocked = source.offline && !(Platform.OS !== "web" && !!source.outbox && isOfflineScheduleEditable(source.item, actorId));
  const conflict = source.conflict ?? null;
  const snapshot = conflict && typeof conflict.serverSnapshot === "object" && conflict.serverSnapshot !== null && !Array.isArray(conflict.serverSnapshot)
    ? conflict.serverSnapshot as Record<string, unknown> : null;
  const [confirmConflictDelete, setConfirmConflictDelete] = useState(false);
  async function resolveConflict(resolution: "server" | "replace") {
    if (!conflict || !source.outbox) return;
    if (resolution === "replace" && conflict.operation === "delete" && !confirmConflictDelete) { setConfirmConflictDelete(true); return; }
    try {
      if (resolution === "server") {
        await source.outbox.resolveConflict({ mutationId: conflict.mutationId, resolution });
      } else {
        if (!snapshot || typeof snapshot.updatedAt !== "string" || snapshot.id !== id || !conflict.requestJson) { setError(locale.t("schedule.conflictUnavailable")); return; }
        const mutationId = `ios:personal:${Crypto.randomUUID()}`;
        const requestBody = { ...(JSON.parse(conflict.requestJson) as Record<string, unknown>), expectedUpdatedAt: snapshot.updatedAt, idempotencyKey: mutationId };
        const replacement = buildOfflineScheduleMutation({ mutationId, entityId: id, operation: conflict.operation, baseRevision: source.baseRevision ?? conflict.baseRevision,
          requestBody, createdAt: new Date().toISOString() });
        await source.outbox.resolveConflict({ mutationId: conflict.mutationId, resolution, replacement });
        if (conflict.operation === "delete") { router.replace("/schedule" as Href); return; }
      }
      setConfirmConflictDelete(false); setError("");
    } catch { setError(locale.t("schedule.conflictUnavailable")); }
  }
  // Sprint 0136: 「未能保存 · 重试 / 放弃」. Discarding a schedule that only exists on this phone leaves its page.
  async function settleFailure(action: "retry" | "discard") {
    const failure = source.failure;
    if (!failure || !source.outbox) return;
    try {
      if (action === "retry") await source.outbox.retry(failure.mutationId);
      else {
        await source.outbox.discard(failure.mutationId);
        if (failure.operation === "create") { router.replace("/schedule" as Href); return; }
      }
      setError("");
    } catch { setError(locale.t("schedule.conflictUnavailable")); }
  }
  useEffect(() => {
    const item = source.item;
    if (!item) { setView(null); setRules(null); setError(source.errorKey ? locale.t(source.errorKey) : source.errorText); return; }
    if (item.state === "cancelled") { setView(null); setRules(null); setError(locale.t("schedule.readUnconfirmed")); return; }
    const next = personalScheduleDetail(item, timeZone);
    if (!next) { setView(null); setRules(null); setError(locale.t("schedule.timezoneUnavailable")); } else { setError(""); setView(next); setRules(personalScheduleDraft(item, next.zone)); }
  }, [source.item, source.errorKey, source.errorText, timeZone, locale]);
  return <AppScreen title={locale.t("personal53.detail")} backLabel={locale.t("schedule.title")} headerActions={view ? <Pressable accessibilityRole="button" accessibilityLabel={editBlocked ? `${locale.t("personal53.edit")}，${locale.t("sync.needsNetwork")}` : locale.t("personal53.edit")} accessibilityState={{ disabled: editBlocked }} disabled={editBlocked} onPress={() => router.push(view.editHref as Href)} style={styles.action}><Text style={[styles.link, editBlocked && styles.disabled]}>{locale.t(editBlocked ? "sync.needsNetwork" : "personal53.edit")}</Text></Pressable> : null} refreshControl={<RefreshControl refreshing={loading} onRefresh={source.refresh} />}>
    {source.offline ? <OfflineNotice lastSyncedAt={source.lastSyncedAt} queues="schedule" /> : null}
    {loading ? <LoadingState /> : null}{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {source.localMutationState && !conflict ? <Text style={source.localMutationState === "failed" ? styles.error : styles.hint}>{locale.t(source.localMutationState === "failed" ? "schedule.outboxFailed" : "schedule.outboxQueued")}</Text> : null}
    {source.failure ? <Text accessibilityRole="alert" style={styles.error}>{locale.t(source.failure.lastErrorCode === NOTE_DEPENDENCY_FAILED ? "schedule.noteDependencyFailed" : "schedule.outboxFailedBody")}</Text> : null}
    {source.failure && source.outbox && !conflict ? <View>
      <Pressable accessibilityRole="button" accessibilityLabel={locale.t("sync.retryChangeNamed", { title: source.item?.title ?? "" })} onPress={() => void settleFailure("retry")} style={styles.secondary}><Text style={styles.body}>{locale.t("common.retry")}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={locale.t("sync.discardChangeNamed", { title: source.item?.title ?? "" })} onPress={() => void settleFailure("discard")} style={styles.secondary}><Text style={styles.body}>{locale.t("sync.discardChange")}</Text></Pressable>
    </View> : null}
    {conflict ? <View style={styles.conflict}>
      <Text style={styles.body}>{locale.t(conflict.operation === "delete" ? "schedule.deleteConflict" : snapshot ? "schedule.scheduleConflict" : "schedule.deletedElsewhere")}</Text>
      {snapshot && typeof snapshot.title === "string" ? <Text style={styles.hint}>{locale.t("schedule.serverVersionNamed", { title: snapshot.title })}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => void resolveConflict("server")} style={styles.secondary}><Text style={styles.body}>{locale.t("schedule.useServerVersion")}</Text></Pressable>
      {snapshot ? <Pressable accessibilityRole="button" onPress={() => void resolveConflict("replace")} style={styles.secondary}><Text style={conflict.operation === "delete" ? styles.error : styles.body}>{locale.t(conflict.operation === "delete" ? confirmConflictDelete ? "schedule.confirmDeleteConflict" : "schedule.deleteAnyway" : "schedule.keepLocalVersion")}</Text></Pressable> : null}
    </View> : null}
    {view ? <>{view.updatedAt === savedVersion ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{locale.t("schedule.saved")}</Text> : null}<Text style={styles.hint}>{locale.t("personal53.private")}</Text><Text accessibilityRole="header" style={styles.title}>{view.title}</Text>
      <View style={styles.timeCard}><View><Text style={styles.hint}>{locale.t("schedule.fieldStartTime")}</Text><Text style={styles.time}>{view.allDay ? locale.t("schedule.allDay") : view.startTime}</Text></View><Text style={styles.hint}>→</Text><View><Text style={styles.hint}>{locale.t("schedule.fieldEndTime")}</Text><Text style={styles.time}>{view.allDay ? locale.t("schedule.allDay") : view.endTime ?? "—"}</Text></View></View>
      <Text style={styles.hint}>{[view.date, view.endDate && view.endDate !== view.date ? view.endDate : null, view.durationMinutes !== null ? locale.t("home.durationMinutes", { count: view.durationMinutes }) : locale.t("personal53.noEnd"), view.zone].filter(Boolean).join(" · ")}</Text>
      {view.location ? <View style={styles.row}><Text style={styles.hint}>{locale.t("schedule.fieldLocation")}</Text><Text style={styles.body}>{view.location}</Text></View> : null}
      <PersonalScheduleAssociations actorId={actorId} scopeKey={scopeKey} noteIds={view.noteIds} contactIds={view.contactIds} />
      {rules ? <PersonalScheduleRules draft={rules} readOnly /> : null}
      <Text style={styles.hint}>{locale.t("personal60.localOnly")}</Text>
      {view.meetingUrl ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("personal53.join")} onPress={() => { void Linking.openURL(view.meetingUrl!).catch(() => setError(locale.t("schedule.operationFailed"))); }} style={styles.primary}><Text style={styles.primaryText}>{locale.t("personal53.join")}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={editBlocked ? `${locale.t("personal53.reschedule")}，${locale.t("sync.needsNetwork")}` : locale.t("personal53.reschedule")} accessibilityState={{ disabled: editBlocked }} disabled={editBlocked} onPress={() => router.push(`${view.editHref}?focus=time` as Href)} style={[styles.secondary, editBlocked && styles.disabledBox]}><Text style={styles.body}>{locale.t("personal53.reschedule")}</Text></Pressable>
    </> : null}
  </AppScreen>;
}
const useStyles = createThemedStyles(colors => ({
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" as const, marginBottom: 20 }, time: { color: colors.ink, fontSize: 28, fontWeight: "800" as const }, timeCard: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const }, hint: { color: colors.ink3Text, fontSize: 13, lineHeight: 20, marginBottom: 8 }, row: { minHeight: 48, borderBottomWidth: 1, borderColor: colors.line, justifyContent: "center" as const }, body: { color: colors.ink, fontSize: 16 }, action: { minHeight: 44, justifyContent: "center" as const }, link: { color: colors.accentText, fontSize: 16 }, disabled: { color: colors.ink3Text }, disabledBox: { opacity: 0.4 }, error: { color: colors.coralText }, primary: { minHeight: 52, justifyContent: "center" as const, alignItems: "center" as const, backgroundColor: colors.ink, borderRadius: 12, marginTop: 20 }, primaryText: { color: colors.surface, fontSize: 16, fontWeight: "700" as const }, secondary: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 12, alignItems: "center" as const, justifyContent: "center" as const, marginTop: 12 },
  conflict: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 16, marginBottom: 12, backgroundColor: colors.surface2 },
}));
