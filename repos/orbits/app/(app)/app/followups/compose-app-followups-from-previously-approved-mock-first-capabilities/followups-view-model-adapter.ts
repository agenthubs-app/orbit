import type { AppFollowupsRouteViewModel } from "./followups-route-view-model";
import type {
  OrbitScheduleConnectionView,
  OrbitScheduleItemView,
  OrbitScheduleViewModel,
} from "../../orbit-schedule-route-view-model";
import { ORBIT_DISPLAY_TIME_ZONE } from "../../orbit-datetime";

type AppFollowupsSuccessRouteViewModel = Extract<
  AppFollowupsRouteViewModel,
  { state: "success" }
>;

function todayParts() {
  const today = new Date();

  return {
    d: today.getDate(),
    m: today.getMonth(),
    y: today.getFullYear(),
  };
}

function connectionIdFor(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `contact:${slug || "orbit"}`;
}

function splitRelationship(value: string): { company: string; name: string } {
  const [name = "Orbit contact", company = "Relationship workspace"] = value
    .split(" · ")
    .map((item) => item.trim())
    .filter(Boolean);

  return { company, name };
}

function initialFor(value: string): string {
  return value.trim().slice(0, 1).toUpperCase() || "O";
}

function dateForDue(value: string, index: number): string {
  const date = new Date();
  const lower = value.toLowerCase();
  const inDays = lower.match(/\bin\s+(\d+)\s+days?\b/);

  if (lower.includes("tomorrow")) {
    date.setDate(date.getDate() + 1);
  } else if (inDays) {
    date.setDate(date.getDate() + Number(inDays[1]));
  } else if (!lower.includes("today")) {
    date.setDate(date.getDate() + index);
  }

  return date.toISOString().slice(0, 10);
}

function dateForCard(card: { due: string; dueAt?: string }, index: number): string {
  const dueParts = dateTimePartsFor(card.dueAt);
  if (dueParts) return dueParts.date;

  return dateForDue(card.due, index);
}

function timeForIndex(index: number): string {
  return `${String(9 + (index % 8)).padStart(2, "0")}:00`;
}

function timeForCard(card: { dueAt?: string }, index: number): string {
  const time = dateTimePartsFor(card.dueAt)?.time;

  return time ?? timeForIndex(index);
}

function dateTimePartsFor(
  value: string | undefined,
): { date: string; time: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: ORBIT_DISPLAY_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): string | null =>
    parts.find((part) => part.type === type)?.value ?? null;
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour");
  const minute = read("minute");

  return year && month && day && hour && minute
    ? { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` }
    : null;
}

export function followupsRouteToOrbitScheduleViewModel(
  model: AppFollowupsSuccessRouteViewModel,
): OrbitScheduleViewModel {
  const connections = new Map<string, OrbitScheduleConnectionView>();
  const ensureConnection = (
    relationship: string,
    targetContactId?: string | null,
    fallbackId = "priority",
  ): OrbitScheduleConnectionView => {
    const { company: relationshipCompany, name } = splitRelationship(relationship);
    const company = targetContactId ? relationshipCompany : "";
    const id = targetContactId ?? `task:${fallbackId}`;
    const existing = connections.get(id);

    if (existing) {
      return existing;
    }

    const connection = {
      company,
      displayName: name,
      g: "g-violet",
      id,
      initial: initialFor(name),
      title: targetContactId ? "Relationship contact" : "Follow-up task",
    };

    connections.set(id, connection);
    return connection;
  };

  if (model.workspace.priority) {
    ensureConnection(
      `${model.workspace.priority.contactName} · ${model.workspace.priority.organization}`,
    );
  }

  const schedules: OrbitScheduleItemView[] = model.workspace.workflowCards.map(
    (card, index) => {
      const connection = ensureConnection(
        card.relationship,
        card.targetContactId,
        card.id,
      );

      return {
        cid: connection.id,
        contactId: card.targetContactId ?? null,
        date: dateForCard(card, index),
        dur: "30 分钟",
        id: `${card.id}:${index}`,
        place: connection.company,
        status: /ready|confirmed|已确认/i.test(card.reviewStatus)
          ? "已确认"
          : "待确认",
        time: timeForCard(card, index),
        topic: card.title,
      };
    },
  );

  return {
    connections: Array.from(connections.values()),
    schedules,
    today: todayParts(),
  };
}
