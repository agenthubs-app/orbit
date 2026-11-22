import * as Crypto from "expo-crypto";
import { type Href, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { OrbitLanguage } from "../../api/contract/language";
import type { ContactInitializationDraft } from "../../api/relationship-initialization";
import { DataCard } from "../../components/DataCard";
import { useOrbitTheme } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { createTranslator, type MessageKey } from "../../i18n/messages";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { createContactInitializationController, type ContactInitializationState } from "../../view-models/relationship-initialization";

export function useContactInitialization(contactId: string, connectionId: string | null | undefined, parentScopeKey: string | undefined, isScopeCurrent: () => boolean, onConfirmed: () => void) {
  const auth = useOrbitAuthSession(), server = useOrbitApiBaseUrl();
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId && contactId) && connectionId !== undefined;
  const scopeKey = JSON.stringify([auth.actorId, auth.cookieHeader, server.baseUrl, contactId, connectionId, parentScopeKey, ready]);
  const client = useOrbitApiClient({ scopeKey });
  const scope = useMemo(() => ({}), [scopeKey]);
  const latest = useRef(scope); latest.current = scope;
  const callbacks = useRef({ isScopeCurrent, onConfirmed }); callbacks.current = { isScopeCurrent, onConfirmed };
  const controller = useMemo(() => createContactInitializationController({ client, actorId: auth.actorId ?? "", contactId, connectionId: connectionId ?? null,
    createId: () => Crypto.randomUUID(), isCurrent: () => ready && latest.current === scope && callbacks.current.isScopeCurrent(),
    onConfirmed: () => { if (latest.current === scope && callbacks.current.isScopeCurrent()) callbacks.current.onConfirmed(); },
  }), [client, scope, ready, auth.actorId, contactId, connectionId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { if (ready) void controller.start(); return () => controller.dispose(); }, [controller, ready]);
  return { controller, state, ready };
}
export type ContactInitializationBinding = ReturnType<typeof useContactInitialization>;

const STAGE_KEYS: Readonly<Record<string, MessageKey>> = {
  active: "contacts.initStageActive", needs_follow_up: "contacts.initStageNeedsFollowUp",
  nurture: "contacts.initStageNurture", archived: "contacts.initStageArchived",
  pending: "contacts.pendingInitTitle", loading: "contacts.initLoading", error: "contacts.initLoadFailed",
};
// Errors raised on the device carry only their code; server errors arrive as "CODE: message" and are shown as sent.
const LOCAL_ERROR_KEYS: Readonly<Record<string, MessageKey>> = {
  INVALID_RESPONSE: "contacts.initErrorInvalidResponse", TIME_ZONE_UNAVAILABLE: "contacts.initErrorTimeZone",
  CHOICE_REQUIRED: "contacts.initErrorChoiceRequired", ARCHIVE_CONFIRMATION_REQUIRED: "contacts.initErrorArchiveConfirm",
  INVALID_INPUT: "contacts.initErrorInvalidInput",
};

export function contactInitializationStageText(stage: string, language: OrbitLanguage): string {
  const key = STAGE_KEYS[stage];
  return key ? createTranslator(language)(key) : stage;
}

export function ContactRelationshipInitializer({ binding }: { binding: ContactInitializationBinding }) {
  const { language } = useOrbitLocale(), { timeZone, canSave } = useOrbitTimeZone();
  const router = useRouter();
  return <ContactInitializationForm state={binding.state} ready={binding.ready} language={language} timeZone={timeZone} canSave={canSave}
    onChange={binding.controller.change} onSave={() => binding.controller.save(timeZone, canSave)} onRefresh={binding.controller.refresh}
    onOpenTask={id => { if (binding.ready) router.push(`/tasks/relationship/${encodeURIComponent(id)}` as Href); }} />;
}

export function ContactInitializationForm({ state, ready, language, timeZone, canSave, onChange, onSave, onRefresh, onOpenTask }: {
  state: ContactInitializationState; ready: boolean; language: OrbitLanguage; timeZone: string; canSave: boolean;
  onChange: (patch: Partial<ContactInitializationDraft>) => void; onSave: () => Promise<void>; onRefresh: () => Promise<void>; onOpenTask: (id: string) => void;
}) {
  const { colors } = useOrbitTheme();
  const t = createTranslator(language);
  if (state.view.kind === "hidden") return null;
  const disabled = state.busy || state.locked || !ready;
  const dated = state.draft.stage === "needs_follow_up" || state.draft.stage === "nurture";
  const fields: ["goal" | "title" | "date" | "time", string, string][] = state.draft.stage === "active" ? [["goal", t("contacts.initGoal"), ""]]
    : dated ? [["title", t("contacts.initNextTitle"), ""], ["date", t("contacts.initNextDate"), "YYYY-MM-DD"], ["time", t("contacts.initNextTime"), "HH:mm"]] : [];
  return <DataCard title={t("contacts.initCardTitle")}>
    <Text style={{ color: colors.ink3Text }}>{t("contacts.initIntro")}</Text>
    {!ready ? <Text accessibilityRole="alert">{t("contacts.initNotReady")}</Text> : null}
    {state.view.kind === "loading" ? <Text>{contactInitializationStageText("loading", language)}</Text> : null}
    {state.error ? <Text accessibilityRole="alert" style={{ color: colors.ink }}>{LOCAL_ERROR_KEYS[state.error] ? t(LOCAL_ERROR_KEYS[state.error]!) : state.error}</Text> : null}
    {state.notice ? <Text accessibilityRole="text">{state.notice === "replayed" ? t("contacts.initReplayed") : t("contacts.initSaved")}</Text> : null}
    {state.view.kind === "pending" ? <View style={{ gap: 12 }}>
      <Text style={{ color: colors.ink }}>{contactInitializationStageText("pending", language)}</Text>
      {(["active", "needs_follow_up", "nurture", "archived"] as const).map(stage => <Pressable key={stage} accessibilityRole="radio" accessibilityLabel={contactInitializationStageText(stage, language)} accessibilityState={{ checked: state.draft.stage === stage, disabled }} disabled={disabled} onPress={() => onChange({ stage })} style={{ paddingVertical: 12 }}>
        <Text style={{ color: state.draft.stage === stage ? colors.accentText : colors.ink }}>{state.draft.stage === stage ? "● " : "○ "}{contactInitializationStageText(stage, language)}</Text>
      </Pressable>)}
      {fields.map(([key, label, placeholder]) => <View key={key} style={{ gap: 6 }}><Text style={{ color: colors.ink2 }}>{label}</Text><TextInput accessibilityLabel={label} value={state.draft[key]} editable={!disabled} onChangeText={value => onChange({ [key]: value })} placeholder={placeholder} placeholderTextColor={colors.ink3Text} maxLength={key === "goal" ? 2000 : key === "title" ? 500 : 16} autoCapitalize="none" style={{ color: colors.ink, borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 12 }} /></View>)}
      {dated ? <Text style={{ color: colors.ink3Text }}>{t("contacts.initTimeZone", { zone: timeZone })}{!canSave ? t("contacts.initTimeZoneUnconfirmed") : ""}</Text> : null}
      {state.draft.stage === "archived" ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: state.draft.archiveConfirmed, disabled }} disabled={disabled} onPress={() => onChange({ archiveConfirmed: !state.draft.archiveConfirmed })}><Text style={{ color: colors.ink, paddingVertical: 12 }}>{state.draft.archiveConfirmed ? "☑ " : "☐ "}{t("contacts.initArchiveConfirm")}</Text></Pressable> : null}
      {state.locked ? <Text style={{ color: colors.ink3Text }}>{t("contacts.initLockedHint")}</Text> : null}
      <Pressable accessibilityRole="button" disabled={!ready || state.busy || !state.draft.stage || (!state.locked && dated && !canSave)} onPress={() => void onSave()} style={{ padding: 14, borderRadius: 10, backgroundColor: colors.accentText, opacity: !ready || state.busy || !state.draft.stage ? 0.5 : 1 }}>
        <Text style={{ color: colors.onAccent }}>{state.busy ? t("contacts.initSaving") : state.locked ? t("contacts.initRetry") : t("contacts.initConfirm")}</Text>
      </Pressable>
    </View> : null}
    {state.view.kind === "initialized" ? <View style={{ gap: 8 }}>
      <Text style={{ color: colors.ink }}>{t("contacts.initCurrentStage", { stage: contactInitializationStageText(state.view.stage, language) })}</Text>
      {state.view.goal ? <Text style={{ color: colors.ink }}>{t("contacts.initCurrentGoal", { goal: state.view.goal })}</Text> : null}
      {state.view.tasks.map(task => <Text key={task.id} style={{ color: colors.ink }}>{task.title} · {new Date(task.dueAt).toLocaleString(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { timeZone })}</Text>)}
      {state.view.tasks.length ? <Pressable accessibilityRole="button" onPress={() => { if (state.view.kind === "initialized") onOpenTask(state.view.connectionId); }}><Text style={{ color: colors.accentText, paddingVertical: 12 }}>{t("contacts.initManageFollowUp")}</Text></Pressable> : null}
    </View> : null}
    <Pressable accessibilityRole="button" disabled={state.busy || !ready} onPress={() => void onRefresh()}><Text style={{ color: colors.accentText, paddingVertical: 12 }}>{t("contacts.initRefresh")}</Text></Pressable>
  </DataCard>;
}
