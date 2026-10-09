import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { Icon } from "./Icon";
import { UiText } from "./Text";

// kit input 44 / radius 14; 01-system ⑧ field error: coral border + coral-soft note
// right below, announced to screen readers. The label is always visible.
export function TextField({ label, error, ...input }: { label: string; error?: string } & Omit<TextInputProps, "style">) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.wrap}>
      <UiText style={styles.label}>{label}</UiText>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor={colors.ink3Text}
        {...input}
        style={[styles.input, error ? styles.inputError : null]}
      />
      {error ? (
        <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
          <Icon name="alert" size={16} color={colors.coralText} />
          <UiText style={styles.errorText}>{error}</UiText>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: colors.ink2, fontSize: 12, fontWeight: "700" },
  input: { minHeight: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, color: colors.ink, fontSize: 14, paddingHorizontal: 14, paddingVertical: 10 },
  inputError: { borderColor: colors.coralText },
  error: { flexDirection: "row", gap: 6, alignItems: "flex-start", backgroundColor: colors.coralSoft, borderRadius: 10, padding: 10 },
  errorText: { flex: 1, color: colors.coralText, fontSize: 12, lineHeight: 18 },
}));
