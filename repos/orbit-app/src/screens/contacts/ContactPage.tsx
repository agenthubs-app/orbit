import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import type { PropsWithChildren, ReactElement, ReactNode, Ref } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type RefreshControlProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { layout, textStyles } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

// Contact-only chrome: other routes retain their own screen layouts.
export function ContactPage({
  children,
  detail = false,
  backLabel,
  backHref,
  toolbarLeft,
  toolbarRight,
  isCurrent,
  scrollRef,
  onBodyLayout,
  refreshControl,
  title
}: PropsWithChildren<{
  detail?: boolean;
  backLabel?: string;
  backHref?: string;
  toolbarLeft?: ReactNode;
  toolbarRight?: ReactNode;
  isCurrent?: () => boolean;
  scrollRef?: Ref<ScrollView>;
  onBodyLayout?: (event: LayoutChangeEvent) => void;
  refreshControl?: ReactElement<RefreshControlProps>;
  title: string;
}>) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const resolvedBackLabel = backLabel ?? locale.t("contacts.back");
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        ref={scrollRef}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.content, detail && styles.detailContent]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        <View style={[styles.toolbar, detail && styles.detailToolbar]}>
          {toolbarLeft ?? <Pressable
            accessibilityLabel={locale.t("common.backToNamed", { name: resolvedBackLabel })}
            accessibilityRole="button"
            onPress={() => isCurrent?.() === false ? undefined : router.canGoBack()
              ? router.back()
              : router.replace((backHref ?? (detail ? "/contacts/list" : "/contacts")) as Href)}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.accent} name="chevron-back" size={23} />
            <Text style={styles.backText}>{resolvedBackLabel}</Text>
          </Pressable>}
          {detail ? <Text accessibilityRole="header" style={styles.detailTitle}>{title}</Text> : null}
          {detail ? <View style={styles.toolbarBalance}>{toolbarRight}</View> : null}
        </View>
        {!detail ? <Text accessibilityRole="header" style={styles.largeTitle}>{title}</Text> : null}
        <View onLayout={onBodyLayout} style={detail ? styles.detailBody : styles.listBody}>{children}</View>
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
  detailContent: { paddingTop: 0 },
  detailToolbar: { minHeight: 48 },
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
  toolbarBalance: { width: 82, alignItems: "flex-end" },
  detailTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: Platform.select({ web: '-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif', ios: "System", default: "sans-serif" }),
    fontSize: 15,
    fontWeight: "800",
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
    paddingTop: 12
  },
  pressed: { opacity: 0.72 }
}));
