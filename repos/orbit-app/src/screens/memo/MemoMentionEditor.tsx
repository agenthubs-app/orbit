import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { NoteMentionContract } from "../../api/contract/notes";
import { ListRow, Segmented, TextField, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { ContactSummary } from "../../view-models/contacts";
import type { EventSummary } from "../../view-models/events";
import type { NoteContactSearchPage } from "../notes/NoteContactPicker";
import { activeMemoMentionQuery, insertMemoMention, updateMemoMentionRanges, type MemoMentionCandidate } from "./memo-mention-model";

export function MemoMentionEditor({ body, disabled = false, mentions, onChange, searchContacts, events }: {
  body: string;
  disabled?: boolean;
  mentions: readonly NoteMentionContract[];
  onChange: (body: string, mentions: readonly NoteMentionContract[]) => void;
  searchContacts: (query: string, cursor: string | undefined, signal: AbortSignal) => Promise<NoteContactSearchPage>;
  events: readonly EventSummary[];
}) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const active = activeMemoMentionQuery(body);
  const [mode, setMode] = useState<"contact" | "event">("contact");
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [tokenError, setTokenError] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    if (!active || mode !== "contact" || disabled) { setContacts([]); setSearching(false); return; }
    const operation = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void searchContacts(active.query, undefined, operation.signal).then(page => {
        if (operation.signal.aborted || current !== generation.current) return;
        setContacts([...page.contacts].slice(0, 6)); setSearching(false);
      }).catch(() => { if (!operation.signal.aborted && current === generation.current) { setContacts([]); setSearching(false); } });
    }, 200);
    return () => { clearTimeout(timer); operation.abort(); };
  }, [active?.query, active?.start, disabled, mode, searchContacts]);
  const filteredEvents = active ? events.filter(event => event.title.toLocaleLowerCase(locale.language).includes(active.query.toLocaleLowerCase(locale.language))).slice(0, 6) : [];
  const candidates: MemoMentionCandidate[] = mode === "event"
    ? filteredEvents.map(event => ({ id: event.id, label: event.title, kind: "event" }))
    : contacts.map(contact => ({ id: contact.id, label: contact.name, kind: "contact" }));
  const changeBody = (value: string) => {
    const next = updateMemoMentionRanges(body, value, mentions);
    if (!next) { setTokenError(true); return; }
    setTokenError(false); onChange(value, next);
  };
  return <View style={styles.wrap}>
    <TextField label={locale.t("notes.body")} presentation="kit" multiline numberOfLines={8} textAlignVertical="top" value={body} onChangeText={changeBody} editable={!disabled} placeholder={locale.t("notes.bodyPlaceholder")} />
    {tokenError ? <UiText accessibilityRole="alert" style={styles.error}>{locale.t("notes.unknownMentionEdit")}</UiText> : null}
    {active && !disabled ? <View style={styles.candidates} accessibilityLabel={locale.t("notes.mentionCandidates")}>
      <Segmented segments={[{ key: "contact", label: locale.t("notes.mentionPersonTab") }, { key: "event", label: locale.t("notes.mentionEventTab") }]} value={mode} onChange={setMode} accessibilityLabel={locale.t("notes.mentionCandidates")} />
      {searching && mode === "contact" ? <UiText style={styles.hint}>{locale.t("notes.mentionSearching")}</UiText> : null}
      {!searching && candidates.length === 0 ? <UiText style={styles.hint}>{locale.t("notes.mentionNone")}</UiText> : null}
      {candidates.map(candidate => <ListRow key={`${candidate.kind}:${candidate.id}`} title={candidate.label} subtitle={candidate.kind === "event" ? locale.t("notes.mentionEventTab") : locale.t("notes.mentionPersonTab")}
        accessibilityLabel={locale.t(candidate.kind === "event" ? "notes.mentionEventNamed" : "notes.mentionNamed", { name: candidate.label })}
        onPress={() => { const inserted = insertMemoMention(body, active, candidate); setTokenError(false); onChange(inserted.body, [...mentions, inserted.mention]); setContacts([]); }} />)}
    </View> : null}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  wrap: { gap: spacing.sm },
  candidates: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, padding: spacing.sm },
  hint: { color: colors.ink3Text, fontSize: 12, padding: spacing.sm },
  error: { color: colors.coralText, fontSize: 12 },
}));
