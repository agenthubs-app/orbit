// R27 イベント参加者の動線（App）的页面骨架：kit .phone .scroll（0 18 130）里的 .topbar（‹ / ✕ 圆钮 · 居中标题 + small）跟内容一起滚，
// 底部浮层（.ctabar / .composer：left/right 12、bottom 26）在滚动区外。参加登録 / 会う準備 / 会後 共用。
import { useRouter, type Href } from "expo-router";
import { useRef, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ShellBackground } from "../../../components/ShellBackground";
import { SHELL_GUTTER, ShellTopBar, useShellTopGap } from "../../../components/ShellTopBar";
import { GlassSurface, IconButton, type IconName } from "../../../components/ui";
import { useOrbitTheme } from "../../../design/theme";
import { shadows } from "../../../design/tokens";

export function JourneyPage({ title, subtitle, leftIcon = "left", leftLabel, fallback, onLeft, right, footer, footerRadius = 28, children, testID, followEnd = false }: {
  title: string;
  subtitle?: string | undefined;
  leftIcon?: IconName;
  leftLabel: string;
  /** 没有上一页时 ‹ 回到的地方。 */
  fallback: string;
  onLeft?: () => void;
  right?: ReactNode;
  /** 底部浮层的内容（玻璃条里横排）。 */
  footer?: ReactNode;
  footerRadius?: number;
  children: ReactNode;
  testID?: string;
  /** Chat-like pages: keep the newest content (the next question) in view as it grows. */
  followEnd?: boolean;
}) {
  const router = useRouter();
  const { colors, scheme } = useOrbitTheme();
  const topGap = useShellTopGap();
  const scroller = useRef<ScrollView>(null);
  const back = onLeft ?? (() => (router.canGoBack() ? router.back() : router.replace(fallback as Href)));
  const topBar = <ShellTopBar title={title} subtitle={subtitle} left={<IconButton icon={leftIcon} accessibilityLabel={leftLabel} onPress={back} />} right={right} />;
  return (
    <SafeAreaView edges={["top"]} style={[styles.page, { backgroundColor: colors.bg, paddingTop: topGap }]} testID={testID}>
      <ShellBackground />
      {/* A chat page keeps its header fixed: following the newest question would otherwise scroll the × off screen. */}
      {followEnd ? <View style={styles.fixedTop}>{topBar}</View> : null}
      <ScrollView ref={scroller} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
        onContentSizeChange={followEnd ? () => scroller.current?.scrollToEnd({ animated: true }) : undefined}>
        {followEnd ? null : topBar}
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { borderRadius: footerRadius }, scheme === "dark" ? shadows.floatDark : shadows.float]}>
          <GlassSurface radius={footerRadius} style={styles.glass}>{footer}</GlassSurface>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pad: { paddingBottom: 130, paddingHorizontal: SHELL_GUTTER },
  fixedTop: { paddingHorizontal: SHELL_GUTTER },
  footer: { bottom: 26, left: 12, position: "absolute", right: 12 },
  glass: { alignItems: "center", flexDirection: "row", gap: 6, padding: 8 },
});
