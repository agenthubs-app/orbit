import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../design/tokens";

interface SectionHeaderProps {
  detail?: string;
  title: string;
}

export function SectionHeader({ detail, title }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    marginTop: spacing.md
  },
  detail: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20
  },
  title: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "800"
  }
});
