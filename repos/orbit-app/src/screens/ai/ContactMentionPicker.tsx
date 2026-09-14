import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { radius, spacing } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";

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
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterMentionContacts(contacts, query, selectedIds), [contacts, query, selectedIds]);
  return <View style={styles.panel}>
    <Text style={styles.title}>@ 联系人</Text>
    <TextInput accessibilityLabel="搜索要提及的联系人" onChangeText={setQuery} placeholder="按姓名或公司搜索" style={styles.input} value={query} />
    {results.map(contact => <Pressable
      accessibilityLabel={`选择联系人：${contact.name}，${contact.organization || "未填写公司"}，${contact.role || "未填写职位"}`}
      accessibilityRole="button"
      key={contact.id}
      onPress={() => { onSelect(contact); setQuery(""); }}
      style={styles.row}
    >
      <Text style={styles.name}>{contact.name}</Text>
      <Text style={styles.detail}>{[contact.organization, contact.role].filter(Boolean).join(" · ") || "资料待补充"}</Text>
    </Pressable>)}
    {results.length === 0 ? <Text style={styles.empty}>没有匹配的联系人。</Text> : null}
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
