import { DEFAULT_RETURN_HREF, returnHref } from "./return-href";
import { createTranslator, type MessageKey, type OrbitTranslator } from "../i18n/messages";

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

const defaultNext = DEFAULT_RETURN_HREF;
/** One-use, in-process hand-over of the typed email between login and signup; never in the URL. */
let signupFallback: { email: string; next: string; expiresAt: number } | null = null;

export function rememberSignupFallbackEmail(email: string, next: string): void {
  signupFallback = { email: email.trim(), next: normalizedNext(next), expiresAt: Date.now() + 120_000 };
}

export function takeSignupFallbackEmail(next: string): string {
  const fallback = signupFallback;
  signupFallback = null;
  return fallback?.next === normalizedNext(next) && fallback.expiresAt > Date.now() ? fallback.email : "";
}

/** Same rule as Web's auth-model and the server's contract, on the trimmed address. */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

export function accountAuthEmailError(email: string): "invalid" | null {
  return EMAIL_PATTERN.test(email.trim()) ? null : "invalid";
}

export const ACCOUNT_PASSWORD_MIN_LENGTH = 8;

export function accountAuthPasswordError(password: string): "too-short" | "too-long" | null {
  if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH) return "too-short";
  if (new TextEncoder().encode(password).byteLength > 72) return "too-long";
  return null;
}
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
    : [emailField, { label: t("auth.password"), name: "password", placeholder: t("auth.passwordPlaceholder"), secure: true }];
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

/** Where signing in or up leads back to: the page the person came from, or Home. */
export function normalizedNext(next: string | undefined): string {
  return returnHref(next) ?? defaultNext;
}

/** The login page that comes back to `href` (Home when there is nothing to come back to). */
export function loginHrefReturningTo(href: string | null | undefined): string {
  const next = returnHref(href);
  return next && next !== defaultNext ? `/account/login?next=${encodeURIComponent(next)}` : "/account/login";
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
  mode,
  next
}: {
  mode: AccountAuthMode;
  next?: string;
}): string {
  const safeNext = normalizedNext(next);

  if (mode === "signup") {
    return `/account/login?created=1&next=${encodeURIComponent(safeNext)}`;
  }

  if (mode === "forgot") {
    return `/account/login?next=${encodeURIComponent(safeNext)}`;
  }

  return `/profile/onboarding?next=${encodeURIComponent(safeNext)}`;
}

/** Where a completed sign-in goes: onboarding decides there whether setup is still needed (a set-up account goes straight to next). */
export function signedInHref({ next, pendingDeletion }: { next?: string | undefined; pendingDeletion?: boolean | undefined }): string {
  if (pendingDeletion) return "/account/pending";
  return nextHrefForAccountAuthSubmit(next === undefined ? { mode: "login" } : { mode: "login", next });
}

// QA-D: the auth transport (mobile-auth / browser-auth / auth-session) returns fixed Chinese messages; show them in the UI language.
const AUTH_MESSAGE_KEYS: readonly MessageKey[] = [
  "auth.err.invalidCredentials",
  "auth.err.serviceUnavailable",
  "auth.err.serviceUnreachable",
  "auth.err.unverified",
  "auth.err.network",
  "auth.err.networkShort",
  "auth.err.missing",
  "auth.err.signupInput",
  "auth.err.emailTaken",
  "auth.err.signupFailed",
  "auth.err.signOutFailed",
  "auth.err.expired",
  "auth.err.sessionExpired",
  "auth.err.incomplete",
  "auth.err.googleVerify",
  "auth.err.googleIncomplete",
  "auth.err.googleReturn",
  "auth.err.googleCancelled",
  "auth.err.invalidRequest",
  "auth.err.invalidRedirect",
  "auth.err.codeUsed",
  "auth.err.identity",
  "auth.err.providers",
  "auth.err.accountState",
];
// The transport returns these keys' text in the screen language (any of the three), so
// every language's copy is a lookup row: a message is re-read in the language shown now.
const AUTH_MESSAGES_BY_TEXT = new Map((["zh", "ja", "en"] as const).flatMap(language => AUTH_MESSAGE_KEYS.map(key => [createTranslator(language)(key), key] as const)));

/** The user closed the Google sheet themselves (a notice, not an error), in whatever language the transport wrote it. */
export function isGoogleSignInCancelled(message: string | null | undefined): boolean {
  return !!message && AUTH_MESSAGES_BY_TEXT.get(message.trim()) === "auth.err.googleCancelled";
}

export function localizeAuthMessage(message: string | null | undefined, t: OrbitTranslator): string | undefined {
  if (!message) return undefined;
  const key = AUTH_MESSAGES_BY_TEXT.get(message.trim());
  return key ? t(key) : message;
}
