import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { notePath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { noteFromPayload } from "../../view-models/notes";
import { buildNoteSuggestionNavigation, noteSourceTasksFromPayload } from "../../view-models/note-suggestions";
import { eventsToSummaries } from "../../view-models/events";
import { useNoteContactSummaries } from "./useNoteContactSummaries";

function MentionedBody({ body, mentions, mentionStyle, textStyle }: {
  body: string;
  mentions: readonly { start: number; end: number; displayText: string }[];
  mentionStyle: object;
  textStyle: object;
}) {
  if (!mentions.length) return <Text selectable style={textStyle}>{body}</Text>;
  const ordered = [...mentions].sort((left, right) => left.start - right.start);
  let cursor = 0;
  const parts: ReactNode[] = [];
  ordered.forEach((mention, index) => {
    if (mention.start > cursor) parts.push(body.slice(cursor, mention.start));
    parts.push(<Text key={`${mention.start}:${index}`} style={mentionStyle}>{mention.displayText}</Text>);
    cursor = mention.end;
  });
  if (cursor < body.length) parts.push(body.slice(cursor));
  return <Text selectable style={textStyle}>{parts}</Text>;
}

export function NoteDetailScreen({ actorId, noteId, scopeKey }: { actorId: string; noteId: string; scopeKey: string }) {
  const router = useRouter();
  const locale = useOrbitLocale();
  const state = useApiResource<unknown>(notePath(noteId), () => false, { scopeKey, cachePolicy: "network-only" });
  const tasksState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.tasks, () => false, { scopeKey });
  const eventsState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.events, () => false, { scopeKey });
  const note = state.kind === "success" || state.kind === "empty" ? noteFromPayload(state.data, actorId, noteId, locale.language) : null;
  const contactSummaries = useNoteContactSummaries(note?.contactIds ?? [], scopeKey);
  const sourceTasks = tasksState.kind === "success" || tasksState.kind === "empty" ? noteSourceTasksFromPayload(tasksState.data, actorId, noteId) : [];
  const events = eventsState.kind === "success" || eventsState.kind === "empty" ? eventsToSummaries(eventsState.data) : [];
  const contactNames = new Map(note?.mentions.map((mention) => [mention.contactId, mention.displayText.replace(/^@/, "")]) ?? []);
  contactSummaries.forEach((contact, id) => contactNames.set(id, contact.name));
  const eventNames = new Map(events.map((event) => [event.id, event.title]));
  const { styles, colors } = useStyles();
  const dateLocale = locale.language === "en" ? "en-US" : locale.language === "ja" ? "ja-JP" : "zh-CN";
  return <AppScreen title={locale.t("notes.title")} backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("notes.title") })} backLabel={locale.t("notes.title")} refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} />}>
    {state.kind === "loading" ? <LoadingState /> : null}
    {state.kind === "failure" || state.kind === "offline" ? <ErrorState message={state.error.message} /> : null}
    {(state.kind === "success" || state.kind === "empty") && !note ? <ErrorState message={locale.t("notes.missing")} /> : null}
    {note ? <>
      <View style={styles.heading}>
        <View style={styles.privatePill}><Ionicons color={colors.text3} name="lock-closed-outline" size={13} /><Text style={styles.private}>{locale.t("notes.private")}</Text></View>
        <Text style={styles.title}>{note.title}</Text>
        <Text style={styles.date}>{new Date(note.updatedAt).toLocaleString(dateLocale, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} · v{note.version}</Text>
      </View>
      <View style={styles.paper}><MentionedBody body={note.body} mentions={note.mentions} mentionStyle={styles.mention} textStyle={styles.body} /></View>
      {note.contactIds.length ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>{locale.t("notes.relatedPeople")}</Text>
        <View style={styles.chips}>{note.contactIds.map((contactId) => <Pressable key={contactId} accessibilityRole="button" accessibilityLabel={locale.t("notes.openRelatedPerson", { name: contactNames.get(contactId) ?? contactId })} onPress={() => router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)} style={styles.chip}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(contactNames.get(contactId) ?? contactId.replace(/^contact:/, "")).slice(0, 1).toLocaleUpperCase()}</Text></View><Text numberOfLines={1} style={styles.chipText}>{contactNames.get(contactId) ?? contactId.replace(/^contact:/, "")}</Text>
        </Pressable>)}</View>
      </View> : null}
      {note.eventIds.length ? <View style={styles.section}><Text style={styles.sectionTitle}>{locale.t("notes.relatedEvents")}</Text>{note.eventIds.map((eventId) => <Pressable key={eventId} accessibilityRole="button" accessibilityLabel={locale.t("notes.openRelatedEvent", { name: eventNames.get(eventId) ?? eventId })} onPress={() => router.push(`/events/${encodeURIComponent(eventId)}` as Href)} style={styles.linkRow}><Ionicons color={colors.accent} name="calendar-outline" size={19} /><Text style={styles.linkText}>{eventNames.get(eventId) ?? eventId.replace(/^event:/, "")}</Text><Ionicons color={colors.text4} name="chevron-forward" size={18} /></Pressable>)}</View> : null}
      {sourceTasks.length ? <View style={styles.section}><Text style={styles.sectionTitle}>{locale.t("notes.createdFromNote")}</Text>{sourceTasks.map((task) => <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={locale.t("notes.openSourceTask", { title: task.title })} onPress={() => router.push(`/tasks/${encodeURIComponent(task.id)}` as Href)} style={styles.linkRow}><Ionicons color={colors.accent} name="checkbox-outline" size={19} /><Text style={styles.linkText}>{task.title}</Text><Ionicons color={colors.text4} name="chevron-forward" size={18} /></Pressable>)}</View> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.edit")} onPress={() => router.push(`/notes/${encodeURIComponent(note.id)}/edit` as Href)} style={styles.editLarge}><Text style={styles.editText}>{locale.t("notes.edit")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.aiSummary")} onPress={() => router.push(buildNoteSuggestionNavigation(note, locale.language))} style={styles.iorbit}><View style={styles.orbitMark}><Ionicons color={colors.onAccent} name="sparkles" size={16} /></View><Text style={styles.iorbitTitle}>{locale.t("notes.aiSummary")}</Text></Pressable>
      </View>
    </> : null}
  </AppScreen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  heading: { gap: spacing.sm, paddingTop: spacing.sm },
  privatePill: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surface3, borderRadius: radius.pill, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  private: { color: colors.text3, fontSize: typography.caption, fontWeight: "700" },
  title: { color: colors.ink, fontSize: 28, fontWeight: "900", letterSpacing: -0.5, lineHeight: 37 },
  date: { color: colors.text3, fontSize: typography.caption, lineHeight: 18 },
  paper: { borderBottomColor: colors.border, borderBottomWidth: 1, minHeight: 230, paddingBottom: spacing.xl, paddingTop: spacing.md },
  body: { color: colors.ink, fontSize: 17, lineHeight: 29 },
  mention: { backgroundColor: colors.accentSoft, color: colors.accent, fontWeight: "800" },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: typography.small, fontWeight: "800", letterSpacing: 0.3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { alignItems: "center", backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", gap: 7, maxWidth: 180, minHeight: 42, paddingHorizontal: 8, paddingRight: 13 },
  avatar: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: radius.pill, height: 28, justifyContent: "center", width: 28 },
  avatarText: { color: colors.accent, fontSize: typography.small, fontWeight: "900" },
  chipText: { color: colors.text, flexShrink: 1, fontSize: typography.small, fontWeight: "700" },
  linkRow: { alignItems: "center", backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md },
  linkText: { color: colors.text, flex: 1, fontSize: typography.small, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.lg },
  editLarge: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.lg, flex: 1, justifyContent: "center", minHeight: 58 },
  editText: { color: colors.bg, fontSize: typography.body, fontWeight: "800" },
  iorbit: { alignItems: "center", borderColor: colors.ink, borderRadius: radius.lg, borderWidth: 1.5, flex: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 58, paddingHorizontal: spacing.sm },
  orbitMark: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.sm, height: 28, justifyContent: "center", width: 28 },
  iorbitTitle: { color: colors.ink, fontSize: typography.body, fontWeight: "800" },
}));
