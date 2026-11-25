/** onboarding-3step-proposal ⑥ VA2–VA4: the first line of every signed-in page while the address is unverified. It cannot be closed and scrolls with the page. */
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { UiText } from "../components/ui/Text";
import { createThemedStyles } from "../design/theme";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import type { OrbitTranslator } from "../i18n/messages";
import { useEmailVerification, type EmailVerificationView } from "./EmailVerificationContext";

/** The one line about the last send; null before any. */
export function emailSendText(view: Pick<EmailVerificationView, "email" | "send">, t: OrbitTranslator): string | null {
  if (view.send.kind === "sent") return t("auth.emailSentTo", { email: view.email });
  if (view.send.kind === "wait") return t("auth.emailWait", { n: view.send.seconds });
  return view.send.kind === "limit" ? t("auth.emailLimit") : view.send.kind === "fail" ? t("auth.emailFail") : null;
}

/** `gutter` / `top`: the page's own side and top padding, which the full-width line reaches over. `gap`: the page's gap between children. */
export function EmailNotice({ gutter = 18, top = 0, gap = 0 }: { gutter?: number; top?: number; gap?: number }) {
  const view = useEmailVerification();
  if (!view || view.verified || !view.noticeVisible) return null;
  return <EmailNoticeBar view={view} style={{ marginHorizontal: -gutter, marginTop: -top, marginBottom: 10 - gap }} />;
}

/** For a page that measures its own height: what the one-line reminder takes. */
export function useEmailNoticeSpace(): number {
  const view = useEmailVerification();
  return view && !view.verified && view.noticeVisible ? 58 : 0;
}

export function EmailNoticeBar({ view, style }: { view: EmailVerificationView; style?: StyleProp<ViewStyle> }) {
  const { colors, styles } = useStyles();
  const { t } = useOrbitLocale();
  const sent = view.send.kind === "sent";
  return (
    <View style={[styles.bar, style]} testID="email-notice">
      <View style={styles.text}>
        <Icon color={colors.ink} name={sent ? "check" : "mail"} size={16} />
        <UiText accessibilityLiveRegion="polite" style={styles.label}>{emailSendText(view, t) ?? t("auth.emailNotice")}</UiText>
      </View>
      {sent ? null : <View style={styles.action}><Button disabled={view.send.kind === "sending"} label={t(view.mailed ? "auth.emailResend" : "auth.emailSendFirst")} onPress={view.requestMail} size="sm" variant="surface" /></View>}
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  bar: { minHeight: 48, paddingVertical: 8, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: colors.accentSoft },
  text: { flexShrink: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  label: { flexShrink: 1, color: colors.ink, fontSize: 16, lineHeight: 24, fontWeight: "700" },
  action: { flexShrink: 0 },
}));
