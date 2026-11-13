// 登录后修改密码（批量建账户的首次改密也落在这里，`?first=1` 只换副标题）。与 Web app/account/change-password 同规则：
// 当前密码 + 新密码（至少 8 位、UTF-8 不超过 72 字节、不能与当前相同）→ POST /api/auth/password/change →
// 旧会话失效，用新密码重新登录（/api/auth/mobile/credentials，存新的 Cookie）→ 去原来要去的页面；重新登录失败回登录页。
// 版式照搬 PasswordResetScreen（同一组登录页样式）；邮箱只读显示并标 textContentType="username"，让钥匙串把新密码记到对的账户上。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { UiPressable, UiText } from "../../components/ui";
import { resetStackTo } from "../../components/shell-navigation";
import { createThemedStyles } from "../../design/theme";
import { layout, spacing, typography } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { nextHrefForAccountAuthSubmit, normalizedNext } from "../../view-models/account-auth";
import { passwordChangeFailureKey, passwordChangeProblemKey, submitPasswordChange, trimPastedPassword, validatePasswordChange } from "../../view-models/password-change";

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function ChangePasswordScreen() {
  const { colors, styles } = useStyles();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const locale = useOrbitLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ first?: string | string[]; next?: string | string[] }>();
  const next = normalizedNext(firstParam(params.next) || undefined);
  const first = firstParam(params.first) === "1";
  const email = auth.user?.email ?? "";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const ready = auth.ready && server.ready && auth.signedIn;
  const onward = nextHrefForAccountAuthSubmit({ mode: "login", next });

  async function submit() {
    if (!ready || sending.current) return;
    const problem = validatePasswordChange(currentPassword, newPassword);
    if (problem) { setError(locale.t(passwordChangeProblemKey(problem))); return; }
    sending.current = true;
    setPending(true);
    setError(null);
    let leaving = false;
    try {
      const result = await submitPasswordChange({ baseUrl: server.baseUrl, cookieHeader: auth.cookieHeader, currentPassword, newPassword });
      if (!result.ok) { setError(locale.t(passwordChangeFailureKey(result.code))); return; }
      // The old session ended with the change: sign in again with the new password and keep going.
      const renewed = await auth.signIn({ email, password: newPassword, redirectTo: next }).catch(() => null);
      leaving = true;
      resetStackTo(router, renewed?.success ? (renewed.pendingDeletion ? "/account/pending" : onward) : `/account/login?next=${encodeURIComponent(next)}`);
    } finally {
      // Leaving: keep the button busy so it cannot be pressed again with the now-stale password.
      if (!leaving) { sending.current = false; setPending(false); }
    }
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen} testID="account-change-password">
      <View style={styles.header}>
        <View style={styles.brand}><UiText allowFontScaling={false} style={styles.brandMark}>O</UiText><UiText style={styles.brandText}>Orbit</UiText></View>
        {/* Soft enforcement (as Web, whose dialog closes to `next`): the person may skip for now. */}
        <UiPressable accessibilityRole="button" accessibilityLabel={locale.t("auth.backLabel")} disabled={pending} onPress={() => resetStackTo(router, onward)} style={styles.back}><UiText style={styles.backText}>{locale.t("auth.backLabel")}</UiText></UiPressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.hero}>
          <UiText accessibilityRole="header" style={styles.title}>{locale.t("auth.changeTitle")}</UiText>
          <UiText style={styles.description}>{locale.t(first ? "auth.changeFirstDescription" : "auth.changeDescription")}</UiText>
        </View>
        <View style={styles.form}>
          {email ? <>
            <UiText style={styles.label}>{locale.t("auth.email")}</UiText>
            <TextInput accessibilityLabel={locale.t("auth.email")} autoCapitalize="none" autoComplete="username" editable={false} textContentType="username" value={email} style={[styles.input, styles.readOnly]} />
          </> : null}
          <UiText style={styles.label}>{locale.t("auth.changeCurrentLabel")}</UiText>
          <TextInput accessibilityLabel={locale.t("auth.changeCurrentLabel")} autoCapitalize="none" autoComplete="current-password" autoCorrect={false} secureTextEntry textContentType="password" editable={!pending} value={currentPassword} onChangeText={(next) => setCurrentPassword((previous) => trimPastedPassword(previous, next))} placeholderTextColor={colors.ink3Text} style={styles.input} testID="account-change-current" />
          <UiText style={styles.label}>{locale.t("reset.newPassword")}</UiText>
          <TextInput accessibilityLabel={locale.t("reset.newPassword")} autoCapitalize="none" autoComplete="new-password" autoCorrect={false} secureTextEntry textContentType="newPassword" editable={!pending} value={newPassword} onChangeText={setNewPassword} placeholderTextColor={colors.ink3Text} style={styles.input} testID="account-change-new" />
          <UiText style={styles.hint}>{locale.t("auth.passwordMinimum")}</UiText>
          {error ? <UiText accessibilityRole="alert" style={styles.error} testID="account-change-error">{error}</UiText> : null}
          <View style={styles.actions}>
            <UiPressable accessibilityRole="button" accessibilityLabel={locale.t("auth.changeSubmit")} disabled={!ready || pending} onPress={() => void submit()} style={[styles.primary, (!ready || pending) && styles.disabled]} testID="account-change-submit">
              <UiText style={styles.primaryText}>{pending ? locale.t("auth.changePending") : locale.t("auth.changeSubmit")}</UiText>
            </UiPressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// 同 PasswordResetScreen 的登录页样式。
const useStyles = createThemedStyles(colors => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { width: "100%", maxWidth: layout.contentMax, alignSelf: "center", minHeight: 58, paddingHorizontal: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 36, height: 36, overflow: "hidden", borderRadius: 12, backgroundColor: colors.ink, color: colors.surface, textAlign: "center", textAlignVertical: "center", fontSize: 24, fontWeight: "900" },
  brandText: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  back: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  backText: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
  content: { flexGrow: 1, width: "100%", maxWidth: layout.contentMax, alignSelf: "center", paddingHorizontal: 36, paddingBottom: 4 },
  hero: { paddingTop: 20 },
  title: { color: colors.ink, fontSize: 24, lineHeight: 32, fontWeight: "800" },
  description: { color: colors.ink2, fontSize: 15, lineHeight: 23, marginTop: 8 },
  form: { flexGrow: 1, marginTop: 18, gap: 8 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  hint: { color: colors.ink3Text, fontSize: 14, lineHeight: 21, marginTop: 2 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: spacing.sm, color: colors.ink, backgroundColor: colors.surface2, fontSize: typography.body },
  readOnly: { color: colors.ink2 },
  actions: { marginTop: "auto", paddingTop: 24, gap: 4 },
  primary: { minHeight: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.surface, fontSize: 17, fontWeight: "700", lineHeight: 24, flexShrink: 1 },
  error: { color: colors.coralText, fontSize: typography.bodySm, lineHeight: 23 },
  disabled: { opacity: 0.6 },
}));
