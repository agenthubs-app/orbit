import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

import { notesSearchPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import { notesPageFromPayload, type NoteView } from "../../view-models/notes";

type Filter = "all" | "contacts" | "events" | "unlinked";
const filters: readonly { value: Filter; labelKey: MessageKey }[] = [
  { value: "all", labelKey: "notes.filterAll" },
  { value: "contacts", labelKey: "notes.filterPeople" },
  { value: "events", labelKey: "notes.filterEvents" },
  { value: "unlinked", labelKey: "notes.unlinked" },
];

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

export function NotesScreen({ actorId, scopeKey }: { actorId: string; scopeKey: string }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ contactId?: string | string[] }>();
  const contactId = (Array.isArray(params.contactId) ? params.contactId[0] : params.contactId)?.trim();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(contactId ? "contacts" : "all");
  const [extraNotes, setExtraNotes] = useState<NoteView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const path = notesSearchPath({ association: filter, ...(contactId ? { contactId } : {}), q: debouncedQuery, limit: 20 });
  const state = useApiResource<unknown>(path, () => false, { scopeKey, cachePolicy: "network-only" });
  const client = useOrbitApiClient();
  const locale = useOrbitLocale();
  const { styles, colors } = useStyles();
  const basePage = state.kind === "success" || state.kind === "empty" ? notesPageFromPayload(state.data, actorId, locale.language) : null;
  useEffect(() => {
    setExtraNotes([]);
    setNextCursor(null);
    setPageError("");
  }, [path]);
  useEffect(() => {
    if (basePage) setNextCursor(basePage.nextCursor);
  }, [state]);
  const notes = useMemo(() => basePage ? [...basePage.notes, ...extraNotes] : null, [basePage, extraNotes]);
  const groups = useMemo(() => ([
    { value: "today", label: locale.t("notes.groupToday") },
    { value: "week", label: locale.t("notes.groupWeek") },
    { value: "earlier", label: locale.t("notes.groupEarlier") },
  ] as const).map((group) => ({ ...group, notes: notes?.filter((note) => noteGroup(note.updatedAt) === group.value) ?? [] })).filter((group) => group.notes.length), [locale, notes]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setPageError("");
    const result = await client.get<unknown>(notesSearchPath({ association: filter, ...(contactId ? { contactId } : {}), q: debouncedQuery, limit: 20, cursor: nextCursor }));
    if (result.success) {
      const page = notesPageFromPayload(result.data, actorId, locale.language);
      if (page) {
        setExtraNotes((items) => [...new Map([...items, ...page.notes].map((note) => [note.id, note])).values()]);
        setNextCursor(page.nextCursor);
      } else {
        setPageError(locale.t("notes.nextPageInvalid"));
      }
    } else {
      setPageError(result.error.message);
    }
    setLoadingMore(false);
  }
  return <AppScreen title={locale.t("notes.myNotes")} backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("nav.home") })} backLabel={locale.t("nav.home")} refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} />} headerActions={
    <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.new")} onPress={() => router.push((contactId ? `/notes/new?contactId=${encodeURIComponent(contactId)}` : "/notes/new") as Href)} style={styles.add}>
      <Ionicons color={colors.onAccent} name="add" size={24} />
    </Pressable>
  }>
    <View style={styles.hero}><Text maxFontSizeMultiplier={2} style={styles.heroTitle}>{locale.t("notes.title")}</Text><Text maxFontSizeMultiplier={2} style={styles.heroCount}>{basePage?.total ?? 0}</Text></View>
    <View style={styles.searchBox}>
      <Ionicons color={colors.text3} name="search" size={19} />
      <TextInput accessibilityLabel={locale.t("notes.search")} autoCorrect={false} maxFontSizeMultiplier={2} onChangeText={setQuery} placeholder={locale.t("notes.searchPlaceholder")} placeholderTextColor={colors.text4} style={styles.searchInput} value={query} />
      {query ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.clearSearch")} onPress={() => setQuery("")}><Ionicons color={colors.text3} name="close-circle" size={19} /></Pressable> : null}
    </View>
    {!contactId ? <><View accessibilityRole="tablist" style={styles.filters}>{filters.map((item) => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: filter === item.value }} onPress={() => setFilter(item.value)} style={[styles.filter, filter === item.value && styles.filterSelected]}>
      <Text maxFontSizeMultiplier={2} style={[styles.filterText, filter === item.value && styles.filterTextSelected]}>{locale.t(item.labelKey)}</Text>
    </Pressable>)}</View><Text maxFontSizeMultiplier={2} style={styles.sort}>{locale.t("notes.sortRecent")}</Text></> : null}
    {state.kind === "loading" ? <LoadingState /> : null}
    {state.kind === "offline" || state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
    {(state.kind === "success" || state.kind === "empty") && notes === null ? <ErrorState message={locale.t("notes.invalidPayload")} /> : null}
    {pageError ? <ErrorState message={pageError} /> : null}
    {notes?.length === 0 ? <EmptyState title={locale.t(query ? "notes.emptySearch" : contactId ? "notes.emptyLinked" : "notes.empty")} message={locale.t(query ? "notes.emptySearchBody" : "notes.emptyBody")} /> : null}
    <View style={styles.list}>{groups.map((group) => <View key={group.value}><Text maxFontSizeMultiplier={2} style={styles.groupTitle}>{group.label}</Text>{group.notes.map((note) => <Pressable key={note.id} accessibilityRole="button" accessibilityLabel={locale.t("notes.viewNamed", { title: note.title })} onPress={() => router.push(`/notes/${encodeURIComponent(note.id)}` as Href)} style={styles.row}>
      <View style={styles.rowTop}><Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.title}>{note.title}</Text><Text maxFontSizeMultiplier={2} style={styles.time}>{noteTime(note.updatedAt, locale.language)}</Text></View>
      <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.summary}>{note.body.replace(/\s+/g, " ")}</Text>
      <View style={styles.metaRow}>
        {note.contactIds.length ? <View style={styles.metaPill}><Ionicons color={colors.accent} name="people-outline" size={14} /><Text maxFontSizeMultiplier={2} style={styles.meta}>{locale.t("notes.peopleCount", { count: note.contactIds.length })}</Text></View> : null}
        {note.eventIds.length ? <View style={styles.metaPill}><Ionicons color={colors.accent} name="calendar-outline" size={14} /><Text maxFontSizeMultiplier={2} style={styles.meta}>{locale.t("notes.eventsCount", { count: note.eventIds.length })}</Text></View> : null}
        {!note.contactIds.length && !note.eventIds.length ? <Text maxFontSizeMultiplier={2} style={styles.meta}>{locale.t("notes.unlinked")}</Text> : null}
      </View>
    </Pressable>)}</View>)}</View>
    {nextCursor ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.loadMore")} disabled={loadingMore} onPress={() => { void loadMore(); }} style={styles.more}><Text maxFontSizeMultiplier={2} style={styles.moreText}>{locale.t(loadingMore ? "notes.loadingMore" : "notes.loadMore")}</Text></Pressable> : null}
  </AppScreen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  add: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.pill, height: 40, justifyContent: "center", width: 40 },
  hero: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm, paddingTop: spacing.sm },
  heroTitle: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -0.8 },
  heroCount: { color: colors.accent, fontSize: 34, fontWeight: "900" },
  searchBox: { alignItems: "center", backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 64, paddingHorizontal: spacing.md },
  searchInput: { color: colors.ink, flex: 1, fontSize: typography.body, minHeight: 64, paddingVertical: 0 },
  filters: { borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  filter: { alignItems: "center", borderBottomColor: "transparent", borderBottomWidth: 3, minHeight: 44, justifyContent: "center", paddingHorizontal: 1 },
  filterSelected: { borderBottomColor: colors.ink },
  filterText: { color: colors.text3, fontSize: typography.caption, fontWeight: "700" },
  filterTextSelected: { color: colors.ink },
  sort: { color: colors.text3, fontSize: typography.caption, textAlign: "right" },
  list: { gap: spacing.sm },
  groupTitle: { color: colors.text3, fontSize: typography.body, fontWeight: "700", paddingTop: spacing.sm },
  row: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, gap: 7, minHeight: 112, paddingVertical: spacing.lg },
  rowTop: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  title: { color: colors.ink, flex: 1, fontSize: 17, fontWeight: "800" },
  time: { color: colors.text3, fontSize: typography.caption },
  summary: { color: colors.text2, fontSize: typography.small },
  metaRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: 2 },
  metaPill: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: radius.pill, flexDirection: "row", gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  meta: { color: colors.text3, fontSize: typography.caption, fontWeight: "600" },
  more: { alignItems: "center", minHeight: 48, justifyContent: "center" },
  moreText: { color: colors.accent, fontSize: typography.small, fontWeight: "700" },
}));
