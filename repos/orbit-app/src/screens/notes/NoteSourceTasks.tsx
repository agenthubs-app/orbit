import { useState } from "react";
import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { noteTaskPageSchema } from "../../api/schema/note-task-page";
import { ErrorState } from "../../components/ErrorState";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function NoteSourceTasks({ actorId, noteId, scopeKey }: { actorId: string; noteId: string; scopeKey: string }) {
  const router = useRouter(), locale = useOrbitLocale(), { styles } = useStyles();
  const scope = JSON.stringify([scopeKey, actorId, noteId]);
  const [position, setPosition] = useState<{ scope: string; cursor: string | null }>({ scope, cursor: null });
  const cursor = position.scope === scope ? position.cursor : null;
  const params = new URLSearchParams({ noteId, limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const state = useApiResource<unknown>(`/api/tasks/note-page?${params}`, () => false, {
    scopeKey: JSON.stringify([scope, cursor]), cachePolicy: "network-only", enabled: Boolean(actorId && noteId),
  });
  const loaded = state.kind === "success" || state.kind === "empty";
  const parsed = loaded ? noteTaskPageSchema.safeParse(state.data) : null;
  const page = parsed?.success && parsed.data.actorId === actorId && parsed.data.noteId === noteId && parsed.data.items.length <= 20
    && (!parsed.data.hasMore || parsed.data.items.length === 20) ? parsed.data : null;
  const failure = state.kind === "failure" || state.kind === "offline" ? state.error.message : loaded && !page
    ? locale.language === "zh" ? "未能确认关联待办，请重试。" : locale.language === "ja" ? "関連タスクを確認できません。再試行してください。" : "Could not verify linked tasks. Please retry." : null;
  const refresh = () => { setPosition({ scope, cursor: null }); state.refresh(); };
  if (page?.total === 0) return null;
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>{locale.t("notes.createdFromNote")}{page ? ` (${page.total})` : ""}</Text>
    {!page && !failure ? <Text accessibilityRole="progressbar" style={styles.text}>{locale.t("common.loading")}</Text> : null}
    {failure ? <View><ErrorState message={failure} /><Pressable accessibilityRole="button" onPress={refresh} style={styles.button}><Text style={styles.text}>{locale.t("common.retry")}</Text></Pressable></View> : null}
    {page?.items.map(task => <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={locale.t("notes.openSourceTask", { title: task.titlePreview })}
      onPress={() => router.push(`/tasks/${encodeURIComponent(task.id)}` as Href)} style={styles.button}><Text style={styles.text}>{task.titlePreview}</Text></Pressable>)}
    {cursor ? <Pressable accessibilityRole="button" onPress={() => setPosition({ scope, cursor: null })} style={styles.button}><Text style={styles.text}>{locale.t("contacts.firstPage")}</Text></Pressable> : null}
    {page?.nextCursor ? <Pressable accessibilityRole="button" onPress={() => setPosition({ scope, cursor: page.nextCursor })} style={styles.button}><Text style={styles.text}>{locale.t("contacts.nextPage")}</Text></Pressable> : null}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { color: colors.ink, fontSize: typography.small, fontWeight: "800" },
  text: { color: colors.text, fontSize: typography.small },
  button: { minHeight: 52, justifyContent: "center", backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md },
}));
