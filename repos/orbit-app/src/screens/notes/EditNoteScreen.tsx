import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

import { notePath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import type { NoteMentionContract } from "../../api/contract/notes";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { noteDraftStorage } from "../../storage/note-draft-storage";
import { contactsToSummaries, type ContactSummary } from "../../view-models/contacts";
import { eventsToSummaries } from "../../view-models/events";
import { buildRichNoteUpdateRequest, confirmedNote, noteFromPayload, type NoteView } from "../../view-models/notes";
import { NoteContactPicker } from "./NoteContactPicker";
import { NoteMentionEditor } from "./NoteMentionEditor";
import { NoteEventPicker } from "./NoteEventPicker";
import { useNoteContactSummaries } from "./useNoteContactSummaries";

let updateSequence = 0;

export function EditNoteScreen({ actorId, draftServer = "local", noteId, scopeKey, isScopeCurrent = () => true }: {
  actorId: string;
  draftServer?: string;
  noteId: string;
  scopeKey: string;
  isScopeCurrent?: () => boolean;
}) {
  const router = useRouter();
  const locale = useOrbitLocale();
  const client = useOrbitApiClient({ scopeKey });
  const state = useApiResource<unknown>(notePath(noteId), () => false, { scopeKey, cachePolicy: "network-only" });
  const eventsState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.events, () => false, { scopeKey });
  const events = eventsState.kind === "success" || eventsState.kind === "empty" ? eventsToSummaries(eventsState.data) : [];
  const serverNote = state.kind === "success" || state.kind === "empty" ? noteFromPayload(state.data, actorId, noteId, locale.language) : null;
  const [confirmed, setConfirmed] = useState<NoteView | null>(null);
  const current = confirmed && (!serverNote || confirmed.version >= serverNote.version) ? confirmed : serverNote;
  const contactSummaries = useNoteContactSummaries(current?.manualContactIds ?? [], scopeKey);
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<NoteMentionContract[]>([]);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<ContactSummary[]>([]);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const mounted = useRef(true);
  const autosaveAllowed = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const mutationKey = useRef(`ios:note:update:${noteId}:${++updateSequence}`);
  const initializedVersion = useRef(0);
  const restored = useRef(false);
  const { styles } = useStyles();
  useEffect(() => () => { mounted.current = false; controller.current?.abort(); }, []);
  useEffect(() => {
    if (!current || dirty || current.version <= initializedVersion.current) return;
    initializedVersion.current = current.version;
    setTitle(current.title);
    setDraft(current.body);
    setMentions([...current.mentions]);
    setEventIds([...current.eventIds]);
    setSelectedIds([...current.manualContactIds]);
  }, [current, dirty]);
  useEffect(() => {
    setSelectedContacts(selectedIds.flatMap((id) => {
      const contact = contactSummaries.get(id);
      return contact ? [contact] : [];
    }));
  }, [contactSummaries, selectedIds]);
  useEffect(() => {
    if (!current || restored.current) return;
    restored.current = true;
    const requestedMutationKey = mutationKey.current;
    void noteDraftStorage.load({ accountId: actorId, server: draftServer, noteId }).then((stored) => {
      if (!stored || !mounted.current || !autosaveAllowed.current || !isScopeCurrent() || mutationKey.current !== requestedMutationKey) return;
      setTitle(stored.title); setDraft(stored.body); setSelectedIds([...stored.manualContactIds]); setMentions([...stored.mentions]); setEventIds([...stored.eventIds]); setDirty(true); setDraftStatus(locale.t("notes.restoredDraft"));
    });
  }, [actorId, current, draftServer, locale, noteId]);
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      if (!autosaveAllowed.current || !mounted.current || !isScopeCurrent()) return;
      setDraftStatus(locale.t("notes.autosaving"));
      void noteDraftStorage.save({ accountId: actorId, server: draftServer, noteId }, { title, body: draft, manualContactIds: selectedIds, mentions, eventIds, savedAt: new Date().toISOString() })
        .then(() => { if (mounted.current) setDraftStatus(locale.t("notes.autosaved")); })
        .catch(() => { if (mounted.current) setDraftStatus(locale.t("notes.autosaveFailed")); });
    }, 500);
    return () => clearTimeout(timer);
  }, [actorId, dirty, draft, draftServer, eventIds, locale, mentions, noteId, selectedIds, title]);
  const owns = () => mounted.current && isScopeCurrent();
  const markChanged = () => { autosaveAllowed.current = true; setDirty(true); setSaved(false); setError(""); mutationKey.current = `ios:note:update:${noteId}:${++updateSequence}`; };
  const toggle = (id: string, contact?: ContactSummary) => {
    setSelectedIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
    if (contact) setSelectedContacts((items) => items.some((item) => item.id === contact.id) ? items : [...items, contact]);
    markChanged();
  };
  const searchContacts = useCallback(async (query: string, cursor: string | undefined, signal: AbortSignal) => {
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.contactsSearch, { body: { query, limit: 20, ...(cursor ? { cursor } : {}) }, signal });
    if (!result.success || result.status < 200 || result.status >= 300) throw new Error(result.success ? locale.t("notes.searchUnavailable") : result.error.message);
    const contacts = contactsToSummaries(result.data);
    const nextCursor = typeof result.data === "object" && result.data !== null && !Array.isArray(result.data) && typeof (result.data as Record<string, unknown>).nextCursor === "string" ? (result.data as Record<string, unknown>).nextCursor as string : undefined;
    return { contacts, ...(nextCursor ? { nextCursor } : {}) };
  }, [client, locale]);

  const draftScope = { accountId: actorId, server: draftServer, noteId };
  async function preserveAndExit() {
    try {
      await noteDraftStorage.save(draftScope, { title, body: draft, manualContactIds: selectedIds, mentions, eventIds, savedAt: new Date().toISOString() });
      if (owns()) { autosaveAllowed.current = false; router.back(); }
    } catch {
      if (owns()) { setShowExitPrompt(false); setError(locale.t("notes.draftSaveFailed")); }
    }
  }
  async function discardAndExit() {
    autosaveAllowed.current = false;
    try {
      await noteDraftStorage.clear(draftScope);
      if (owns()) router.back();
    } catch {
      autosaveAllowed.current = true;
      if (owns()) { setShowExitPrompt(false); setError(locale.t("notes.draftSaveFailed")); }
    }
  }

  async function save() {
    if (!owns() || pending || !current) return;
    const request = buildRichNoteUpdateRequest({ title, body: draft, manualContactIds: selectedIds, mentions, eventIds }, current.version, mutationKey.current, locale.language);
    if (!request.success) { setError(request.error); return; }
    const operation = new AbortController(); controller.current = operation; setPending(true); setError(""); setSaved(false);
    const result = await client.patch<unknown>(notePath(noteId), { body: request.body, signal: operation.signal });
    if (!owns() || operation.signal.aborted) return;
    const note = result.success && result.status >= 200 && result.status < 300
      ? confirmedNote(result.data, { actorId, title: request.body.title, body: request.body.body, manualContactIds: request.body.manualContactIds, mentions: request.body.mentions, contactIds: [...request.body.manualContactIds, ...request.body.mentions.map((item) => item.contactId)], eventIds: request.body.eventIds, noteId }, locale.language) : null;
    if (note) {
      autosaveAllowed.current = false;
      await noteDraftStorage.clear(draftScope);
      if (!owns()) return;
      initializedVersion.current = note.version; setConfirmed(note); setTitle(note.title); setDraft(note.body); setMentions([...note.mentions]); setSelectedIds([...note.manualContactIds]); setEventIds([...note.eventIds]); setDirty(false); setDraftStatus(""); setSaved(true); state.refresh();
    } else setError(result.success ? locale.t("notes.updateUnconfirmed") : result.error.message);
    if (owns()) setPending(false);
    if (controller.current === operation) controller.current = null;
  }

  const saveDisabled = pending || !dirty || !title.trim() || !draft.trim();
  return <AppScreen title={locale.t("notes.edit")} onBack={() => { if (!pending && owns()) dirty ? setShowExitPrompt(true) : router.back(); }} backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("notes.title") })} backLabel={locale.t("notes.title")} refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} />} headerActions={<View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.cancelEdit")} disabled={pending} onPress={() => dirty ? setShowExitPrompt(true) : router.back()} style={styles.cancel}><Text style={styles.cancelText}>{locale.t("common.cancel")}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={locale.t(pending ? "notes.saving" : "notes.saveChanges")} accessibilityState={{ disabled: saveDisabled }} disabled={saveDisabled} onPress={() => { void save(); }} style={styles.cancel}><Text style={[styles.headerSaveText, saveDisabled && styles.headerSaveDisabled]}>{locale.t(pending ? "notes.saving" : "notes.save")}</Text></Pressable></View>}>
    {showExitPrompt ? <View accessibilityRole="alert" style={styles.exitPrompt}>
      <Text style={styles.exitTitle}>{locale.t("notes.keepChangesTitle")}</Text><Text style={styles.notice}>{locale.t("notes.keepDraftBody")}</Text>
      <View style={styles.exitActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.continueEditing")} onPress={() => setShowExitPrompt(false)} style={styles.exitButton}><Text style={styles.cancelText}>{locale.t("notes.continueEditing")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.discard")} onPress={() => { void discardAndExit(); }} style={styles.exitButton}><Text style={styles.destructiveText}>{locale.t("notes.discard")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.keepAndExit")} onPress={() => { void preserveAndExit(); }} style={styles.exitPrimary}><Text style={styles.saveText}>{locale.t("notes.keepAndExit")}</Text></Pressable>
      </View>
    </View> : null}
    {state.kind === "loading" && !current ? <LoadingState /> : null}
    {state.kind === "failure" || state.kind === "offline" ? <ErrorState message={state.error.message} /> : null}
    {(state.kind === "success" || state.kind === "empty") && !current ? <ErrorState message={locale.t("notes.missing")} /> : null}
    {current ? <>
      <Text style={styles.private}>{locale.t("notes.privateVersion", { version: current.version })}</Text>
      <View style={styles.paper}>
        <TextInput accessibilityLabel={locale.t("notes.noteTitle")} editable={!pending} maxLength={200} value={title} onChangeText={(value) => { setTitle(value); markChanged(); }} style={styles.titleInput} />
        <View style={styles.rule} />
        <NoteMentionEditor body={draft} disabled={pending} mentions={mentions} onChange={(value, nextMentions) => { setDraft(value); setMentions([...nextMentions]); markChanged(); }} search={searchContacts} />
      </View>
      <NoteContactPicker disabled={pending} search={searchContacts} selectedContacts={selectedContacts} selectedIds={selectedIds} onToggle={toggle} />
      <NoteEventPicker disabled={pending} events={events} selectedIds={eventIds} onToggle={(id) => { setEventIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); markChanged(); }} />
      {draftStatus ? <Text accessibilityLiveRegion="polite" style={draftStatus === locale.t("notes.autosaveFailed") ? styles.error : styles.notice}>{draftStatus}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {saved ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{locale.t("notes.updated")}</Text> : null}
    </> : null}
  </AppScreen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  private: { color: colors.text3, fontSize: typography.caption, lineHeight: 18 },
  paper: { minHeight: 420, paddingHorizontal: 2 },
  titleInput: { color: colors.ink, fontSize: 30, fontWeight: "900", minHeight: 72, paddingVertical: spacing.md },
  rule: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth },
  links: { gap: spacing.sm },
  label: { color: colors.ink, fontSize: typography.body, fontWeight: "700" },
  linkRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.sm, minHeight: 48 },
  contactLink: { flex: 1, minHeight: 44, justifyContent: "center" },
  contactLinkText: { color: colors.accent, fontSize: typography.body },
  unlink: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  unlinkText: { color: colors.rose, fontSize: typography.small, fontWeight: "600" },
  error: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
  notice: { color: colors.text3, fontSize: typography.small, lineHeight: 20 },
  saveText: { color: colors.onAccent, fontSize: typography.body, fontWeight: "700" },
  headerActions: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  headerSaveText: { color: colors.accent, fontSize: typography.body, fontWeight: "800" },
  headerSaveDisabled: { color: colors.text4 },
  cancel: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 },
  cancelText: { color: colors.accent, fontSize: typography.body },
  destructiveText: { color: colors.rose, fontSize: typography.small, fontWeight: "700" },
  exitPrompt: { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  exitTitle: { color: colors.ink, fontSize: typography.body, fontWeight: "800" },
  exitActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "flex-end" },
  exitButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md },
  exitPrimary: { backgroundColor: colors.accent, borderRadius: radius.sm, minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md },
}));
