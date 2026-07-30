import { resolveSupportedInitialRouteHref } from "./initial-route";

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
}

const defaultNext = "/dashboard";
const boundary = "使用网页端同一组邮箱和密码。";
const authEntryPaths = new Set([
  "/account/forgot-password",
  "/account/login",
  "/account/signup"
]);

const modeCopy: Record<
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
> = {
  forgot: {
    busyLabel: "处理中...",
    description: "当前部署尚未配置密码重置服务。",
    primaryLabel: "密码重置暂不可用",
    restrictionMessage:
      "系统没有发送邮件或验证码。请返回登录，或联系为你提供账号的活动主办方。",
    switchHref: "/account/login",
    switchLabel: "返回登录",
    title: "重置密码"
  },
  login: {
    busyLabel: "登录中...",
    description: "登录后进入你的活动、人脉和个人资料工作区。",
    primaryLabel: "登录",
    switchHref: "/account/signup",
    switchLabel: "还没有账号，创建账号",
    title: "欢迎回来"
  },
  signup: {
    busyLabel: "创建中...",
    description: "用真实邮箱开始建立个人账号，之后可以关联活动报名资料。",
    primaryLabel: "创建账号",
    switchHref: "/account/login",
    switchLabel: "已有账号，去登录",
    title: "创建你的 Orbit 账号"
  }
};

const emailField: AccountAuthFieldView = {
  label: "邮箱",
  name: "email",
  placeholder: "输入邮箱地址",
  secure: false
};

const passwordField: AccountAuthFieldView = {
  helper: "至少 8 位",
  label: "密码",
  name: "password",
  placeholder: "输入密码",
  secure: true
};

const signupPasswordField: AccountAuthFieldView = {
  helper: "至少 8 位",
  label: "设置密码",
  name: "password",
  placeholder: "设置至少 8 位密码",
  secure: true
};

function fieldsForMode(mode: AccountAuthMode): AccountAuthFieldView[] {
  if (mode === "forgot") {
    return [];
  }

  return mode === "signup"
    ? [emailField, signupPasswordField]
    : [emailField, passwordField];
}

function helperLinksForMode(mode: AccountAuthMode): AccountAuthHelperLinkView[] {
  if (mode === "login") {
    return [{ href: "/account/forgot-password", label: "忘记密码" }];
  }

  return [];
}

function oauthActionsForMode(
  mode: AccountAuthMode,
  googleEnabled: boolean
): AccountAuthOauthActionView[] {
  if (!googleEnabled || mode === "forgot") {
    return [];
  }

  return [{ id: "google", label: "使用 Google 登录" }];
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
  const googleEnabled = options.googleEnabled === true;

  return {
    ...modeCopy[mode],
    boundary,
    defaultNext,
    fields: fieldsForMode(mode),
    helperLinks: helperLinksForMode(mode),
    mode,
    oauthActions: oauthActionsForMode(mode, googleEnabled)
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

  return safeNext;
}
