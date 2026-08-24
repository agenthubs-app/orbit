export type EventCenterRole =
  | "owner"
  | "operations"
  | "check_in"
  | "reviewer"
  | "read_only_analyst";

export type EventCenterActionKey =
  | "operations"
  | "admission"
  | "check_in"
  | "analytics"
  | "view"
  | "roles";

export type EventCenterPhase = "upcoming" | "live" | "ended";

interface EventCenterItem {
  endsAt: string | null;
  eventId: string;
  lifecycleState: string;
  migrationPending: boolean;
  owner: boolean;
  revision: number;
  role: EventCenterRole;
  startsAt: string | null;
  title: string | null;
  venue: string | null;
}

export interface EventCenterItemView {
  availableActionKeys: EventCenterActionKey[];
  id: string;
  lifecycleLabel: string;
  migrationPending: boolean;
  nextTask: {
    detail: string;
    label: string;
  };
  phase: EventCenterPhase;
  restriction: string | null;
  roleDetail: string;
  roleLabel: string;
  scheduleLabel: string;
  title: string;
  venueLabel: string;
}

const roles = [
  "owner",
  "operations",
  "check_in",
  "reviewer",
  "read_only_analyst"
] as const satisfies readonly EventCenterRole[];

const roleCopy: Record<EventCenterRole, { detail: string; label: string }> = {
  owner: {
    detail: "负责活动配置、现场运营与成员权限。",
    label: "活动负责人"
  },
  operations: {
    detail: "可配置运营并执行现场流程。",
    label: "运营"
  },
  check_in: {
    detail: "可打开签到名单并记录到场。",
    label: "签到"
  },
  reviewer: {
    detail: "可审阅报名并做出准入决定。",
    label: "审核"
  },
  read_only_analyst: {
    detail: "可查看汇总分析，不包含个人名单。",
    label: "只读分析"
  }
};

const lifecycleLabels: Record<string, string> = {
  archived: "已归档",
  cancelled: "已取消",
  draft: "草稿",
  legacy_active: "运营中",
  legacy_archived: "已归档",
  published: "已发布"
};

const actionCopy: Record<
  EventCenterActionKey,
  { detail: string; label: string }
> = {
  admission: {
    detail: "活动开始前，先处理报名与准入。",
    label: "报名审核"
  },
  analytics: {
    detail: "活动结束后，查看到场与运营结果。",
    label: "查看活动分析"
  },
  check_in: {
    detail: "活动进行中，优先处理来宾签到。",
    label: "签到台"
  },
  operations: {
    detail: "检查活动配置并安排现场流程。",
    label: "打开运营台"
  },
  roles: {
    detail: "配置本场活动的运营成员与权限。",
    label: "管理角色"
  },
  view: {
    detail: "查看活动信息与当前状态。",
    label: "查看活动"
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isEventCenterRole(value: unknown): value is EventCenterRole {
  return typeof value === "string" && roles.includes(value as EventCenterRole);
}

function parseEventCenterItem(value: unknown): EventCenterItem | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.eventId !== "string" ||
    value.eventId.trim().length === 0 ||
    typeof value.lifecycleState !== "string" ||
    typeof value.migrationPending !== "boolean" ||
    typeof value.owner !== "boolean" ||
    typeof value.revision !== "number" ||
    !isEventCenterRole(value.role) ||
    !isNullableString(value.startsAt) ||
    !isNullableString(value.endsAt) ||
    !isNullableString(value.title) ||
    !isNullableString(value.venue)
  ) {
    return null;
  }

  return {
    endsAt: value.endsAt,
    eventId: value.eventId,
    lifecycleState: value.lifecycleState,
    migrationPending: value.migrationPending,
    owner: value.owner,
    revision: value.revision,
    role: value.role,
    startsAt: value.startsAt,
    title: value.title,
    venue: value.venue
  };
}

function eventPhase(item: EventCenterItem, now: Date): EventCenterPhase {
  const nowMs = now.getTime();
  const startsAtMs = Date.parse(item.startsAt ?? "");
  const endsAtMs = Date.parse(item.endsAt ?? "");

  if (Number.isFinite(startsAtMs) && nowMs < startsAtMs) {
    return "upcoming";
  }

  if (Number.isFinite(endsAtMs) && nowMs > endsAtMs) {
    return "ended";
  }

  return "live";
}

