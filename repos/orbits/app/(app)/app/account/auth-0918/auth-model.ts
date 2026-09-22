/**
 * 认证四态弹窗（Orbit_0918）纯模型：视图类型、本地校验、按钮文案表、路由路径。
 * 来源：docs/designs/Orbit_0918/Orbit 首页.dc.html renderVals 494–533
 * （496 `validEmail` 正则；517–520 按钮文案；526–529 校验文案）。
 * 文案以 {zh,en} 对象返回，由屏内 `useOrbitLanguage().t()` 取值；zh 值 = 设计逐字。
 */

export type AuthView = "login" | "register" | "forgot" | "reset";

export interface AuthCopy {
  en: string;
  ja?: string;
  zh: string;
}

/** 设计 496：`/^[^@\s]+@[^@\s]+\.[^@\s]+$/`。 */
const DESIGN_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const AUTH_ERROR_COPY = {
  /** 设计 527：注册 409。 */
  emailTaken: { en: "This email is already registered. Please sign in instead.", zh: "该邮箱已注册，请直接登录。" },
  /** 设计 526：邮箱格式。 */
  invalidEmail: { en: "Please enter a valid email address.", zh: "请输入有效的邮箱地址。" },
  /** 设计 526：登录失败。 */
  loginFailed: { en: "Email or password is incorrect. Please try again.", zh: "邮箱或密码不正确，请重试。" },
  /** 设计 529：两次不一致。 */
  passwordMismatch: { en: "The two passwords do not match.", zh: "两次输入的密码不一致。" },
  /** 设计 526：密码 8 位。 */
  passwordTooShort: { en: "Password must be at least 8 characters.", zh: "密码至少 8 位。" },
  /** 设计 529：重置失败回退。 */
  resetFailed: { en: "Reset failed. Please try again later.", zh: "重置失败，请稍后重试。" },
  /** 设计 529：新密码 8 位。 */
  resetTooShort: { en: "New password must be at least 8 characters.", zh: "新密码至少 8 位。" },
} as const satisfies Record<string, AuthCopy>;

export const AUTH_PASSWORD_MIN_LENGTH = 8;

export function validateEmail(value: string): AuthCopy | null {
  return DESIGN_EMAIL_PATTERN.test(value) ? null : AUTH_ERROR_COPY.invalidEmail;
}

export function validatePassword(value: string): AuthCopy | null {
  return value.length < AUTH_PASSWORD_MIN_LENGTH ? AUTH_ERROR_COPY.passwordTooShort : null;
}

/** 设计 529：先长度、后一致性。 */
export function validateResetPair(password: string, confirmation: string): AuthCopy | null {
  if (password.length < AUTH_PASSWORD_MIN_LENGTH) return AUTH_ERROR_COPY.resetTooShort;
  if (password !== confirmation) return AUTH_ERROR_COPY.passwordMismatch;
  return null;
}

export interface AuthButtonLabels {
  idle: AuthCopy;
  loading: AuthCopy;
  /** 设计只给 登录 / 注册 成功态文案（517–518）；找回 / 新密码 成功后隐藏按钮。 */
  success?: AuthCopy;
}

/** 设计 517–520。 */
export const AUTH_BUTTON_LABELS: Record<AuthView, AuthButtonLabels> = {
  forgot: {
    idle: { en: "Request reset link", zh: "申请重置链接" },
    loading: { en: "Sending…", zh: "发送中…" },
  },
  login: {
    idle: { en: "Sign in", zh: "登录" },
    loading: { en: "Signing in…", zh: "登录中…" },
    success: { en: "✓ Signed in", zh: "✓ 已登录" },
  },
  register: {
    idle: { en: "Create account", zh: "创建账号" },
    loading: { en: "Creating…", zh: "创建中…" },
    success: { en: "✓ Account created", zh: "✓ 账号已创建" },
  },
  reset: {
    idle: { en: "Set new password", zh: "设置新密码" },
    loading: { en: "Saving…", zh: "保存中…" },
  },
};

/** 设计 `<a href="#" onClick=goX>` 在应用里都是真实导航：四态 = 既有四条路由（计划：路由保留）。 */
const AUTH_ROUTE_SEGMENT: Record<AuthView, string> = {
  forgot: "forgot-password",
  login: "login",
  register: "signup",
  reset: "reset-password",
};

export function authRoutePath(view: AuthView, next: string): string {
  const base = `/app/account/${AUTH_ROUTE_SEGMENT[view]}`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

/** 各视图 `<h2>` 的 id（审阅修订 12：`aria-labelledby` 指向视图标题）。 */
export function authTitleId(view: AuthView): string {
  return `au-title-${view}`;
}

/**
 * 任务 2 过渡桥（记录）：`use-account-auth.ts` 原样保留旧文案（「邮箱或密码不正确。」/
 * 「该邮箱已注册,请直接登录。」，特征化测试锁定），设计要求 526–527 文案。屏内把这两条
 * 已知的 hook 文案换成设计文案；服务端 `error.message` 与其他文案原样透传。Task 3 删旧后
 * 可把 hook 文案对齐设计并移除本桥。
 */
const LEGACY_ERROR_BRIDGE: ReadonlyArray<{ from: AuthCopy; to: AuthCopy }> = [
  { from: { en: "Email or password is incorrect.", zh: "邮箱或密码不正确。" }, to: AUTH_ERROR_COPY.loginFailed },
  { from: { en: "An account with this email already exists.", zh: "该邮箱已注册,请直接登录。" }, to: AUTH_ERROR_COPY.emailTaken },
];

export function bridgeLegacyAuthError(error: string, t: (copy: AuthCopy) => string): string {
  if (!error) return error;
  for (const entry of LEGACY_ERROR_BRIDGE) if (t(entry.from) === error) return t(entry.to);
  return error;
}
