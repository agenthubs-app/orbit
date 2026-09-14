import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ContactSummary } from "../../view-models/contacts";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";

export function NoteContactPicker({ contacts, disabled = false, selectedIds, onToggle }: {
  contacts: readonly ContactSummary[];
  disabled?: boolean;
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
}) {
  const { styles } = useStyles();
  const selected = new Set(selectedIds);
  return <View style={styles.group}>
    <Text style={styles.label}>关联人脉（可多选）</Text>
    {contacts.length === 0 ? <Text style={styles.hint}>暂无可关联的人脉，也可以先保存笔记。</Text> : <View style={styles.options}>
      {contacts.map((contact) => {
        const checked = selected.has(contact.id);
        return <Pressable key={contact.id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled}
          onPress={() => onToggle(contact.id)} style={[styles.option, checked && styles.selected, disabled && styles.disabled]}>
          <Text style={[styles.optionText, checked && styles.selectedText]}>{contact.name}</Text>
          {contact.organization ? <Text style={styles.meta}>{contact.organization}</Text> : null}
        </Pressable>;
      })}
    </View>}
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  group: { gap: spacing.sm },
  label: { color: colors.ink, fontSize: typography.body, fontWeight: "700", lineHeight: 23 },
  hint: { color: colors.text3, fontSize: typography.small, lineHeight: 20 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  option: { borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  disabled: { opacity: 0.5 },
  optionText: { color: colors.text, fontSize: typography.small, fontWeight: "600" },
  selectedText: { color: colors.onAccent },
  meta: { color: colors.text3, fontSize: 11, lineHeight: 15 },
}));
