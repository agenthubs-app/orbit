import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout, radius, spacing, textStyles } from "../design/tokens";
import { createThemedStyles } from "../design/theme";

interface DataCardProps extends PropsWithChildren {
  detail?: string;
  onPress?: () => void;
  title: string;
  variant?: "section" | "inset";
}

export function DataCard({ children, detail, onPress, title, variant = "section" }: DataCardProps) {
  const { styles } = useStyles();
  const content = (
    <View style={[styles.card, variant === "inset" ? styles.inset : styles.section]}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {title}
        </Text>
        {detail ? (
          <Text style={styles.detail}>
            {detail}
          </Text>
        ) : null}
      </View>
      {children ? <View style={styles.body}>{children}</View> : null}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  body: {
    gap: spacing.sm
  },
  card: {
    gap: spacing.md,
    minHeight: layout.control
  },
  section: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.lg
  },
  inset: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    padding: spacing.lg
  },
  detail: {
    ...textStyles.small,
    color: colors.text3
  },
  header: {
    gap: spacing.xs
  },
  pressable: {
    minHeight: layout.control
  },
  pressed: {
    opacity: 0.82,
    transform: [{ translateY: 0.5 }]
  },
  title: {
    ...textStyles.listTitle,
    color: colors.ink
  }
}));
