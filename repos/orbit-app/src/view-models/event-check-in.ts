export type EventCheckInSegment = "all" | "pending" | "done";

export interface EventCheckInParticipantView {
  checkedIn: boolean;
  checkedInLabel: string | null;
  displayName: string;
  participantId: string;
  shortId: string;
  statusLabel: "已签到" | "未签到";
}

export interface EventCheckInRosterView {
  checkedCount: number;
  contractValid: boolean;
  eventId: string;
  participants: EventCheckInParticipantView[];
  totalCount: number;
}

const participantKeys = [
  "checkedIn",
  "checkedInAt",
  "displayName",
  "participantId"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatTime(value: string): string {
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

function participantToView(value: unknown): EventCheckInParticipantView | null {
  if (!isRecord(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (
    keys.length !== participantKeys.length ||
    !participantKeys.every((key) => keys.includes(key)) ||
    typeof value.checkedIn !== "boolean" ||
    (value.checkedInAt !== null && typeof value.checkedInAt !== "string") ||
    typeof value.displayName !== "string" ||
    !value.displayName.trim() ||
    typeof value.participantId !== "string" ||
    !value.participantId.trim() ||
    (value.checkedIn && value.checkedInAt === null) ||
    (!value.checkedIn && value.checkedInAt !== null)
  ) {
    return null;
  }

  return {
    checkedIn: value.checkedIn,
    checkedInLabel: value.checkedInAt ? formatTime(value.checkedInAt) : null,
    displayName: value.displayName.trim(),
    participantId: value.participantId,
    shortId: value.participantId.slice(-6),
    statusLabel: value.checkedIn ? "已签到" : "未签到"
  };
}

export function eventCheckInRosterToView(payload: unknown): EventCheckInRosterView {
  if (!isRecord(payload) || typeof payload.eventId !== "string") {
    return {
      checkedCount: 0,
      contractValid: false,
      eventId: "",
      participants: [],
      totalCount: 0
    };
  }
  const rawParticipants = Array.isArray(payload.participants)
    ? payload.participants
    : [];
  const parsedParticipants = rawParticipants.map(participantToView);
  const participants = parsedParticipants.filter(
    (item): item is EventCheckInParticipantView => item !== null
  );

  return {
    checkedCount: participants.filter((participant) => participant.checkedIn).length,
    contractValid:
      Array.isArray(payload.participants) &&
      parsedParticipants.every((participant) => participant !== null),
    eventId: payload.eventId,
    participants,
    totalCount: participants.length
  };
}

export function filterEventCheckInParticipants(
  participants: readonly EventCheckInParticipantView[],
  segment: EventCheckInSegment,
  query: string
): EventCheckInParticipantView[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return participants.filter((participant) => {
    if (segment === "pending" && participant.checkedIn) {
      return false;
    }
    if (segment === "done" && !participant.checkedIn) {
      return false;
    }
    return (
      !normalizedQuery ||
      participant.displayName.toLocaleLowerCase().includes(normalizedQuery) ||
      participant.participantId.toLocaleLowerCase().endsWith(normalizedQuery)
    );
  });
}

export function buildEventCheckInBody(participantId: string) {
  const normalized = participantId.trim();
  if (!normalized) {
    throw new Error("participantId is required");
  }
  return { participantId: normalized };
}
