import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ErrorState } from "../../components/ErrorState";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useNoteSourceTasks } from "./note-source-tasks-source";

export function NoteSourceTasks({ actorId, noteId, scopeKey }: { actorId: string; noteId: string; scopeKey: string }) {
  const router = useRouter(), locale = useOrbitLocale(), { styles } = useStyles();
  const source = useNoteSourceTasks({ actorId, noteId, scopeKey });
  const failure = source.failure === "sync.failure" ? locale.t("sync.failure") : source.failure;
  if (source.total === 0) return null;
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>{locale.t("notes.createdFromNote")}{source.items ? ` (${source.total})` : ""}</Text>
    {!source.items && !failure ? <Text accessibilityRole="progressbar" style={styles.text}>{locale.t("common.loading")}</Text> : null}
    {failure ? <View><ErrorState message={failure} /><Pressable accessibilityRole="button" onPress={source.refresh} style={styles.button}><Text style={styles.text}>{locale.t("common.retry")}</Text></Pressable></View> : null}
    {source.items?.map(task => <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={locale.t("notes.openSourceTask", { title: task.title })}
      onPress={() => router.push(`/tasks/${encodeURIComponent(task.id)}` as Href)} style={styles.button}><Text style={styles.text}>{task.title}</Text></Pressable>)}
    {!source.onFirstPage ? <Pressable accessibilityRole="button" onPress={source.first} style={styles.button}><Text style={styles.text}>{locale.t("contacts.firstPage")}</Text></Pressable> : null}
    {source.hasNext ? <Pressable accessibilityRole="button" onPress={source.next} style={styles.button}><Text style={styles.text}>{locale.t("contacts.nextPage")}</Text></Pressable> : null}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { color: colors.ink, fontSize: typography.small, fontWeight: "800" },
  text: { color: colors.text, fontSize: typography.small },
  button: { minHeight: 52, justifyContent: "center", backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md },
}));
