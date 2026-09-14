import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { ORBIT_API_ENDPOINTS, notesPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { notesFromPayload } from "../../view-models/notes";

export function NotesScreen({ actorId, scopeKey }: { actorId: string; scopeKey: string }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string | string[] }>();
  const contactId = (Array.isArray(params.contactId) ? params.contactId[0] : params.contactId)?.trim();
  const state = useApiResource<unknown>(notesPath(contactId), () => false, { scopeKey, cachePolicy: "network-only" });
  const { styles } = useStyles();
  const notes = state.kind === "success" || state.kind === "empty" ? notesFromPayload(state.data, actorId) : null;
  return <AppScreen title="笔记" refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} />} headerActions={
    <Pressable accessibilityRole="button" accessibilityLabel="新建笔记" onPress={() => router.push((contactId ? `/notes/new?contactId=${encodeURIComponent(contactId)}` : "/notes/new") as Href)} style={styles.add}>
      <Text style={styles.addText}>新建</Text>
    </Pressable>
  }>
    {state.kind === "loading" ? <LoadingState /> : null}
    {state.kind === "offline" || state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
    {(state.kind === "success" || state.kind === "empty") && notes === null ? <ErrorState message="服务返回的笔记不完整，请重新读取。" /> : null}
    {notes?.length === 0 ? <EmptyState title={contactId ? "还没有关联笔记" : "还没有笔记"} message="新建一篇私密笔记，可关联一个或多个人脉。" /> : null}
    {notes?.map((note) => <Pressable key={note.id} accessibilityRole="button" accessibilityLabel="查看笔记"
      onPress={() => router.push(`/notes/${encodeURIComponent(note.id)}` as Href)} style={styles.card}>
      <Text numberOfLines={4} style={styles.body}>{note.body}</Text>
      <View style={styles.metaRow}><Text style={styles.meta}>{note.contactIds.length ? `关联 ${note.contactIds.length} 人` : "未关联人脉"}</Text><Text style={styles.meta}>v{note.version}</Text></View>
    </Pressable>)}
  </AppScreen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  add: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  addText: { color: colors.accent, fontSize: typography.body, fontWeight: "700" },
  card: { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.md, minHeight: 88, padding: spacing.lg },
  body: { color: colors.ink, fontSize: typography.body, lineHeight: 24 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  meta: { color: colors.text3, fontSize: typography.caption, lineHeight: 18 },
}));
