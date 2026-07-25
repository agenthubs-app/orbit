import { eventDetailToSummary } from "./events";
import { profileToSummary } from "./profile";

export interface RegisterInviteAction {
  href:
    | "/events"
    | "/profile"
    | `/account/login?next=${string}`
    | `/account/signup?next=${string}`
    | `/events/${string}/register`;
  label: string;
}

export interface RegisterInviteEventView {
  code: string;
  description: string;
  id: string;
  sourceLabel: string;
  startsAt: string;
  status: string;
  theme: string;
  title: string;
  venue: string;
}

export interface RegisterInviteProfileView {
  company: string;
  headline: string;
  name: string;
  offering: string[];
  role: string;
  seeking: string[];
  topics: string[];
}

export type RegisterInviteReadinessStatus =
  | "blocked"
  | "complete"
  | "needs_attention"
  | "next";

export interface RegisterInviteReadinessItem {
  detail: string;
  id: "account" | "profile" | "registration";
  status: RegisterInviteReadinessStatus;
  title: string;
}

export interface RegisterInviteReadinessView {
  completedCount: number;
  items: RegisterInviteReadinessItem[];
  summary: string;
  title: string;
}

export interface RegisterInviteView {
  actions: RegisterInviteAction[];
  event: RegisterInviteEventView;
  guardrail: string;
  profile: RegisterInviteProfileView;
  readiness: RegisterInviteReadinessView;
  summary: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactCode(value: string): string {
  const code = value.replace(/[^a-z0-9]+/giu, "").toUpperCase();
  return code || "EVENT";
}

function eventRecord(data: unknown): Record<string, unknown> | null {
  if (isRecord(data) && isRecord(data.event)) {
    return data.event;
  }

  return isRecord(data) ? data : null;
}

function sourceTheme(event: Record<string, unknown> | null): string {
  const sourceMetadata = event?.sourceMetadata;
  const captureMethod = isRecord(sourceMetadata)
    ? sourceMetadata.captureMethod
    : null;

  if (captureMethod === "signup_invite") {
    return "报名邀请";
  }

  if (captureMethod === "qr_scan") {
    return "扫码邀请";
  }

  if (typeof captureMethod === "string" && captureMethod.trim()) {
    return "活动邀请";
  }

  return "活动邀请";
}

function eventView(
  data: unknown,
  inviteCode?: string | null
): RegisterInviteEventView {
  const event = eventDetailToSummary(data);
  const rawEvent = eventRecord(data);
  const hasEvent = event.id && event.id !== "event";

  if (!hasEvent) {
    return {
      code: compactCode(inviteCode ?? ""),
      description: "打开活动后再补报名资料。",
      id: inviteCode?.trim() || "event",
      sourceLabel: "",
      startsAt: "时间待确认",
      status: "待确认",
      theme: "活动邀请",
      title: "活动待确认",
      venue: "地点待确认"
    };
  }

  return {
    code: compactCode(inviteCode || event.id),
    description: event.description || "打开活动后再补报名资料。",
    id: event.id,
    sourceLabel: event.sourceLabel,
    startsAt: event.startsAt,
    status: event.status,
    theme: sourceTheme(rawEvent),
    title: event.title,
    venue: event.location || "地点待确认"
  };
}

function profileView(data: unknown): RegisterInviteProfileView {
  const profile = profileToSummary(data);

  return {
    company: profile.organization,
    headline: profile.headline,
    name: profile.displayName,
    offering: profile.offering,
    role: profile.role,
    seeking: profile.seeking,
    topics: profile.topics
  };
}

function hasRegistrationTarget(event: RegisterInviteEventView): boolean {
  return Boolean(event.id && event.id !== "event");
}

function eventRegistrationPath(event: RegisterInviteEventView): `/events/${string}/register` {
  return `/events/${event.id}/register`;
}

function actionsFor(
  event: RegisterInviteEventView,
  authenticated = true
): RegisterInviteAction[] {
  if (!hasRegistrationTarget(event)) {
    return [
      { href: "/events", label: "查看活动列表" },
      { href: "/profile", label: "检查个人资料" }
    ];
  }

  const next = encodeURIComponent(eventRegistrationPath(event));

  if (authenticated === false) {
    return [
      { href: `/account/login?next=${next}`, label: "登录继续报名" },
      { href: `/account/signup?next=${next}`, label: "创建账号" },
      { href: "/profile", label: "检查个人资料" }
    ];
  }

  return [
    {
      href: eventRegistrationPath(event),
      label: "继续填写活动问题"
    },
    { href: "/profile", label: "检查个人资料" }
  ];
}

function guardrailFor(
  event: RegisterInviteEventView,
  authenticated?: boolean | null
): string {
  if (hasRegistrationTarget(event) && authenticated === false) {
    return "先登录或创建账号，再继续这场活动。";
  }

  return "这里先检查资料；提交报名在活动问题页完成。";
}

function profileIsReady(profile: RegisterInviteProfileView): boolean {
  return (
    Boolean(profile.name.trim()) &&
    Boolean(profile.company.trim()) &&
    Boolean(profile.role.trim()) &&
    profile.offering.length > 0 &&
    profile.seeking.length > 0 &&
    profile.topics.length > 0
  );
}

function readinessFor(input: {
  authenticated?: boolean | null | undefined;
  event: RegisterInviteEventView;
  profile: RegisterInviteProfileView;
}): RegisterInviteReadinessView {
  const accountReady = input.authenticated !== false;
  const profileReady = profileIsReady(input.profile);
  const registrationReady = hasRegistrationTarget(input.event);
  const items: RegisterInviteReadinessItem[] = [
    {
      detail: accountReady
        ? "账号已确认，可以继续填写活动问题。"
        : "先登录或创建账号。",
      id: "account",
      status: accountReady ? "complete" : "needs_attention",
      title: "账号"
    },
    {
      detail: profileReady
        ? "能提供、想寻找和话题都已补齐。"
        : "先补能提供、想寻找和话题。",
      id: "profile",
      status: profileReady ? "complete" : "needs_attention",
      title: "公开资料"
    },
    {
      detail: registrationReady
        ? "下一步进入这场活动的问题页。"
        : "先打开一场可报名活动。",
      id: "registration",
      status: registrationReady ? "next" : "blocked",
      title: "活动问题"
    }
  ];
  const completedCount = items.filter((item) => item.status !== "blocked" && item.status !== "needs_attention").length;

  return {
    completedCount,
    items,
    summary: `${completedCount} / ${items.length} 项可继续`,
    title: "报名准备"
  };
}

export function registerInviteToView(input: {
  authenticated?: boolean | null;
  eventPayload: unknown;
  inviteCode?: string | null;
  profilePayload: unknown;
}): RegisterInviteView {
  const event = eventView(input.eventPayload, input.inviteCode);
  const profile = profileView(input.profilePayload);

  return {
    actions: actionsFor(event, input.authenticated ?? true),
    event,
    guardrail: guardrailFor(event, input.authenticated),
    profile,
    readiness: readinessFor({
      authenticated: input.authenticated,
      event,
      profile
    }),
    summary: "先确认别人会看到的资料，再回答这场活动的问题。",
    title: "报名资料准备"
  };
}