function onsiteAvailable(item: EventCenterItem): boolean {
  return !item.migrationPending && item.lifecycleState === "published";
}

function analyticsAvailable(item: EventCenterItem): boolean {
  return (
    !item.migrationPending &&
    (item.lifecycleState === "published" || item.lifecycleState === "archived")
  );
}

function actionKeysFor(item: EventCenterItem): EventCenterActionKey[] {
  if (item.migrationPending) {
    return [];
  }

  const onsite = onsiteAvailable(item);
  const actions: EventCenterActionKey[] = [];

  if (onsite && (item.owner || item.role === "operations")) {
    actions.push("operations");
  }
  if (onsite && (item.owner || item.role === "reviewer")) {
    actions.push("admission");
  }
  if (
    onsite &&
    (item.owner || item.role === "operations" || item.role === "check_in")
  ) {
    actions.push("check_in");
  }
  if (
    analyticsAvailable(item) &&
    (item.owner ||
      item.role === "operations" ||
      item.role === "read_only_analyst")
  ) {
    actions.push("analytics");
  }

  actions.push("view");

  if (item.owner) {
    actions.push("roles");
  }

  return actions;
}

function preferredAction(
  actions: EventCenterActionKey[],
  phase: EventCenterPhase
): EventCenterActionKey | null {
  const phaseAction: Record<EventCenterPhase, EventCenterActionKey> = {
    ended: "analytics",
    live: "check_in",
    upcoming: "admission"
  };
  const preferred = phaseAction[phase];

  if (actions.includes(preferred)) {
    return preferred;
  }

  if (actions.includes("operations")) {
    return "operations";
  }

  return actions[0] ?? null;
}

function orderedActions(
  actions: EventCenterActionKey[],
  primary: EventCenterActionKey | null
): EventCenterActionKey[] {
  if (!primary) {
    return actions;
  }

  return [primary, ...actions.filter((action) => action !== primary)];
}

function formatDate(value: string | null): string {
  if (!value) {
    return "时间待配置";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Tokyo"
  }).format(date);
}

function lifecycleRestriction(item: EventCenterItem): string | null {
  if (item.migrationPending) {
    return "该活动资料尚未完成迁移，运营、签到、分析与角色管理暂不可用。";
  }
  if (item.lifecycleState === "draft") {
    return "活动发布前不开放运营、签到与报名审核。";
  }
  if (item.lifecycleState === "cancelled") {
    return "活动已取消，运营、签到与报名审核均已关闭。";
  }
  if (item.lifecycleState === "archived") {
    return "活动已归档，现场运营、签到与报名审核已关闭。";
  }
  if (item.lifecycleState !== "published") {
    return "当前状态不开放运营、签到与报名审核。";
  }

  return null;
}

function itemToView(item: EventCenterItem, now: Date): EventCenterItemView {
  const phase = eventPhase(item, now);
  const actions = actionKeysFor(item);
  const primary = preferredAction(actions, phase);
  const role = roleCopy[item.role];
  const nextTask = primary
    ? actionCopy[primary]
    : {
        detail: "资料确认后再继续活动运营。",
        label: "等待资料迁移"
      };

  return {
    availableActionKeys: orderedActions(actions, primary),
    id: item.eventId,
    lifecycleLabel: item.migrationPending
      ? "主数据待迁移"
      : (lifecycleLabels[item.lifecycleState] ?? "状态待确认"),
    migrationPending: item.migrationPending,
    nextTask,
    phase,
    restriction: lifecycleRestriction(item),
    roleDetail: role.detail,
    roleLabel: item.migrationPending ? "迁移待确认" : role.label,
    scheduleLabel: `${formatDate(item.startsAt)} - ${formatDate(item.endsAt)}`,
    title: item.migrationPending
      ? "活动资料待迁移"
      : item.title?.trim() || "未命名活动",
    venueLabel: item.venue?.trim() || "地点待配置"
  };
}

export function eventCenterToView(
  payload: unknown,
  now = new Date()
): EventCenterItemView[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.flatMap((value) => {
    const item = parseEventCenterItem(value);
    return item ? [itemToView(item, now)] : [];
  });
}
