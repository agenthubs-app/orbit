import type { ContactDTO, TaskDTO } from "../../../shared/domain/contracts";
import {
  contactCompany,
  contactTitle,
  contactsById,
  formatDatePart,
  formatTimePart,
  getOrbitHybridRouteData,
  gradientFor,
  initialFor,
  sortedContacts,
  type OrbitHybridRouteData,
} from "./orbit-hybrid-route-data";

export interface OrbitScheduleConnectionView {
  company: string;
  displayName: string;
  g: string;
  id: string;
  initial: string;
  title: string;
}

export interface OrbitScheduleItemView {
  cid: string;
  date: string;
  dur: string;
  id: string;
  place: string;
  status: "已确认" | "待确认";
  time: string;
  topic: string;
}

export interface OrbitScheduleViewModel {
  connections: OrbitScheduleConnectionView[];
  schedules: OrbitScheduleItemView[];
  today: {
    d: number;
    m: number;
    y: number;
  };
}

function connectionView(contact: ContactDTO, index: number): OrbitScheduleConnectionView {
  return {
    company: contactCompany(contact),
    displayName: contact.displayName,
    g: gradientFor(contact.id, index),
    id: contact.id,
    initial: initialFor(contact.displayName),
    title: contactTitle(contact),
  };
}

function scheduleFromTask(
  data: OrbitHybridRouteData,
  task: TaskDTO,
): OrbitScheduleItemView | null {
  if (!task.contactId || !task.dueAt) {
    return null;
  }

  const contact = contactsById(data).get(task.contactId);

  return {
    cid: task.contactId,
    date: formatDatePart(task.dueAt),
    dur: "30 分钟",
    id: task.id,
    place: contact?.organization ?? "Local remote follow-up",
    status: task.status === "scheduled" || task.status === "completed" ? "已确认" : "待确认",
    time: formatTimePart(task.dueAt),
    topic: task.title,
  };
}

function todayParts(generatedAt: string) {
  const date = new Date(generatedAt);

  if (!Number.isFinite(date.getTime())) {
    return { y: 2026, m: 6, d: 30 };
  }

  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  };
}

export function getOrbitScheduleViewModel(): OrbitScheduleViewModel {
  const data = getOrbitHybridRouteData();

  return {
    connections: sortedContacts(data).map(connectionView),
    today: todayParts(data.generatedAt),
    schedules: data.tasks
      .map((task) => scheduleFromTask(data, task))
      .filter((item): item is OrbitScheduleItemView => item !== null),
  };
}
