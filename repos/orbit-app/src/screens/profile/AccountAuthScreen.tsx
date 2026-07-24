import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  accountAuthToView,
  type AccountAuthFieldView,
  type AccountAuthMode
} from "../../view-models/account-auth";
import { accountSessionToView } from "../../view-models/account-session";

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
  const params = useLocalSearchParams<{
    created?: string | string[];
    email?: string | string[];
    next?: string | string[];
  }>();
  const router = useRouter();
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const auth = useOrbitAuthSession();
  const [values, setValues] = useState<Record<AccountAuthFieldView["name"], string>>({
    code: "",
    email: firstParam(params.email),
    newPassword: "",
    password: ""
  });
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.accountMe,
    (data) =>
      accountSessionToView(data, { authenticated: auth.signedIn }).statusLabel !==
      "已登录"
  );
  const view = useMemo(
    () => accountAuthToView(mode, { forgotStep }),
    [forgotStep, mode]
  );
  const next = firstParam(params.next, view.defaultNext);
  const created = firstParam(params.created) === "1";

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
    setSubmitting(true);
    setNotice(null);
    setError(null);

    try {
      if (mode === "forgot") {
        if (forgotStep === 1) {
          setForgotStep(2);
          setNotice("重置密码暂时不能发送，请先返回登录。");
        } else {
          router.replace(`/account/login?next=${encodeURIComponent(next)}` as Href);
        }
        return;
      }

      if (mode === "signup") {
        const result = await auth.register({
          displayName: "小雨",
          email: values.email,
          password: values.password
        });

        if (!result.success) {
          setError(result.message ?? "创建账号失败，请稍后再试。");
          return;
        }

        router.replace(
          `/account/login?created=1&email=${encodeURIComponent(
            values.email.trim()
          )}&next=${encodeURIComponent(next)}` as Href
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

      state.refresh();
      router.replace(next as Href);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppScreen
      eyebrow="账号"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title={view.title}
    >
      <DataCard detail={view.description} title="账号入口">
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
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={submitting || !auth.ready}
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
          <Pressable
            accessibilityRole="button"
            onPress={() => navigateTo(`${view.switchHref}?next=${encodeURIComponent(next)}`)}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.secondaryButtonText}>{view.switchLabel}</Text>
          </Pressable>
          {view.helperLinks.length > 0 ? (
            <View style={styles.helperLinkRow}>
              {view.helperLinks.map((helperLink) => (
                <Pressable
                  accessibilityRole="link"
                  key={helperLink.href}
                  onPress={() =>
                    navigateTo(
                      `${helperLink.href}?next=${encodeURIComponent(next)}`
                    )
                  }
                  style={({ pressed }) => [
                    styles.helperLink,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Text style={styles.helperLinkText}>{helperLink.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </DataCard>

      <DataCard detail={view.boundary} title="登录说明">
        <Text style={styles.bodyText}>
          邮箱密码账号会同步到网页版。Google 登录先从网页版进入。
        </Text>
      </DataCard>

      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="服务器连不上" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} title="账号状态不可用" />
      ) : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <SessionPreview data={state.data} signedIn={auth.signedIn} />
      ) : null}
    </AppScreen>
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
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.labelRow}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {field.helper ? <Text style={styles.fieldHelper}>{field.helper}</Text> : null}
      </View>
      <TextInput
        autoCapitalize="none"
        keyboardType={field.name === "email" ? "email-address" : "default"}
        onChangeText={onChange}
        placeholder={field.placeholder}
        placeholderTextColor={colors.text4}
        secureTextEntry={field.secure}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function SessionPreview({
  data,
  signedIn
}: {
  data: unknown;
  signedIn: boolean;
}) {
  const session = accountSessionToView(data, { authenticated: signedIn });

  return (
    <DataCard detail={session.summary} title="账号状态">
      <View style={styles.sessionRow}>
        <Text style={styles.sessionName}>{session.displayName}</Text>
        <Text style={styles.statusPill}>{session.statusLabel}</Text>
      </View>
      <Text style={styles.bodyText}>{session.goal}</Text>
    </DataCard>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20
  },
  disabledButton: {
    opacity: 0.72
  },
  errorText: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderRadius: radius.md,
    borderWidth: 1,
    color: "#B42318",
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
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.ink,
    fontSize: typography.body,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
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
  },
  sessionName: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 20
  },
  sessionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  statusPill: {
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  }
});
