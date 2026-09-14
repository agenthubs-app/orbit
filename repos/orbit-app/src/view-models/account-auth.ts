import { resolveSupportedInitialRouteHref } from "./initial-route";
import { createTranslator, type OrbitTranslator } from "../i18n/messages";

export type AccountAuthMode = "forgot" | "login" | "signup";

export interface AccountAuthFieldView {
  helper?: string;
  label: string;
  name: "email" | "password";
  placeholder: string;
  secure: boolean;
}

export interface AccountAuthHelperLinkView {
  href: string;
  label: string;
}

export interface AccountAuthOauthActionView {
  id: "google";
  label: string;
}

export interface AccountAuthView {
  boundary: string;
  busyLabel: string;
  defaultNext: string;
  description: string;
  fields: AccountAuthFieldView[];
  helperLinks: AccountAuthHelperLinkView[];
  mode: AccountAuthMode;
  oauthActions: AccountAuthOauthActionView[];
  primaryLabel: string;
  restrictionMessage?: string;
  switchHref: string;
  switchLabel: string;
  title: string;
}

interface AccountAuthOptions {
  googleEnabled?: boolean;
  t?: OrbitTranslator;
}

const defaultNext = "/dashboard";
const authEntryPaths = new Set([
  "/account/forgot-password",
  "/account/reset-password",
  "/account/login",
  "/account/signup"
]);

function modeCopy(t: OrbitTranslator): Record<
  AccountAuthMode,
  Omit<
    AccountAuthView,
    | "boundary"
    | "defaultNext"
    | "fields"
    | "helperLinks"
    | "mode"
    | "oauthActions"
  >
> { return {
  forgot: {
    busyLabel: t("auth.forgotBusy"),
    description: t("auth.forgotDescription"),
    primaryLabel: t("auth.forgotPrimary"),
    switchHref: "/account/login",
    switchLabel: t("auth.forgotSwitch"),
    title: t("auth.forgotTitle")
  },
  login: {
    busyLabel: t("auth.loginBusy"),
    description: t("auth.loginViewDescription"),
    primaryLabel: t("auth.loginPrimary"),
    switchHref: "/account/signup",
    switchLabel: t("auth.loginSwitch"),
    title: t("auth.loginTitle")
  },
  signup: {
    busyLabel: t("auth.signupBusy"),
    description: t("auth.signupDescription"),
    primaryLabel: t("auth.signupPrimary"),
    switchHref: "/account/login",
    switchLabel: t("auth.signupSwitch"),
    title: t("auth.signupViewTitle")
  }
}; }

function fieldsForMode(mode: AccountAuthMode, t: OrbitTranslator): AccountAuthFieldView[] {
  const emailField: AccountAuthFieldView = {
    label: t("auth.email"), name: "email", placeholder: t("auth.emailPlaceholder"), secure: false
  };
  if (mode === "forgot") {
    return [emailField];
  }

  return mode === "signup"
    ? [emailField, { helper: t("auth.passwordHelper"), label: t("auth.setPassword"), name: "password", placeholder: t("auth.setPasswordPlaceholder"), secure: true }]
    : [emailField, { helper: t("auth.passwordHelper"), label: t("auth.password"), name: "password", placeholder: t("auth.passwordPlaceholder"), secure: true }];
}

function helperLinksForMode(mode: AccountAuthMode, t: OrbitTranslator): AccountAuthHelperLinkView[] {
  if (mode === "forgot") {
    return [{ href: "/account/reset-password", label: t("auth.useResetLink") }];
  }
  if (mode === "login") {
    return [{ href: "/account/forgot-password", label: t("auth.forgotPassword") }];
  }

  return [];
}

function oauthActionsForMode(
  mode: AccountAuthMode,
  googleEnabled: boolean,
  t: OrbitTranslator
): AccountAuthOauthActionView[] {
  if (!googleEnabled || mode === "forgot") {
    return [];
  }

  return [{ id: "google", label: t("auth.google") }];
}

export function normalizedNext(next: string | undefined): string {
  const supported = resolveSupportedInitialRouteHref(next?.trim());
  const pathname = supported?.split(/[?#]/u, 1)[0];

  if (!supported || !pathname || authEntryPaths.has(pathname)) {
    return defaultNext;
  }

  return supported;
}

export function accountAuthToView(
  mode: AccountAuthMode,
  options: AccountAuthOptions = {}
): AccountAuthView {
  const t = options.t ?? createTranslator("zh");
  const googleEnabled = options.googleEnabled === true;

  return {
    ...modeCopy(t)[mode],
    boundary: t("auth.boundary"),
    defaultNext,
    fields: fieldsForMode(mode, t),
    helperLinks: helperLinksForMode(mode, t),
    mode,
    oauthActions: oauthActionsForMode(mode, googleEnabled, t)
  };
}

export function nextHrefForAccountAuthSubmit({
  email,
  mode,
  next
}: {
  email: string;
  mode: AccountAuthMode;
  next?: string;
}): string {
  const safeNext = normalizedNext(next);

  if (mode === "signup") {
    return `/account/login?created=1&email=${encodeURIComponent(
      email.trim()
    )}&next=${encodeURIComponent(safeNext)}`;
  }

  if (mode === "forgot") {
    return `/account/login?next=${encodeURIComponent(safeNext)}`;
  }

  return `/profile?complete=1&next=${encodeURIComponent(safeNext)}`;
}
