import { clearInitialURL, useLinkingURL } from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { PasswordResetResponse } from "../../api/contract/password-reset";
import { createThemedStyles } from "../../design/theme";
import { layout, spacing, typography } from "../../design/tokens";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { passwordResetFragmentFromAppLink, passwordResetTokenFromFragment, passwordResetTokenFromLink, passwordResetValidation } from "../../view-models/password-reset";

export function PasswordResetScreen() {
  const { colors, styles } = useStyles();
  const client = useOrbitApiClient();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const locale = useOrbitLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ "#"?: string | string[] }>();
  const fragment = typeof params["#"] === "string" ? params["#"] : undefined;
  const linkingUrl = useLinkingURL();
  const nativeFragment = passwordResetFragmentFromAppLink(linkingUrl);
  const capturedFragment = fragment ?? nativeFragment;
  const actorId = auth.user?.id ?? null;
  const ready = auth.ready && server.ready;
  const [scope, setScope] = useState({ client, actorId, ready });
  const scopeRef = useRef(scope);
  const mounted = useRef(true);
  const pendingRef = useRef(false);
  const requestId = useRef(0);
  // A still-present fragment is consumed once, including across account switches.
  const fragmentHandled = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!capturedFragment) return;
    const fragmentKey = capturedFragment;
    if (!ready || fragmentHandled.current === fragmentKey) return;
    fragmentHandled.current = fragmentKey;
    requestId.current++;
    pendingRef.current = false;
    setPending(false);
    const captured = passwordResetTokenFromFragment(capturedFragment);
    setToken(captured);
    setLink("");
    setPassword("");
    setConfirmation("");
    setNotice(null);
    setError(captured ? null : locale.t("reset.invalidLink"));
    clearInitialURL();
    router.setParams({ "#": undefined });
  }, [capturedFragment, fragment, linkingUrl, ready, router]);

  if (scope.client !== client || scope.actorId !== actorId || scope.ready !== ready) {
    const nextScope = { client, actorId, ready };
    scopeRef.current = nextScope;
    setScope(nextScope);
    if (scope.ready && capturedFragment) fragmentHandled.current = capturedFragment;
    pendingRef.current = false;
    setToken(null);
    setLink("");
    setPassword("");
    setConfirmation("");
    setPending(false);
    setError(null);
    setNotice(null);
    return null;
  }

  function captureLink() {
    if (!ready || pendingRef.current) return;
    const captured = passwordResetTokenFromLink(link, client.baseUrl);
    if (!captured) { setError(locale.t("reset.invalidServerLink")); return; }
    setToken(captured);
    setLink("");
    setPassword("");
    setConfirmation("");
    setError(null);
    setNotice(null);
    router.setParams({ "#": undefined });
  }

  async function submit() {
    if (!ready || !token || pendingRef.current) return;
    const validation = passwordResetValidation(password, confirmation, locale.t);
    if (validation) { setError(validation); return; }
    const requestScope = scope;
    const submittedId = ++requestId.current;
    const isCurrent = () => mounted.current && scopeRef.current === requestScope && requestId.current === submittedId;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await client.post<PasswordResetResponse>("/api/auth/password-reset/confirm", { body: { token, password } });
      if (!isCurrent()) return;
      if (!result.success) {
        setError(result.error.code === "INVALID_TOKEN" ? locale.t("auth.resetLinkUnavailable") : result.error.message);
        if (result.error.code === "INVALID_TOKEN") {
          setToken(null);
          setPassword("");
          setConfirmation("");
          router.setParams({ "#": undefined });
        }
        return;
      }
      if (typeof result.data?.message !== "string" || !result.data.message.trim() || result.status >= 400) {
        setError(locale.t("reset.unconfirmed"));
        return;
      }
      setToken(null);
      setLink("");
      setPassword("");
      setConfirmation("");
      setNotice(result.data.message);
      router.setParams({ "#": undefined });
    } catch {
      if (isCurrent()) setError(locale.t("reset.networkFailure"));
    } finally {
      if (isCurrent()) { pendingRef.current = false; setPending(false); }
    }
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.brand}><Text allowFontScaling={false} style={styles.brandMark}>O</Text><Text style={styles.brandText}>Orbit</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("auth.backLabel")} onPress={() => router.canGoBack() ? router.back() : router.replace("/account/login")} style={styles.back}><Text style={styles.backText}>{locale.t("auth.backLabel")}</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.title}>{token ? locale.t("auth.resetNewTitle") : error ? locale.t("auth.resetInvalidTitle") : locale.t("reset.title")}</Text>
        <Text style={styles.description}>{token ? locale.t("auth.resetDescription") : error ? locale.t("auth.resetInvalidDescription") : locale.t("auth.resetPasteDescription")}</Text>
      </View>
      <View style={styles.form}>
        {token ? <>
          <Text style={styles.label}>{locale.t("reset.newPassword")}</Text>
          <TextInput accessibilityLabel={locale.t("reset.newPassword")} autoCapitalize="none" autoCorrect={false} secureTextEntry textContentType="newPassword" editable={!pending} value={password} onChangeText={setPassword} style={styles.input} />
          <Text style={styles.hint}>{locale.t("auth.passwordMinimum")}</Text>
          <Text style={styles.label}>{locale.t("auth.resetConfirmLabel")}</Text>
          <TextInput accessibilityLabel={locale.t("reset.confirmPassword")} autoCapitalize="none" autoCorrect={false} secureTextEntry textContentType="newPassword" editable={!pending} value={confirmation} onChangeText={setConfirmation} style={styles.input} />
        </> : !notice && !error ? <>
          <Text style={styles.label}>{locale.t("reset.link")}</Text>
          <TextInput accessibilityLabel={locale.t("reset.link")} autoCapitalize="none" autoCorrect={false} secureTextEntry editable={ready} value={link} onChangeText={setLink} style={styles.input} />
        </> : null}
        {error && token ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
        <View style={styles.actions}>
        {notice ? <Pressable accessibilityRole="button" onPress={() => router.replace("/account/login")} style={styles.primary}><Text style={styles.primaryText}>{locale.t("reset.backLogin")}</Text></Pressable> : (
          <Pressable accessibilityRole="button" accessibilityLabel={token ? locale.t("reset.submit") : error ? locale.t("auth.resetReapply") : locale.t("reset.useLink")} disabled={!ready || pending} onPress={token ? submit : error ? () => router.push("/account/forgot-password") : captureLink} style={({ pressed }) => [styles.primary, (!ready || pending) && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{pending ? locale.t("reset.pending") : token ? locale.t("auth.resetSubmit") : error ? locale.t("auth.resetReapply") : locale.t("reset.useLink")}</Text>
          </Pressable>
        )}
        {!token && !error && !notice ? <Pressable accessibilityRole="link" onPress={() => router.push("/account/forgot-password")} style={styles.link}>
          <Text style={styles.linkText}>{locale.t("reset.reapply")}</Text>
        </Pressable> : null}
        {!token && !notice && !error ? <Pressable accessibilityRole="link" onPress={() => router.replace("/account/login")} style={styles.link}>
          <Text style={styles.linkText}>{locale.t("reset.backLogin")}</Text>
        </Pressable> : null}
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { width: "100%", maxWidth: layout.contentMax, alignSelf: "center", minHeight: 58, paddingHorizontal: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 36, height: 36, overflow: "hidden", borderRadius: 12, backgroundColor: colors.ink, color: colors.surface, textAlign: "center", textAlignVertical: "center", fontSize: 22, fontWeight: "900" },
  brandText: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  back: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  backText: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
  content: { flexGrow: 1, width: "100%", maxWidth: layout.contentMax, alignSelf: "center", paddingHorizontal: 36, paddingBottom: 4 },
  hero: { paddingTop: 20 },
  title: { color: colors.ink, fontSize: 22, lineHeight: 29, fontWeight: "800" },
  description: { color: colors.ink2, fontSize: 13, lineHeight: 20, marginTop: 8 },
  form: { flexGrow: 1, marginTop: 18, gap: 8 },
  label: { color: colors.ink, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  hint: { color: colors.ink3Text, fontSize: 12, lineHeight: 18, marginTop: 2 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: spacing.sm, color: colors.ink, backgroundColor: colors.surface2, fontSize: typography.body },
  actions: { marginTop: "auto", paddingTop: 24, gap: 4 },
  primary: { minHeight: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.surface, fontSize: 14, fontWeight: "700", lineHeight: 20, flexShrink: 1 },
  error: { color: colors.coralText, fontSize: typography.bodySm, lineHeight: 20 },
  notice: { color: colors.okText, fontSize: typography.bodySm, lineHeight: 20 },
  link: { minHeight: 44, justifyContent: "center", alignItems: "center" },
  linkText: { color: colors.accentText, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.84 }
}));
