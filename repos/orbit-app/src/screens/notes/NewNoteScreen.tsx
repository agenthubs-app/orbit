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
  const controller = useRef<AbortController | null>(null);
  const idempotencyKey = useRef(`ios:note:create:${Date.now()}:${++createSequence}`);
  const { styles } = useStyles();
  useEffect(() => () => { mounted.current = false; controller.current?.abort(); }, []);
  useEffect(() => {
    let active = true;
    void noteDraftStorage.load({ accountId: actorId, server: draftServer }).then((stored) => {
      if (!active || !stored) return;
      setTitle(stored.title); setDraft(stored.body); setSelectedIds([...new Set([...stored.manualContactIds, ...(initialContactId ? [initialContactId] : [])])]); setMentions([...stored.mentions]); setEventIds([...stored.eventIds]); setDraftStatus("已恢复草稿");
    });
    return () => { active = false; };
  }, [actorId, draftServer]);
  useEffect(() => {
    if (!title && !draft && selectedIds.length === 0 && mentions.length === 0 && eventIds.length === 0) return;
    const timer = setTimeout(() => {
      setDraftStatus("正在自动保存…");
      void noteDraftStorage.save({ accountId: actorId, server: draftServer }, { title, body: draft, manualContactIds: selectedIds, mentions, eventIds, savedAt: new Date().toISOString() })
        .then(() => { if (mounted.current) setDraftStatus("已自动保存"); })
        .catch(() => { if (mounted.current) setDraftStatus("自动保存失败，请手动保存笔记"); });
    }, 500);
    return () => clearTimeout(timer);
  }, [actorId, draft, draftServer, eventIds, mentions, selectedIds, title]);
  const owns = () => mounted.current && isScopeCurrent();
  const change = (value: string) => { setDraft(value); setError(""); };
  const toggle = (id: string, contact?: ContactSummary) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    if (contact) setSelectedContacts((items) => items.some((item) => item.id === contact.id) ? items : [...items, contact]);
    setError("");
  };
  const searchContacts = useCallback(async (query: string, cursor: string | undefined, signal: AbortSignal) => {
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.contactsSearch, { body: { query, limit: 20, ...(cursor ? { cursor } : {}) }, signal });
    if (!result.success || result.status < 200 || result.status >= 300) throw new Error(result.success ? "搜索暂时不可用，请重试。" : result.error.message);
    const contacts = contactsToSummaries(result.data);
    const nextCursor = typeof result.data === "object" && result.data !== null && !Array.isArray(result.data) && typeof (result.data as Record<string, unknown>).nextCursor === "string"
      ? (result.data as Record<string, unknown>).nextCursor as string
      : undefined;
    return { contacts, ...(nextCursor ? { nextCursor } : {}) };
  }, [client]);

  const draftScope = { accountId: actorId, server: draftServer };
  const initialIds = initialContactId ? [initialContactId] : [];
  const contactsChanged = selectedIds.length !== initialIds.length || selectedIds.some((id) => !initialIds.includes(id));
  const hasChanges = Boolean(title || draft || contactsChanged || mentions.length || eventIds.length);
  async function preserveAndExit() {
    try {
      await noteDraftStorage.save(draftScope, { title, body: draft, manualContactIds: selectedIds, mentions, eventIds, savedAt: new Date().toISOString() });
      if (owns()) router.back();
    } catch {
      if (owns()) { setShowExitPrompt(false); setError("草稿未能保存，请继续编辑或稍后重试。"); }
    }
  }
  async function discardAndExit() {
    await noteDraftStorage.clear(draftScope);
    if (owns()) router.back();
  }

  async function save() {
    if (!owns() || pending) return;
    const request = buildRichNoteCreateRequest({ title, body: draft, manualContactIds: selectedIds, mentions, eventIds }, idempotencyKey.current);
    if (!request.success) { setError(request.error); return; }
    const operation = new AbortController(); controller.current = operation; setPending(true); setError("");
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.notes, { body: request.body, signal: operation.signal });
    if (!owns() || operation.signal.aborted) return;
    const note = result.success && result.status >= 200 && result.status < 300
      ? confirmedNote(result.data, { actorId, title: request.body.title, body: request.body.body, manualContactIds: request.body.manualContactIds, mentions: request.body.mentions, contactIds: [...request.body.manualContactIds, ...request.body.mentions.map((item) => item.contactId)], eventIds: request.body.eventIds }) : null;
    if (note) { await noteDraftStorage.clear(draftScope); router.replace(`/notes/${encodeURIComponent(note.id)}`); }
    else { setError(result.success ? "尚未确认笔记已保存，内容已保留，请重试。" : result.error.message); setPending(false); }
    if (controller.current === operation) controller.current = null;
  }

  const saveDisabled = pending || !title.trim() || !draft.trim();
  return <AppScreen title="新建笔记" headerActions={<View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="取消新建笔记" disabled={pending} onPress={() => hasChanges ? setShowExitPrompt(true) : router.back()} style={styles.cancel}><Text style={styles.cancelText}>取消</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={pending ? "保存中" : "保存笔记"} accessibilityState={{ disabled: saveDisabled }} disabled={saveDisabled} onPress={() => { void save(); }} style={styles.headerSave}><Text style={[styles.headerSaveText, saveDisabled && styles.headerSaveDisabled]}>{pending ? "保存中" : "保存"}</Text></Pressable></View>}>
    {showExitPrompt ? <View accessibilityRole="alert" style={styles.exitPrompt}>
      <Text style={styles.exitTitle}>保留这份草稿吗？</Text><Text style={styles.exitText}>可以保留后退出、放弃草稿，或继续编辑。</Text>
      <View style={styles.exitActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="继续编辑笔记" onPress={() => setShowExitPrompt(false)} style={styles.exitButton}><Text style={styles.cancelText}>继续编辑</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="放弃笔记草稿" onPress={() => { void discardAndExit(); }} style={styles.exitButton}><Text style={styles.destructiveText}>放弃</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="保留笔记草稿并退出" onPress={() => { void preserveAndExit(); }} style={styles.exitPrimary}><Text style={styles.saveText}>保留并退出</Text></Pressable>
      </View>
    </View> : null}
    <View style={styles.paper}>
      <TextInput accessibilityLabel="笔记标题" editable={!pending} maxLength={200} onChangeText={(value) => { setTitle(value); setError(""); }} placeholder="标题" placeholderTextColor={styles.placeholder.color} style={styles.titleInput} value={title} />
      <View style={styles.rule} />
      <NoteMentionEditor body={draft} disabled={pending} mentions={mentions} onChange={(value, nextMentions) => { change(value); setMentions([...nextMentions]); }} search={searchContacts} />
    </View>
    <NoteContactPicker disabled={pending} search={searchContacts} selectedContacts={selectedContacts} selectedIds={selectedIds} onToggle={toggle} />
    <NoteEventPicker disabled={pending} events={events} selectedIds={eventIds} onToggle={(id) => setEventIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])} />
    {draftStatus ? <Text accessibilityLiveRegion="polite" style={draftStatus.startsWith("自动保存失败") ? styles.error : styles.draftStatus}>{draftStatus}</Text> : null}
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
