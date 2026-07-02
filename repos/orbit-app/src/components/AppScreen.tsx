import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../design/tokens";

interface AppScreenProps extends PropsWithChildren {
  eyebrow?: string;
  title: string;
}

export function AppScreen({ children, eyebrow, title }: AppScreenProps) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.header}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text adjustsFontSizeToFit numberOfLines={2} style={styles.title}>
            {title}
          </Text>
        </View>
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md
  },
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg
  },
  eyebrow: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  header: {
    gap: spacing.xs
  },
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1
  },
  title: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "800",
    lineHeight: 32
  }
});
