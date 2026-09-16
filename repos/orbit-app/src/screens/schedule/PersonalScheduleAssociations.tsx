import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { contactDetailPath, contactsSearchPath, notePath, notesSearchPath } from "../../api/endpoints";
import { contactDetailToSummary, contactsToSummaries } from "../../view-models/contacts";
import { noteFromPayload, notesPageFromPayload } from "../../view-models/notes";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createThemedStyles } from "../../design/theme";

export function PersonalScheduleAssociations({ actorId, scopeKey, noteIds, contactIds, disabled = false, onNotesChange, onContactsChange }: {
  actorId: string; scopeKey: string; noteIds: readonly string[]; contactIds: readonly string[]; disabled?: boolean;
  onNotesChange?: (ids: string[]) => void; onContactsChange?: (ids: string[]) => void;
}) {
  const locale = useOrbitLocale(); const { styles } = useStyles();
  if (!onNotesChange && !onContactsChange && !noteIds.length && !contactIds.length) return null;
  return <View><Text style={styles.hint}>{locale.t("personal53.associations")}</Text><AssociationPicker actorId={actorId} scopeKey={scopeKey} noteIds={noteIds} kind="note" disabled={disabled} {...(onNotesChange ? { onNotesChange } : {})} /><AssociationPicker actorId={actorId} scopeKey={scopeKey} noteIds={contactIds} kind="contact" disabled={disabled} {...(onContactsChange ? { onNotesChange: onContactsChange } : {})} /></View>;
}
function AssociationPicker({ actorId, scopeKey, noteIds, kind, disabled = false, onNotesChange }: {
  actorId: string; scopeKey: string; noteIds: readonly string[]; kind: "note" | "contact"; disabled?: boolean;
  onNotesChange?: (ids: string[]) => void;
}) {
  const client = useOrbitApiClient({ scopeKey }); const locale = useOrbitLocale(); const router = useRouter(); const { styles } = useStyles();
  const [open, setOpen] = useState(false); const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  const [names, setNames] = useState<Record<string, string>>({}); const [unavailable, setUnavailable] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const pageOperation = useRef<AbortController | null>(null);
  const idsKey = JSON.stringify(noteIds);
  useEffect(() => {
    const operation = new AbortController(); setNames({}); setUnavailable([]);
    void Promise.all(noteIds.map(async id => {
      try {
        const result = await client.get<unknown>(kind === "note" ? notePath(id) : contactDetailPath(id), { signal: operation.signal });
        if (!result.success) return { id, title: null };
        if (kind === "note") return { id, title: noteFromPayload(result.data, actorId, id, locale.language)?.title ?? null };
        const contact = contactDetailToSummary(result.data, locale.language);
        return { id, title: contact.id === id ? contact.name : null };
      } catch { return { id, title: null }; }
    })).then(items => {
      if (operation.signal.aborted) return;
      setNames(Object.fromEntries(items.filter(item => item.title !== null).map(item => [item.id, item.title!])));
      setUnavailable(items.filter(item => item.title === null).map(item => item.id));
    });
    return () => operation.abort();
  }, [client, actorId, idsKey, locale.language, kind]);
  async function search(word: string, next: string | null, signal: AbortSignal) {
    const result = kind === "note" ? await client.get<unknown>(notesSearchPath({ q: word, limit: 20, ...(next ? { cursor: next } : {}) }), { signal })
      : await client.post<unknown>(contactsSearchPath(), { body: { query: word, limit: 20, ...(next ? { cursor: next } : {}) }, signal });
    if (!result.success) throw new Error(locale.t("notes.searchUnavailable"));
    if (kind === "note") {
      const page = notesPageFromPayload(result.data, actorId, locale.language);
      if (!page || page.notes.length > 20) throw new Error(locale.t("notes.searchUnavailable"));
      return { items: page.notes.map(note => ({ id: note.id, title: note.title })), nextCursor: page.nextCursor };
    }
    const raw = result.data as { contacts?: unknown; nextCursor?: unknown } | null;
    if (!raw || !Array.isArray(raw.contacts) || raw.contacts.length > 20 || (raw.nextCursor !== undefined && typeof raw.nextCursor !== "string")) throw new Error(locale.t("notes.searchUnavailable"));
    const contacts = contactsToSummaries(result.data, locale.language);
    if (contacts.length !== raw.contacts.length || contacts.some(contact => !contact.id || contact.id === "contact") || new Set(contacts.map(contact => contact.id)).size !== contacts.length) throw new Error(locale.t("notes.searchUnavailable"));
    return { items: contacts.map(contact => ({ id: contact.id, title: contact.name })), nextCursor: typeof raw.nextCursor === "string" && raw.nextCursor ? raw.nextCursor : null };
  }
  useEffect(() => {
    pageOperation.current?.abort();
    const operation = new AbortController(); pageOperation.current = operation; setResults([]); setCursor(null); setError("");
    if (!open || !query.trim()) { setLoading(false); return () => operation.abort(); }
    setLoading(true);
    const timer = setTimeout(() => {
      void search(query.trim(), null, operation.signal).then(page => {
        if (operation.signal.aborted) return;
        setResults(page.items); setCursor(page.nextCursor);
      }).catch(() => { if (!operation.signal.aborted) setError(locale.t("notes.searchUnavailable")); }).finally(() => { if (!operation.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); operation.abort(); pageOperation.current?.abort(); };
  }, [client, actorId, open, query, locale, kind]);
  async function more() {
    if (!cursor || loading) return;
    const operation = new AbortController(); pageOperation.current = operation;
    setLoading(true);
    try {
      const page = await search(query.trim(), cursor, operation.signal);
      if (operation.signal.aborted) return;
      setResults(items => [...new Map([...items, ...page.items].map(item => [item.id, item])).values()]); setCursor(page.nextCursor);
    } catch { if (!operation.signal.aborted) setError(locale.t("notes.searchUnavailable")); } finally { if (!operation.signal.aborted) setLoading(false); }
  }
  return <View style={styles.group}>
    {onNotesChange ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t(kind === "note" ? "personal53.notes" : "personal53.contacts")} disabled={disabled} onPress={() => setOpen(value => !value)} style={styles.row}><Text style={styles.link}>{locale.t(kind === "note" ? "personal53.notes" : "personal53.contacts")}</Text></Pressable> : null}
    {noteIds.map(id => <View key={id} style={styles.row}>
      {names[id] ? <Pressable accessibilityRole="button" disabled={disabled} onPress={() => router.push(`/${kind === "note" ? "notes" : "contacts"}/${encodeURIComponent(id)}` as Href)}><Text style={styles.link}>{names[id]}</Text></Pressable> : null}
      {unavailable.includes(id) ? <Text accessibilityRole="alert" style={styles.error}>{locale.t("personal53.unavailable")}</Text> : null}
      {onNotesChange ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.removeRelatedPerson", { name: names[id] ?? locale.t("personal53.notes") })} disabled={disabled} onPress={() => onNotesChange(noteIds.filter(value => value !== id))}><Text style={styles.link}>×</Text></Pressable> : null}
    </View>)}
    {open ? <View><TextInput accessibilityLabel={locale.t(kind === "note" ? "notes.search" : "notes.searchRelatedPeople")} value={query} onChangeText={setQuery} editable={!disabled} style={styles.input} />
      {results.map(note => <Pressable key={note.id} accessibilityRole="checkbox" accessibilityLabel={note.title} accessibilityState={{ checked: noteIds.includes(note.id) }} disabled={disabled || (!noteIds.includes(note.id) && noteIds.length >= 50)} onPress={() => onNotesChange?.(noteIds.includes(note.id) ? noteIds.filter(id => id !== note.id) : [...noteIds, note.id])} style={styles.row}><Text style={styles.link}>{note.title}</Text></Pressable>)}
      {cursor ? <Pressable accessibilityRole="button" disabled={loading || disabled} onPress={() => void more()} style={styles.row}><Text style={styles.link}>{locale.t("notes.loadMore")}</Text></Pressable> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View> : null}
  </View>;
}
const useStyles = createThemedStyles(colors => ({ group: { marginVertical: 4 }, hint: { color: colors.text3, fontSize: 13 }, row: { minHeight: 44, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const }, link: { color: colors.accent, fontSize: 16 }, input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, paddingHorizontal: 12 }, error: { color: colors.rose, fontSize: 14 } }));
