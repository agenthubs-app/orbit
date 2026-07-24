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
}

type UnknownRecord = Record<string, unknown>;

const founderAccountView = {
  authActions: [],
  displayName: "小雨",
  goal:
    "用 Orbit 找到能互相帮忙的人：AI 落地客户、合作伙伴、日本本地资源和靠谱引荐。",
  nextAction: "回到个人资料，把能提供的资源写得更具体。",
  planLabel: "人脉交换工作区",
  roleLabel: "创始人",
  summary: "这里决定别人看到你是谁，以及这个工作区要优先连接什么资源。",
  timezoneLabel: "东京时间",
  workspaceName: "Orbit"
};

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

function containsImplementationLabel(value: string): boolean {
  return /\b(mock|fixture|provider|generated|source-backed|source:|evidence:|demo workspace|demo founder|command-center|implementation|deterministic)\b/iu.test(
    value
  );
}

function userFacingText(value: string, fallback: string): string {
  const text = value.trim();

  if (!text || containsImplementationLabel(text)) {
    return fallback;
  }

  return text;
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

  return userFacingText(value, founderAccountView.timezoneLabel);
}

function planLabel(value: string): string {
  if (value === "mock-pro" || value === "live-relationship-os") {
    return founderAccountView.planLabel;
  }

  return userFacingText(value, founderAccountView.planLabel);
}

function roleLabel(value: string): string {
  if (value === "founder-operator" || value === "operator") {
    return founderAccountView.roleLabel;
  }

  return userFacingText(value, founderAccountView.roleLabel);
}

function isKnownDemoAccount(
  account: UnknownRecord,
  user: UnknownRecord
): boolean {
  return (
    stringField(user, "id") === "profile_orbit_generated_operator" ||
    stringField(user, "displayName") === "小雨" ||
    stringField(user, "displayName") === "赵翔" ||
    stringField(user, "displayName") === "Xinyi Zhao" ||
    stringField(account, "displayName") === "Orbit Generated Relationship Workspace" ||
    stringField(account, "displayName") === "Ari Lane" ||
    stringField(account, "displayName") === "赵翔" ||
    stringField(account, "workspaceName") === "Orbit Founder Relationship OS" ||
    stringField(account, "displayName") === "Xinyi Zhao" ||
    stringField(user, "displayName") === "Ari Lane"
  );
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

  if (!isRecord(payload) || isKnownDemoAccount(account, user)) {
    return {
      ...founderAccountView,
      authActions: authActions(status),
      emptyMessage: "当前账号接口没有返回可展示的登录信息。",
      emptyTitle: "账号状态不可用",
      statusLabel: statusLabel(status),
      title: "账号与工作区"
    };
  }

  const goal = userFacingText(
    stringField(profile, "relationshipGoal"),
    founderAccountView.goal
  );
  const nextAction =
    status === "signed-in"
      ? userFacingText(stringField(payload, "nextAction"), founderAccountView.nextAction)
      : "先登录，再回到个人资料继续完善信息。";

  return {
    displayName: userFacingText(
      stringField(user, "displayName") || stringField(account, "displayName"),
      founderAccountView.displayName
    ),
    emptyMessage: "当前账号接口没有返回可展示的登录信息。",
    emptyTitle: "账号状态不可用",
    goal,
    authActions: authActions(status),
    nextAction,
    planLabel: planLabel(stringField(account, "plan")),
    roleLabel: roleLabel(stringField(account, "role")),
    statusLabel: statusLabel(status),
    summary: founderAccountView.summary,
    timezoneLabel: timezoneLabel(
      stringField(user, "timezone") || stringField(profile, "homeMarket")
    ),
    title: "账号与工作区",
    workspaceName: userFacingText(
      stringField(account, "workspaceName"),
      founderAccountView.workspaceName
    )
  };
}
