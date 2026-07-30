import type { OrbitLanguage } from "./orbit-language-core";

const EVENT_TIME_ZONE = "Asia/Tokyo";

export interface EventTemporalBounds {
  end: Date | null;
  hasValidRange: boolean;
  start: Date | null;
}

export interface SourceAgendaItem {
  description: string;
  label: string;
}

export interface SourceTimedAgendaItem extends SourceAgendaItem {
  time: string;
}

function validDate(value: string): Date | null {
  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}

export function eventTemporalBounds(
  startsAt: string,
  endsAt: string,
): EventTemporalBounds {
  const start = validDate(startsAt);
  const end = validDate(endsAt);

  return {
    end,
    hasValidRange:
      start !== null && end !== null && end.getTime() > start.getTime(),
    start,
  };
}

function agendaTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  }).format(date);
}

/**
 * Places authored agenda labels inside the source event's exact time range.
 *
 * The source startsAt/endsAt pair is the only clock. Invalid or zero/negative
 * ranges produce no agenda instead of fabricating times.
 */
export function sourceBoundedAgenda(input: {
  endsAt: string;
  items: readonly SourceAgendaItem[];
  startsAt: string;
}): SourceTimedAgendaItem[] {
  const bounds = eventTemporalBounds(input.startsAt, input.endsAt);

  if (
    !bounds.hasValidRange ||
    bounds.start === null ||
    bounds.end === null ||
    input.items.length === 0
  ) {
    return [];
  }

  const durationMs = bounds.end.getTime() - bounds.start.getTime();

  return input.items.map((item, index) => ({
    ...item,
    time: agendaTime(
      new Date(
        bounds.start!.getTime() +
          Math.floor((durationMs * index) / input.items.length),
      ),
    ),
  }));
}

function rangeLocale(language: OrbitLanguage): string {
  if (language === "en") return "en-US";
  if (language === "ja") return "ja-JP";
  return "zh-CN";
}

export function sourceEventRangeLabel(
  startsAt: string,
  endsAt: string,
  language: OrbitLanguage,
): string | null {
  const bounds = eventTemporalBounds(startsAt, endsAt);

  if (bounds.start === null) {
    return null;
  }

  const locale = rangeLocale(language);
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
  }).format(bounds.start);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  });
  const startTime = time.format(bounds.start);

  if (!bounds.hasValidRange || bounds.end === null) {
    const pending = {
      en: "end time TBD",
      ja: "終了時刻未定",
      zh: "结束时间待确认",
    }[language];

    return `${date} ${startTime} · ${pending}`;
  }

  return `${date} ${startTime}–${time.format(bounds.end)}`;
}
