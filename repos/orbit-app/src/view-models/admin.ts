import { eventsToSummaries, type EventSummary } from "./events";

export type AdminSurface = "access" | "dashboard" | "events";
export type AdminEventState = "active" | "ended" | "upcoming";

export interface AdminLoginView {
  boundary: string;
  primaryHref: "/admin" | "/account/login?next=%2Fadmin";
  primaryLabel: string;
  summary: string;
  title: string;
}

export interface AdminStatView {
  id: string;
  label: string;
  note: string;
  value: string;
}

export interface AdminEventView {
  coverPath?: string;
  detail: string;
  href: `/events/${string}`;
  id: string;
  location: string;
  state: AdminEventState;
  stateLabel: string;
  startsAt: string;
  title: string;
}

export interface AdminMemberView {
  email: string;
  id: string;
  initial: string;
  name: string;
  role: string;
}

export interface AdminView {
  activeTab: AdminSurface;
  boundary: string;
  emptyEventMessage: string;
  emptyEventTitle: string;
  events: AdminEventView[];
  members: AdminMemberView[];
  nav: {
    href: "/admin" | "/admin/access" | "/admin/events";
    id: AdminSurface;
    label: string;
  }[];
  org: {
    initial: string;
    name: string;
    owner: string;
  };
  stats: AdminStatView[];
  summary: string;
  title: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedRecord(record: UnknownRecord, fieldName: string): UnknownRecord {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function stringField(record: UnknownRecord, fieldName: string, fallback = "") {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberField(record: UnknownRecord, fieldName: string, fallback = 0) {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function listFromPayload(data: unknown): UnknownRecord[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }

  if (!isRecord(data)) {
    return [];
  }

  const events = data.events;
  return Array.isArray(events) ? events.filter(isRecord) : [];
}

function containsImplementationLabel(value: string): boolean {
  return /\b(mock|fixture|provider|source-backed|storage-backed|generated|live-record|live-store|source:|evidence:|implementation|command-center|database|postgres|hybrid)\b/iu.test(
    value
  );
}

function segmentLooksChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/u.test(value) && !/[\u3040-\u30ff]/u.test(value);
}

function preferredChineseSegment(value: string): string {
  const markerMatch = /ZH:\s*([^/]+?)(?:\s+EN:|\s+JA:|$)/u.exec(value);
  if (markerMatch?.[1]?.trim()) {
    return markerMatch[1].trim();
  }

  const segments = value
    .split(/\s*\/\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.find(segmentLooksChinese) ?? value.trim();
}

function cleanText(value: string, fallback: string): string {
  const text = preferredChineseSegment(value);
  return text && !containsImplementationLabel(text) ? text : fallback;
}

function hasMixedLanguageTitle(value: string): boolean {
  return /[\u3040-\u30ff]/u.test(value) || /\s\/\s*[A-Za-z]/u.test(value);
}

function eventTitle(event: UnknownRecord): string {
  const rawTitle = stringField(event, "title") || stringField(event, "name");
  const title = cleanText(rawTitle, "");
  const source = nestedRecord(event, "sourceMetadata");
  const sourceLabel = cleanText(stringField(source, "label"), "");

  if (sourceLabel && rawTitle && hasMixedLanguageTitle(rawTitle)) {
    return sourceLabel;
  }

  return title || sourceLabel || "未命名活动";
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventState(event: UnknownRecord, now: number): AdminEventState {
  const rawStatus = stringField(event, "status").toLowerCase();
  const startsAt = timestamp(stringField(event, "startsAt"));
  const endsAt = timestamp(stringField(event, "endsAt"));

  if (rawStatus === "cancelled" || rawStatus === "canceled" || rawStatus === "ended") {
    return "ended";
  }

  if (endsAt !== null && endsAt < now) {
    return "ended";
  }

  if (
    startsAt !== null &&
    endsAt !== null &&
    startsAt <= now &&
    now <= endsAt
  ) {
    return "active";
  }

  return "upcoming";
}

function stateLabel(state: AdminEventState): string {
  if (state === "active") {
    return "进行中";
  }

  if (state === "ended") {
    return "已结束";
  }

  return "即将开始";
}

const enWeekdayToZh: Record<string, string> = {
  Fri: "周五",
  Mon: "周一",
  Sat: "周六",
  Sun: "周日",
  Thu: "周四",
  Tue: "周二",
  Wed: "周三"
};

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return value || "时间待定";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
    weekday: "short"
  }).formatToParts(new Date(parsed));
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const time = [partValue("hour"), partValue("minute")]
    .filter(Boolean)
    .join(":");

  return `${partValue("month")}月${partValue("day")}日 ${
    enWeekdayToZh[partValue("weekday")] ?? ""
  } ${time}`.trim();
}

function eventLocation(event: UnknownRecord): string {
  return cleanText(
    stringField(event, "venue") ||
      stringField(event, "location") ||
      stringField(event, "locationLabel"),
    "地点待定"
  );
}

function eventDetail(event: UnknownRecord): string {
  return cleanText(
    stringField(event, "relationshipValue") ||
      stringField(event, "nextAction") ||
      stringField(event, "description") ||
      stringField(event, "summary"),
    "确认报名、签到、匹配和现场承接安排。"
  );
}

function eventToView(
  event: UnknownRecord,
  now: number,
  summary?: EventSummary
): AdminEventView {
  const id = stringField(event, "id", "event");
  const state = eventState(event, now);

  return {
    ...(summary?.coverPath ? { coverPath: summary.coverPath } : {}),
    detail: eventDetail(event),
    href: `/events/${encodeURIComponent(id)}`,
    id,
    location: eventLocation(event),
    state,
    stateLabel: stateLabel(state),
    startsAt: formatDateTime(stringField(event, "startsAt")),
    title: eventTitle(event)
  };
}

function profileRecord(data: unknown): UnknownRecord {
  if (!isRecord(data)) {
    return {};
  }

  const profile = data.profile;
  return isRecord(profile) ? profile : data;
}

function relationshipAssetCount(dashboard: unknown): number {
  if (!isRecord(dashboard)) {
    return 0;
  }

  const totals = nestedRecord(dashboard, "relationshipAssetTotals");
  return numberField(totals, "contacts");
}

function titleForSurface(surface: AdminSurface): string {
  if (surface === "events") {
    return "活动管理";
  }

  if (surface === "access") {
    return "访问管理";
  }

  return "主办方后台";
}

export function adminLoginToView({
  signedIn = false
}: {
  signedIn?: boolean;
} = {}): AdminLoginView {
  return {
    boundary:
      "移动端没有独立管理员邮件登录，也不会修改管理员权限；后台数据访问由服务端按当前账号决定。",
    primaryHref: signedIn ? "/admin" : "/account/login?next=%2Fadmin",
    primaryLabel: signedIn ? "打开只读后台" : "登录后检查访问权限",
    summary: signedIn
      ? "使用当前已登录账号打开只读后台，核对该账号能够访问的活动和资料。"
      : "请先登录个人账号；登录完成后，服务端会检查该账号可访问的后台数据。",
    title: "后台入口"
  };
}

export function adminToView({
  dashboard,
  events,
  now = new Date(),
  profile,
  surface = "dashboard"
}: {
  dashboard?: unknown;
  events: unknown;
  now?: Date;
  profile?: unknown;
  surface?: AdminSurface;
}): AdminView {
  const rawEvents = listFromPayload(events);
  const nowTime = now.getTime();
  const summaryById = new Map(
    eventsToSummaries(events).map((event) => [event.id, event])
  );
  const eventViews = rawEvents.map((event) =>
    eventToView(
      event,
      nowTime,
      summaryById.get(stringField(event, "id", "event"))
    )
  );
  const profileView = profileRecord(profile);
  const orgName = cleanText(
    stringField(profileView, "company") ||
      stringField(profileView, "organization"),
    "Orbit"
  );
  const owner = cleanText(
    stringField(profileView, "fullName") || stringField(profileView, "name"),
    "后台负责人"
  );
  const role = cleanText(stringField(profileView, "title"), "管理员");
  const ownerEmail = stringField(profileView, "email");
  const activeCount = eventViews.filter((event) => event.state === "active").length;
  const upcomingCount = eventViews.filter((event) => event.state === "upcoming").length;

  return {
    activeTab: surface,
    boundary:
      "移动端只读后台数据；新建活动、运行匹配、邀请成员和权限修改仍需正式管理接口。",
    emptyEventMessage: "活动导入或创建后，这里会显示报名、签到和匹配状态。",
    emptyEventTitle: "暂无活动记录",
    events: eventViews,
    members: ownerEmail
      ? [
          {
            email: ownerEmail,
            id: "workspace-owner",
            initial: owner.trim().slice(0, 1).toUpperCase() || "O",
            name: owner,
            role
          }
        ]
      : [],
    nav: [
      {
        href: "/admin",
        id: "dashboard",
        label: "仪表盘"
      },
      {
        href: "/admin/events",
        id: "events",
        label: "活动管理"
      },
      {
        href: "/admin/access",
        id: "access",
        label: "访问管理"
      }
    ],
    org: {
      initial: orgName.trim().slice(0, 1).toUpperCase() || "O",
      name: orgName,
      owner
    },
    stats: [
      {
        id: "events",
        label: "活动记录",
        note: "全部活动",
        value: String(eventViews.length)
      },
      {
        id: "active",
        label: "进行中",
        note: "现场状态",
        value: String(activeCount)
      },
      {
        id: "upcoming",
        label: "即将开始",
        note: "待准备",
        value: String(upcomingCount)
      },
      {
        id: "relationships",
        label: "关系资产",
        note: "人脉覆盖",
        value: String(relationshipAssetCount(dashboard))
      }
    ],
    summary:
      eventViews.length > 0
        ? `当前有 ${eventViews.length} 场活动记录，先看报名、签到和匹配准备是否清楚。`
        : "当前没有活动记录，先确认主办方资料和访问权限。",
    title: titleForSurface(surface)
  };
}
