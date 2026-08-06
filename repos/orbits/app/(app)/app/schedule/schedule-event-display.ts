import type { EventRecord } from "../../../../features/events/event-crud-and-import/contract";

export function scheduleEventSourceLabel(event: EventRecord): string {
  const labels: Partial<Record<EventRecord["sourceMetadata"]["type"], string>> = {
    calendar_signal: "日历信号",
    event_import: "活动导入",
    manual: "你手动添加",
  };

  return labels[event.sourceMetadata.type] ?? "活动来源";
}

export function scheduleEventStatusLabel(status: EventRecord["status"]): string {
  const labels: Record<EventRecord["status"], string> = {
    cancelled: "已取消",
    confirmed: "已确认",
    draft: "草稿",
    imported: "已导入",
    pending_import: "待导入",
  };

  return labels[status];
}

export function scheduleEventTitle(event: EventRecord): string {
  const titles: Record<string, string> = {
    "Seed Investor and Founder Matching Salon": "种子轮投资人与创始人匹配沙龙",
  };

  return titles[event.title] ?? event.title;
}

export function scheduleEventVenue(event: EventRecord): string {
  const venues: Record<string, string> = {
    "Orbit Relationship Room": "Orbit 关系室",
  };

  return venues[event.venue] ?? event.venue;
}

function dateTimeParts(value: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );

  return {
    day: Number(parts.day ?? "1"),
    hour: parts.hour ?? "00",
    minute: parts.minute ?? "00",
    month: Number(parts.month ?? "1"),
    year: Number(parts.year ?? "1970"),
  };
}

export function formatScheduleEventWindow(event: EventRecord): string {
  const start = dateTimeParts(event.startsAt);
  const end = dateTimeParts(event.endsAt);

  return `${start.year}年${start.month}月${start.day}日 ${start.hour}:${start.minute}-${end.hour}:${end.minute}`;
}

export function scheduleEventNextAction(event: EventRecord): string {
  if (event.nextAction.includes("registration")) {
    return "下一步：先复核来源和参会意图，再决定是否登记或预留时间。";
  }

  return "下一步：先复核活动来源和关系机会，再决定是否登记、联系参会人或安排后续。";
}
