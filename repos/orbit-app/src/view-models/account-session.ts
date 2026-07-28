export interface AccountSessionView {
  authActions: {
    href: "/account/login" | "/account/signup";
    label: string;
  }[];
  displayName: string;
  emptyMessage: string;
  emptyTitle: string;
  goal: string;
  nextAction: string;
  planLabel: string;
  roleLabel: string;
  statusLabel: string;
  summary: string;
  timezoneLabel: string;
  title: string;
  workspaceName: string;
}

export interface AccountSessionOptions {
  authenticated?: boolean | null;
  authUser?: {
    email: string;
    id: string;
    name: string;
  } | null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: UnknownRecord,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nestedRecord(record: UnknownRecord, fieldName: string): UnknownRecord {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function statusLabel(status: string): string {
  if (status === "signed-in") {
    return "已登录";
  }

  if (status === "pending") {
    return "等待确认";
  }

  return "未登录";
}

function authActions(status: string): AccountSessionView["authActions"] {
  if (status === "signed-in") {
    return [];
  }

  return [
    {
      href: "/account/login",
      label: "登录"
    },
    {
      href: "/account/signup",
      label: "创建账号"
    }
  ];
}

function timezoneLabel(value: string): string {
  if (value === "Asia/Tokyo" || value === "Tokyo") {
    return "东京时间";
  }

  return value.trim() || "未填写";
}

function planLabel(value: string): string {
  if (value === "mock-pro" || value === "live-relationship-os") {
    return "人脉交换工作区";
  }

  return value.trim() || "未设置方案";
}

function roleLabel(value: string): string {
  if (value === "founder-operator" || value === "operator") {
    return value === "founder-operator" ? "创始人" : "运营者";
  }

  return value.trim() || "未填写";
}

function effectiveStatus(
  status: string,
  options: AccountSessionOptions
): string {
  if (options.authenticated === true) {
    return "signed-in";
  }

  if (options.authenticated === false) {
    return "signed-out";
  }

  return status;
}

export function accountSessionToView(
  data: unknown,
  options: AccountSessionOptions = {}
): AccountSessionView {
  const payload = isRecord(data) ? data : {};
  const account = nestedRecord(payload, "account");
  const user = nestedRecord(payload, "user");
  const profile = nestedRecord(payload, "profile");
  const session = nestedRecord(payload, "session");
  const status = effectiveStatus(
    stringField(session, "status", "signed-out"),
    options
  );

  if (status !== "signed-in") {
    return {
      authActions: authActions(status),
      displayName: "账号",
      emptyMessage: "登录后才会显示你的身份、工作区和关系目标。",
      emptyTitle: "尚未登录",
      goal: "",
      nextAction: "登录后可以继续完善个人资料。",
      planLabel: "",
      roleLabel: "",
      statusLabel: statusLabel(status),
      summary: "当前设备没有已验证身份，Orbit 不会展示任何人的账号资料。",
      timezoneLabel: "",
      title: "账号与工作区",
      workspaceName: ""
    };
  }

  return {
    displayName:
      options.authUser?.name.trim() ||
      stringField(user, "displayName") ||
      stringField(account, "displayName") ||
      "未填写姓名",
    emptyMessage: "当前账号接口没有返回可展示的登录信息。",
    emptyTitle: "账号状态不可用",
    goal: stringField(profile, "relationshipGoal", "尚未填写关系目标。"),
    authActions: authActions(status),
    nextAction: "回到个人资料，补全希望别人看到的信息。",
    planLabel: planLabel(stringField(account, "plan")),
    roleLabel: roleLabel(stringField(account, "role")),
    statusLabel: statusLabel(status),
    summary: "查看当前登录身份、工作区和关系目标。",
    timezoneLabel: timezoneLabel(
      stringField(user, "timezone") || stringField(profile, "homeMarket")
    ),
    title: "账号与工作区",
    workspaceName:
      stringField(account, "workspaceName") || "未设置工作区"
  };
}
