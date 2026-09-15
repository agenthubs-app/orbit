import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { ContactSummary } from "../../view-models/contacts";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export interface NoteContactSearchPage {
  contacts: readonly ContactSummary[];
  nextCursor?: string;
}

export function NoteContactPicker({ disabled = false, selectedIds, selectedContacts = [], onToggle, search }: {
  disabled?: boolean;
  selectedIds: readonly string[];
  selectedContacts?: readonly ContactSummary[];
  onToggle: (id: string, contact?: ContactSummary) => void;
  search: (query: string, cursor: string | undefined, signal: AbortSignal) => Promise<NoteContactSearchPage>;
}) {
  const { styles, colors } = useStyles();
  const locale = useOrbitLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const names = new Map(selectedContacts.map((contact) => [contact.id, contact]));
  for (const contact of results) names.set(contact.id, contact);

  useEffect(() => {
    const word = query.trim();
    controller.current?.abort();
    const currentGeneration = ++generation.current;
    if (!open) return;
    if (!word) {
      setResults([]);
      setNextCursor(undefined);
      setSearching(false);
      setError("");
      return;
    }
    const operation = new AbortController();
    controller.current = operation;
    setSearching(true);
    setError("");
    const timer = setTimeout(() => {
      const request = search(word, undefined, operation.signal);
      void request.then((page) => {
        if (operation.signal.aborted || currentGeneration !== generation.current) return;
        setResults([...page.contacts]);
        setNextCursor("nextCursor" in page ? page.nextCursor : undefined);
        setSearching(false);
      }).catch((reason: unknown) => {
        if (operation.signal.aborted || currentGeneration !== generation.current) return;
        setError(reason instanceof Error ? reason.message : locale.t("notes.searchUnavailable"));
        setSearching(false);
      });
    }, 250);
    return () => { clearTimeout(timer); operation.abort(); };
  }, [locale, open, query, search]);

  async function loadMore() {
    if (!nextCursor || searching) return;
    const operation = new AbortController();
    controller.current = operation;
    const currentGeneration = generation.current;
    setSearching(true);
    try {
      const page = await search(query.trim(), nextCursor, operation.signal);
      if (operation.signal.aborted || currentGeneration !== generation.current) return;
      setResults((items) => [...new Map([...items, ...page.contacts].map((contact) => [contact.id, contact])).values()]);
      setNextCursor(page.nextCursor);
    } catch (reason) {
      if (!operation.signal.aborted) setError(reason instanceof Error ? reason.message : locale.t("notes.searchUnavailable"));
    } finally {
      if (!operation.signal.aborted) setSearching(false);
    }
  }

  const selected = new Set(selectedIds);
  return <View style={styles.group}>
    <View style={styles.labelRow}>
      <View>
        <Text style={styles.label}>{locale.t("notes.relatedPeople")}</Text>
        <Text style={styles.hint}>{locale.t("notes.relatedPeopleHint")}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.addRelatedPeople")} disabled={disabled} onPress={() => setOpen((value) => !value)} style={styles.addButton}>
        <Ionicons color={colors.accent} name={open ? "close" : "add"} size={23} />
      </Pressable>
    </View>
    {selectedIds.length ? <View style={styles.selectedRow}>{selectedIds.map((id) => {
      const contact = names.get(id);
      return <View key={id} style={styles.chip}>
        <Text numberOfLines={1} style={styles.chipText}>{contact?.name ?? id}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.removeRelatedPerson", { name: contact?.name ?? id })} disabled={disabled} onPress={() => onToggle(id, contact)} hitSlop={8}>
          <Ionicons color={colors.text3} name="close-circle" size={18} />
        </Pressable>
      </View>;
    })}</View> : null}
    {open ? <View style={styles.searchPanel}>
      <View style={styles.searchBox}>
        <Ionicons color={colors.text3} name="search" size={19} />
        <TextInput accessibilityLabel={locale.t("notes.searchRelatedPeople")} autoCapitalize="none" autoCorrect={false} editable={!disabled} onChangeText={setQuery} placeholder={locale.t("notes.searchPeoplePlaceholder")} placeholderTextColor={colors.text4} style={styles.searchInput} value={query} />
      </View>
      {!query.trim() ? <Text style={styles.emptyHint}>{locale.t("notes.searchPeopleStart")}</Text> : null}
      {searching && results.length === 0 ? <Text accessibilityLiveRegion="polite" style={styles.emptyHint}>{locale.t("notes.searching")}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {query.trim() && !searching && !error && results.length === 0 ? <Text style={styles.emptyHint}>{locale.t("notes.noPeople")}</Text> : null}
      {results.map((contact) => {
        const checked = selected.has(contact.id);
        return <Pressable key={contact.id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => onToggle(contact.id, contact)} style={styles.resultRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{contact.name.slice(0, 1).toLocaleUpperCase()}</Text></View>
          <View style={styles.resultCopy}>
            <Text style={styles.resultName}>{contact.name}</Text>
            <Text numberOfLines={1} style={styles.resultMeta}>{[contact.role, contact.organization].filter(Boolean).join(" · ") || locale.t("notes.personProfile")}</Text>
          </View>
          <Ionicons color={checked ? colors.accent : colors.borderStrong} name={checked ? "checkmark-circle" : "ellipse-outline"} size={23} />
        </Pressable>;
      })}
      {nextCursor ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("notes.loadMorePeople")} disabled={searching} onPress={() => { void loadMore(); }} style={styles.more}><Text style={styles.moreText}>{locale.t(searching ? "notes.loadingMore" : "notes.loadMore")}</Text></Pressable> : null}
    </View> : null}
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  group: { gap: spacing.md },
  labelRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  label: { color: colors.ink, fontSize: typography.body, fontWeight: "700", lineHeight: 23 },
  hint: { color: colors.text3, fontSize: typography.caption, lineHeight: 18, marginTop: 2 },
  addButton: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: radius.pill, height: 38, justifyContent: "center", width: 38 },
  selectedRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { alignItems: "center", backgroundColor: colors.surface3, borderRadius: radius.pill, flexDirection: "row", gap: 6, maxWidth: 190, minHeight: 36, paddingHorizontal: spacing.md },
  chipText: { color: colors.text, flexShrink: 1, fontSize: typography.small, fontWeight: "600" },
  searchPanel: { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden", padding: spacing.md },
  searchBox: { alignItems: "center", backgroundColor: colors.surface3, borderRadius: radius.md, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  searchInput: { color: colors.ink, flex: 1, fontSize: typography.body, minHeight: 44, paddingVertical: 0 },
  emptyHint: { color: colors.text3, fontSize: typography.small, lineHeight: 20, paddingHorizontal: spacing.sm, paddingVertical: spacing.lg, textAlign: "center" },
  error: { color: colors.rose, fontSize: typography.small, lineHeight: 20, padding: spacing.sm },
  resultRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm },
  avatar: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: radius.pill, height: 40, justifyContent: "center", width: 40 },
  avatarText: { color: colors.accent, fontSize: typography.body, fontWeight: "800" },
  resultCopy: { flex: 1, minWidth: 0 },
  resultName: { color: colors.ink, fontSize: typography.body, fontWeight: "700" },
  resultMeta: { color: colors.text3, fontSize: typography.caption, lineHeight: 18, marginTop: 2 },
  more: { alignItems: "center", minHeight: 44, justifyContent: "center" },
  moreText: { color: colors.accent, fontSize: typography.small, fontWeight: "700" },
}));
