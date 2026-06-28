export type OrbitAccountAuthMode = "login" | "signup" | "forgot";

export interface OrbitAccountAuthViewModel {
  busyLabel: string;
  defaultNext: string;
  description: string;
  mode: OrbitAccountAuthMode;
  primaryLabel: string;
  switchLabel: string;
  title: string;
}

const accountAuthCopy: Record<OrbitAccountAuthMode, Omit<OrbitAccountAuthViewModel, "defaultNext" | "mode">> = {
  login: {
    busyLabel: "处理中...",
    description: "登录后进入你的活动和通用商务画像。",
    primaryLabel: "登录",
    switchLabel: "还没有账号，创建账号",
    title: "欢迎回来",
  },
  signup: {
    busyLabel: "创建中...",
    description: "用真实邮箱创建个人账号，系统会按邮箱关联你已经报名过的活动资料。",
    primaryLabel: "创建账号",
    switchLabel: "已有账号，去登录",
    title: "创建你的 Orbit 账号",
  },
  forgot: {
    busyLabel: "处理中...",
    description: "输入注册邮箱，我们会发送验证码用于重置密码。",
    primaryLabel: "发送验证码",
    switchLabel: "返回登录",
    title: "重置密码",
  },
};

export function getOrbitAccountAuthViewModel(mode: OrbitAccountAuthMode): OrbitAccountAuthViewModel {
  return {
    ...accountAuthCopy[mode],
    defaultNext: "/home",
    mode,
  };
}
