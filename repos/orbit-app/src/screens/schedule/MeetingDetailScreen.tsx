import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { MeetingDetailsContract } from "../../api/contract/appointments";
import { meetingDetailsPath, meetingDetailsReceipt, readMeetingDetails } from "../../api/meeting-details";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { LoadingState } from "../../components/LoadingState";
import { createControlStyles } from "../../design/controls";
import { radius, spacing, textStyles } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { meetingDetailsToView } from "../../view-models/meeting-details";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function MeetingDetailScreen() {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const appointmentId = firstParam(params.id);
  const actorId = auth.actorId ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && !!actorId && !!appointmentId;
  const scopeKey = JSON.stringify([actorId, appointmentId, ready, server.baseUrl]);
  return <MeetingDetailEditor appointmentId={appointmentId} ready={ready} scopeKey={scopeKey} />;
}

function MeetingDetailEditor({ appointmentId, ready, scopeKey }: { appointmentId: string; ready: boolean; scopeKey: string }) {
  const locale = useOrbitLocale();
  const router = useRouter();
  const { colors, styles } = useStyles();
  const client = useOrbitApiClient({ scopeKey });
  const requestScope = useMemo(() => ({ active: true, busy: false, controller: new AbortController(), keys: new Map<string, string>() }), [client]);
  const currentScope = useRef(requestScope);
  currentScope.current = requestScope;
  const [baseline, setBaseline] = useState<MeetingDetailsContract | null>(null);
  const [latest, setLatest] = useState<MeetingDetailsContract | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const dirty = !!baseline && draft !== baseline.details;
  const stale = !!baseline && !!latest && baseline.version !== latest.version;
  const stateRef = useRef({ baseline, dirty });
  stateRef.current = { baseline, dirty };

  useEffect(() => {
    requestScope.active = true;
    if (requestScope.controller.signal.aborted) requestScope.controller = new AbortController();
    return () => { requestScope.active = false; requestScope.controller.abort(); };
  }, [requestScope]);

  useEffect(() => {
    if (!ready) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    void client.get<unknown>(meetingDetailsPath(appointmentId), { signal: requestScope.controller.signal }).then((result) => {
      if (!active || !requestScope.active || currentScope.current !== requestScope) return;
      const value = result.success ? readMeetingDetails(result.data) : null;
      if (!value || value.appointmentId !== appointmentId) {
        setError(result.success ? locale.t("meetingDetails.readUnconfirmed") : result.error.message);
        return;
      }
      setLatest(value);
      setError("");
      if (!stateRef.current.baseline || !stateRef.current.dirty) {
        setBaseline(value);
        setDraft(value.details);
      }
    }).catch(() => {
      if (active && requestScope.active) setError(locale.t("meetingDetails.readFailed"));
    }).finally(() => {
      if (active && requestScope.active) setLoading(false);
    });
    return () => { active = false; };
  }, [appointmentId, client, locale, ready, requestScope, revision]);

  const loadLatest = () => {
    if (!latest) return;
    setBaseline(latest);
    setDraft(latest.details);
    setError("");
    setMessage("");
  };

  const cancelEditing = () => {
    setDraft(baseline?.details ?? "");
    setEditing(false);
    setError("");
    setMessage("");
  };

  async function save() {
    if (!ready || !baseline || stale || requestScope.busy || !requestScope.active || currentScope.current !== requestScope || !dirty) return;
    const body = { details: draft, expectedVersion: baseline.version };
    const path = meetingDetailsPath(appointmentId, true);
    const fingerprint = JSON.stringify([path, body]);
    const key = requestScope.keys.get(fingerprint) ?? `ios:meeting-details:${Crypto.randomUUID()}`;
    requestScope.keys.set(fingerprint, key);
    requestScope.busy = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await client.patch<unknown>(path, {
        body,
        headers: { "Idempotency-Key": key },
        signal: requestScope.controller.signal,
      });
      if (!requestScope.active || currentScope.current !== requestScope) return;
      if (!result.success) {
        setError(result.status === 409 ? locale.t("meetingDetails.conflict") : locale.t("meetingDetails.operationFailed"));
        return;
      }
      const receipt = meetingDetailsReceipt(result.data, appointmentId, draft, baseline.version);
      if (result.status < 200 || result.status >= 300 || !receipt) {
        setError(locale.t("meetingDetails.saveUnconfirmed"));
        return;
      }
      requestScope.keys.delete(fingerprint);
      setBaseline(receipt);
      setLatest(receipt);
      setDraft(receipt.details);
      setEditing(false);
      setMessage(locale.t("meetingDetails.saved"));
    } catch {
      if (requestScope.active && currentScope.current === requestScope) setError(locale.t("meetingDetails.operationFailed"));
    } finally {
      requestScope.busy = false;
      if (requestScope.active && currentScope.current === requestScope) setSaving(false);
    }
  }

  const view = baseline ? meetingDetailsToView(baseline, locale.language) : null;
  return (
    <AppScreen
      backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("schedule.title") })}
      backLabel={locale.t("schedule.title")}
      eyebrow={locale.t("meetingDetails.eyebrow")}
      refreshControl={<RefreshControl onRefresh={() => setRevision(value => value + 1)} refreshing={loading} tintColor={colors.accent} />}
      title={locale.t("meetingDetails.title")}
    >
      {loading && !baseline ? <LoadingState /> : null}
      {baseline && view ? (
        <>
          <DataCard detail={view.statusLabel} title={locale.t("meetingDetails.info")}>
            <View style={styles.infoRow}><Ionicons color={colors.accent} name="time-outline" size={19} /><Text style={styles.body}>{view.timeLabel}</Text></View>
            <View style={styles.infoRow}><Ionicons color={colors.text3} name="location-outline" size={19} /><Text style={styles.body}>{view.mediumLabel}</Text></View>
          </DataCard>

          {view.proposalNote ? <DataCard title={locale.t("meetingDetails.proposal")}><Text style={styles.body}>{view.proposalNote}</Text></DataCard> : null}

          <DataCard detail={locale.t("meetingDetails.sharedHint")} title={locale.t("meetingDetails.details")}>
            {editing ? (
              <>
                <TextInput
                  accessibilityLabel={locale.t("meetingDetails.inputLabel")}
                  editable={!saving}
                  maxLength={5_000}
                  multiline
                  onChangeText={setDraft}
                  placeholder={locale.t("meetingDetails.placeholder")}
                  placeholderTextColor={colors.text4}
                  style={styles.input}
                  textAlignVertical="top"
                  value={draft}
                />
                {view.updatedLabel ? <Text style={styles.meta}>{view.updatedLabel}</Text> : null}
                {stale ? (
                  <View style={styles.notice}>
                    <Text accessibilityRole="alert" style={styles.error}>{locale.t("meetingDetails.conflict")}</Text>
                    <Pressable accessibilityRole="button" onPress={loadLatest} style={styles.secondaryButton}><Text style={styles.secondaryText}>{locale.t("meetingDetails.useLatest")}</Text></Pressable>
                  </View>
                ) : null}
                {!stale && error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
                <Pressable accessibilityRole="button" disabled={saving || stale || !dirty} onPress={() => void save()} style={({ pressed }) => [styles.primaryButton, (saving || stale || !dirty) ? styles.disabled : null, pressed ? styles.pressed : null]}>
                  <Text style={styles.primaryText}>{locale.t(saving ? "meetingDetails.saving" : "meetingDetails.save")}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={saving} onPress={cancelEditing} style={styles.secondaryButton}><Text style={styles.secondaryText}>{locale.t("meetingDetails.cancel")}</Text></Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.body, !baseline.details ? styles.empty : null]}>{baseline.details || locale.t("meetingDetails.empty")}</Text>
                {view.updatedLabel ? <Text style={styles.meta}>{view.updatedLabel}</Text> : null}
                <Pressable accessibilityRole="button" onPress={() => { setEditing(true); setError(""); setMessage(""); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>{locale.t("meetingDetails.edit")}</Text></Pressable>
              </>
            )}
          </DataCard>

          {view.contactHref || view.eventHref ? (
            <View style={styles.links}>
              {view.contactHref ? <DetailLink label={locale.t("meetingDetails.openContact")} onPress={() => router.push(view.contactHref as Href)} /> : null}
              {view.eventHref ? <DetailLink label={locale.t("meetingDetails.openEvent")} onPress={() => router.push(view.eventHref as Href)} /> : null}
            </View>
          ) : null}
        </>
      ) : null}
      {!stale && error && !editing ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {error ? <Pressable accessibilityRole="button" onPress={() => setRevision(value => value + 1)} style={styles.secondaryButton}><Text style={styles.secondaryText}>{locale.t("meetingDetails.reload")}</Text></Pressable> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text> : null}
    </AppScreen>
  );
}

function DetailLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, styles } = useStyles();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}><Text style={styles.linkText}>{label}</Text><Ionicons color={colors.text3} name="chevron-forward" size={18} /></Pressable>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  body: { ...textStyles.body, color: colors.text, flexShrink: 1 },
  disabled: { opacity: 0.45 },
  empty: { color: colors.text3 },
  error: { ...textStyles.small, color: colors.rose },
  infoRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm },
  input: { ...textStyles.body, borderColor: colors.borderStrong, borderRadius: radius.input, borderWidth: 1, color: colors.text, minHeight: 132, padding: spacing.md },
  link: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 52, paddingVertical: spacing.sm },
  links: { gap: spacing.xs },
  linkText: { ...textStyles.body, color: colors.text },
  meta: { ...textStyles.caption, color: colors.text3 },
  notice: { backgroundColor: colors.roseSoft, borderRadius: radius.md, gap: spacing.sm, padding: spacing.md },
  pressed: { opacity: 0.72 },
  primaryButton: { ...createControlStyles(colors).primaryButton, minHeight: 48 },
  primaryText: { color: colors.onAccent, fontWeight: "700" },
  secondaryButton: { ...createControlStyles(colors).secondaryButton, minHeight: 44 },
  secondaryText: { color: colors.text, fontWeight: "600" },
  success: { ...textStyles.small, color: colors.live },
}));
