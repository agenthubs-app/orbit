import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, RefreshControl, StyleSheet, TextInput, View } from "react-native";

import { AppScreen } from "../../components/AppScreen";
import { EmptyState, RetryCard, Skeleton, UiText as Text } from "../../components/ui";
import { Icon } from "../../components/ui/Icon";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import { MemoOfflineNotice } from "./MemoOfflineNotice";
import { useNotesListSource } from "../notes/notes-source";

function noteTime(value: string, language: "en" | "ja" | "zh"): string {
  const date = new Date(value);
  const now = new Date();
  const locale = language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "zh-CN";
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function noteGroup(value: string): "earlier" | "today" | "week" {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "today";
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
  return date >= start ? "week" : "earlier";
}

export function MemoListScreen({ actorId, scopeKey }: { actorId: string; scopeKey: string }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string | string[] }>();
  const contactId = (Array.isArray(params.contactId) ? params.contactId[0] : params.contactId)?.trim();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  // UX-5: one kind of note — no 面谈 / 自由备忘录 filter (interviews live in the calendar).
  const source = useNotesListSource({ actorId, scopeKey, association: "all", contactId, noteKind: "all", q: debouncedQuery });
  const locale = useOrbitLocale();
  const { styles, colors } = useStyles();
  const notes = source.notes;
  const needsNetwork = source.offline && Platform.OS === "web";
  const groups = useMemo(() => ([
    { value: "today", label: locale.t("notes.groupToday") },
    { value: "week", label: locale.t("notes.groupWeek") },
    { value: "earlier", label: locale.t("notes.groupEarlier") },
  ] as const).map((group) => ({ ...group, notes: notes?.filter((note) => noteGroup(note.updatedAt) === group.value) ?? [] })).filter((group) => group.notes.length), [locale, notes]);
  return <AppScreen inset="kit" title={locale.t("notes.myNotes")} backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("nav.home") })} backLabel={locale.t("nav.home")} onBack={() => router.replace("/home" as Href)} refreshControl={<RefreshControl refreshing={source.refreshing} onRefresh={source.refresh} />} headerActions={
    <Pressable accessibilityRole="button" accessibilityLabel={needsNetwork ? `${locale.t("notes.new")}，${locale.t("sync.needsNetwork")}` : locale.t("notes.new")} accessibilityState={{ disabled: needsNetwork }} disabled={needsNetwork} onPress={() => router.push((contactId ? `/notes/new?contactId=${encodeURIComponent(contactId)}` : "/notes/new") as Href)} style={[styles.add, needsNetwork && styles.addDisabled]}>
      <Icon color={colors.onAccent} name="plus" size={24} />
    </Pressable>
  }>
    {source.offline ? <MemoOfflineNotice lastSyncedAt={source.lastSyncedAt} /> : null}
    {contactId ? <View><Text style={styles.sort}>{locale.t("notes.contactScope")}</Text><Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.allNotes")} onPress={() => router.push("/notes")} style={styles.more}><Text style={styles.moreText}>{locale.t("notes.allNotes")}</Text></Pressable></View> : null}
    <View style={styles.searchBox}>
      <Icon color={colors.ink3Text} name="search" size={20} />
      <TextInput accessibilityLabel={locale.t("notes.search")} autoCorrect={false} maxFontSizeMultiplier={2} onChangeText={setQuery} placeholder={locale.t("notes.searchPlaceholder")} placeholderTextColor={colors.ink3Text} style={styles.searchInput} value={query} />
      {query ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.clearSearch")} onPress={() => setQuery("")}><Icon color={colors.ink3Text} name="x-circle" size={20} /></Pressable> : null}
    </View>
    {source.loading ? <Skeleton /> : null}
    {source.failure ? <RetryCard title={source.failure} onRetry={source.refresh} /> : null}
    {source.invalid ? <RetryCard title={locale.t("notes.invalidPayload")} onRetry={source.refresh} /> : null}
    {source.pageError ? <><RetryCard title={source.pageError} onRetry={source.refresh} /><Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.reloadHistory")} onPress={source.refresh} style={styles.more}><Text style={styles.moreText}>{locale.t("notes.reloadHistory")}</Text></Pressable></> : null}
    {notes?.length === 0 ? <EmptyState title={locale.t(query ? "notes.emptySearch" : contactId ? "notes.emptyLinked" : "notes.empty")} message={locale.t(query ? "notes.emptySearchBody" : "notes.emptyBody")} /> : null}
    {/* UX-6: iOS Notes list — each group one card; a row is the title, then the time and the first line. */}
    <View style={styles.list}>{groups.map((group) => <View key={group.value} style={styles.group}><Text maxFontSizeMultiplier={2} style={styles.groupTitle}>{group.label}</Text><View style={styles.card}>{group.notes.map((note, index) => <Pressable key={note.id} accessibilityRole="button" accessibilityLabel={locale.t("notes.viewNamed", { title: note.title })} onPress={() => router.push(`/notes/${encodeURIComponent(note.id)}` as Href)} style={styles.row}>
      <View style={index > 0 ? styles.rowLine : null} />
      <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.title}>{note.title}</Text>
      <View style={styles.subRow}>
        <Text maxFontSizeMultiplier={2} style={styles.time}>{noteTime(note.updatedAt, locale.language)}</Text>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.summary}>{note.body.replace(/\s+/g, " ")}</Text>
      </View>
      {note.contactIds.length || note.eventIds.length || note.localMutationState ? <View style={styles.metaRow}>
        {note.contactIds.length ? <View style={styles.metaPill}><Icon color={colors.ink3Text} name="users" size={13} /><Text maxFontSizeMultiplier={2} style={styles.meta}>{locale.t("notes.peopleCount", { count: note.contactIds.length })}</Text></View> : null}
        {note.eventIds.length ? <View style={styles.metaPill}><Icon color={colors.ink3Text} name="calendar" size={13} /><Text maxFontSizeMultiplier={2} style={styles.meta}>{locale.t("notes.eventsCount", { count: note.eventIds.length })}</Text></View> : null}
        {note.localMutationState ? <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={2} style={styles.mutationStatus}>{locale.t(`notes.outbox${note.localMutationState === "queued" ? "Queued" : note.localMutationState === "conflict" ? "Conflict" : "Failed"}` as MessageKey)}</Text> : null}
      </View> : null}
    </Pressable>)}</View></View>)}</View>
    {source.hasMore ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.loadMore")} disabled={source.loadingMore} onPress={source.loadMore} style={styles.more}><Text maxFontSizeMultiplier={2} style={styles.moreText}>{locale.t(source.loadingMore ? "notes.loadingMore" : "notes.loadMore")}</Text></Pressable> : null}
  </AppScreen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  add: { alignItems: "center", backgroundColor: colors.accentText, borderRadius: radius.pill, height: 40, justifyContent: "center", width: 40 },
  addDisabled: { backgroundColor: colors.ink3Text },
  hero: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm, paddingTop: spacing.sm },
  heroTitle: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -0.8 },
  heroCount: { color: colors.accentText, fontSize: 34, fontWeight: "900" },
  searchBox: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  searchInput: { color: colors.ink, flex: 1, fontSize: typography.bodySm, minHeight: 44, paddingVertical: 0 },
  filters: { borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  filter: { alignItems: "center", borderBottomColor: "transparent", borderBottomWidth: 3, minHeight: 44, justifyContent: "center", paddingHorizontal: 1 },
  filterSelected: { borderBottomColor: colors.ink },
  filterText: { color: colors.ink3Text, fontSize: typography.label, fontWeight: "700" },
  filterTextSelected: { color: colors.ink },
  sort: { color: colors.ink3Text, fontSize: typography.label, textAlign: "right" },
  list: { gap: spacing.lg }, group: { gap: 6 }, card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  rowLine: { position: "absolute", top: 0, left: 0, right: -spacing.lg, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  subRow: { flexDirection: "row", gap: spacing.sm, alignItems: "baseline" },
  groupTitle: { color: colors.ink, fontSize: 20, fontWeight: "700", paddingHorizontal: 2 },
  row: { gap: 3, paddingVertical: 12 },
  rowTop: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  rowIcon: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.sm, height: 32, justifyContent: "center", width: 32 },
  rowEmoji: { fontSize: 20 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "600" },
  time: { color: colors.ink2, fontSize: 15 },
  summary: { color: colors.ink3Text, flex: 1, fontSize: 15 },
  metaRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: 2 },
  kindPill: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  kindText: { color: colors.ink3Text, fontSize: typography.label, fontWeight: "700" },
  metaPill: { alignItems: "center", flexDirection: "row", gap: 4 },
  meta: { color: colors.ink3Text, fontSize: 13 },
  mutationStatus: { color: colors.accentText, fontSize: typography.label, fontWeight: "800" },
  more: { alignItems: "center", minHeight: 48, justifyContent: "center" },
  moreText: { color: colors.accentText, fontSize: typography.bodySm, fontWeight: "700" },
}));
