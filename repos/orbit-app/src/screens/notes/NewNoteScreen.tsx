import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput } from "react-native";

import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { contactsToSummaries } from "../../view-models/contacts";
import { buildNoteCreateRequest, confirmedNote } from "../../view-models/notes";
import { NoteContactPicker } from "./NoteContactPicker";

let createSequence = 0;

export function NewNoteScreen({ actorId, scopeKey, isScopeCurrent = () => true }: { actorId: string; scopeKey: string; isScopeCurrent?: () => boolean }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string | string[] }>();
  const initialContactId = (Array.isArray(params.contactId) ? params.contactId[0] : params.contactId)?.trim();
  const client = useOrbitApiClient({ scopeKey });
  const contactsState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.contacts, () => false, { scopeKey });
  const contacts = contactsState.kind === "success" || contactsState.kind === "empty" ? contactsToSummaries(contactsState.data) : [];
  const [draft, setDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialContactId ? [initialContactId] : []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const idempotencyKey = useRef(`ios:note:create:${Date.now()}:${++createSequence}`);
  const { styles } = useStyles();
  useEffect(() => () => { mounted.current = false; controller.current?.abort(); }, []);
  const owns = () => mounted.current && isScopeCurrent();
  const change = (value: string) => { setDraft(value); setError(""); };
  const toggle = (id: string) => { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); setError(""); };

  async function save() {
    if (!owns() || pending) return;
    const request = buildNoteCreateRequest(draft, selectedIds, idempotencyKey.current);
    if (!request.success) { setError(request.error); return; }
    const operation = new AbortController(); controller.current = operation; setPending(true); setError("");
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.notes, { body: request.body, signal: operation.signal });
    if (!owns() || operation.signal.aborted) return;
    const note = result.success && result.status >= 200 && result.status < 300
      ? confirmedNote(result.data, { actorId, body: request.body.body, contactIds: request.body.contactIds }) : null;
    if (note) router.replace(`/notes/${encodeURIComponent(note.id)}`);
    else { setError(result.success ? "尚未确认笔记已保存，内容已保留，请重试。" : result.error.message); setPending(false); }
    if (controller.current === operation) controller.current = null;
  }

  return <AppScreen title="新建笔记" headerActions={<Pressable accessibilityRole="button" accessibilityLabel="取消新建笔记" disabled={pending} onPress={() => router.back()} style={styles.cancel}><Text style={styles.cancelText}>取消</Text></Pressable>}>
    <TextInput accessibilityLabel="笔记内容" editable={!pending} multiline placeholder="记下重要信息、讨论结论或下一步" placeholderTextColor={styles.placeholder.color}
      value={draft} onChangeText={change} style={styles.input} textAlignVertical="top" />
    {contactsState.kind === "failure" || contactsState.kind === "offline" ? <ErrorState title="人脉暂时无法读取" message={contactsState.error.message} /> : null}
    <NoteContactPicker contacts={contacts} disabled={pending} selectedIds={selectedIds} onToggle={toggle} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={pending ? "保存中" : "保存笔记"} accessibilityState={{ disabled: pending || !draft.trim() }} disabled={pending || !draft.trim()} onPress={() => { void save(); }} style={[styles.save, (pending || !draft.trim()) && styles.disabled]}>
      <Text style={styles.saveText}>{pending ? "保存中" : "保存笔记"}</Text>
    </Pressable>
  </AppScreen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  cancel: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.accent, fontSize: typography.body },
  input: { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.ink, fontSize: typography.body, lineHeight: 24, minHeight: 180, padding: spacing.lg },
  placeholder: { color: colors.text4 },
  error: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
  save: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.md, justifyContent: "center", minHeight: 48, paddingHorizontal: spacing.lg },
  saveText: { color: colors.onAccent, fontSize: typography.body, fontWeight: "700" },
  disabled: { opacity: 0.45 },
}));
