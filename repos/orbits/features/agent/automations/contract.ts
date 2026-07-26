export const AGENT_AUTOMATION_STATUSES = [
  "active",
  "paused",
  "running",
  "completed",
  "failed",
] as const;

export const AGENT_AUTOMATION_DELIVERY_CHANNELS = [
  "in_app",
  "push",
] as const;

export const AGENT_AUTOMATION_LEASE_TIMEOUT_MS = 5 * 60_000;

export type AgentAutomationStatus =
  (typeof AGENT_AUTOMATION_STATUSES)[number];
export type AgentAutomationDeliveryChannel =
  (typeof AGENT_AUTOMATION_DELIVERY_CHANNELS)[number];

export type AgentAutomationSchedule =
  | {
      kind: "once";
      at: string;
    }
  | {
      kind: "daily";
      time: string;
      timeZone: string;
    }
  | {
      kind: "weekly";
      daysOfWeek: readonly number[];
      time: string;
      timeZone: string;
    };

export interface AgentAutomationRunOutcome {
  status: "success" | "failure";
  summary: string;
  runId?: string;
  completedAt: string;
}

export interface AgentAutomation {
  automationId: string;
  capabilityId: string;
  title: string;
  instruction: string;
  schedule: AgentAutomationSchedule;
  delivery: AgentAutomationDeliveryChannel;
  status: AgentAutomationStatus;
  nextRunAt: string | null;
  lastRun: AgentAutomationRunOutcome | null;
  runCount: number;
  lease?: {
    leaseId: string;
    workerId: string;
    claimedAt: string;
    resumeStatus: "active" | "paused";
  };
  createdAt: string;
  updatedAt: string;
}

export interface AgentAutomationRecordPayload extends Record<string, unknown> {
  automation: AgentAutomation;
}

export interface CreateAgentAutomationInput {
  capabilityId: string;
  title: string;
  instruction: string;
  schedule: AgentAutomationSchedule;
  delivery: AgentAutomationDeliveryChannel;
}

export interface UpdateAgentAutomationInput {
  capabilityId?: string;
  title?: string;
  instruction?: string;
  schedule?: AgentAutomationSchedule;
  delivery?: AgentAutomationDeliveryChannel;
  status?: "active" | "paused";
}

export interface ClaimAgentAutomationsInput {
  now: string;
  workerId: string;
  limit: number;
}

export interface RecordAgentAutomationRunInput {
  automationId: string;
  completedAt: string;
  leaseId: string;
  outcome: Omit<AgentAutomationRunOutcome, "completedAt">;
}

export interface AgentAutomationService {
  list: () => Promise<readonly AgentAutomation[]>;
  get: (automationId: string) => Promise<AgentAutomation | null>;
  create: (input: CreateAgentAutomationInput) => Promise<AgentAutomation>;
  update: (
    automationId: string,
    input: UpdateAgentAutomationInput,
  ) => Promise<AgentAutomation>;
  remove: (automationId: string) => Promise<void>;
  claimDue: (
    input: ClaimAgentAutomationsInput,
  ) => Promise<readonly AgentAutomation[]>;
  claim: (input: {
    automationId: string;
    claimedAt: string;
    workerId: string;
  }) => Promise<AgentAutomation>;
  recordRun: (
    input: RecordAgentAutomationRunInput,
  ) => Promise<AgentAutomation>;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function requireInstant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid ISO date-time.`);
  }
  return parsed;
}

function requireTime(value: string): { hour: number; minute: number } {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new Error("Automation time must use HH:mm.");
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function requireTimeZone(value: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    throw new Error("Automation time zone must be a valid IANA time zone.");
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zonedParts(instantMs: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(instantMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function zonedLocalToInstant(
  local: ZonedParts,
  timeZone: string,
): number {
  const targetAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  let candidate = targetAsUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = zonedParts(candidate, timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    const correction = targetAsUtc - observedAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }

  return candidate;
}

function weekdayForLocalDate(input: Pick<ZonedParts, "year" | "month" | "day">) {
  return new Date(
    Date.UTC(input.year, input.month - 1, input.day),
  ).getUTCDay();
}

export function validateAgentAutomationSchedule(
  schedule: AgentAutomationSchedule,
): void {
  if (schedule.kind === "once") {
    requireInstant(schedule.at, "Automation run time");
    return;
  }

  requireTime(schedule.time);
  requireTimeZone(schedule.timeZone);
  if (
    schedule.kind === "weekly" &&
    (schedule.daysOfWeek.length === 0 ||
      schedule.daysOfWeek.some(
        (day) => !Number.isInteger(day) || day < 0 || day > 6,
      ))
  ) {
    throw new Error(
      "Weekly automations require at least one weekday from 0 through 6.",
    );
  }
}

export function nextAgentAutomationRunAt(
  schedule: AgentAutomationSchedule,
  after: string,
): string | null {
  validateAgentAutomationSchedule(schedule);
  const afterMs = requireInstant(after, "Automation comparison time");

  if (schedule.kind === "once") {
    const atMs = requireInstant(schedule.at, "Automation run time");
    return atMs > afterMs ? new Date(atMs).toISOString() : null;
  }

  const timeZone = requireTimeZone(schedule.timeZone);
  const time = requireTime(schedule.time);
  const localAfter = zonedParts(afterMs, timeZone);

  for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
    const date = new Date(
      Date.UTC(
        localAfter.year,
        localAfter.month - 1,
        localAfter.day + dayOffset,
      ),
    );
    const localDate = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
    if (
      schedule.kind === "weekly" &&
      !schedule.daysOfWeek.includes(weekdayForLocalDate(localDate))
    ) {
      continue;
    }
    const candidate = zonedLocalToInstant(
      {
        ...localDate,
        hour: time.hour,
        minute: time.minute,
      },
      timeZone,
    );
    if (candidate > afterMs) {
      return new Date(candidate).toISOString();
    }
  }

  throw new Error("Unable to resolve the next automation occurrence.");
}
