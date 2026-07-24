import { eventDetailToSummary } from "./events";
import { profileToSummary } from "./profile";

export interface RegisterInviteAction {
  href: "/events" | "/profile" | `/events/${string}/register`;
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

export interface RegisterInviteView {
  actions: RegisterInviteAction[];
  event: RegisterInviteEventView;
  guardrail: string;
  profile: RegisterInviteProfileView;
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

function actionsFor(event: RegisterInviteEventView): RegisterInviteAction[] {
  if (!event.id || event.id === "event") {
    return [
      { href: "/events", label: "查看活动列表" },
      { href: "/profile", label: "检查个人资料" }
    ];
  }

  return [
    {
      href: `/events/${event.id}/register`,
      label: "继续填写活动问题"
    },
    { href: "/profile", label: "检查个人资料" }
  ];
}

export function registerInviteToView(input: {
  eventPayload: unknown;
  inviteCode?: string | null;
  profilePayload: unknown;
}): RegisterInviteView {
  const event = eventView(input.eventPayload, input.inviteCode);

  return {
    actions: actionsFor(event),
    event,
    guardrail: "这里只准备资料，不会创建账号、写入报名或发送消息。",
    profile: profileView(input.profilePayload),
    summary: "先确认别人会看到的资料，再回答这场活动的问题。",
    title: "报名资料准备"
  };
}
