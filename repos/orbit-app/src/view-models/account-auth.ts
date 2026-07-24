export type AccountAuthMode = "forgot" | "login" | "signup";
export type AccountAuthSubmitResult = "forgot-step-2" | string;

export interface AccountAuthFieldView {
  helper?: string;
  label: string;
  name: "code" | "email" | "newPassword" | "password";
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
  switchHref: string;
  switchLabel: string;
  title: string;
}

interface AccountAuthOptions {
  forgotStep?: 1 | 2;
  googleEnabled?: boolean;
}

const defaultNext = "/dashboard";
const boundary = "使用网页端同一组邮箱和密码。";

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
    description: "输入注册邮箱，先确认重置入口。",
    primaryLabel: "发送验证码",
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

const codeField: AccountAuthFieldView = {
  label: "验证码",
  name: "code",
  placeholder: "6 位验证码",
  secure: false
};

const newPasswordField: AccountAuthFieldView = {
  helper: "至少 8 位",
  label: "新密码",
  name: "newPassword",
  placeholder: "设置新密码",
  secure: true
};

function fieldsForMode(
  mode: AccountAuthMode,
  forgotStep: 1 | 2
): AccountAuthFieldView[] {
  if (mode === "forgot") {
    return forgotStep === 2
      ? [emailField, codeField, newPasswordField]
      : [emailField];
  }

  return mode === "signup"
    ? [emailField, signupPasswordField]
    : [emailField, passwordField];
}

function helperLinksForMode(mode: AccountAuthMode): AccountAuthHelperLinkView[] {
  if (mode === "login") {
    return [{ href: "/account/forgot-password", label: "忘记密码" }];
  }

  if (mode === "forgot") {
    return [{ href: "/account/login", label: "返回登录" }];
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

function normalizedNext(next: string | undefined): string {
  if (!next?.trim().startsWith("/")) {
    return defaultNext;
  }

  return next.trim();
}

export function accountAuthToView(
  mode: AccountAuthMode,
  options: AccountAuthOptions = {}
): AccountAuthView {
  const forgotStep = options.forgotStep ?? 1;
  const googleEnabled = options.googleEnabled === true;

  return {
    ...modeCopy[mode],
    boundary,
    defaultNext,
    fields: fieldsForMode(mode, forgotStep),
    helperLinks: helperLinksForMode(mode),
    mode,
    oauthActions: oauthActionsForMode(mode, googleEnabled)
  };
}

export function nextHrefForAccountAuthSubmit({
  email,
  forgotStep = 1,
  mode,
  next
}: {
  email: string;
  forgotStep?: 1 | 2;
  mode: AccountAuthMode;
  next?: string;
}): AccountAuthSubmitResult {
  const safeNext = normalizedNext(next);

  if (mode === "signup") {
    return `/account/login?created=1&email=${encodeURIComponent(
      email.trim()
    )}&next=${encodeURIComponent(safeNext)}`;
  }

  if (mode === "forgot") {
    if (forgotStep === 1) {
      return "forgot-step-2";
    }

    return `/account/login?next=${encodeURIComponent(safeNext)}`;
  }

  return safeNext;
}
