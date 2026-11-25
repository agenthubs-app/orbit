/** VA5: the line in 設定 › アカウント's ログイン情報 card. */
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { UiText } from "../components/ui/Text";
import { createThemedStyles } from "../design/theme";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import { emailSendText } from "./EmailNotice";
import { useEmailVerification, type EmailVerificationView } from "./EmailVerificationContext";

export function EmailVerificationRow({ style }: { style?: StyleProp<ViewStyle> }) {
  const view = useEmailVerification();
  return view ? <EmailVerificationRowView style={style} view={view} /> : null;
}

export function EmailVerificationRowView({ style, view }: { style?: StyleProp<ViewStyle>; view: EmailVerificationView }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const result = view.verified ? null : emailSendText(view, t);
  return (
    <View style={[styles.block, style]} testID="email-verification-row">
      <View style={styles.row}>
        <View style={styles.text}>
          <UiText style={styles.title}>{t("auth.emailRow")}</UiText>
          {result ? <UiText accessibilityLiveRegion="polite" style={styles.result}>{result}</UiText> : null}
        </View>
        <Chip label={t(view.verified ? "auth.emailVerified" : "auth.emailUnverified")} tone={view.verified ? "teal" : "apricot"} />
      </View>
      {view.verified || view.send.kind === "sent" ? null : <Button disabled={view.send.kind === "sending"} label={t(view.mailed ? "auth.emailResend" : "auth.emailSendFirst")} onPress={view.requestMail} />}
    </View>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  // .evrow wraps its button onto a line of its own at phone width.
  block: { gap: 14, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 16, lineHeight: 24, fontWeight: "700" },
  result: { color: colors.ink3Text, fontSize: 13, lineHeight: 19.5, fontWeight: "500" },
}));
