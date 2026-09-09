import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { PasswordResetResponse } from "../../api/contract/password-reset";
import { AppScreen } from "../../components/AppScreen";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { passwordResetTokenFromFragment, passwordResetTokenFromLink, passwordResetValidation } from "../../view-models/password-reset";

export function PasswordResetScreen() {
  const { colors, styles } = useStyles();
  const client = useOrbitApiClient();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const router = useRouter();
  const params = useLocalSearchParams<{ "#"?: string | string[] }>();
  const fragment = typeof params["#"] === "string" ? params["#"] : undefined;
  const actorId = auth.user?.id ?? null;
  const ready = auth.ready && server.ready;
  const [scope, setScope] = useState({ client, actorId, ready });
  const scopeRef = useRef(scope);
  const mounted = useRef(true);
  const pendingRef = useRef(false);
  const requestId = useRef(0);
  // A still-present fragment is consumed once, including across account switches.
  const fragmentHandled = useRef(false);
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
    if (!fragment) { fragmentHandled.current = false; return; }
    if (!ready || fragmentHandled.current) return;
    fragmentHandled.current = true;
    requestId.current++;
    pendingRef.current = false;
    setPending(false);
    const captured = passwordResetTokenFromFragment(fragment);
    setToken(captured);
    setLink("");
    setPassword("");
    setConfirmation("");
    setNotice(null);
    setError(captured ? null : "链接无效，请重新申请。");
    router.setParams({ "#": undefined });
  }, [fragment, ready, router]);

  if (scope.client !== client || scope.actorId !== actorId || scope.ready !== ready) {
    const nextScope = { client, actorId, ready };
    scopeRef.current = nextScope;
    setScope(nextScope);
    if (scope.ready && fragment) fragmentHandled.current = true;
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
    if (!captured) { setError("链接无效，请使用当前服务器的重置链接。"); return; }
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
    const validation = passwordResetValidation(password, confirmation);
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
        setError(result.error.message);
        if (result.error.code === "INVALID_TOKEN") {
          setToken(null);
          setPassword("");
          setConfirmation("");
          router.setParams({ "#": undefined });
        }
        return;
      }
      if (typeof result.data?.message !== "string" || !result.data.message.trim() || result.status >= 400) {
        setError("尚未确认重置成功，请重试。");
        return;
      }
      setToken(null);
      setLink("");
      setPassword("");
      setConfirmation("");
      setNotice(result.data.message);
      router.setParams({ "#": undefined });
    } catch {
      if (isCurrent()) setError("暂时无法连接服务，请稍后重试。");
    } finally {
      if (isCurrent()) { pendingRef.current = false; setPending(false); }
    }
  }

  return (
    <AppScreen eyebrow="账号" title="重置密码">
      <View style={styles.form}>
        {token ? <>
          <Text style={styles.label}>新密码</Text>
          <TextInput accessibilityLabel="新密码" autoCapitalize="none" autoCorrect={false} secureTextEntry textContentType="newPassword" editable={!pending} value={password} onChangeText={setPassword} style={styles.input} />
          <Text style={styles.label}>确认新密码</Text>
          <TextInput accessibilityLabel="确认新密码" autoCapitalize="none" autoCorrect={false} secureTextEntry textContentType="newPassword" editable={!pending} value={confirmation} onChangeText={setConfirmation} style={styles.input} />
        </> : !notice ? <>
          <Text style={styles.label}>重置链接</Text>
          <TextInput accessibilityLabel="重置链接" autoCapitalize="none" autoCorrect={false} secureTextEntry editable={ready} value={link} onChangeText={setLink} style={styles.input} />
        </> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : (
          <Pressable accessibilityRole="button" accessibilityLabel={token ? "重置密码" : "使用重置链接"} disabled={!ready || pending} onPress={token ? submit : captureLink} style={({ pressed }) => [styles.primary, (!ready || pending) && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{pending ? "重置中..." : token ? "重置密码" : "使用重置链接"}</Text>
            <Ionicons name="arrow-forward" color={colors.onAccent} size={18} />
          </Pressable>
        )}
        <Pressable accessibilityRole="link" onPress={() => router.push("/account/forgot-password")} style={styles.link}>
          <Text style={styles.linkText}>重新申请重置链接</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.replace("/account/login")} style={styles.link}>
          <Text style={styles.linkText}>返回登录</Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  form: { gap: spacing.md },
  label: { color: colors.text, fontSize: typography.small, fontWeight: "700", lineHeight: 20 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border2, borderRadius: radius.input, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, backgroundColor: colors.surface2, fontSize: typography.body },
  primary: { minHeight: 48, padding: spacing.md, borderRadius: radius.control, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.sm },
  primaryText: { color: colors.onAccent, fontSize: typography.body, fontWeight: "700", lineHeight: 20, flexShrink: 1 },
  error: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
  notice: { color: colors.live, fontSize: typography.small, lineHeight: 20 },
  link: { minHeight: 44, padding: spacing.sm, justifyContent: "center", alignItems: "center" },
  linkText: { color: colors.accent, fontSize: typography.small, fontWeight: "700", lineHeight: 20 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.84 }
}));
