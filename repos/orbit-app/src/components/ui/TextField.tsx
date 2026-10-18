import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { Icon } from "./Icon";
import { UiText } from "./Text";

// kit input 44 / radius 14; 01-system ⑧ field error: coral border + coral-soft note
// right below, announced to screen readers. The label is always visible.
export function TextField({ label, error, presentation = "default", ...input }: { label: string; error?: string; presentation?: "default" | "kit" } & Omit<TextInputProps, "style">) {
  const { colors, styles } = useStyles();
  return (
    <View style={[styles.wrap, presentation === "kit" && styles.kitWrap]}>
      <UiText style={[styles.label, presentation === "kit" && styles.kitLabel]}>{label}</UiText>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor={colors.ink3Text}
        {...input}
        style={[styles.input, presentation === "kit" && styles.kitInput, error ? styles.inputError : null, presentation === "kit" && error && styles.kitInputError]}
      />
      {error ? (
        <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.error, presentation === "kit" && styles.kitError]}>
          {presentation !== "kit" ? <Icon name="alert" size={16} color={colors.coralText} /> : null}
          {presentation === "kit" ? <UiText style={styles.kitErrorText}><UiText style={styles.kitErrorLead}>{error.split("。")[0]}。</UiText>{error.split("。").slice(1).join("。")}</UiText> : <UiText style={styles.errorText}>{error}</UiText>}
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
  kitWrap: { gap: 6 },
  kitLabel: { color: colors.ink3Text, fontSize: 11.5 },
  kitInput: { backgroundColor: colors.surface, color: colors.ink, fontSize: 13 },
  kitInputError: { borderColor: colors.coral },
  kitError: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  kitErrorText: { color: colors.ink, fontSize: 12, lineHeight: 18.6 },
  kitErrorLead: { color: colors.coral, fontWeight: "700" },
}));
