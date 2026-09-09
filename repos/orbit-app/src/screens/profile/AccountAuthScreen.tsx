import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { PasswordResetResponse } from "../../api/contract/password-reset";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { radius, spacing, typography } from "../../design/tokens";
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

  if (scope.client !== client || scope.actorId !== actorId || scope.ready !== ready || scope.mode !== mode) {
    const nextScope = { client, actorId, ready, mode };
    scopeRef.current = nextScope;
    setScope(nextScope);
    if (mode === "forgot" || scope.mode === "forgot") {
      recoveryPending.current = false;
      setSubmitting(false);
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
    setSubmitting(true);
    setNotice(null);
    setError(null);

    try {
      if (mode === "signup") {
        const result = await auth.register({
          email: values.email,
          password: values.password
        });

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
      setSubmitting(false);
    }
  }

  async function startGoogleSignIn() {
    setSubmitting(true);
    setNotice(null);
    setError(null);

    try {
      const result = await auth.startGoogleSignIn({ redirectTo: next });

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
      setSubmitting(false);
    }
  }

  return (
    <AppScreen
      eyebrow="账号"
      title={view.title}
    >
      <OrbitAuthLogo />
      <DataCard title={view.primaryLabel}>
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
          {view.fields.map((field) => (
            <AuthField
              field={field}
              key={field.name}
              onChange={(value) => updateValue(field, value)}
              value={fieldValue(field, values)}
            />
          ))}
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
            <Ionicons color={colors.onAccent} name="arrow-forward" size={17} />
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
                  <Ionicons color={colors.ink} name="logo-google" size={17} />
                  <Text style={styles.oauthButtonText}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => navigateTo(`${view.switchHref}?next=${encodeURIComponent(next)}`)}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.pressed : null,
              submitting ? styles.disabledButton : null
            ]}
          >
            <Text style={styles.secondaryButtonText}>{view.switchLabel}</Text>
          </Pressable>
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
          </View>
        )}
      </DataCard>
    </AppScreen>
  );
}

function OrbitAuthLogo() {
  const { styles } = useStyles();
  return (
    <View style={styles.brandHeader}>
      <View accessibilityLabel="Orbit" style={styles.brandMark}>
        <View style={styles.brandRingPrimary} />
        <View style={styles.brandRingSecondary} />
        <View style={styles.brandCore} />
      </View>
      <Text style={styles.brandName}>Orbit</Text>
    </View>
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

  return (
    <View style={styles.fieldWrap}>
      <View style={styles.labelRow}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {field.helper ? <Text style={styles.fieldHelper}>{field.helper}</Text> : null}
      </View>
      <View style={styles.inputShell}>
        <TextInput
          accessibilityLabel={field.label}
          autoCapitalize="none"
          keyboardType={field.name === "email" ? "email-address" : "default"}
          onChangeText={onChange}
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
  brandCore: {
    backgroundColor: colors.onAccent,
    borderRadius: radius.pill,
    height: 12,
    width: 12
  },
  brandHeader: {
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: spacing.xs,
    paddingTop: spacing.sm
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 20,
    height: 64,
    justifyContent: "center",
    overflow: "hidden",
    width: 64
  },
  brandName: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 31
  },
  brandRingPrimary: {
    borderColor: colors.onAccent,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    height: 23,
    position: "absolute",
    transform: [{ rotate: "-24deg" }],
    width: 47
  },
  brandRingSecondary: {
    borderColor: colors.accent,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    height: 25,
    position: "absolute",
    transform: [{ rotate: "28deg" }],
    width: 50
  },
  disabledButton: {
    opacity: 0.72
  },
  dividerLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: StyleSheet.hairlineWidth
  },
  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  dividerText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  errorText: {
    backgroundColor: colors.roseSoft,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 19,
    padding: spacing.md
  },
  fieldHelper: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 16
  },
  fieldLabel: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  fieldWrap: {
    gap: spacing.sm
  },
  form: {
    gap: spacing.md
  },
  helperLink: {
    borderRadius: radius.control,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  helperLinkRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center"
  },
  helperLinkText: {
    color: colors.text2,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  inputShell: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden"
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  noticeText: {
    backgroundColor: colors.liveSoft,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.live,
    fontSize: typography.small,
    lineHeight: 19,
    padding: spacing.md
  },
  oauthButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border2,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  oauthButtonText: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  oauthStack: {
    gap: spacing.sm
  },
  passwordToggle: {
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
    minWidth: 48
  },
  pressed: {
    opacity: 0.84,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  }
}));
