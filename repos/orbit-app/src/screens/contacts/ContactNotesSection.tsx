import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { OrbitApiClient } from "../../api/client";
import { contactDetailPath } from "../../api/endpoints";
import { radius, spacing, typography, type OrbitColors } from "../../design/tokens";
import { buildContactDetailNoteRequest } from "../../view-models/contacts";
import { contactNotesToView, confirmedContactNotes, type ContactNoteView } from "../../view-models/contact-notes";

export function ContactNotesSection({ actorId, client, colors, contactId, data, onRefresh }: {
  actorId: string | null;
  client: Pick<OrbitApiClient, "patch">;
  colors: OrbitColors;
  contactId: string;
  data: unknown;
  onRefresh: () => void;
}) {
  const styles = useMemo(() => createNotesStyles(colors), [colors]);
  const [scope, setScope] = useState({ actorId, client, contactId });
  const scopeRef = useRef(scope);
  const mounted = useRef(true);
  const pendingRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState<ContactNoteView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Reset before rendering another contact/account, not on ordinary data refreshes.
  if (scope.actorId !== actorId || scope.client !== client || scope.contactId !== contactId) {
    const nextScope = { actorId, client, contactId };
    scopeRef.current = nextScope;
    setScope(nextScope);
    pendingRef.current = false;
    setExpanded(false);
    setDraft("");
    setPending(false);
    setConfirmed([]);
    setError(null);
    setSaved(false);
    return null;
  }

  const view = contactNotesToView(data, contactId);
  // Keep server-confirmed notes while a refresh is still returning older data.
  const notes = [...new Map([
    ...(view.state === "ready" ? view.notes : []), ...confirmed
  ].map((note) => [note.id, note])).values()]
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

  async function saveNote() {
    if (pendingRef.current) return;
    const request = buildContactDetailNoteRequest(draft);
    if (!request.success) { setError(request.error); return; }
    const requestScope = scope;
    const isCurrent = () => mounted.current && scopeRef.current === requestScope;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const result = await client.patch<unknown>(contactDetailPath(contactId), { body: request.request.body });
      if (!isCurrent()) return;
      const notes = result.success ? confirmedContactNotes(result.data, contactId, request.request.body.note.body) : null;
      if (!notes) { setError("尚未确认保存成功，内容已保留，请重试。"); return; }
      setConfirmed(notes);
      setDraft("");
      setSaved(true);
      onRefresh();
    } catch {
      if (isCurrent()) setError("尚未确认保存成功，内容已保留，请重试。");
    } finally {
      if (isCurrent()) { pendingRef.current = false; setPending(false); }
    }
  }

  return (
    <View style={styles.section}>
      <Pressable accessibilityRole="button" accessibilityLabel="联系人备注" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.title}>联系人备注</Text>
          <Text style={styles.caption}>仅自己可见{notes.length ? ` · ${notes.length} 条` : ""}</Text>
        </View>
        <Ionicons color={colors.text3} name={expanded ? "chevron-up" : "chevron-down"} size={18} />
      </Pressable>
      {expanded ? <View style={styles.content}>
        {view.state === "unavailable" ? <Text accessibilityRole="alert" style={styles.error}>备注暂时读取不了，请刷新后重试。</Text> : null}
        {view.state === "ready" && notes.length === 0 ? <Text style={styles.caption}>还没有联系人备注。</Text> : null}
        {notes.map((note) => <View key={note.id} style={styles.note}>
          <Text selectable style={styles.body}>{note.body}</Text>
          <Text style={styles.caption}>{Number.isFinite(Date.parse(note.createdAt)) ? new Date(note.createdAt).toLocaleString("zh-CN") : note.createdAt}</Text>
        </View>)}
        <TextInput
          accessibilityLabel="添加联系人备注"
          editable={!pending}
          multiline
          onChangeText={(value) => { setDraft(value); setSaved(false); setError(null); }}
          placeholder="记下下次联系时想记得的事"
          placeholderTextColor={colors.text4}
          style={styles.input}
          textAlignVertical="top"
          value={draft}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {saved ? <Text accessibilityLiveRegion="polite" style={styles.caption}>备注已保存。</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: pending || !draft.trim() }} disabled={pending || !draft.trim()} onPress={saveNote} style={({ pressed }) => [styles.save, (pending || !draft.trim()) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.saveText}>{pending ? "保存中" : "保存备注"}</Text>
        </Pressable>
      </View> : null}
    </View>
  );
}

function createNotesStyles(colors: OrbitColors) {
  return StyleSheet.create({
  section: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  header: { minHeight: 68, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: spacing.md },
  heading: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { fontSize: 17, lineHeight: 24, fontWeight: "600", color: colors.ink },
  caption: { fontSize: typography.caption, lineHeight: 18, color: colors.text3 },
  content: { paddingBottom: spacing.xl, gap: spacing.lg },
  note: { gap: spacing.sm, paddingBottom: spacing.lg, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  body: { fontSize: typography.body, lineHeight: 23, color: colors.text, flexShrink: 1 },
  input: { fontSize: typography.body, lineHeight: 23, minHeight: 120, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, padding: spacing.md, color: colors.text, backgroundColor: colors.surface },
  save: { minHeight: 48, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
  saveText: { fontSize: typography.body, lineHeight: 23, fontWeight: "600", color: colors.onAccent },
  error: { fontSize: typography.small, lineHeight: 20, color: colors.rose },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 }
  });
}
