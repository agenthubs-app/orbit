import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { radius, spacing } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export interface MentionContact {
  id: string;
  name: string;
  organization: string;
  role: string;
}

export function filterMentionContacts(
  contacts: readonly MentionContact[],
  query: string,
  selectedIds: readonly string[],
): MentionContact[] {
  const normalized = query.trim().toLocaleLowerCase();
  const selected = new Set(selectedIds);
  return contacts.filter((contact) => !selected.has(contact.id) && (!normalized
    || contact.name.toLocaleLowerCase().includes(normalized)
    || contact.organization.toLocaleLowerCase().includes(normalized))).slice(0, 8);
}

export function ContactMentionPicker({ contacts, onSelect, selectedIds }: {
  contacts: readonly MentionContact[];
  onSelect: (contact: MentionContact) => void;
  selectedIds: readonly string[];
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterMentionContacts(contacts, query, selectedIds), [contacts, query, selectedIds]);
  return <View style={styles.panel}>
    <Text style={styles.title}>{locale.t("aiMention.title")}</Text>
    <TextInput accessibilityLabel={locale.t("aiMention.searchLabel")} onChangeText={setQuery} placeholder={locale.t("aiMention.searchPlaceholder")} style={styles.input} value={query} />
    {results.map(contact => <Pressable
      accessibilityLabel={locale.t("aiMention.selectContact", { name: locale.t.literal(contact.name), organization: locale.t.literal(contact.organization || locale.t("aiMention.companyMissing")), role: locale.t.literal(contact.role || locale.t("aiMention.roleMissing")) })}
      accessibilityRole="button"
      key={contact.id}
      onPress={() => { onSelect(contact); setQuery(""); }}
      style={styles.row}
    >
      <Text style={styles.name}>{contact.name}</Text>
      <Text style={styles.detail}>{[contact.organization, contact.role].filter(Boolean).join(" · ") || locale.t("aiMention.detailsMissing")}</Text>
    </Pressable>)}
    {results.length === 0 ? <Text style={styles.empty}>{locale.t("aiMention.empty")}</Text> : null}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: spacing.xs, padding: spacing.sm },
  title: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  input: { backgroundColor: colors.bg, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, color: colors.ink, minHeight: 44, paddingHorizontal: spacing.sm },
  row: { borderTopColor: colors.border, borderTopWidth: 1, minHeight: 52, paddingVertical: spacing.xs },
  name: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  detail: { color: colors.text3, fontSize: 12, marginTop: 2 },
  empty: { color: colors.text3, fontSize: 12, paddingVertical: spacing.xs },
}));
