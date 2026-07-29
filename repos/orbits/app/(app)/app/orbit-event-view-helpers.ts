import type { EventDTO } from "../../../shared/domain/contracts";

export function initialFor(value: string, fallback = "O"): string {
  return value.trim().slice(0, 1).toUpperCase() || fallback;
}

export function eventStatusFor(
  event: Pick<EventDTO, "endsAt" | "startsAt">,
  generatedAt: string,
): "active" | "upcoming" | "ended" {
  const now = new Date(generatedAt).getTime();
  const startsAt = new Date(event.startsAt).getTime();
  const endsAt = new Date(event.endsAt ?? event.startsAt).getTime();

  if (!Number.isFinite(now) || !Number.isFinite(startsAt)) {
    return "upcoming";
  }

  if (Number.isFinite(endsAt) && endsAt < now) {
    return "ended";
  }

  if (startsAt <= now) {
    return "active";
  }

  return "upcoming";
}

function normalizedTextFor(event: EventDTO): string {
  return `${event.name} ${event.source.label ?? ""} ${event.location ?? ""}`.toLowerCase();
}

export function eventThemeFor(event: EventDTO): string {
  const text = normalizedTextFor(event);

  if (text.includes("ai") || text.includes("人工") || text.includes("自動")) return "ai";
  if (text.includes("finance") || text.includes("投資") || text.includes("金融")) return "finance";
  if (text.includes("manufact") || text.includes("製造") || text.includes("半導体")) return "chip";
  if (text.includes("retail") || text.includes("fashion") || text.includes("consumer")) return "fashion";
  if (text.includes("ecommerce") || text.includes("越境") || text.includes("cross-border")) return "globe";
  if (text.includes("saas") || text.includes("workflow")) return "cloud";

  return "ai";
}

export function eventIndustryFor(event: EventDTO): string {
  const text = normalizedTextFor(event);

  if (text.includes("ai") || text.includes("自動")) return "AI / automation";
  if (text.includes("finance") || text.includes("投資") || text.includes("金融")) return "Finance / investment";
  if (text.includes("ecommerce") || text.includes("越境")) return "Cross-border commerce";
  if (text.includes("manufact") || text.includes("製造")) return "Manufacturing";
  if (text.includes("community") || text.includes("コミュニティ")) return "Community";
  if (text.includes("restaurant") || text.includes("飲食")) return "Hospitality";

  return "Relationship building";
}

export function eventTagsFor(event: EventDTO): string[] {
  const industry = eventIndustryFor(event);
  const sourceLabel =
    event.source.type === "event_import"
      ? "event import"
      : event.source.type.replace(/_/g, " ");

  return [
    ...new Set([industry, sourceLabel, event.location].filter(Boolean)),
  ];
}

export function formatDuration(
  startValue: string,
  endValue?: string,
): string {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue ?? startValue).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "30 分钟";
  }

  const minutes = Math.round((end - start) / 60_000);

  if (minutes >= 120) {
    return `${Math.round(minutes / 60)} 小时`;
  }

  return `${minutes} 分钟`;
}
