import { StyleSheet, View } from "react-native";
import { Icon, UiPressable, UiText, type IconName } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { spacing, typography } from "../../../design/tokens";
import type { ReactNode } from "react";

// b5 .sgroup .srow; page-private until the component library supports this row.
export function AccountRow({ icon, title, detail, trailing, onPress }: { icon: IconName; title: string; detail?: string; trailing?: ReactNode; onPress?: () => void }) {
  const { styles, colors } = useStyles();
  return <UiPressable accessibilityRole={onPress ? "button" : "text"} accessibilityLabel={title} onPress={onPress} style={styles.row}>
    <View style={styles.icon}><Icon name={icon} size={16} color={colors.ink2} /></View>
    <View style={styles.meta}><UiText style={styles.title}>{title}</UiText>{detail ? <UiText style={styles.detail}>{detail}</UiText> : null}</View>
    {trailing}{onPress ? <Icon name="right" size={16} color={colors.ink3} /> : null}
  </UiPressable>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm + spacing.xxs + 1 },
  icon: { width: 34, height: 34, borderRadius: 999, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, minWidth: 0 }, title: { fontSize: typography.row, fontWeight: "700", color: colors.ink },
  detail: { fontSize: typography.label, color: colors.ink3, marginTop: spacing.xxs },
}));
