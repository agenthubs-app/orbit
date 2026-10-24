import { type Href, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Platform, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import type { NoteMentionContract } from "../../api/contract/notes";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { Chip, EmptyState, RetryCard, Skeleton, UiText as Text } from "../../components/ui";
import { Icon } from "../../components/ui/Icon";
import { MemoOfflineNotice } from "./MemoOfflineNotice";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { eventsToSummaries } from "../../view-models/events";
import { buildOfflineNoteMutation } from "../../data/sync/note-outbox-mutation";
import { noteFromPayload } from "../../view-models/notes";
import { bodyAfterTitle } from "./memo-mention-model";
import { useNoteContactSummaries } from "../notes/useNoteContactSummaries";
import { NoteSourceTasks } from "../notes/NoteSourceTasks";
import { useNoteDetailSource } from "../notes/notes-source";

function MentionedBody({ body, mentions, mentionStyle, textStyle, disabledStyle, contactIds, eventIds, deletedContact, onOpenContact, onOpenEvent }: {
  body: string;
  mentions: readonly NoteMentionContract[];
  mentionStyle: object;
  textStyle: object;
  disabledStyle: object;
  contactIds: ReadonlySet<string>;
  eventIds: ReadonlySet<string>;
  deletedContact: string;
  onOpenContact: (id: string) => void;
  onOpenEvent: (id: string) => void;
}) {
  if (!mentions.length) return <Text selectable style={textStyle}>{body}</Text>;
  const ordered = [...mentions].sort((left, right) => left.start - right.start);
  let cursor = 0;
  const parts: ReactNode[] = [];
  ordered.forEach((mention, index) => {
    if (mention.start > cursor) parts.push(body.slice(cursor, mention.start));
    const isContact = (mention.entityType ?? "contact") === "contact";
    const contactId = isContact ? mention.contactId : undefined;
    const eventId = mention.entityType === "event" ? mention.eventId : undefined;
    const active = contactId ? contactIds.has(contactId) : eventId ? eventIds.has(eventId) : false;
    parts.push(<Text key={`${mention.start}:${index}`} accessibilityRole={active ? "link" : undefined}
      onPress={active ? () => contactId ? onOpenContact(contactId) : eventId ? onOpenEvent(eventId) : undefined : undefined}
      style={active ? mentionStyle : disabledStyle}>{contactId && !active ? deletedContact : mention.displayText}</Text>);
    cursor = mention.end;
  });
  if (cursor < body.length) parts.push(body.slice(cursor));
  return <Text selectable style={textStyle}>{parts}</Text>;
}

export function MemoDetailScreen({ actorId, noteId, scopeKey }: { actorId: string; noteId: string; scopeKey: string }) {
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
  const failedMutation = source.failedMutation ?? null;
  // Sprint 0136: 「未能保存 · 重试 / 放弃」. Discarding a note that only exists on this phone leaves its page.
  async function settleFailed(action: "retry" | "discard") {
    if (!failedMutation) return;
    setConflictBusy(true); setConflictError("");
    try {
      if (action === "retry") await source.retryFailed?.(failedMutation.mutationId);
      else {
        await source.discardFailed?.(failedMutation.mutationId);
        if (failedMutation.operation === "create") router.replace("/notes" as Href);
      }
    } catch { setConflictError(locale.t("notes.conflictResolutionFailed")); } finally { setConflictBusy(false); }
  }
  const conflictServerNote = conflictMutation?.serverSnapshot
    ? noteFromPayload({ note: conflictMutation.serverSnapshot }, actorId, conflictMutation.id, locale.language)
    : null;
  const contactSummaries = useNoteContactSummaries(note?.contactIds ?? [], scopeKey);
  const events = eventsState.kind === "success" || eventsState.kind === "empty" ? eventsToSummaries(eventsState.data) : [];
  const contactNames = new Map(note?.mentions.filter(mention => (mention.entityType ?? "contact") === "contact" && mention.contactId)
    .map(mention => [mention.contactId!, mention.displayText.replace(/^@/, "")] as const) ?? []);
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
  return <AppScreen inset="kit" title={locale.t("notes.title")} onBack={() => router.replace("/notes")} backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("notes.title") })} backLabel={locale.t("notes.title")}
    // UX-6: editing is one tap away like iOS Notes — "编辑" in the header, or tap the text.
    headerActions={note && !(source.offline && Platform.OS === "web") ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.edit")} hitSlop={8} onPress={() => router.push(`/notes/${encodeURIComponent(note.id)}/edit` as Href)} style={styles.headerEdit}><Text style={styles.headerEditText}>{locale.t("notes.editShort")}</Text></Pressable> : undefined}
    refreshControl={<RefreshControl refreshing={source.refreshing} onRefresh={() => { setTaskRefresh(value => value + 1); source.refresh(); }} />}>
    {source.offline ? <MemoOfflineNotice lastSyncedAt={source.lastSyncedAt} /> : null}
    {source.loading ? <Skeleton /> : null}
    {source.failure ? <RetryCard title={source.failure} onRetry={source.refresh} /> : null}
    {source.missing && source.offline ? <EmptyState title={locale.t("sync.notOnDevice")} /> : source.missing ? <EmptyState title={locale.t("notes.missing")} /> : null}
    {note ? <>
      <View style={styles.heading}>
        <Text style={styles.title}>{note.title}</Text>
        {note.noteKind === "voice" ? <Chip label={locale.t("notes.voiceSource")} /> : null}
        <Text style={styles.date}>{new Date(note.updatedAt).toLocaleString(dateLocale, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
      {note.localMutationState ? <Text accessibilityLiveRegion="polite" style={styles.mutationStatus}>{locale.t(`notes.outbox${note.localMutationState === "queued" ? "Queued" : note.localMutationState === "conflict" ? "Conflict" : "Failed"}` as "notes.outboxQueued" | "notes.outboxConflict" | "notes.outboxFailed")}</Text> : null}
      </View>
      {failedMutation && source.retryFailed ? <View style={styles.conflictActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("sync.retryChangeNamed", { title: note.title })} disabled={conflictBusy} onPress={() => { void settleFailed("retry"); }} style={styles.conflictSecondary}><Text style={styles.conflictSecondaryText}>{locale.t("common.retry")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("sync.discardChangeNamed", { title: note.title })} disabled={conflictBusy} onPress={() => { void settleFailed("discard"); }} style={styles.conflictSecondary}><Text style={styles.conflictSecondaryText}>{locale.t("sync.discardChange")}</Text></Pressable>
        {conflictError && !conflictMutation ? <Text accessibilityRole="alert" style={styles.conflictError}>{conflictError}</Text> : null}
      </View> : null}
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
      <Pressable accessible={false} accessibilityLabel={locale.t("notes.edit")} onPress={() => { if (!(source.offline && Platform.OS === "web")) router.push(`/notes/${encodeURIComponent(note.id)}/edit` as Href); }} style={styles.paper}><MentionedBody {...bodyAfterTitle(note.title, note.body, note.mentions)} mentionStyle={styles.mention} disabledStyle={styles.disabledMention} textStyle={styles.body}
        contactIds={new Set(contactSummaries.keys())} eventIds={new Set(events.map(event => event.id))} deletedContact={locale.t("notes.deletedContact")}
        onOpenContact={id => router.push(`/contacts/${encodeURIComponent(id)}` as Href)} onOpenEvent={id => router.push(`/events/${encodeURIComponent(id)}` as Href)} /></Pressable>
      {note.contactIds.length ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>{locale.t("notes.relatedPeople")}</Text>
        <View style={styles.chips}>{note.contactIds.map((contactId) => {
          const available = contactSummaries.has(contactId);
          const name = available ? contactNames.get(contactId) ?? contactId : locale.t("notes.deletedContact");
          const content = <><View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toLocaleUpperCase()}</Text></View><Text numberOfLines={1} style={styles.chipText}>{name}</Text></>;
          return available
            ? <Pressable key={contactId} accessibilityRole="button" accessibilityLabel={locale.t("notes.openRelatedPerson", { name })} onPress={() => router.push(`/contacts/${encodeURIComponent(contactId)}` as Href)} style={styles.chip}>{content}</Pressable>
            : <View key={contactId} style={styles.chip}>{content}</View>;
        })}</View>
      </View> : null}
      {note.eventIds.length ? <View style={styles.section}><Text style={styles.sectionTitle}>{locale.t("notes.relatedEvents")}</Text>{note.eventIds.map((eventId) => {
        const name = eventNames.get(eventId);
        return name
          ? <Pressable key={eventId} accessibilityRole="button" accessibilityLabel={locale.t("notes.openRelatedEvent", { name })} onPress={() => router.push(`/events/${encodeURIComponent(eventId)}` as Href)} style={styles.linkRow}><Icon color={colors.accentText} name="calendar" size={20} /><Text style={styles.linkText}>{name}</Text><Icon color={colors.ink3Text} name="right" size={20} /></Pressable>
          : <View key={eventId} style={styles.linkRow}><Icon color={colors.ink3Text} name="calendar" size={20} /><Text style={styles.disabledMention}>{eventId.replace(/^event:/, "")}</Text></View>;
      })}</View> : null}
      <NoteSourceTasks key={JSON.stringify([scopeKey, actorId, noteId, taskRefresh])} actorId={actorId} noteId={noteId} scopeKey={scopeKey} />
    </> : null}
  </AppScreen>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  heading: { gap: spacing.sm, paddingTop: spacing.sm },
  headerEdit: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }, headerEditText: { color: colors.accentText, fontSize: 17, fontWeight: "600" },
  privatePill: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surface3, borderRadius: radius.pill, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  private: { color: colors.ink3Text, fontSize: typography.label, fontWeight: "700" },
  title: { color: colors.ink, fontSize: 30, fontWeight: "900", letterSpacing: -0.5, lineHeight: 40 },
  date: { color: colors.ink3Text, fontSize: typography.label, lineHeight: 20 },
  mutationStatus: { color: colors.accentText, fontSize: typography.label, fontWeight: "800" },
  conflictPanel: { backgroundColor: colors.surface2, borderColor: colors.coralText, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  conflictTitle: { color: colors.coralText, fontSize: typography.body, fontWeight: "900" },
  conflictLabel: { color: colors.ink3Text, fontSize: typography.label, fontWeight: "800" },
  conflictBody: { color: colors.ink, fontSize: typography.bodySm, lineHeight: 24 },
  conflictActions: { gap: spacing.sm, paddingTop: spacing.xs },
  conflictPrimary: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.md, justifyContent: "center", minHeight: 46, paddingHorizontal: spacing.md },
  conflictPrimaryText: { color: colors.bg, fontSize: typography.bodySm, fontWeight: "800" },
  conflictSecondary: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.md, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md },
  conflictSecondaryText: { color: colors.ink, fontSize: typography.bodySm, fontWeight: "700" },
  conflictError: { color: colors.coralText, fontSize: typography.bodySm, lineHeight: 23 },
  paper: { borderBottomColor: colors.line, borderBottomWidth: 1, minHeight: 230, paddingBottom: spacing.xl, paddingTop: spacing.md },
  body: { color: colors.ink, fontSize: 19, lineHeight: 32 },
  mention: { backgroundColor: colors.accentSoft, color: colors.accentText, fontWeight: "800" },
  disabledMention: { color: colors.ink3Text, fontWeight: "700" },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: typography.bodySm, fontWeight: "800", letterSpacing: 0.3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { alignItems: "center", backgroundColor: colors.surface2, borderColor: colors.line, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", gap: 7, maxWidth: 180, minHeight: 42, paddingHorizontal: 8, paddingRight: 13 },
  avatar: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: radius.pill, height: 28, justifyContent: "center", width: 28 },
  avatarText: { color: colors.accentText, fontSize: typography.bodySm, fontWeight: "900" },
  chipText: { color: colors.ink, flexShrink: 1, fontSize: typography.bodySm, fontWeight: "700" },
  linkRow: { alignItems: "center", backgroundColor: colors.surface2, borderColor: colors.line, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md },
  linkText: { color: colors.ink, flex: 1, fontSize: typography.bodySm, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.lg },
  disabled: { opacity: 0.4 },
  editLarge: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.lg, flex: 1, justifyContent: "center", minHeight: 58 },
  editText: { color: colors.bg, fontSize: typography.body, fontWeight: "800" },
  iorbit: { alignItems: "center", borderColor: colors.ink, borderRadius: radius.lg, borderWidth: 1.5, flex: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 58, paddingHorizontal: spacing.sm },
  orbitMark: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.sm, height: 28, justifyContent: "center", width: 28 },
  iorbitTitle: { color: colors.ink, fontSize: typography.body, fontWeight: "800" },
}));
