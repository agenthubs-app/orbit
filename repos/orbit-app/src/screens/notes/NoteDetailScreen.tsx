import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

import { noteContactPath, notePath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { contactsToSummaries } from "../../view-models/contacts";
import { buildNoteUpdateRequest, confirmedNote, noteFromPayload, type NoteView } from "../../view-models/notes";
import { buildNoteSuggestionNavigation, noteSourceTasksFromPayload } from "../../view-models/note-suggestions";
import { NoteContactPicker } from "./NoteContactPicker";

let updateSequence = 0;

export function NoteDetailScreen({ actorId, noteId, scopeKey, isScopeCurrent = () => true }: {
  actorId: string;
  noteId: string;
  scopeKey: string;
  isScopeCurrent?: () => boolean;
}) {
  const router = useRouter();
  const client = useOrbitApiClient({ scopeKey });
  const state = useApiResource<unknown>(notePath(noteId), () => false, { scopeKey, cachePolicy: "network-only" });
  const contactsState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.contacts, () => false, { scopeKey });
  const tasksState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.tasks, () => false, { scopeKey });
  const serverNote = state.kind === "success" || state.kind === "empty" ? noteFromPayload(state.data, actorId, noteId) : null;
  const contacts = contactsState.kind === "success" || contactsState.kind === "empty" ? contactsToSummaries(contactsState.data) : [];
  const sourceTasks = tasksState.kind === "success" || tasksState.kind === "empty" ? noteSourceTasksFromPayload(tasksState.data, actorId, noteId) : [];
  const [confirmed, setConfirmed] = useState<NoteView | null>(null);
  const current = confirmed && (!serverNote || confirmed.version >= serverNote.version) ? confirmed : serverNote;
  const [draft, setDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const mutationKey = useRef(`ios:note:update:${noteId}:${++updateSequence}`);
  const initializedVersion = useRef(0);
  const { styles } = useStyles();
  useEffect(() => () => { mounted.current = false; controller.current?.abort(); }, []);
  useEffect(() => {
    if (!current || dirty || current.version <= initializedVersion.current) return;
    initializedVersion.current = current.version;
    setDraft(current.body);
    setSelectedIds([...current.contactIds]);
  }, [current, dirty]);
  const owns = () => mounted.current && isScopeCurrent();
  const markChanged = () => { setDirty(true); setSaved(false); setError(""); mutationKey.current = `ios:note:update:${noteId}:${++updateSequence}`; };
  const toggle = (id: string) => { setSelectedIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); markChanged(); };

  async function save() {
    if (!owns() || pending || !current) return;
    const request = buildNoteUpdateRequest(draft, selectedIds, current.version, mutationKey.current);
    if (!request.success) { setError(request.error); return; }
    const operation = new AbortController(); controller.current = operation; setPending(true); setError(""); setSaved(false);
    const result = await client.patch<unknown>(notePath(noteId), { body: request.body, signal: operation.signal });
    if (!owns() || operation.signal.aborted) return;
    const note = result.success && result.status >= 200 && result.status < 300
      ? confirmedNote(result.data, { actorId, body: request.body.body, contactIds: request.body.contactIds, noteId }) : null;
    if (note) {
      initializedVersion.current = note.version; setConfirmed(note); setDraft(note.body); setSelectedIds([...note.contactIds]); setDirty(false); setSaved(true); state.refresh();
    } else setError(result.success ? "尚未确认修改已保存，草稿已保留，请重试。" : result.error.message);
    if (owns()) setPending(false);
    if (controller.current === operation) controller.current = null;
  }

  async function unlink(contactId: string) {
    if (!owns() || pending || !current || !current.contactIds.includes(contactId)) return;
    const operation = new AbortController(); controller.current = operation; setPending(true); setError(""); setSaved(false);
    const expectedIds = current.contactIds.filter((id) => id !== contactId);
    const result = await client.delete<unknown>(noteContactPath(noteId, contactId), {
      body: { expectedVersion: current.version, idempotencyKey: `ios:note:unlink:${noteId}:${contactId}:${current.version}` },
      signal: operation.signal,
    });
    if (!owns() || operation.signal.aborted) return;
    const note = result.success && result.status >= 200 && result.status < 300
      ? confirmedNote(result.data, { actorId, body: current.body, contactIds: expectedIds, noteId }) : null;
    if (note) {
      initializedVersion.current = note.version; setConfirmed(note); setSelectedIds((ids) => ids.filter((id) => id !== contactId)); setSaved(true); state.refresh();
    } else setError(result.success ? "尚未确认已解除关联，内容和草稿均已保留。" : result.error.message);
    if (owns()) setPending(false);
    if (controller.current === operation) controller.current = null;
  }

  return <AppScreen title="笔记详情" refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} />}>
    {state.kind === "loading" && !current ? <LoadingState /> : null}
    {state.kind === "failure" || state.kind === "offline" ? <ErrorState message={state.error.message} /> : null}
    {(state.kind === "success" || state.kind === "empty") && !current ? <ErrorState message="笔记不存在或返回内容不完整。" /> : null}
    {current ? <>
      <Text style={styles.private}>仅自己可见 · 版本 {current.version}</Text>
      <TextInput accessibilityLabel="笔记内容" editable={!pending} multiline value={draft} onChangeText={(value) => { setDraft(value); markChanged(); }} style={styles.input} textAlignVertical="top" />
      <NoteContactPicker contacts={contacts} disabled={pending} selectedIds={selectedIds} onToggle={toggle} />
      {current.contactIds.length ? <View style={styles.links}>
        <Text style={styles.label}>当前关联</Text>
        {current.contactIds.map((contactId) => <View key={contactId} style={styles.linkRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={`打开关联人脉 ${contactId}`} onPress={() => router.push(`/contacts/${encodeURIComponent(contactId)}`)} style={styles.contactLink}>
            <Text style={styles.contactLinkText}>{contacts.find((item) => item.id === contactId)?.name ?? contactId}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`解除关联 ${contactId}`} disabled={pending} onPress={() => { void unlink(contactId); }} style={styles.unlink}>
            <Text style={styles.unlinkText}>解除关联</Text>
          </Pressable>
        </View>)}
      </View> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {saved ? <Text accessibilityLiveRegion="polite" style={styles.notice}>笔记已更新。</Text> : null}
      {sourceTasks.length ? <View style={styles.links}>
        <Text style={styles.label}>由这篇笔记创建的待办</Text>
        {sourceTasks.map((task) => <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`打开来源待办 ${task.title}`} onPress={() => router.push(`/tasks/${encodeURIComponent(task.id)}`)} style={styles.contactLink}>
          <Text style={styles.contactLinkText}>{task.title} · 笔记版本 {task.sourceNoteVersion}</Text>
        </Pressable>)}
      </View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="从这篇笔记整理待办" disabled={pending || dirty} onPress={() => router.push(buildNoteSuggestionNavigation(current))} style={[styles.suggest, (pending || dirty) && styles.disabled]}>
        <Text style={styles.suggestText}>从这篇笔记整理待办</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={pending ? "保存中" : "保存修改"} accessibilityState={{ disabled: pending || !dirty || !draft.trim() }} disabled={pending || !dirty || !draft.trim()} onPress={() => { void save(); }} style={[styles.save, (pending || !dirty || !draft.trim()) && styles.disabled]}>
        <Text style={styles.saveText}>{pending ? "保存中" : "保存修改"}</Text>
      </Pressable>
    </> : null}
  </AppScreen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  private: { color: colors.text3, fontSize: typography.caption, lineHeight: 18 },
  input: { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.ink, fontSize: typography.body, lineHeight: 24, minHeight: 180, padding: spacing.lg },
  links: { gap: spacing.sm },
  label: { color: colors.ink, fontSize: typography.body, fontWeight: "700" },
  linkRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.sm, minHeight: 48 },
  contactLink: { flex: 1, minHeight: 44, justifyContent: "center" },
  contactLinkText: { color: colors.accent, fontSize: typography.body },
  unlink: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  unlinkText: { color: colors.rose, fontSize: typography.small, fontWeight: "600" },
  error: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
  notice: { color: colors.text3, fontSize: typography.small, lineHeight: 20 },
  save: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.md, justifyContent: "center", minHeight: 48, paddingHorizontal: spacing.lg },
  saveText: { color: colors.onAccent, fontSize: typography.body, fontWeight: "700" },
  suggest: { alignItems: "center", borderColor: colors.accent, borderRadius: radius.md, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: spacing.lg },
  suggestText: { color: colors.accent, fontSize: typography.body, fontWeight: "700" },
  disabled: { opacity: 0.45 },
}));
