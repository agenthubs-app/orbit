import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { OfflineNotice } from "../../components/OfflineNotice";
import { NotesOfflineNotice } from "./NotesOfflineNotice";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { NeedsNetworkState } from "../../components/NeedsNetworkState";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { buildNoteSuggestionNavigation } from "../../view-models/note-suggestions";
import { eventsToSummaries } from "../../view-models/events";
import { buildOfflineNoteMutation } from "../../data/sync/note-outbox-mutation";
import { noteFromPayload } from "../../view-models/notes";
import { useNoteContactSummaries } from "./useNoteContactSummaries";
import { NoteSourceTasks } from "./NoteSourceTasks";
import { useNoteDetailSource } from "./notes-source";

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
  const source = useNoteDetailSource({ actorId, noteId, scopeKey });
  const canonicalNoteId = source.note?.id;
  const redirectedAlias = useRef<string | null>(null);
  useEffect(() => {
    if (!noteId.startsWith("local:")) {
      redirectedAlias.current = null;
      return;
    }
    if (noteId.startsWith("local:") && canonicalNoteId && canonicalNoteId !== noteId) {
      const transition = `${noteId}\u0000${canonicalNoteId}`;
      if (redirectedAlias.current === transition) return;
      redirectedAlias.current = transition;
      router.replace(`/notes/${encodeURIComponent(canonicalNoteId)}` as Href);
    }
  }, [canonicalNoteId, noteId, router]);
  const [taskRefresh, setTaskRefresh] = useState(0);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [conflictError, setConflictError] = useState("");
  const eventsState = useApiResource<unknown>(ORBIT_API_ENDPOINTS.events, () => false, { scopeKey });
  const note = source.note;
  const conflictMutation = source.conflictMutation;
  const conflictServerNote = conflictMutation?.serverSnapshot
    ? noteFromPayload({ note: conflictMutation.serverSnapshot }, actorId, conflictMutation.id, locale.language)
    : null;
  const contactSummaries = useNoteContactSummaries(note?.contactIds ?? [], scopeKey);
  const events = eventsState.kind === "success" || eventsState.kind === "empty" ? eventsToSummaries(eventsState.data) : [];
  const contactNames = new Map(note?.mentions.map((mention) => [mention.contactId, mention.displayText.replace(/^@/, "")]) ?? []);
  contactSummaries.forEach((contact, id) => contactNames.set(id, contact.name));
  const eventNames = new Map(events.map((event) => [event.id, event.title]));
  const { styles, colors } = useStyles();
  const dateLocale = locale.language === "en" ? "en-US" : locale.language === "ja" ? "ja-JP" : "zh-CN";
  async function resolveConflict(resolution: "server" | "keep-local" | "save-as-new") {
    if (!conflictMutation || !conflictServerNote || conflictBusy) return;
    setConflictBusy(true);
    setConflictError("");
    try {
      const parsed: unknown = JSON.parse(conflictMutation.requestJson ?? "null");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError("conflict request is invalid");
      const requestBody: Record<string, unknown> = { ...(parsed as Record<string, unknown>), idempotencyKey: Crypto.randomUUID() };
      if (resolution === "server") {
        await source.resolveConflict({ mutationId: conflictMutation.mutationId, resolution: "server" });
        return;
      }
      if (resolution === "keep-local") {
        if (!source.baseRevision) throw new Error(locale.t("sync.notOnDevice"));
        requestBody.expectedVersion = conflictServerNote.version;
        const replacement = buildOfflineNoteMutation({
          mutationId: String(requestBody.idempotencyKey), entityId: conflictMutation.id, operation: "update",
          baseRevision: source.baseRevision, requestBody, createdAt: new Date().toISOString(),
        });
        await source.resolveConflict({ mutationId: conflictMutation.mutationId, resolution: "replace", replacement });
        return;
      }
      const localId = `local:${Crypto.randomUUID()}`;
      delete requestBody.expectedVersion;
      const replacement = buildOfflineNoteMutation({
        mutationId: String(requestBody.idempotencyKey), entityId: localId, operation: "create",
        baseRevision: null, requestBody, createdAt: new Date().toISOString(),
      });
      await source.resolveConflict({ mutationId: conflictMutation.mutationId, resolution: "replace", replacement });
      router.replace(`/notes/${encodeURIComponent(localId)}` as Href);
    } catch {
      setConflictError(locale.t("notes.conflictResolutionFailed"));
    } finally {
      setConflictBusy(false);
    }
  }
  return <AppScreen title={locale.t("notes.title")} onBack={() => router.replace("/notes")} backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("notes.title") })} backLabel={locale.t("notes.title")} refreshControl={<RefreshControl refreshing={source.refreshing} onRefresh={() => { setTaskRefresh(value => value + 1); source.refresh(); }} />}>
    {source.offline ? Platform.OS === "web" ? <OfflineNotice lastSyncedAt={source.lastSyncedAt} /> : <NotesOfflineNotice lastSyncedAt={source.lastSyncedAt} /> : null}
    {source.loading ? <LoadingState /> : null}
    {source.failure ? <ErrorState message={source.failure} /> : null}
    {source.missing && source.offline ? <NeedsNetworkState message={locale.t("sync.notOnDevice")} /> : source.missing ? <ErrorState message={locale.t("notes.missing")} /> : null}
    {note ? <>
      <View style={styles.heading}>
        <View style={styles.privatePill}><Ionicons color={colors.text3} name="lock-closed-outline" size={13} /><Text style={styles.private}>{locale.t("notes.private")}</Text></View>
        <Text style={styles.title}>{note.title}</Text>
        <Text style={styles.date}>{new Date(note.updatedAt).toLocaleString(dateLocale, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} · v{note.version}</Text>
      {note.localMutationState ? <Text accessibilityLiveRegion="polite" style={styles.mutationStatus}>{locale.t(`notes.outbox${note.localMutationState === "queued" ? "Queued" : note.localMutationState === "conflict" ? "Conflict" : "Failed"}` as "notes.outboxQueued" | "notes.outboxConflict" | "notes.outboxFailed")}</Text> : null}
      </View>
      {conflictMutation && conflictServerNote ? <View accessibilityRole="summary" style={styles.conflictPanel}>
        <Text style={styles.conflictTitle}>{locale.t("notes.conflictTitle")}</Text>
        <Text style={styles.conflictLabel}>{locale.t("notes.conflictLocalLabel")}</Text>
        <Text selectable style={styles.conflictBody}>{note.body}</Text>
        <Text style={styles.conflictLabel}>{locale.t("notes.conflictServerLabel")}</Text>
        <Text selectable style={styles.conflictBody}>{conflictServerNote.body}</Text>
        <View style={styles.conflictActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.keepLocalVersion")} disabled={conflictBusy} onPress={() => { void resolveConflict("keep-local"); }} style={styles.conflictPrimary}><Text style={styles.conflictPrimaryText}>{locale.t(conflictBusy ? "notes.conflictResolving" : "notes.keepLocalVersion")}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.useServerVersion")} disabled={conflictBusy} onPress={() => { void resolveConflict("server"); }} style={styles.conflictSecondary}><Text style={styles.conflictSecondaryText}>{locale.t("notes.useServerVersion")}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.saveAsNewNote")} disabled={conflictBusy} onPress={() => { void resolveConflict("save-as-new"); }} style={styles.conflictSecondary}><Text style={styles.conflictSecondaryText}>{locale.t("notes.saveAsNewNote")}</Text></Pressable>
        </View>
        {conflictError ? <Text accessibilityRole="alert" style={styles.conflictError}>{conflictError}</Text> : null}
      </View> : null}
      <View style={styles.paper}><MentionedBody body={note.body} mentions={note.mentions} mentionStyle={styles.mention} textStyle={styles.body} /></View>
      {note.contactIds.length ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>{locale.t("notes.relatedPeople")}</Text>
        <View style={styles.chips}>{note.contactIds.map((contactId) => <Pressable key={contactId} accessibilityRole="button" accessibilityLabel={locale.t("notes.openRelatedPerson", { name: contactNames.get(contactId) ?? contactId })} onPress={() => router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)} style={styles.chip}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(contactNames.get(contactId) ?? contactId.replace(/^contact:/, "")).slice(0, 1).toLocaleUpperCase()}</Text></View><Text numberOfLines={1} style={styles.chipText}>{contactNames.get(contactId) ?? contactId.replace(/^contact:/, "")}</Text>
        </Pressable>)}</View>
      </View> : null}
      {note.eventIds.length ? <View style={styles.section}><Text style={styles.sectionTitle}>{locale.t("notes.relatedEvents")}</Text>{note.eventIds.map((eventId) => <Pressable key={eventId} accessibilityRole="button" accessibilityLabel={locale.t("notes.openRelatedEvent", { name: eventNames.get(eventId) ?? eventId })} onPress={() => router.push(`/events/${encodeURIComponent(eventId)}` as Href)} style={styles.linkRow}><Ionicons color={colors.accent} name="calendar-outline" size={19} /><Text style={styles.linkText}>{eventNames.get(eventId) ?? eventId.replace(/^event:/, "")}</Text><Ionicons color={colors.text4} name="chevron-forward" size={18} /></Pressable>)}</View> : null}
      <NoteSourceTasks key={JSON.stringify([scopeKey, actorId, noteId, taskRefresh])} actorId={actorId} noteId={noteId} scopeKey={scopeKey} />
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={source.offline && Platform.OS === "web" ? `${locale.t("notes.edit")}，${locale.t("sync.needsNetwork")}` : locale.t("notes.edit")} accessibilityState={{ disabled: source.offline && Platform.OS === "web" }} disabled={source.offline && Platform.OS === "web"} onPress={() => router.push(`/notes/${encodeURIComponent(note.id)}/edit` as Href)} style={[styles.editLarge, source.offline && Platform.OS === "web" && styles.disabled]}><Text style={styles.editText}>{locale.t(source.offline && Platform.OS === "web" ? "sync.needsNetwork" : "notes.edit")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={source.offline ? `${locale.t("notes.aiSummary")}，${locale.t("sync.needsNetwork")}` : locale.t("notes.aiSummary")} accessibilityState={{ disabled: source.offline }} disabled={source.offline} onPress={() => router.push(buildNoteSuggestionNavigation(note, locale.language))} style={[styles.iorbit, source.offline && styles.disabled]}><View style={styles.orbitMark}><Ionicons color={colors.onAccent} name="sparkles" size={16} /></View><Text style={styles.iorbitTitle}>{locale.t("notes.aiSummary")}</Text></Pressable>
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
  mutationStatus: { color: colors.accent, fontSize: typography.caption, fontWeight: "800" },
  conflictPanel: { backgroundColor: colors.surface2, borderColor: colors.rose, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  conflictTitle: { color: colors.rose, fontSize: typography.body, fontWeight: "900" },
  conflictLabel: { color: colors.text3, fontSize: typography.caption, fontWeight: "800" },
  conflictBody: { color: colors.ink, fontSize: typography.small, lineHeight: 21 },
  conflictActions: { gap: spacing.sm, paddingTop: spacing.xs },
  conflictPrimary: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.md, justifyContent: "center", minHeight: 46, paddingHorizontal: spacing.md },
  conflictPrimaryText: { color: colors.bg, fontSize: typography.small, fontWeight: "800" },
  conflictSecondary: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md },
  conflictSecondaryText: { color: colors.text, fontSize: typography.small, fontWeight: "700" },
  conflictError: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
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
  disabled: { opacity: 0.4 },
  editLarge: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.lg, flex: 1, justifyContent: "center", minHeight: 58 },
  editText: { color: colors.bg, fontSize: typography.body, fontWeight: "800" },
  iorbit: { alignItems: "center", borderColor: colors.ink, borderRadius: radius.lg, borderWidth: 1.5, flex: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 58, paddingHorizontal: spacing.sm },
  orbitMark: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.sm, height: 28, justifyContent: "center", width: 28 },
  iorbitTitle: { color: colors.ink, fontSize: typography.body, fontWeight: "800" },
}));
