import { useEffect, useMemo, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { contactDetailPath, notePath } from "../../api/endpoints";
import { personalScheduleAssociationOptionsPageSchema } from "../../api/schema/personal-schedule-associations";
import { contactDetailToSummary } from "../../view-models/contacts";
import { noteFromPayload } from "../../view-models/notes";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createThemedStyles } from "../../design/theme";

export function PersonalScheduleAssociations({ actorId, scopeKey, noteIds, contactIds, disabled = false, onNotesChange, onContactsChange }: {
  actorId: string; scopeKey: string; noteIds: readonly string[]; contactIds: readonly string[]; disabled?: boolean;
  onNotesChange?: (ids: string[]) => void; onContactsChange?: (ids: string[]) => void;
}) {
  const locale = useOrbitLocale(); const { styles } = useStyles();
  if (!onNotesChange && !onContactsChange && !noteIds.length && !contactIds.length) return null;
  return <View accessibilityLabel={locale.t("personal53.associations")}>{!onNotesChange && !onContactsChange ? <Text style={styles.hint}>{locale.t("personal53.associations")}</Text> : null}<AssociationPicker actorId={actorId} scopeKey={scopeKey} noteIds={contactIds} kind="contact" disabled={disabled} {...(onContactsChange ? { onNotesChange: onContactsChange } : {})} /><AssociationPicker actorId={actorId} scopeKey={scopeKey} noteIds={noteIds} kind="note" compactEntry={!noteIds.length && !!onNotesChange} disabled={disabled} {...(onNotesChange ? { onNotesChange } : {})} /></View>;
}
function AssociationPicker({ actorId, scopeKey, noteIds, kind, disabled = false, compactEntry = false, onNotesChange }: {
  actorId: string; scopeKey: string; noteIds: readonly string[]; kind: "note" | "contact"; disabled?: boolean; compactEntry?: boolean;
  onNotesChange?: (ids: string[]) => void;
}) {
  const client = useOrbitApiClient({ scopeKey }); const locale = useOrbitLocale(); const router = useRouter(); const { styles } = useStyles();
  const server = useOrbitApiBaseUrl();
  const [open, setOpen] = useState(false); const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  const [names, setNames] = useState<Record<string, string>>({}); const [unavailable, setUnavailable] = useState<string[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<string | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [partial, setPartial] = useState(false);
  const dismiss = () => { pageOperation.current?.abort(); setOpen(false); setQuery(""); setResults([]); setCursor(null); setError(""); };
  const drag = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => true, onPanResponderTerminationRequest: () => false, onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx), onPanResponderRelease: (_event, gesture) => { if (gesture.dy > 60 && Math.abs(gesture.dy) > Math.abs(gesture.dx)) dismiss(); } }), []);
  const pageOperation = useRef<AbortController | null>(null);
  const idsKey = JSON.stringify(noteIds);
  useEffect(() => {
    const operation = new AbortController(); setNames({}); setUnavailable([]); setImages({});
    void Promise.all(noteIds.map(async (id): Promise<{ id: string; title: string | null; imageUrl?: string }> => {
      try {
        const result = await client.get<unknown>(kind === "note" ? notePath(id) : contactDetailPath(id), { signal: operation.signal });
        if (!result.success) return { id, title: null };
        if (kind === "note") return { id, title: noteFromPayload(result.data, actorId, id, locale.language)?.title ?? null };
        const contact = contactDetailToSummary(result.data, locale.language);
        if (contact.id !== id) return { id, title: null };
        let imageUrl: string | undefined;
        if (contact.imageUrl) {
          try {
            const url = new URL(contact.imageUrl, server.baseUrl);
            if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) imageUrl = url.href;
          } catch { /* Invalid images fall back to this verified contact's initial. */ }
        }
        return { id, title: contact.name, ...(imageUrl ? { imageUrl } : {}) };
      } catch { return { id, title: null }; }
    })).then(items => {
      if (operation.signal.aborted) return;
      setNames(Object.fromEntries(items.filter(item => item.title !== null).map(item => [item.id, item.title!])));
      setImages(Object.fromEntries(items.filter(item => item.title !== null && item.imageUrl).map(item => [item.id, item.imageUrl!])));
      setUnavailable(items.filter(item => item.title === null).map(item => item.id));
    });
    return () => operation.abort();
  }, [client, actorId, idsKey, locale.language, kind, server.baseUrl]);
  async function search(word: string, next: string | null, signal: AbortSignal) {
    const params = new URLSearchParams({ q: word, limit: "20", ...(next ? { cursor: next } : {}) });
    const result = kind === "note"
      ? await client.get<unknown>(`/api/schedule-items/association-options/notes?${params}`, { signal })
      : await client.get<unknown>(`/api/schedule-items/association-options/contacts?${params}`, { signal });
    if (!result.success) throw new Error(locale.t("notes.searchUnavailable"));
    const decoded = personalScheduleAssociationOptionsPageSchema.safeParse(result.data);
    if (!decoded.success || decoded.data.actorId !== actorId || decoded.data.kind !== kind) throw new Error(locale.t("notes.searchUnavailable"));
    return { items: decoded.data.options, nextCursor: decoded.data.nextCursor ?? null, partial: decoded.data.partial };
  }
  useEffect(() => {
    pageOperation.current?.abort();
    const operation = new AbortController(); pageOperation.current = operation; setResults([]); setCursor(null); setError(""); setPartial(false);
    if (!open) { setLoading(false); return () => operation.abort(); }
    setLoading(true);
    const timer = setTimeout(() => {
      void search(query.trim(), null, operation.signal).then(page => {
        if (operation.signal.aborted) return;
        setResults(page.items); setCursor(page.nextCursor); setPartial(page.partial);
      }).catch(() => { if (!operation.signal.aborted) setError(locale.t("notes.searchUnavailable")); }).finally(() => { if (!operation.signal.aborted) setLoading(false); });
    }, query.trim() ? 250 : 0);
    return () => { clearTimeout(timer); operation.abort(); pageOperation.current?.abort(); };
  }, [client, actorId, open, query, locale, kind, retry]);
  async function more() {
    if (!cursor || loading) return;
    const operation = new AbortController(); pageOperation.current = operation;
    setLoading(true);
    try {
      const page = await search(query.trim(), cursor, operation.signal);
      if (operation.signal.aborted) return;
      setResults(items => [...new Map([...items, ...page.items].map(item => [item.id, item])).values()]); setCursor(page.nextCursor); setPartial(page.partial);
    } catch { if (!operation.signal.aborted) setError(locale.t("notes.searchUnavailable")); } finally { if (!operation.signal.aborted) setLoading(false); }
  }
  return <View style={[styles.group, compactEntry ? { position: "absolute", right: 44, top: 0 } : null]}>
    {onNotesChange ? <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel={locale.t(kind === "note" ? "personal53.notes" : "personal53.contacts")} disabled={disabled} onPress={() => setOpen(value => !value)} style={styles.entry}><Text style={[styles.groupLabel, compactEntry ? { fontSize: 12 } : null]}>{locale.t(kind === "note" ? "personal53.notes" : "personal53.contacts")}</Text></Pressable>{kind === "contact" ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.addRelatedPeople")} disabled={disabled} onPress={() => setOpen(true)} style={styles.close}><Text style={styles.link}>＋</Text></Pressable> : null}</View> : null}
    <View style={styles.chips}>{noteIds.map(id => <View key={id} style={styles.chip}>
      {names[id] ? <Pressable accessibilityRole="button" accessibilityLabel={names[id]} disabled={disabled} onPress={() => router.push(`/${kind === "note" ? "notes" : "contacts"}/${encodeURIComponent(id)}` as Href)} style={styles.identity}><View style={styles.chipVisual}>{kind === "contact" ? <View accessibilityRole="image" accessibilityLabel={locale.t("contacts.avatarFor", { name: names[id] })} style={styles.avatar}>{images[id] ? <Image accessible={false} resizeMode="cover" source={{ uri: images[id] }} style={styles.avatarImage} onError={() => setImages(previous => { const next = { ...previous }; delete next[id]; return next; })} /> : <Text style={styles.avatarText}>{Array.from(names[id]!)[0]}</Text>}</View> : null}<Text style={styles.chipText}>{names[id]}</Text></View></Pressable> : null}
      {unavailable.includes(id) ? <Text accessibilityRole="alert" style={styles.error}>{locale.t("personal53.unavailable")}</Text> : null}
      {onNotesChange ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.removeRelatedPerson", { name: names[id] ?? locale.t(kind === "note" ? "personal53.notes" : "personal53.contacts") })} disabled={disabled} onPress={() => onNotesChange(noteIds.filter(value => value !== id))} style={styles.close}><Text style={styles.link}>×</Text></Pressable> : null}
    </View>)}</View>
    {open ? <Modal transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("common.close")} onPress={dismiss} style={styles.backdrop} />
        <View role="dialog" accessibilityLabel={locale.t(kind === "note" ? "personal53.notes" : "personal53.contacts")} accessibilityViewIsModal style={styles.sheet}>
          <View {...drag.panHandlers} style={styles.handleArea}><View style={styles.handle} /></View>
          <View style={styles.row}><Text style={styles.sheetTitle}>{locale.t(kind === "note" ? "personal53.notes" : "personal53.contacts")}</Text><Pressable accessibilityRole="button" accessibilityLabel={locale.t("common.close")} onPress={dismiss} style={styles.close}><Text style={styles.link}>×</Text></Pressable></View>
          <TextInput accessibilityLabel={locale.t(kind === "note" ? "notes.search" : "notes.searchRelatedPeople")} value={query} onChangeText={setQuery} editable={!disabled} autoCapitalize="none" style={styles.input} />
          <Text accessibilityLiveRegion="polite" style={styles.hint}>{locale.t("personal59.selectedCount", { count: noteIds.length })}</Text>
          {noteIds.length >= 50 ? <Text accessibilityRole="alert" style={styles.hint}>{locale.t("personal59.associationLimit")}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
      {loading ? <Text accessibilityRole="progressbar" style={styles.hint}>{locale.t("notes.loadingMore")}</Text> : null}
      {!loading && !error && !results.length && !cursor ? <Text style={styles.hint}>{locale.t(kind === "note" ? query.trim() ? "notes.emptySearch" : "notes.empty" : "notes.noPeople")}</Text> : null}
      {results.map(note => <Pressable key={note.id} accessibilityRole="checkbox" accessibilityLabel={note.title} aria-checked={noteIds.includes(note.id)} accessibilityState={{ checked: noteIds.includes(note.id) }} disabled={disabled || (!noteIds.includes(note.id) && noteIds.length >= 50)} onPress={() => onNotesChange?.(noteIds.includes(note.id) ? noteIds.filter(id => id !== note.id) : [...noteIds, note.id])} style={styles.row}><Text style={styles.link}>{note.title}</Text>{noteIds.includes(note.id) ? <Text aria-hidden style={styles.link}>✓</Text> : null}</Pressable>)}
      {partial ? <Text style={styles.hint}>{locale.t("personal59.partialSearch")}</Text> : null}
      {cursor ? <Pressable accessibilityRole="button" disabled={loading || disabled} onPress={() => void more()} style={styles.row}><Text style={styles.link}>{locale.t(kind === "note" ? "notes.loadMore" : "notes.loadMorePeople")}</Text></Pressable> : null}
      {error ? <View><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={styles.row}><Text style={styles.link}>{locale.t("common.retry")}</Text></Pressable></View> : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal> : null}
  </View>;
}
const useStyles = createThemedStyles(colors => ({ group: { marginVertical: 4 }, hint: { color: colors.text3, fontSize: 11 }, groupLabel: { color: colors.text, fontSize: 15, fontWeight: "800" as const }, entry: { minHeight: 44, minWidth: 44, justifyContent: "center" as const }, chips: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 }, chip: { minHeight: 44, maxWidth: "100%" as const, flexDirection: "row" as const, alignItems: "center" as const }, identity: { minHeight: 44, minWidth: 44, flexShrink: 1, justifyContent: "center" as const }, chipVisual: { minHeight: 32, flexDirection: "row" as const, alignItems: "center" as const, gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border, borderRadius: 99, backgroundColor: colors.surface2 }, chipText: { flexShrink: 1, color: colors.text, fontSize: 13, fontWeight: "600" as const }, avatar: { width: 24, height: 24, borderRadius: 12, overflow: "hidden" as const, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: colors.border }, avatarImage: { width: 24, height: 24 }, avatarText: { color: colors.text, fontSize: 11, fontWeight: "700" as const }, row: { minHeight: 44, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const }, link: { color: colors.accent, fontSize: 16 }, input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, paddingHorizontal: 12 }, error: { color: colors.rose, fontSize: 14 }, overlay: { flex: 1, justifyContent: "flex-end" as const }, backdrop: { position: "absolute" as const, top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(11,18,32,0.35)" }, sheet: { maxHeight: "80%" as const, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: 32 }, handleArea: { height: 24, alignItems: "center" as const, justifyContent: "center" as const }, handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }, sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800" as const }, close: { minHeight: 44, minWidth: 44, alignItems: "center" as const, justifyContent: "center" as const }, list: { minHeight: 120, marginTop: 12 } }));
