import type { PropsWithChildren, ReactElement } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../design/tokens";

interface AppScreenProps extends PropsWithChildren {
  eyebrow?: string;
  refreshControl?: ReactElement<RefreshControlProps>;
  title: string;
}

export function AppScreen({
  children,
  eyebrow,
  refreshControl,
  title
}: AppScreenProps) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={refreshControl}
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
    gap: 14
  },
  content: {
    alignSelf: "center",
    gap: spacing.lg,
    maxWidth: 540,
    paddingBottom: 96,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    width: "100%"
  },
  eyebrow: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  header: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs
  },
  safeArea: {
    backgroundColor: colors.bgSoft,
    flex: 1
  },
  title: {
    color: colors.ink,
    fontSize: typography.display,
    fontWeight: "700",
    lineHeight: 29
  }
});
