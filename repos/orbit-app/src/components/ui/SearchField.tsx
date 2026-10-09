import { StyleSheet, TextInput, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { useStandardCopy } from "../../i18n/standard-copy";
import { Icon } from "./Icon";
import { UiPressable } from "./Pressable";

// kit .search: 44 tall pill on surface, search icon, clear button when not empty.
export function SearchField({ value, onChangeText, placeholder, accessibilityLabel }: { value: string; onChangeText: (value: string) => void; placeholder: string; accessibilityLabel?: string }) {
  const { colors, styles } = useStyles();
  const copy = useStandardCopy();
  return (
    <View style={styles.field}>
      <Icon name="search" size={16} color={colors.ink3Text} />
      <TextInput
        accessibilityLabel={accessibilityLabel ?? placeholder}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3Text}
        returnKeyType="search"
        style={styles.input}
        value={value}
      />
      {value ? (
        <UiPressable accessibilityRole="button" accessibilityLabel={copy.filter.clear} hitSlop={14} onPress={() => onChangeText("")}>
          <Icon name="x-circle" size={16} color={colors.ink3Text} />
        </UiPressable>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  field: { minHeight: 44, borderRadius: 999, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 },
  input: { flex: 1, color: colors.ink, fontSize: 13.5, paddingVertical: 10 },
}));
