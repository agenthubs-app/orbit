import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../design/tokens";

interface MetricPillProps {
  label: string;
  value: number | string;
}

export function MetricPill({ label, value }: MetricPillProps) {
  return (
    <View style={styles.pill}>
      <Text numberOfLines={1} style={styles.value}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.text2,
    fontSize: typography.caption,
    lineHeight: 16
  },
  pill: {
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 88,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  value: {
    color: colors.accent,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  }
});
