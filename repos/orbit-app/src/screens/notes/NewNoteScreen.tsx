import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import type { NoteMentionContract } from "../../api/contract/notes";
import { AppScreen } from "../../components/AppScreen";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { noteDraftStorage } from "../../storage/note-draft-storage";
import { contactsToSummaries, type ContactSummary } from "../../view-models/contacts";
import { eventsToSummaries } from "../../view-models/events";
import { buildRichNoteCreateRequest, confirmedNote } from "../../view-models/notes";
import { NoteContactPicker } from "./NoteContactPicker";
import { NoteMentionEditor } from "./NoteMentionEditor";
import { NoteEventPicker } from "./NoteEventPicker";

let createSequence = 0;

export function NewNoteScreen({ actorId, draftServer = "local", scopeKey, isScopeCurrent = () => true }: { actorId: string; draftServer?: string; scopeKey: string; isScopeCurrent?: () => boolean }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string | string[] }>();
  const initialContactId = (Array.isArray(params.contactId) ? params.contactId[0] : params.contactId)?.trim();
  const client = useOrbitApiClient({ scopeKey });
  const locale = useOrbitLocale();
  const eventsState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.events, () => false, { scopeKey });
  const events = eventsState.kind === "success" || eventsState.kind === "empty" ? eventsToSummaries(eventsState.data) : [];
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<NoteMentionContract[]>([]);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialContactId ? [initialContactId] : []);
  const [selectedContacts, setSelectedContacts] = useState<ContactSummary[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const mounted = useRef(true);
  const exitToHistory = useRef(false);
  const autosaveAllowed = useRef(true);
  const draftValue = JSON.stringify([title, draft, selectedIds, mentions, eventIds]);
  const latestDraft = useRef({ value: draftValue, revision: 0 });
  if (latestDraft.current.value !== draftValue) latestDraft.current = { value: draftValue, revision: latestDraft.current.revision + 1 };
  const controller = useRef<AbortController | null>(null);
  const idempotencyKey = useRef(`ios:note:create:${Date.now()}:${++createSequence}`);
  const { styles } = useStyles();
  useEffect(() => () => { mounted.current = false; controller.current?.abort(); }, []);
  useEffect(() => {
    let active = true;
    const requestedDraft = latestDraft.current.revision;
    void noteDraftStorage.load({ accountId: actorId, server: draftServer }).then((stored) => {
      if (!active || !stored || !autosaveAllowed.current || !isScopeCurrent() || latestDraft.current.revision !== requestedDraft) return;
      setTitle(stored.title); setDraft(stored.body); setSelectedIds([...new Set([...stored.manualContactIds, ...(initialContactId ? [initialContactId] : [])])]); setMentions([...stored.mentions]); setEventIds([...stored.eventIds]); setDraftStatus(locale.t("notes.restoredDraft"));
    });
    return () => { active = false; };
  }, [actorId, draftServer, initialContactId, locale]);
  useEffect(() => {
    if (!title && !draft && selectedIds.length === 0 && mentions.length === 0 && eventIds.length === 0) return;
    const timer = setTimeout(() => {
      if (!autosaveAllowed.current || !mounted.current || !isScopeCurrent()) return;
      setDraftStatus(locale.t("notes.autosaving"));
      void noteDraftStorage.save({ accountId: actorId, server: draftServer }, { title, body: draft, manualContactIds: selectedIds, mentions, eventIds, savedAt: new Date().toISOString() })
        .then(() => { if (mounted.current) setDraftStatus(locale.t("notes.autosaved")); })
        .catch(() => { if (mounted.current) setDraftStatus(locale.t("notes.autosaveFailed")); });
    }, 500);
    return () => clearTimeout(timer);
  }, [actorId, draft, draftServer, eventIds, locale, mentions, selectedIds, title]);
  const owns = () => mounted.current && isScopeCurrent();
  const change = (value: string) => { setDraft(value); setError(""); };
  const toggle = (id: string, contact?: ContactSummary) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    if (contact) setSelectedContacts((items) => items.some((item) => item.id === contact.id) ? items : [...items, contact]);
    setError("");
  };
  const searchContacts = useCallback(async (query: string, cursor: string | undefined, signal: AbortSignal) => {
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.contactsSearch, { body: { query, limit: 20, ...(cursor ? { cursor } : {}) }, signal });
    if (!result.success || result.status < 200 || result.status >= 300) throw new Error(result.success ? locale.t("notes.searchUnavailable") : result.error.message);
    const contacts = contactsToSummaries(result.data);
    const nextCursor = typeof result.data === "object" && result.data !== null && !Array.isArray(result.data) && typeof (result.data as Record<string, unknown>).nextCursor === "string"
      ? (result.data as Record<string, unknown>).nextCursor as string
      : undefined;
    return { contacts, ...(nextCursor ? { nextCursor } : {}) };
  }, [client, locale]);

  const draftScope = { accountId: actorId, server: draftServer };
  const initialIds = initialContactId ? [initialContactId] : [];
  const contactsChanged = selectedIds.length !== initialIds.length || selectedIds.some((id) => !initialIds.includes(id));
  const hasChanges = Boolean(title || draft || contactsChanged || mentions.length || eventIds.length);
  async function preserveAndExit() {
    try {
      await noteDraftStorage.save(draftScope, { title, body: draft, manualContactIds: selectedIds, mentions, eventIds, savedAt: new Date().toISOString() });
      if (owns()) { autosaveAllowed.current = false; exitToHistory.current ? router.replace("/notes") : router.back(); }
    } catch {
      if (owns()) { setShowExitPrompt(false); setError(locale.t("notes.draftSaveFailed")); }
    }
  }
  async function discardAndExit() {
    autosaveAllowed.current = false;
    try {
      await noteDraftStorage.clear(draftScope);
      if (owns()) exitToHistory.current ? router.replace("/notes") : router.back();
    } catch {
      autosaveAllowed.current = true;
      if (owns()) { setShowExitPrompt(false); setError(locale.t("notes.draftSaveFailed")); }
    }
  }

  async function save() {
    if (!owns() || pending) return;
    const request = buildRichNoteCreateRequest({ title, body: draft, manualContactIds: selectedIds, mentions, eventIds }, idempotencyKey.current, locale.language);
    if (!request.success) { setError(request.error); return; }
    const operation = new AbortController(); controller.current = operation; setPending(true); setError("");
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.notes, { body: request.body, signal: operation.signal });
    if (!owns() || operation.signal.aborted) return;
    const note = result.success && result.status >= 200 && result.status < 300
      ? confirmedNote(result.data, { actorId, title: request.body.title, body: request.body.body, manualContactIds: request.body.manualContactIds, mentions: request.body.mentions, contactIds: [...request.body.manualContactIds, ...request.body.mentions.map((item) => item.contactId)], eventIds: request.body.eventIds }, locale.language) : null;
    if (note) { autosaveAllowed.current = false; await noteDraftStorage.clear(draftScope); if (owns()) router.replace(`/notes/${encodeURIComponent(note.id)}`); }
    else { setError(result.success ? locale.t("notes.createUnconfirmed") : result.error.message); setPending(false); }
    if (controller.current === operation) controller.current = null;
  }

  const saveDisabled = pending || !title.trim() || !draft.trim();
  return <AppScreen title={locale.t("notes.new")} onBack={() => { if (!pending && owns()) hasChanges ? setShowExitPrompt(true) : router.back(); }} backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("notes.title") })} backLabel={locale.t("notes.title")} headerActions={<View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.cancelNew")} disabled={pending} onPress={() => hasChanges ? setShowExitPrompt(true) : router.back()} style={styles.cancel}><Text style={styles.cancelText}>{locale.t("common.cancel")}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={locale.t(pending ? "notes.saving" : "notes.saveNote")} accessibilityState={{ disabled: saveDisabled }} disabled={saveDisabled} onPress={() => { void save(); }} style={styles.headerSave}><Text style={[styles.headerSaveText, saveDisabled && styles.headerSaveDisabled]}>{locale.t(pending ? "notes.saving" : "notes.save")}</Text></Pressable></View>}>
    {showExitPrompt ? <View accessibilityRole="alert" style={styles.exitPrompt}>
      <Text style={styles.exitTitle}>{locale.t("notes.keepDraftTitle")}</Text><Text style={styles.exitText}>{locale.t("notes.keepDraftBody")}</Text>
      <View style={styles.exitActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.continueEditing")} onPress={() => { exitToHistory.current = false; setShowExitPrompt(false); }} style={styles.exitButton}><Text style={styles.cancelText}>{locale.t("notes.continueEditing")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.discard")} onPress={() => { void discardAndExit(); }} style={styles.exitButton}><Text style={styles.destructiveText}>{locale.t("notes.discard")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.keepAndExit")} onPress={() => { void preserveAndExit(); }} style={styles.exitPrimary}><Text style={styles.saveText}>{locale.t("notes.keepAndExit")}</Text></Pressable>
      </View>
    </View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.viewHistory")} disabled={pending} onPress={() => { if (!owns()) return; exitToHistory.current = true; hasChanges ? setShowExitPrompt(true) : router.replace("/notes"); }} style={styles.cancel}><Text style={styles.cancelText}>{locale.t("notes.viewHistory")}</Text></Pressable>
    <View style={styles.paper}>
      <TextInput accessibilityLabel={locale.t("notes.noteTitle")} editable={!pending} maxLength={200} onChangeText={(value) => { setTitle(value); setError(""); }} placeholder={locale.t("notes.noteTitle")} placeholderTextColor={styles.placeholder.color} style={styles.titleInput} value={title} />
      <View style={styles.rule} />
      <NoteMentionEditor body={draft} disabled={pending} mentions={mentions} onChange={(value, nextMentions) => { change(value); setMentions([...nextMentions]); }} search={searchContacts} />
    </View>
    <NoteContactPicker disabled={pending} search={searchContacts} selectedContacts={selectedContacts} selectedIds={selectedIds} onToggle={toggle} />
    <NoteEventPicker disabled={pending} events={events} selectedIds={eventIds} onToggle={(id) => setEventIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])} />
    {draftStatus ? <Text accessibilityLiveRegion="polite" style={draftStatus === locale.t("notes.autosaveFailed") ? styles.error : styles.draftStatus}>{draftStatus}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </AppScreen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  cancel: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.accent, fontSize: typography.body },
  headerActions: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  headerSave: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 },
  headerSaveText: { color: colors.accent, fontSize: typography.body, fontWeight: "800" },
  headerSaveDisabled: { color: colors.text4 },
  paper: { minHeight: 420, paddingHorizontal: 2 },
  titleInput: { color: colors.ink, fontSize: 30, fontWeight: "900", minHeight: 72, paddingVertical: spacing.md },
  rule: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth },
  placeholder: { color: colors.text4 },
  error: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
  draftStatus: { color: colors.text3, fontSize: typography.caption, lineHeight: 18, textAlign: "right" },
  saveText: { color: colors.onAccent, fontSize: typography.body, fontWeight: "700" },
  exitPrompt: { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  exitTitle: { color: colors.ink, fontSize: typography.body, fontWeight: "800" },
  exitText: { color: colors.text3, fontSize: typography.small, lineHeight: 20 },
  exitActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "flex-end" },
  exitButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md },
  exitPrimary: { backgroundColor: colors.accent, borderRadius: radius.sm, minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md },
  destructiveText: { color: colors.rose, fontSize: typography.small, fontWeight: "700" },
}));
