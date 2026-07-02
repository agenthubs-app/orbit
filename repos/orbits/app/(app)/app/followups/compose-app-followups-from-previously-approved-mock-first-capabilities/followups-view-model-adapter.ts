import type { AppFollowupsRouteViewModel } from "./followups-route-view-model";
import type {
  OrbitScheduleConnectionView,
  OrbitScheduleItemView,
  OrbitScheduleViewModel,
} from "../../orbit-schedule-route-view-model";

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
  return `contact:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "orbit"}`;
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

function timeForIndex(index: number): string {
  return `${String(9 + (index % 8)).padStart(2, "0")}:00`;
}

export function followupsRouteToOrbitScheduleViewModel(
  model: AppFollowupsSuccessRouteViewModel,
): OrbitScheduleViewModel {
  const connections = new Map<string, OrbitScheduleConnectionView>();
  const ensureConnection = (relationship: string): OrbitScheduleConnectionView => {
    const { company, name } = splitRelationship(relationship);
    const id = connectionIdFor(name);
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
      title: "Relationship contact",
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
      const connection = ensureConnection(card.relationship);

      return {
        cid: connection.id,
        date: dateForDue(card.due, index),
        dur: "30 分钟",
        id: `${card.id}:${index}`,
        place: connection.company,
        status: /ready|confirmed|已确认/i.test(card.reviewStatus)
          ? "已确认"
          : "待确认",
        time: timeForIndex(index),
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
