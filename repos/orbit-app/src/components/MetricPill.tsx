import { StyleSheet, Text, View } from "react-native";
import { radius, spacing, typography } from "../design/tokens";
import { createThemedStyles } from "../design/theme";

interface MetricPillProps {
  label: string;
  value: number | string;
}

export function MetricPill({ label, value }: MetricPillProps) {
  const { styles } = useStyles();
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

const useStyles = createThemedStyles((colors) => StyleSheet.create({
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
}));
