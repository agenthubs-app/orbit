import type { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../design/tokens";

interface DataCardProps extends PropsWithChildren {
  detail?: string;
  title: string;
}

export function DataCard({ children, detail, title }: DataCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={3} style={styles.detail}>
            {detail}
          </Text>
        ) : null}
      </View>
      {children ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: spacing.lg
  },
  detail: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20
  },
  header: {
    gap: spacing.xs
  },
  title: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 22
  }
});
