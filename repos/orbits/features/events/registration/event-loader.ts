import {
  mockEventRecords,
  mockOrbitAiRecommendedEventDetailRecord,
} from "../event-crud-and-import/fixtures";
import type { EventRecord } from "../event-crud-and-import/contract";
import { bilingualSegment } from "../../orbit-ai/event-recommendation-artifact-service";
import { createEventCrudAndImportService } from "../service-factory";

const kanaPattern = /[぀-ヿ]/u;
const hanPattern = /[㐀-鿿]/u;

function segmentMatchesLanguage(
  segment: string,
  language: "en" | "zh",
): boolean {
  return language === "en"
    ? !hanPattern.test(segment) && !kanaPattern.test(segment)
    : hanPattern.test(segment) && !kanaPattern.test(segment);
}

/**
 * 按语言取活动标题的单一语言段。
 *
 * live 活动的 title 常是「日 / 英」拼接,中文名在 sourceMetadata.label 的
 * 三语串里;mock 活动的 label 则是来源标签(如 "Manual event creation"),
 * 不能当标题用。因此:先从 title 挑,挑出的段确实是目标语言就用;否则仅当
 * label 是多段串且含目标语言段时才取 label,不然回退 title 的挑选结果。
 */
export function localizedEventTitle(
  event: EventRecord,
  language: "en" | "zh",
): string {
  const fromTitle = bilingualSegment(event.title, language);

  if (segmentMatchesLanguage(fromTitle, language)) {
    return fromTitle;
  }

  const label = event.sourceMetadata?.label ?? "";

  if (label.includes("/")) {
    const fromLabel = bilingualSegment(label, language);

    if (segmentMatchesLanguage(fromLabel, language)) {
      return fromLabel;
    }
  }

  return fromTitle;
}

const knownRegistrationEvents: readonly EventRecord[] = [
  ...mockEventRecords,
  mockOrbitAiRecommendedEventDetailRecord,
];

export async function loadEventForRegistration(
  eventId: string,
): Promise<EventRecord | null> {
  const normalizedEventId = eventId.trim();
  const knownEvent = knownRegistrationEvents.find(
    (event) => event.id === normalizedEventId,
  );

  if (knownEvent) {
    return knownEvent;
  }

  try {
    const result = await createEventCrudAndImportService().getEvent({
      eventId: normalizedEventId,
    });

    return result.success ? result.data.event : null;
  } catch {
    return null;
  }
}

