import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { PasswordResetResponse } from "../../api/contract/password-reset";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { layout, radius, spacing, textStyles, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import {
  accountAuthToView,
  nextHrefForAccountAuthSubmit,
  normalizedNext,
  type AccountAuthFieldView,
  type AccountAuthMode
} from "../../view-models/account-auth";

function firstParam(value: string | string[] | undefined, fallback = ""): string {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

function fieldValue(
  field: AccountAuthFieldView,
  values: Record<AccountAuthFieldView["name"], string>
): string {
  return values[field.name];
}

export function AccountAuthScreen({ mode }: { mode: AccountAuthMode }) {
  const { colors, styles } = useStyles();
  const { fontScale } = useWindowDimensions();
  const params = useLocalSearchParams<{
    created?: string | string[];
    email?: string | string[];
    next?: string | string[];
  }>();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.user?.id ?? null;
  const ready = auth.ready && server.ready;
  const [scope, setScope] = useState({ client, actorId, ready, mode });
  const scopeRef = useRef(scope);
  const mounted = useRef(true);
  const authPending = useRef(false);
  const authScopeKey = `${server.baseUrl}\u0000${mode}`;
  const authScopeRef = useRef(authScopeKey);
  const recoveryPending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [values, setValues] = useState<Record<AccountAuthFieldView["name"], string>>({
    email: firstParam(params.email),
    password: ""
  });
  const view = useMemo(
    () => accountAuthToView(mode, { googleEnabled: auth.googleEnabled }),
    [auth.googleEnabled, mode]
  );
  const next = normalizedNext(firstParam(params.next, view.defaultNext));
  const created = firstParam(params.created) === "1";

  if (authScopeRef.current !== authScopeKey) {
    authScopeRef.current = authScopeKey;
    authPending.current = false;
  }

  if (scope.client !== client || scope.actorId !== actorId || scope.ready !== ready || scope.mode !== mode) {
    const nextScope = { client, actorId, ready, mode };
    scopeRef.current = nextScope;
    setScope(nextScope);
    authPending.current = false;
    setSubmitting(false);
    if (mode === "forgot" || scope.mode === "forgot") {
      recoveryPending.current = false;
      setValues({ email: "", password: "" });
      setNotice(null);
      setError(null);
    }
    return null;
  }

  function updateValue(field: AccountAuthFieldView, value: string) {
    setValues((current) => ({
      ...current,
      [field.name]: value
    }));
  }

  function navigateTo(href: string) {
    router.push(href as Href);
  }

  async function submit() {
    if (mode === "forgot") {
      if (!ready || recoveryPending.current) return;
      recoveryPending.current = true;
      const requestScope = scope;
      const isCurrent = () => mounted.current && scopeRef.current === requestScope;
      setSubmitting(true);
      setNotice(null);
      setError(null);
      try {
        const result = await client.post<PasswordResetResponse>("/api/auth/password-reset/request", {
          body: { email: values.email.trim() }
        });
        if (!isCurrent()) return;
        if (!result.success) setError(result.error.message);
        else if (typeof result.data?.message !== "string" || !result.data.message.trim() || result.status >= 400) {
          setError("尚未确认受理，请稍后重试。");
        } else setNotice(result.data.message);
      } catch {
        if (isCurrent()) setError("暂时无法连接服务，请稍后重试。");
      } finally {
        if (isCurrent()) { recoveryPending.current = false; setSubmitting(false); }
      }
      return;
    }
    if (!ready || authPending.current) return;
    authPending.current = true;
    const requestAuthScope = authScopeKey;
    const isCurrent = () => mounted.current && authScopeRef.current === requestAuthScope;
    setSubmitting(true);
    setNotice(null);
    setError(null);

    try {
      if (mode === "signup") {
        const result = await auth.register({
          email: values.email,
          password: values.password
        });

        if (!isCurrent()) return;
        if (!result.success) {
          setError(result.message ?? "创建账号失败，请稍后再试。");
          return;
        }

        router.replace(
          nextHrefForAccountAuthSubmit({
            email: values.email,
            mode,
            next
          }) as Href
        );
        return;
      }

      const result = await auth.signIn({
        email: values.email,
        password: values.password,
        redirectTo: next
      });

      if (!isCurrent()) return;
      if (!result.success) {
        setError(result.message ?? "登录失败，请稍后再试。");
        return;
      }

      router.replace(
        nextHrefForAccountAuthSubmit({
          email: values.email,
          mode,
          next
        }) as Href
      );
    } finally {
      if (isCurrent()) {
        authPending.current = false;
        setSubmitting(false);
      }
    }
  }

  async function startGoogleSignIn() {
    if (!ready || authPending.current) return;
    authPending.current = true;
    const requestAuthScope = authScopeKey;
    const isCurrent = () => mounted.current && authScopeRef.current === requestAuthScope;
    setSubmitting(true);
    setNotice(null);
    setError(null);

    try {
      const result = await auth.startGoogleSignIn({ redirectTo: next });

      if (!isCurrent()) return;
      if (!result.success) {
        if (result.message === "已取消 Google 登录。") {
          setNotice(result.message);
        } else {
          setError(result.message ?? "Google 登录没有完成，请重新登录。");
        }
        return;
      }

      router.replace(
        nextHrefForAccountAuthSubmit({
          email: values.email,
          mode,
          next
        }) as Href
      );
    } finally {
      if (isCurrent()) {
        authPending.current = false;
        setSubmitting(false);
      }
    }
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="关闭"
          accessibilityRole="button"
          onPress={() => router.canGoBack() ? router.back() : router.replace("/account")}
          style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}
        >
          <Ionicons color={colors.accent} name="chevron-back" size={18} />
          <Text style={styles.closeText}>关闭</Text>
        </Pressable>
      </View>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
      >
        <View style={styles.hero}>
          <OrbitAuthLogo />
          <Text accessibilityRole="header" style={styles.title}>{mode === "signup" ? "创建账号" : view.title}</Text>
          <Text style={styles.description}>
            {mode === "login" ? "登录你的账号，继续高效连接。" : view.description}
          </Text>
        </View>
        {view.restrictionMessage ? (
          <View style={styles.form}>
            <Text style={styles.errorText}>{view.restrictionMessage}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                navigateTo(
                  `${view.switchHref}?next=${encodeURIComponent(next)}`
                )
              }
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.primaryButtonText}>{view.switchLabel}</Text>
              <Ionicons color={colors.onAccent} name="arrow-forward" size={17} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
          <View style={styles.fields}>
          {view.fields.map((field) => (
            <AuthField
              field={field}
              key={field.name}
              onChange={(value) => updateValue(field, value)}
              value={fieldValue(field, values)}
            />
          ))}
          </View>
          {view.helperLinks.length > 0 ? (
            <View style={styles.helperLinkRow}>
              {view.helperLinks.map((helperLink) => (
                <Pressable
                  accessibilityRole="link"
                  disabled={submitting}
                  key={helperLink.href}
                  onPress={() =>
                    navigateTo(
                      `${helperLink.href}?next=${encodeURIComponent(next)}`
                    )
                  }
                  style={({ pressed }) => [
                    styles.helperLink,
                    pressed ? styles.pressed : null,
                    submitting ? styles.disabledButton : null
                  ]}
                >
                  <Text style={styles.helperLinkText}>{helperLink.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={[styles.actions, view.helperLinks.length > 0 ? styles.actionsAfterHelper : null]}>
          {created ? (
            <Text style={styles.noticeText}>账号已创建。请用刚才的邮箱继续登录。</Text>
          ) : null}
          {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
          <Pressable
            accessibilityLabel={view.primaryLabel}
            accessibilityRole="button"
            disabled={submitting || !auth.ready || (mode === "forgot" && !ready)}
            onPress={submit}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.pressed : null,
              submitting || !auth.ready ? styles.disabledButton : null
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {submitting ? view.busyLabel : view.primaryLabel}
            </Text>
          </Pressable>
          {view.oauthActions.length > 0 ? (
            <View style={styles.oauthStack}>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>或</Text>
                <View style={styles.dividerLine} />
              </View>
              {view.oauthActions.map((action) => (
                <Pressable
                  accessibilityLabel={action.label}
                  accessibilityRole="button"
                  disabled={submitting || !auth.ready}
                  key={action.id}
                  onPress={startGoogleSignIn}
                  style={({ pressed }) => [
                    styles.oauthButton,
                    pressed ? styles.pressed : null,
                    submitting || !auth.ready ? styles.disabledButton : null
                  ]}
                >
                  <Ionicons color={colors.ink} name="logo-google" size={18} />
                  <Text style={styles.oauthButtonText}>{fontScale > 1.3 ? "Google 登录" : action.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          </View>
          </View>
        )}
        {!view.restrictionMessage ? (
          <View style={styles.footer}>
          <Pressable
            accessibilityLabel={view.switchLabel}
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => navigateTo(`${view.switchHref}?next=${encodeURIComponent(next)}`)}
            style={({ pressed }) => [
              styles.switchButton,
              pressed ? styles.pressed : null,
              submitting ? styles.disabledButton : null
            ]}
          >
            <Text style={styles.switchText}>
              {mode === "login" ? "还没有账号？ " : mode === "signup" ? "已有账号？ " : ""}
              <Text style={styles.switchAction}>{mode === "login" ? "注册" : mode === "signup" ? "登录" : view.switchLabel}</Text>
            </Text>
          </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function OrbitAuthLogo() {
  const { styles } = useStyles();
  return (
    <Text accessibilityLabel="Orbit" style={styles.brandName}>Orbit<Text style={styles.brandDot}>.</Text></Text>
  );
}

function AuthField({
  field,
  onChange,
  value
}: {
  field: AccountAuthFieldView;
  onChange: (value: string) => void;
  value: string;
}) {
  const { colors, styles } = useStyles();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldWrap}>
      <View style={styles.labelRow}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {field.helper ? <Text style={styles.fieldHelper}>{field.helper}</Text> : null}
      </View>
      <View style={[styles.inputShell, focused ? styles.inputFocused : null]}>
        <TextInput
          accessibilityLabel={field.label}
          autoCapitalize="none"
          keyboardType={field.name === "email" ? "email-address" : "default"}
          onChangeText={onChange}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          placeholder={field.placeholder}
          placeholderTextColor={colors.text4}
          secureTextEntry={field.secure && !passwordVisible}
          style={styles.input}
          value={value}
        />
        {field.secure ? (
          <Pressable
            accessibilityLabel={passwordVisible ? "隐藏密码" : "显示密码"}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setPasswordVisible((current) => !current)}
            style={({ pressed }) => [
              styles.passwordToggle,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons
              color={colors.text3}
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={19}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { width: "100%", maxWidth: layout.contentMax, alignSelf: "center", minHeight: 48, paddingHorizontal: 16, justifyContent: "center", alignItems: "flex-start" },
  closeButton: { minHeight: 44, minWidth: 44, flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  closeText: { color: colors.accent, fontSize: 15, lineHeight: 20, fontWeight: "600", flexShrink: 1 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, width: "100%", maxWidth: layout.contentMax, alignSelf: "center", paddingHorizontal: 24 },
  hero: { paddingTop: 40 },
  brandName: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 31,
    letterSpacing: -0.52
  },
  brandDot: { color: colors.accent },
  title: { color: colors.ink, fontSize: 34, lineHeight: 40, fontWeight: "900", letterSpacing: -1.02, marginTop: 28 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 8 },
  disabledButton: {
    opacity: 0.72
  },
  dividerLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: 1
  },
  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  dividerText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  errorText: {
    backgroundColor: colors.roseSoft,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 19,
    padding: spacing.md
  },
  fieldHelper: {
    ...textStyles.caption,
    color: colors.text3,
    flexShrink: 1
  },
  fieldLabel: {
    color: colors.text3,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 0.48
  },
  fieldWrap: {
    gap: 6
  },
  form: {
    marginTop: 36
  },
  fields: { gap: 22 },
  actions: { gap: 12, marginTop: 28 },
  actionsAfterHelper: { marginTop: 14 },
  helperLink: {
    alignItems: "center",
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: layout.control,
    maxWidth: "100%",
    paddingHorizontal: 6,
    paddingVertical: spacing.xs
  },
  helperLinkRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end"
  },
  helperLinkText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  input: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
    flex: 1,
    minWidth: 0,
    minHeight: 44.5,
    outlineStyle: "solid",
    outlineWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 10
  },
  inputShell: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1.5,
    minHeight: 46,
    flexDirection: "row"
  },
  inputFocused: { borderBottomColor: colors.ink },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "space-between"
  },
  noticeText: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    color: colors.live,
    fontSize: typography.small,
    lineHeight: 19,
    padding: spacing.md
  },
  oauthButton: {
    ...createControlStyles(colors).secondaryButton,
    backgroundColor: colors.surface,
    minHeight: 50,
    flexDirection: "row",
    gap: 10
  },
  oauthButtonText: {
    ...createControlStyles(colors).secondaryButtonText,
    fontWeight: "600"
  },
  oauthStack: {
    gap: 20,
    marginTop: 8
  },
  passwordToggle: {
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
    minWidth: 44
  },
  pressed: {
    opacity: 0.84,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.sm
  },
  primaryButtonText: {
    ...createControlStyles(colors).primaryButtonText
  },
  footer: { marginTop: "auto", paddingTop: 36, paddingBottom: 4 },
  switchButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  switchText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  switchAction: { color: colors.accent, fontWeight: "700" }
}));
