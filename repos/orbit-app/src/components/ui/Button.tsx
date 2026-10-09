import { ActivityIndicator, StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import type { OrbitColors } from "../../design/tokens";
import { Icon, type IconName } from "./Icon";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "dangerGhost" | "dangerSoft";

// kit/ui.css .btn: pill, 40 tall (sm 32 with a 44 hit area), 13/700. Variants map to
// token pairs that are in the contrast list (RD-05). danger = the final destructive
// action in a confirm; dangerGhost = the entry point on a page; dangerSoft = menu item.
export function Button({
  label,
  onPress,
  variant = "secondary",
  size = "md",
  block = false,
  icon,
  loading = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  block?: boolean;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors, styles } = useStyles();
  const tone = tones(colors)[variant];
  const inactive = disabled || loading;
  return (
    <UiPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={size === "sm" ? 6 : 2}
      onPress={onPress}
      style={[styles.base, size === "sm" ? styles.sm : styles.md, block && styles.block, { backgroundColor: tone.background }, inactive && styles.inactive]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={tone.text} size="small" /> : icon ? <Icon name={icon} size={16} color={tone.text} /> : null}
        <UiText numberOfLines={1} style={[styles.label, size === "sm" && styles.labelSm, { color: tone.text }]}>{label}</UiText>
      </View>
    </UiPressable>
  );
}

export function tones(colors: OrbitColors): Record<ButtonVariant, { background: string; text: string }> {
  return {
    primary: { background: colors.ink, text: colors.onAccent },
    accent: { background: colors.accent, text: colors.onAccent },
    secondary: { background: colors.surface2, text: colors.ink },
    ghost: { background: "transparent", text: colors.ink2 },
    danger: { background: colors.coralText, text: colors.onAccent },
    dangerGhost: { background: "transparent", text: colors.coralText },
    dangerSoft: { background: colors.coralSoft, text: colors.coralText },
  };
}

const useStyles = createThemedStyles(() => StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", borderRadius: 999, alignSelf: "flex-start" },
  md: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10 },
  sm: { minHeight: 32, paddingHorizontal: 12, paddingVertical: 6 },
  block: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontSize: 13, fontWeight: "700" },
  labelSm: { fontSize: 12 },
  inactive: { opacity: 0.45 },
}));
