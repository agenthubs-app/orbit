import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { OrbitApiClient } from "../../api/client";
import { notesSearchPath } from "../../api/endpoints";
import { radius, spacing, typography, type OrbitColors } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { contactNotesToView } from "../../view-models/contact-notes";
import { notesPageFromPayload, type NoteView } from "../../view-models/notes";
import { mergeNotePages } from "../../view-models/note-history-pagination";

export function ContactNotesSection({ actorId, client, colors, contactId, data, openRequest = 0, preview = false, isScopeCurrent }: {
  actorId: string | null;
  client: Pick<OrbitApiClient, "get" | "patch">;
  colors: OrbitColors;
  contactId: string;
  data: unknown;
  onRefresh: () => void;
  openRequest?: number;
  preview?: boolean;
  isScopeCurrent?: () => boolean;
}) {
  const router = useRouter();
  const locale = useOrbitLocale();
  const styles = useMemo(() => createNotesStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [linkedNotes, setLinkedNotes] = useState<NoteView[]>([]);
  const [linkedTotal, setLinkedTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [linkedState, setLinkedState] = useState<"idle" | "loading" | "ready" | "failure">("idle");
  const [linkedError, setLinkedError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const source = JSON.stringify([actorId, contactId, debouncedQuery, expanded]);
  const activeSource = useRef(source);
  activeSource.current = source;
  const pageFlight = useRef<AbortController | null>(null);
  useEffect(() => { if (openRequest > 0) setExpanded(true); }, [openRequest]);
  useEffect(() => {
    pageFlight.current?.abort();
    pageFlight.current = null;
    setLoadingMore(false);
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    pageFlight.current?.abort();
    pageFlight.current = null;
    setLoadingMore(false);
    if (!expanded) return;
    if (!actorId) {
      setLinkedState("failure");
      setLinkedError(locale.t("notes.signIn"));
      return;
    }
    const controller = new AbortController();
    setLinkedState("loading");
    setLinkedError("");
    setLinkedNotes([]);
    setNextCursor(null);
    void client.get<unknown>(notesSearchPath({ contactId, q: debouncedQuery, limit: 20 }), { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted || isScopeCurrent?.() === false) return;
      if (!result.success || result.status < 200 || result.status >= 300) {
        setLinkedState("failure");
        setLinkedError(result.success ? locale.t("notes.linkedReadFailed") : result.error.message);
        return;
      }
      const page = notesPageFromPayload(result.data, actorId, locale.language);
      if (!page) {
        setLinkedState("failure");
        setLinkedError(locale.t("notes.linkedInvalid"));
        return;
      }
      setLinkedNotes(page.notes);
      setLinkedTotal(page.total);
      setNextCursor(page.nextCursor);
      setLinkedState("ready");
    }).catch(() => {
      if (!controller.signal.aborted && isScopeCurrent?.() !== false) {
        setLinkedState("failure");
        setLinkedError(locale.t("notes.linkedReadFailed"));
      }
    });
    return () => { controller.abort(); pageFlight.current?.abort(); pageFlight.current = null; };
  }, [actorId, client, contactId, debouncedQuery, expanded, isScopeCurrent, locale]);
  const view = contactNotesToView(data, contactId);
  const notes = view.state === "ready" ? view.notes : [];
  const navigate = (href: string) => { if (isScopeCurrent?.() !== false) router.push(href as Href); };

  async function loadMore() {
    if (!actorId || !nextCursor || pageFlight.current || isScopeCurrent?.() === false) return;
    const operation = new AbortController();
    pageFlight.current = operation;
    const requestedSource = source;
    const owns = () => !operation.signal.aborted && pageFlight.current === operation && activeSource.current === requestedSource && isScopeCurrent?.() !== false;
    setLoadingMore(true);
    setLinkedError("");
    try {
    const result = await client.get<unknown>(notesSearchPath({ contactId, q: debouncedQuery, limit: 20, cursor: nextCursor }), { signal: operation.signal });
    if (!owns()) return;
    if (result.success && result.status >= 200 && result.status < 300) {
      const page = notesPageFromPayload(result.data, actorId, locale.language);
      if (page && page.total === linkedTotal) {
        setLinkedNotes((items) => mergeNotePages(items, page.notes));
        setNextCursor(page.nextCursor);
      } else setLinkedError(locale.t("notes.nextLinkedInvalid"));
    } else setLinkedError(result.success ? locale.t("notes.nextLinkedFailed") : result.error.message);
    } catch {
      if (owns()) setLinkedError(locale.t("notes.nextLinkedFailed"));
    } finally {
      if (owns()) { pageFlight.current = null; setLoadingMore(false); }
    }
  }

  return <View style={styles.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.contactSection")} accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={[styles.header, preview && styles.previewHeader]}>
      <View style={styles.heading}>
        <Text style={[styles.title, preview && styles.previewTitle]}>{locale.t("notes.contactSection")}</Text>
        <Text style={styles.caption}>{locale.t("notes.contactCaption")}{linkedState === "ready" ? ` · ${locale.t("notes.linkedCount", { count: linkedTotal })}` : ""}</Text>
      </View>
      <Ionicons color={colors.text3} name={expanded ? "chevron-up" : "chevron-down"} size={18} />
    </Pressable>
    {preview && !expanded ? <View style={styles.previewList}>
      {view.state === "unavailable" ? <Text accessibilityRole="alert" style={styles.error}>{locale.t("notes.legacyReadFailed")}</Text> : null}
      {view.state === "ready" && notes.length === 0 ? <Text style={styles.caption}>{locale.t("notes.noContactNotes")}</Text> : null}
      {notes.slice(0, 3).map((note) => <Pressable key={note.id} accessibilityRole="button" accessibilityLabel={locale.t("notes.viewLegacy")} onPress={() => setExpanded(true)} style={styles.previewRow}>
        <View style={styles.previewIcon}><Ionicons color={colors.ink} name="document-text-outline" size={16} /></View>
        <Text style={styles.previewBody}>{note.body}</Text><Ionicons color={colors.text3} name="chevron-forward" size={15} />
      </Pressable>)}
    </View> : null}
    {expanded ? <View style={styles.content}>
      <View style={styles.searchBox}>
        <Ionicons color={colors.text3} name="search" size={18} />
        <TextInput accessibilityLabel={locale.t("notes.searchLinked")} autoCorrect={false} onChangeText={setQuery} placeholder={locale.t("notes.searchLinkedPlaceholder")} placeholderTextColor={colors.text3} style={styles.searchInput} value={query} />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.clearLinkedSearch")} onPress={() => setQuery("")}><Ionicons color={colors.text3} name="close-circle" size={18} /></Pressable> : null}
      </View>
      {linkedState === "loading" ? <Text accessibilityLiveRegion="polite" style={styles.caption}>{locale.t("notes.readingLinked")}</Text> : null}
      {linkedState === "failure" ? <Text accessibilityRole="alert" style={styles.error}>{linkedError}</Text> : null}
      {linkedState === "ready" && linkedNotes.length === 0 ? <Text style={styles.caption}>{locale.t(query ? "notes.noLinkedSearch" : "notes.noLinked")}</Text> : null}
      {linkedNotes.map((note) => <Pressable key={note.id} accessibilityRole="button" accessibilityLabel={locale.t("notes.viewLinkedNamed", { title: note.title })} onPress={() => navigate(`/notes/${encodeURIComponent(note.id)}`)} style={styles.linkedNote}>
        <View style={styles.linkedHeading}><Text numberOfLines={1} style={styles.linkedTitle}>{note.title}</Text><Text style={styles.caption}>{new Date(note.updatedAt).toLocaleDateString(locale.language === "en" ? "en-US" : locale.language === "ja" ? "ja-JP" : "zh-CN", { month: "short", day: "numeric" })}</Text></View>
        <Text numberOfLines={2} style={styles.linkedBody}>{note.body.replace(/\s+/g, " ")}</Text>
        <Text style={styles.caption}>{locale.t(note.mentions.some((mention) => mention.contactId === contactId) ? "notes.mentionRelation" : "notes.manualRelation")}</Text>
      </Pressable>)}
      {nextCursor ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.loadMoreLinked")} disabled={loadingMore} onPress={() => { void loadMore(); }} style={styles.loadMore}><Text style={styles.secondaryText}>{locale.t(loadingMore ? "notes.loadingMore" : "notes.loadMore")}</Text></Pressable> : null}
      {linkedError && linkedState === "ready" ? <Text accessibilityRole="alert" style={styles.error}>{linkedError}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.allNotes")} onPress={() => navigate("/notes")} style={styles.secondary}>
          <Text style={styles.secondaryText}>{locale.t("notes.allNotes")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.viewAllLinked")} onPress={() => navigate(`/notes?contactId=${encodeURIComponent(contactId)}`)} style={styles.secondary}>
          <Text style={styles.secondaryText}>{locale.t("notes.viewAll")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.newForPerson")} onPress={() => navigate(`/notes/new?contactId=${encodeURIComponent(contactId)}`)} style={styles.primary}>
          <Ionicons color={colors.onAccent} name="add" size={18} /><Text style={styles.primaryText}>{locale.t("notes.new")}</Text>
        </Pressable>
      </View>
      <Text style={styles.subheading}>{locale.t("notes.legacyReadOnly")}</Text>
      {view.state === "unavailable" ? <Text accessibilityRole="alert" style={styles.error}>{locale.t("notes.legacyReadFailed")}</Text> : null}
      {view.state === "ready" && notes.length === 0 ? <Text style={styles.caption}>{locale.t("notes.noLegacy")}</Text> : null}
      {notes.map((note) => <View key={note.id} style={styles.note}>
        <Text selectable style={styles.body}>{note.body}</Text>
        <Text style={styles.caption}>{Number.isFinite(Date.parse(note.createdAt)) ? new Date(note.createdAt).toLocaleString(locale.language === "en" ? "en-US" : locale.language === "ja" ? "ja-JP" : "zh-CN") : note.createdAt}</Text>
      </View>)}
      <Text style={styles.caption}>{locale.t("notes.legacyMigration")}</Text>
    </View> : null}
  </View>;
}

function createNotesStyles(colors: OrbitColors) {
  return StyleSheet.create({
    previewHeader: { minHeight: 56, paddingTop: 14, paddingBottom: 8 },
    previewTitle: { fontSize: 15, lineHeight: 22, fontWeight: "800" },
    previewList: { paddingBottom: 12 },
    previewRow: { minHeight: 56, paddingVertical: 11, borderBottomColor: colors.border2, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
    previewIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
    previewBody: { flex: 1, minWidth: 0, fontFamily: Platform.select({ web: '-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif', ios: "System", default: "sans-serif" }), fontSize: 14, lineHeight: 22, color: colors.ink },
    section: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
    header: { minHeight: 68, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: spacing.md },
    heading: { flex: 1, minWidth: 0, gap: spacing.xs },
    title: { fontSize: 17, lineHeight: 24, fontWeight: "600", color: colors.ink },
    caption: { fontSize: typography.caption, lineHeight: 18, color: colors.text3 },
    content: { paddingBottom: spacing.xl, gap: spacing.lg },
    searchBox: { alignItems: "center", backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
    searchInput: { color: colors.ink, flex: 1, fontSize: typography.small, minHeight: 44, paddingVertical: 0 },
    linkedNote: { borderBottomColor: colors.border2, borderBottomWidth: StyleSheet.hairlineWidth, gap: 5, minHeight: 92, paddingVertical: spacing.md },
    linkedHeading: { alignItems: "baseline", flexDirection: "row", gap: spacing.sm },
    linkedTitle: { color: colors.ink, flex: 1, fontSize: typography.body, fontWeight: "800" },
    linkedBody: { color: colors.text2, fontSize: typography.small, lineHeight: 20 },
    loadMore: { alignItems: "center", justifyContent: "center", minHeight: 44 },
    note: { gap: spacing.sm, paddingBottom: spacing.lg, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
    body: { fontSize: typography.body, lineHeight: 23, color: colors.text, flexShrink: 1 },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    secondary: { minHeight: 48, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
    secondaryText: { color: colors.ink, fontSize: typography.body, fontWeight: "600" },
    primary: { alignItems: "center", flexDirection: "row", gap: 6, minHeight: 48, backgroundColor: colors.accent, borderRadius: radius.sm, justifyContent: "center", paddingHorizontal: spacing.lg },
    primaryText: { color: colors.onAccent, fontSize: typography.body, fontWeight: "700" },
    error: { fontSize: typography.small, lineHeight: 20, color: colors.rose },
    subheading: { color: colors.ink, fontSize: typography.small, fontWeight: "800", marginTop: spacing.sm },
  });
}
