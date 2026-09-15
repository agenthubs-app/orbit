import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { NoteMentionContract } from "../../api/contract/notes";
import type { ContactSummary } from "../../view-models/contacts";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { NoteContactSearchPage } from "./NoteContactPicker";

export function activeMentionQuery(body: string): { start: number; query: string } | null {
  const match = body.match(/(?:^|\s)@([^\s@]{1,30})$/u);
  if (!match || match.index === undefined) return null;
  const prefix = match[0].startsWith("@") ? "" : match[0][0]!;
  return { start: match.index + prefix.length, query: match[1]! };
}

export function insertMention(body: string, active: { start: number; query: string }, contact: ContactSummary): { body: string; mention: NoteMentionContract } {
  const displayText = `@${contact.name}`;
  const endOfQuery = active.start + active.query.length + 1;
  const nextBody = `${body.slice(0, active.start)}${displayText} ${body.slice(endOfQuery)}`;
  return {
    body: nextBody,
    mention: { contactId: contact.id, start: active.start, end: active.start + displayText.length, displayText },
  };
}

export function updateMentionRanges(previousBody: string, nextBody: string, mentions: readonly NoteMentionContract[]): NoteMentionContract[] {
  let prefix = 0;
  while (prefix < previousBody.length && prefix < nextBody.length && previousBody[prefix] === nextBody[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < previousBody.length - prefix
    && suffix < nextBody.length - prefix
    && previousBody[previousBody.length - 1 - suffix] === nextBody[nextBody.length - 1 - suffix]
  ) suffix += 1;
  const previousEditEnd = previousBody.length - suffix;
  const nextEditEnd = nextBody.length - suffix;
  const shift = nextEditEnd - previousEditEnd;
  return mentions.flatMap((mention) => {
    const shifted = mention.end <= prefix
      ? mention
      : mention.start >= previousEditEnd
        ? { ...mention, start: mention.start + shift, end: mention.end + shift }
        : null;
    return shifted && nextBody.slice(shifted.start, shifted.end) === shifted.displayText ? [shifted] : [];
  });
}

export function NoteMentionEditor({ body, disabled = false, mentions, onChange, search }: {
  body: string;
  disabled?: boolean;
  mentions: readonly NoteMentionContract[];
  onChange: (body: string, mentions: readonly NoteMentionContract[]) => void;
  search: (query: string, cursor: string | undefined, signal: AbortSignal) => Promise<NoteContactSearchPage>;
}) {
  const { styles, colors } = useStyles();
  const locale = useOrbitLocale();
  const [results, setResults] = useState<ContactSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const active = activeMentionQuery(body);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    if (!active) { setResults([]); setSearching(false); return; }
    const operation = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void search(active.query, undefined, operation.signal).then((page) => {
        if (operation.signal.aborted || current !== generation.current) return;
        setResults([...page.contacts].slice(0, 6));
        setSearching(false);
      }).catch(() => {
        if (!operation.signal.aborted && current === generation.current) { setResults([]); setSearching(false); }
      });
    }, 250);
    return () => { clearTimeout(timer); operation.abort(); };
  }, [active?.query, active?.start, search]);

  function updateBody(value: string) {
    onChange(value, updateMentionRanges(body, value, mentions));
  }

  return <View style={styles.editor}>
    <TextInput accessibilityLabel={locale.t("notes.body")} editable={!disabled} multiline onChangeText={updateBody} placeholder={locale.t("notes.bodyPlaceholder")} placeholderTextColor={colors.text4} style={styles.input} textAlignVertical="top" value={body} />
    {active ? <View accessibilityLabel={locale.t("notes.mentionCandidates")} style={styles.suggestions}>
      <View style={styles.suggestionHeader}><Ionicons color={colors.accent} name="at" size={16} /><Text style={styles.suggestionTitle}>{locale.t(searching ? "notes.mentionSearching" : results.length ? "notes.mentionChoose" : "notes.mentionNone")}</Text></View>
      {results.map((contact) => <Pressable key={contact.id} accessibilityRole="button" accessibilityLabel={locale.t("notes.mentionNamed", { name: contact.name })} onPress={() => {
        const inserted = insertMention(body, active, contact);
        onChange(inserted.body, [...mentions, inserted.mention]);
        setResults([]);
      }} style={styles.result}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{contact.name.slice(0, 1).toLocaleUpperCase()}</Text></View>
        <View style={styles.copy}><Text style={styles.name}>{contact.name}</Text><Text numberOfLines={1} style={styles.meta}>{[contact.role, contact.organization].filter(Boolean).join(" · ")}</Text></View>
      </Pressable>)}
    </View> : null}
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  editor: { position: "relative" },
  input: { color: colors.ink, fontSize: typography.body, lineHeight: 26, minHeight: 260, paddingVertical: spacing.lg },
  suggestions: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, boxShadow: "0 10px 28px rgba(11,18,32,0.10)", marginBottom: spacing.md, overflow: "hidden" },
  suggestionHeader: { alignItems: "center", backgroundColor: colors.accentSofter, flexDirection: "row", gap: 6, minHeight: 38, paddingHorizontal: spacing.md },
  suggestionTitle: { color: colors.text2, fontSize: typography.caption, fontWeight: "700" },
  result: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md },
  avatar: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: radius.pill, height: 34, justifyContent: "center", width: 34 },
  avatarText: { color: colors.accent, fontSize: typography.small, fontWeight: "800" },
  copy: { flex: 1 },
  name: { color: colors.ink, fontSize: typography.small, fontWeight: "700" },
  meta: { color: colors.text3, fontSize: typography.caption, marginTop: 2 },
}));
