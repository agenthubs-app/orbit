import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Pressable,
  Platform,
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
import { reportRegisterOpened, signupSourceOf, signupVisitorId } from "../../api/signup-funnel";
import { authReturnStorage } from "../../storage/auth-return-storage";
import { profileOnboardingStorage } from "../../storage/profile-onboarding-storage";
import { LinkedTerms } from "../../email-verification/LinkedTerms";
import { MailSentDialog } from "../../email-verification/MailSentDialog";
import type { PasswordResetResponse } from "../../api/contract/password-reset";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { Checkbox } from "../../components/ui/Checks";
import { Icon } from "../../components/ui/Icon";
import { resetStackTo } from "../../components/shell-navigation";
import { layout, radius, spacing, textStyles, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import {
  ACCOUNT_PASSWORD_MIN_LENGTH,
  accountAuthToView,
  accountAuthEmailError,
  accountAuthPasswordError,
  isGoogleSignInCancelled,
  localizeAuthMessage,
  nextHrefForAccountAuthSubmit,
  normalizedNext,
  rememberSignupFallbackEmail,
  signedInHref,
  takeSignupFallbackEmail,
  type AccountAuthFieldView,
  type AccountAuthMode
} from "../../view-models/account-auth";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { OrbitTranslator } from "../../i18n/messages";
import { credentialsLandingHref, readMustChangePassword, trimPastedPassword } from "../../view-models/password-change";

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
    next?: string | string[];
  }>();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Problems found before sending, shown on their own field.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AccountAuthFieldView["name"], string>>>({});
  const emailInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const inputs = { email: emailInput, password: passwordInput };
  const [agreed, setAgreed] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  // Signed up and signed in: the verification mail's popup (VA1), and where its button goes on to.
  const [mailSent, setMailSent] = useState<{ email: string; href: string } | null>(null);
  // Login / forgot-password links only help when the server refused the sign-up (e.g. the address is taken), not for a short password.
  const [signupRefused, setSignupRefused] = useState(false);
  const [devicePendingWrites, setDevicePendingWrites] = useState<{
    baseUrl: string;
    count: number | null;
  } | null>(null);
  const auth = useOrbitAuthSession();
  const locale = useOrbitLocale();
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
  // Email + password sign-in succeeded: where it was going, until the account's mustChangePassword is read with the new session.
  const [landing, setLanding] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!ready || mode !== "login" || Platform.OS === "web") {
      setDevicePendingWrites(null);
      return;
    }

    let active = true;
    const requestedBaseUrl = server.baseUrl;
    setDevicePendingWrites(null);
    void auth.readPendingWritesOnDevice().then(
      count => {
        if (active) setDevicePendingWrites({ baseUrl: requestedBaseUrl, count });
      },
      () => {
        if (active) setDevicePendingWrites({ baseUrl: requestedBaseUrl, count: null });
      },
    );
    return () => { active = false; };
  }, [auth.readPendingWritesOnDevice, mode, ready, server.baseUrl]);
  useEffect(() => {
    if (landing === null) return;
    let live = true;
    // Runs on the render that carries `landing`, which already has the session signIn() accepted.
    // An unreadable status never blocks sign-in (as Web credentialsLandingPath).
    void readMustChangePassword({ baseUrl: server.baseUrl, cookieHeader: auth.cookieHeader }).then((mustChange) => {
      if (live && mounted.current) resetStackTo(router, credentialsLandingHref(mustChange, landing));
    });
    return () => { live = false; };
  }, [auth.cookieHeader, landing, router, server.baseUrl]);
  const view = useMemo(
    () => accountAuthToView(mode, { googleEnabled: auth.googleEnabled, t: locale.t }),
    [auth.googleEnabled, locale.t, mode]
  );
  const next = normalizedNext(firstParam(params.next, view.defaultNext));
  const created = firstParam(params.created) === "1";
  const [values, setValues] = useState<Record<AccountAuthFieldView["name"], string>>({
    email: "",
    password: ""
  });
  useEffect(() => {
    if (mode === "forgot") return;
    const fallbackEmail = takeSignupFallbackEmail(next);
    if (fallbackEmail) setValues((current) => current.email ? current : { ...current, email: fallbackEmail });
  }, [mode, next]);
  useEffect(() => {
    if (mode === "signup" && server.ready) void reportRegisterOpened(server.baseUrl, signupSourceOf(next));
  // Once per opening of the page, not per change of `next`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, server.baseUrl, server.ready]);
  // The popup is the only thing between the new account and onboarding: closing the App there keeps the way back.
  const returnScope = mailSent && auth.actorId ? auth.actorId : null;
  useEffect(() => {
    if (returnScope) void profileOnboardingStorage.writeReturn({ actorId: returnScope, baseUrl: server.baseUrl }, next);
  }, [next, returnScope, server.baseUrl]);
  const accepted = mode === "forgot" && notice !== null;

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
    setFieldErrors({});
    if (mode === "forgot" || scope.mode === "forgot") {
      recoveryPending.current = false;
      setValues({ email: "", password: "" });
      setNotice(null);
      setError(null);
    }
    return null;
  }

  function updateValue(field: AccountAuthFieldView, value: string) {
    setFieldErrors(({ [field.name]: _cleared, ...rest }) => rest);
    setValues((current) => ({
      ...current,
      // Login: a pasted password loses its surrounding spaces (as Web); typing is untouched.
      [field.name]: mode === "login" && field.name === "password" ? trimPastedPassword(current.password, value) : value
    }));
  }

  function changeConsent(value: boolean) {
    setAgreed(value);
    if (value) setConsentMissing(false);
  }

  function navigateTo(href: string) {
    router.push(href as Href);
  }

  /** Login ↔ signup: next stays in the URL, the typed email is handed over in-process. */
  function switchMode(href: string) {
    if (values.email.trim()) rememberSignupFallbackEmail(values.email, next);
    navigateTo(`${href}?next=${encodeURIComponent(next)}`);
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
        // QA-D: the API client turns server errors into fixed Chinese text; show the UI language instead.
        if (!result.success) setError(result.status >= 500 ? locale.t("auth.forgotUnavailable") : result.error.code === "ORBIT_APP_NETWORK_ERROR" ? locale.t("auth.networkFailure") : locale.t("auth.pendingUnconfirmed"));
        else if (typeof result.data?.message !== "string" || !result.data.message.trim() || result.status >= 400) {
          setError(locale.t("auth.pendingUnconfirmed"));
        } else {
          setNotice(locale.t("auth.forgotAccepted"));
          void authReturnStorage.remember(next, "reset");
        }
      } catch {
        if (isCurrent()) setError(locale.t("auth.networkFailure"));
      } finally {
        if (isCurrent()) { recoveryPending.current = false; setSubmitting(false); }
      }
      return;
    }
    if (!ready || authPending.current || landing !== null) return;
    setSignupRefused(false);
    const problems: typeof fieldErrors = {};
    if (mode === "signup" && accountAuthEmailError(values.email)) problems.email = locale.t("auth.err.emailInvalid");
    const passwordError = accountAuthPasswordError(values.password);
    if (passwordError) problems.password = locale.t(passwordError === "too-long" ? "auth.err.passwordTooLong" : "auth.err.passwordTooShort");
    setFieldErrors(problems);
    const consentProblem = mode === "signup" && !agreed;
    setConsentMissing(consentProblem);
    const firstProblem = problems.email ? "email" : problems.password ? "password" : null;
    if (firstProblem || consentProblem) {
      setNotice(null);
      setError(null);
      if (firstProblem) inputs[firstProblem].current?.focus();
      return;
    }
    authPending.current = true;
    const requestAuthScope = authScopeKey;
    const isCurrent = () => mounted.current && authScopeRef.current === requestAuthScope;
    setSubmitting(true);
    setNotice(null);
    setError(null);

    try {
      if (mode === "signup") {
        const visitorId = await signupVisitorId();
        if (!isCurrent()) return;
        const result = await auth.register({
          email: values.email,
          language: locale.language,
          password: values.password,
          source: signupSourceOf(next),
          ...(visitorId ? { visitorId } : {})
        });

        if (!isCurrent()) return;
        if (!result.success) {
          setError(localizeAuthMessage(result.message, locale.t) ?? locale.t("auth.signupFailure"));
          setSignupRefused(true);
          return;
        }

        const signedIn = await auth.signIn({ email: values.email, password: values.password, redirectTo: next });
        if (!isCurrent()) return;
        if (!signedIn.success) rememberSignupFallbackEmail(values.email, next);
        // Signed in now: nothing from before (welcome, login, signup) stays to go back to.
        const href = signedIn.success ? signedInHref({ next, pendingDeletion: signedIn.pendingDeletion }) : nextHrefForAccountAuthSubmit({ mode: "signup", next });
        if (result.mailSentTo) setMailSent({ email: result.mailSentTo, href });
        else resetStackTo(router, href);
        return;
      }

      const result = await auth.signIn({
        email: values.email,
        password: values.password,
        redirectTo: next
      });

      if (!isCurrent()) return;
      if (!result.success) {
        setError(localizeAuthMessage(result.message, locale.t) ?? locale.t("auth.loginFailure"));
        return;
      }

      if (result.pendingDeletion) {
        resetStackTo(router, "/account/pending");
        return;
      }
      // First sign-in of an account created with an initial password: change it first (checked once the new session is in).
      setLanding(next);
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
      await authReturnStorage.remember(next);
      const result = await auth.startGoogleSignIn({ redirectTo: next, signup: { source: signupSourceOf(next), visitorId: await signupVisitorId() } });

      if (!isCurrent()) return;
      if (!result.success) {
        if (isGoogleSignInCancelled(result.message)) {
          setNotice(locale.t("auth.googleCancelled"));
        } else {
          setError(localizeAuthMessage(result.message, locale.t) ?? locale.t("auth.googleIncomplete"));
        }
        return;
      }

      // Google completes a session even when launched from the signup screen.
      resetStackTo(router, signedInHref({ next, pendingDeletion: result.pendingDeletion }));
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
        <View style={styles.brand}><Text allowFontScaling={false} style={styles.brandMark}>O</Text><Text style={styles.brandText}>Orbit</Text></View>
        <Pressable
          accessibilityLabel={locale.t("auth.backLabel")}
          accessibilityRole="button"
          onPress={() => router.canGoBack() ? router.back() : router.replace("/")}
          style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.closeText}>{locale.t("auth.backLabel")}</Text>
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
          <Text accessibilityRole="header" style={styles.title}>{accepted ? locale.t("auth.forgotAcceptedTitle") : mode === "signup" ? locale.t("auth.signupTitle") : view.title}</Text>
          <Text style={styles.description}>
            {accepted ? notice : mode === "login" ? locale.t("auth.loginDescription") : mode === "signup" ? locale.t("auth.signupBrief") : locale.t("auth.forgotBrief")}
          </Text>
        </View>
        {mode === "login" && Platform.OS !== "web" && devicePendingWrites?.baseUrl === server.baseUrl && devicePendingWrites.count !== 0 ? (
          <Text accessibilityRole={devicePendingWrites.count === null ? "alert" : "text"} style={styles.description}>
            {devicePendingWrites.count === null
              ? locale.t("auth.devicePendingWritesUnknown")
              : locale.t("auth.devicePendingWriteCount", { count: devicePendingWrites.count })}
          </Text>
        ) : null}
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
          {view.oauthActions.length > 0 ? (
            <View style={styles.oauthStack}>
              {view.oauthActions.map((action) => (
                <Pressable
                  accessibilityLabel={action.label}
                  accessibilityRole="button"
                  disabled={submitting || !auth.ready}
                  key={action.id}
                  onPress={startGoogleSignIn}
                  style={({ pressed }) => [styles.oauthButton, pressed ? styles.pressed : null, submitting || !auth.ready ? styles.disabledButton : null]}
                >
                  <Ionicons color={colors.ink} name="logo-google" size={18} />
                  <Text style={styles.oauthButtonText}>{fontScale > 1.3 ? locale.t("auth.googleShort") : action.label}</Text>
                </Pressable>
              ))}
              <LinkedTerms textKey="auth.googleTerms" style={styles.googleTerms} />
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{locale.t("auth.or")}</Text>
                <View style={styles.dividerLine} />
              </View>
            </View>
          ) : null}
          {!accepted ? <View style={styles.fields}>
          {view.fields.map((field, index) => (
            <AuthField
              error={fieldErrors[field.name]}
              field={field}
              inputRef={inputs[field.name]}
              key={field.name}
              last={index === view.fields.length - 1}
              mode={mode}
              onSubmit={() => { if (index === view.fields.length - 1) void submit(); else passwordInput.current?.focus(); }}
              onChange={(value) => updateValue(field, value)}
              t={locale.t}
              value={fieldValue(field, values)}
            />
          ))}
          </View> : null}
          <View style={styles.actions}>
          {created ? (
            <Text style={styles.noticeText}>{locale.t("auth.createdNotice")}</Text>
          ) : null}
          {notice && !accepted ? <Text style={styles.noticeText}>{notice}</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
          {mode === "signup" && error && signupRefused ? <View style={styles.errorLinks}>
            <Pressable accessibilityRole="link" onPress={() => switchMode("/account/login")} style={styles.errorLink}><Text style={styles.errorLinkText}>{locale.t("auth.loginPrimary")}</Text></Pressable>
            <Pressable accessibilityRole="link" onPress={() => navigateTo(`/account/forgot-password?next=${encodeURIComponent(next)}`)} style={styles.errorLink}><Text style={styles.errorLinkText}>{locale.t("auth.forgotPassword")}</Text></Pressable>
          </View> : null}
          {mode === "signup" ? <View style={styles.consent}>
            <View style={styles.consentRow}>
              <Checkbox accessibilityLabel={locale.t("auth.consentLabel")} checked={agreed} onChange={changeConsent} />
              <LinkedTerms textKey="auth.consent" onPress={() => changeConsent(!agreed)} style={styles.consentText} />
            </View>
            {consentMissing ? <Text accessibilityRole="alert" style={styles.fieldError}>{locale.t("auth.err.consentRequired")}</Text> : null}
          </View> : null}
          {accepted ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={locale.t("auth.loginPrimary")}
            onPress={() => router.replace(nextHrefForAccountAuthSubmit({ mode: "forgot", next }) as Href)}
            style={styles.primaryButton}
          ><Text style={styles.primaryButtonText}>{locale.t("auth.loginPrimary")}</Text></Pressable> : <Pressable
            accessibilityLabel={mode === "forgot" ? locale.t("auth.forgotRequest") : view.primaryLabel}
            accessibilityRole="button"
            disabled={submitting || landing !== null || !auth.ready || (mode === "forgot" && !ready)}
            onPress={submit}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.pressed : null,
              submitting || landing !== null || !auth.ready ? styles.disabledButton : null
            ]}
          >
            <Text style={styles.primaryButtonText}>{submitting || landing !== null ? view.busyLabel : mode === "forgot" ? locale.t("auth.forgotRequest") : view.primaryLabel}</Text>
          </Pressable>}
          </View>
          </View>
        )}
        {!view.restrictionMessage && !accepted ? (
          <View style={styles.footer}>
          {view.helperLinks.length > 0 ? (
            <View style={styles.helperLinkRow}>
              {view.helperLinks.map((helperLink) => (
                <Pressable
                  accessibilityRole="link"
                  disabled={submitting}
                  key={helperLink.href}
                  onPress={() => navigateTo(`${helperLink.href}?next=${encodeURIComponent(next)}`)}
                  style={({ pressed }) => [styles.helperLink, pressed ? styles.pressed : null, submitting ? styles.disabledButton : null]}
                >
                  <Text style={styles.helperLinkText}>{helperLink.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable
            accessibilityLabel={view.switchLabel}
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => switchMode(view.switchHref)}
            style={({ pressed }) => [
              styles.switchButton,
              pressed ? styles.pressed : null,
              submitting ? styles.disabledButton : null
            ]}
          >
            <Text style={styles.switchText}>
              {mode === "login" ? locale.t("auth.noAccount") : mode === "signup" ? locale.t("auth.hasAccount") : ""}
              <Text style={styles.switchAction}>{mode === "login" ? locale.t("auth.register") : mode === "signup" ? locale.t("auth.loginPrimary") : view.switchLabel}</Text>
            </Text>
          </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <MailSentDialog email={mailSent?.email ?? null} onProceed={() => { if (mailSent) resetStackTo(router, mailSent.href); }} />
    </SafeAreaView>
  );
}

function AuthField({
  error,
  field,
  inputRef,
  last,
  mode,
  onChange,
  onSubmit,
  t,
  value
}: {
  error?: string | undefined;
  field: AccountAuthFieldView;
  inputRef: RefObject<TextInput | null>;
  last: boolean;
  mode: AccountAuthMode;
  onChange: (value: string) => void;
  onSubmit: () => void;
  t: OrbitTranslator;
  value: string;
}) {
  const { colors, styles } = useStyles();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  // Signup: 「at least 8」 turns to the kit's met state (b1 .reqs .ok) as soon as it is.
  const helperMet = field.name === "password" && value.length >= ACCOUNT_PASSWORD_MIN_LENGTH;

  return (
    <View style={styles.fieldWrap}>
      <View style={styles.labelRow}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {field.helper ? <View style={styles.helperRow}>
          {helperMet ? <Icon color={colors.okText} name="check" size={16} /> : null}
          <Text style={[styles.fieldHelper, helperMet ? styles.fieldHelperMet : null]}>{field.helper}</Text>
        </View> : null}
      </View>
      <View style={[styles.inputShell, focused ? styles.inputFocused : null, error ? styles.inputInvalid : null]}>
        <TextInput
          accessibilityLabel={field.label}
          autoCapitalize="none"
          autoComplete={field.name === "email" ? "email" : mode === "signup" ? "new-password" : "password"}
          autoCorrect={false}
          keyboardType={field.name === "email" ? "email-address" : "default"}
          onChangeText={onChange}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          onSubmitEditing={onSubmit}
          placeholder={field.placeholder}
          placeholderTextColor={colors.ink3Text}
          ref={inputRef}
          returnKeyType={last ? "go" : "next"}
          secureTextEntry={field.secure && !passwordVisible}
          style={styles.input}
          // 「next」 keeps the keyboard up while the focus moves to the password.
          submitBehavior={last ? "blurAndSubmit" : "submit"}
          // iOS keychain: the email is the account name; sign-up offers to save a new password.
          textContentType={field.name === "email" ? "username" : mode === "signup" ? "newPassword" : "password"}
          value={value}
        />
        {field.secure ? (
          <Pressable
            accessibilityLabel={passwordVisible ? t("auth.hidePassword") : t("auth.showPassword")}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setPasswordVisible((current) => !current)}
            style={({ pressed }) => [
              styles.passwordToggle,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons
              color={colors.ink3Text}
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={19}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { width: "100%", maxWidth: layout.contentMax, alignSelf: "center", minHeight: 58, paddingHorizontal: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 36, height: 36, overflow: "hidden", borderRadius: 12, backgroundColor: colors.ink, color: colors.surface, textAlign: "center", textAlignVertical: "center", fontSize: 24, fontWeight: "900" },
  brandText: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  closeButton: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  closeText: { color: colors.ink2, fontSize: 14, lineHeight: 21, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, width: "100%", maxWidth: layout.contentMax, alignSelf: "center", paddingHorizontal: 36, paddingBottom: 4 },
  hero: { paddingTop: 20 },
  title: { color: colors.ink, fontSize: 24, lineHeight: 32, fontWeight: "800" },
  description: { color: colors.ink2, fontSize: 15, lineHeight: 23, marginTop: 8 },
  disabledButton: {
    opacity: 0.72
  },
  dividerLine: {
    backgroundColor: colors.line,
    flex: 1,
    height: 1
  },
  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  dividerText: {
    color: colors.ink3Text,
    fontSize: typography.label,
    lineHeight: 18
  },
  errorText: {
    backgroundColor: colors.coralSoft,
    borderColor: colors.line,
    borderRadius: radius.xl,
    borderWidth: 1,
    color: colors.coralText,
    fontSize: typography.bodySm,
    lineHeight: 22,
    padding: spacing.md
  },
  errorLinks: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  errorLink: { minHeight: 44, justifyContent: "center" },
  errorLinkText: { color: colors.accentText, fontSize: 15, fontWeight: "700" },
  fieldHelper: {
    ...textStyles.caption,
    color: colors.ink3Text,
    flexShrink: 1
  },
  fieldHelperMet: { color: colors.okText, fontWeight: "700" },
  helperRow: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 6 },
  // b1 .fld.err: coral outline and fill, the reason under the field.
  fieldError: { ...textStyles.caption, color: colors.coralText, fontWeight: "600" },
  inputInvalid: { backgroundColor: colors.coralSoft, borderColor: colors.coral },
  fieldLabel: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    letterSpacing: 0
  },
  fieldWrap: {
    gap: 6
  },
  form: {
    flexGrow: 1,
    marginTop: 18
  },
  fields: { gap: 16 },
  actions: { gap: 12, marginTop: "auto", paddingTop: 24 },
  helperLink: {
    alignItems: "center",
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 44,
    maxWidth: "100%",
    paddingHorizontal: 6,
    paddingVertical: spacing.xs
  },
  helperLinkRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center"
  },
  helperLinkText: {
    color: colors.accentText,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21
  },
  input: {
    fontSize: 18,
    lineHeight: 25,
    color: colors.ink,
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    outlineStyle: "solid",
    outlineWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  inputShell: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 48,
    flexDirection: "row"
  },
  inputFocused: { borderColor: colors.accentText },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "space-between"
  },
  noticeText: {
    backgroundColor: colors.okSoft,
    borderColor: colors.line,
    borderRadius: radius.xl,
    borderWidth: 1,
    color: colors.okText,
    fontSize: typography.bodySm,
    lineHeight: 22,
    padding: spacing.md
  },
  oauthButton: {
    ...createControlStyles(colors).secondaryButton,
    backgroundColor: colors.surface,
    minHeight: 44,
    flexDirection: "row",
    gap: 10
  },
  oauthButtonText: {
    ...createControlStyles(colors).secondaryButtonText,
    fontWeight: "600"
  },
  oauthStack: {
    gap: 12,
    marginBottom: 18
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
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: 22
  },
  primaryButtonText: {
    ...createControlStyles(colors).primaryButtonText
  },
  // VA6 .gterms: 8 under the Google button.
  googleTerms: { color: colors.ink3Text, fontSize: 13, lineHeight: 22.1, fontWeight: "500", marginTop: -4, textAlign: "center" },
  consent: { gap: 6 },
  consentRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  consentText: { flex: 1, color: colors.ink2, fontSize: 15, lineHeight: 23, fontWeight: "600" },
  // QA-D: stacked and centred; side by side the Japanese 「…登録」 ran past the right edge.
  footer: { minHeight: 40, paddingTop: 4, paddingBottom: 4, alignItems: "center" },
  switchButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  switchText: { color: colors.ink2, fontSize: 14, lineHeight: 21, textAlign: "center" },
  switchAction: { color: colors.accentText, fontWeight: "700" }
}));
