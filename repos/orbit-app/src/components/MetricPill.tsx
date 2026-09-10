import { StyleSheet, Text, View } from "react-native";
import { spacing, textStyles } from "../design/tokens";
import { createThemedStyles } from "../design/theme";

interface MetricPillProps {
  label: string;
  value: number | string;
}

export function MetricPill({ label, value }: MetricPillProps) {
  const { styles } = useStyles();
  return (
    <View style={styles.pill}>
      <Text style={styles.value}>
        {value}
      </Text>
      <Text style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  label: {
    ...textStyles.caption,
    color: colors.text2
  },
  pill: {
    flexShrink: 1,
    maxWidth: "100%",
    minWidth: 88,
    paddingVertical: spacing.sm
  },
  value: {
    ...textStyles.listTitle,
    color: colors.ink
  }
}));
