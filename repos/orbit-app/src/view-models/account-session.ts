import { mobileUserDisplayName } from "./mobile-profile";
import { createTranslator, type OrbitTranslator } from "../i18n/messages";

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
  t?: OrbitTranslator;
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

function statusLabel(status: string, t: OrbitTranslator): string {
  if (status === "signed-in") {
    return t("account.signedIn");
  }

  if (status === "pending") {
    return t("account.pending");
  }

  return t("account.signedOut");
}

function authActions(status: string, t: OrbitTranslator): AccountSessionView["authActions"] {
  if (status === "signed-in") {
    return [];
  }

  return [
    {
      href: "/account/login",
      label: t("auth.loginPrimary")
    },
    {
      href: "/account/signup",
      label: t("auth.signupPrimary")
    }
  ];
}

function timezoneLabel(value: string, t: OrbitTranslator): string {
  if (value === "Asia/Tokyo" || value === "Tokyo") {
    return t("account.tokyoTime");
  }

  return value.trim() || t("account.notProvided");
}

function planLabel(value: string, t: OrbitTranslator): string {
  if (value === "mock-pro" || value === "live-relationship-os") {
    return t("account.relationshipWorkspace");
  }

  return value.trim() || t("account.planUnset");
}

function roleLabel(value: string, t: OrbitTranslator): string {
  if (value === "founder-operator" || value === "operator") {
    return value === "founder-operator" ? t("account.founder") : t("account.operator");
  }

  return value.trim() || t("account.notProvided");
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
  const t = options.t ?? createTranslator("zh");
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
      authActions: authActions(status, t),
      displayName: t("account.guestName"),
      emptyMessage: t("account.guestEmpty"),
      emptyTitle: t("account.guestTitle"),
      goal: "",
      nextAction: t("account.guestNext"),
      planLabel: "",
      roleLabel: "",
      statusLabel: statusLabel(status, t),
      summary: t("account.guestSummary"),
      timezoneLabel: "",
      title: t("account.title"),
      workspaceName: ""
    };
  }

  return {
    displayName:
      mobileUserDisplayName(
        options.authUser,
        stringField(user, "displayName") ||
          stringField(account, "displayName")
      ) || t("account.nameMissing"),
    emptyMessage: t("account.unavailable"),
    emptyTitle: t("account.unavailable"),
    goal: stringField(profile, "relationshipGoal", t("account.goalMissing")),
    authActions: authActions(status, t),
    nextAction: t("account.profileNext"),
    planLabel: planLabel(stringField(account, "plan"), t),
    roleLabel: roleLabel(stringField(account, "role"), t),
    statusLabel: statusLabel(status, t),
    summary: t("account.summary"),
    timezoneLabel: timezoneLabel(
      stringField(user, "timezone") || stringField(profile, "homeMarket")
    , t),
    title: t("account.title"),
    workspaceName:
      stringField(account, "workspaceName") || t("account.workspaceMissing")
  };
}
