import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import type { PropsWithChildren, ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type RefreshControlProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { layout, textStyles } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";

// Contact-only chrome: other routes retain their own screen layouts.
export function ContactPage({
  children,
  detail = false,
  refreshControl,
  title
}: PropsWithChildren<{
  detail?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  title: string;
}>) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        <View style={styles.toolbar}>
          <Pressable
            accessibilityLabel="返回联系人"
            accessibilityRole="button"
            onPress={() => router.canGoBack()
              ? router.back()
              : router.replace((detail ? "/contacts/list" : "/contacts") as Href)}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.accent} name="chevron-back" size={23} />
            <Text style={styles.backText}>联系人</Text>
          </Pressable>
          {detail ? <Text accessibilityRole="header" style={styles.detailTitle}>{title}</Text> : null}
          {detail ? <View style={styles.toolbarBalance} /> : null}
        </View>
        {!detail ? <Text accessibilityRole="header" style={styles.largeTitle}>{title}</Text> : null}
        <View style={detail ? styles.detailBody : styles.listBody}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  safeArea: {
    backgroundColor: colors.surface,
    flex: 1
  },
  content: {
    alignSelf: "center",
    maxWidth: layout.contentMax,
    paddingBottom: layout.contentBottom,
    paddingHorizontal: layout.pageInset,
    paddingTop: 12,
    width: "100%"
  },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: layout.toolbar
  },
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: layout.toolbar,
    minWidth: 88,
    marginLeft: -6
  },
  backText: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 22
  },
  toolbarBalance: { width: 82 },
  detailTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    textAlign: "center"
  },
  largeTitle: {
    ...textStyles.pageTitle,
    color: colors.ink,
    marginTop: 14,
    marginBottom: 20
  },
  listBody: { gap: 0 },
  detailBody: {
    gap: 0,
    paddingTop: 32
  },
  pressed: { opacity: 0.72 }
}));
