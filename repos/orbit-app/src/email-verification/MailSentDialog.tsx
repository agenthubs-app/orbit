/** VA1: shown once after signing up, above the page; one button — neither the backdrop nor the back gesture closes it. */
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, findNodeHandle, Platform, StyleSheet, View } from "react-native";

import { durations } from "../components/ui/motion";
import { UiPortal } from "../components/ui/Portal";
import { UiPressable } from "../components/ui/Pressable";
import { Scrim } from "../components/ui/Scrim";
import { UiText } from "../components/ui/Text";
import { useBackHandler } from "../components/ui/useBackHandler";
import { createThemedStyles } from "../design/theme";
import { floatShadow } from "../design/tokens";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";

const stay = () => undefined;

export function MailSentDialog({ email, onProceed }: { email: string | null; onProceed: () => void }) {
  const { colors, styles } = useStyles();
  const { t } = useOrbitLocale();
  const visible = email !== null;
  const appear = useRef(new Animated.Value(0)).current;
  const title = useRef<View>(null);
  useBackHandler(visible, stay);
  useEffect(() => {
    if (!visible) return;
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: durations.dialog, useNativeDriver: true }).start();
  }, [appear, visible]);
  if (email === null) return null;
  const focusTitle = () => {
    if (Platform.OS === "web") return;
    const node = findNodeHandle(title.current);
    if (node) requestAnimationFrame(() => AccessibilityInfo.setAccessibilityFocus?.(node));
  };
  return (
    <UiPortal>
      <View accessibilityViewIsModal style={styles.root} testID="mail-sent-dialog">
        <Scrim />
        <Animated.View style={[styles.dialog, floatShadow(colors), { opacity: appear }]}>
          <View style={styles.tile}><UiText allowFontScaling={false} style={styles.emoji}>📮</UiText></View>
          <View ref={title} accessible accessibilityRole="header" accessibilityLabel={t("auth.mailSentTitle")} onLayout={focusTitle}><UiText style={styles.title}>{t("auth.mailSentTitle")}</UiText></View>
          <UiText style={styles.body}><UiText style={styles.email}>{email}</UiText>{`\n${t("auth.mailSentBody")}`}</UiText>
          <UiPressable accessibilityLabel={t("auth.mailSentOk")} accessibilityRole="button" onPress={onProceed} style={styles.button} testID="mail-sent-ok"><UiText style={styles.buttonText}>{t("auth.mailSentOk")}</UiText></UiPressable>
        </Animated.View>
      </View>
    </UiPortal>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: 342, maxWidth: "100%", borderRadius: 28, padding: 24, backgroundColor: colors.surface },
  tile: { width: 64, height: 64, borderRadius: 20, marginTop: 10, alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: colors.macLav },
  emoji: { fontSize: 32, lineHeight: 48 },
  title: { color: colors.ink, fontSize: 24, lineHeight: 36, fontWeight: "900", textAlign: "center", marginTop: 14 },
  body: { color: colors.ink2, fontSize: 15, lineHeight: 25.5, textAlign: "center", marginTop: 6 },
  email: { color: colors.ink2, fontSize: 15, lineHeight: 25.5, fontWeight: "700" },
  button: { height: 50, marginTop: 18, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink },
  buttonText: { color: colors.bg, fontSize: 17, lineHeight: 25.5, fontWeight: "700" },
}));
