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

export const AGENT_AUTOMATION_SIGNAL_TYPES = [
  "followup_due",
  "event_upcoming",
  "relationship_stale",
] as const;
export type AgentAutomationSignalType =
  (typeof AGENT_AUTOMATION_SIGNAL_TYPES)[number];

export type AgentAutomationTrigger =
  | {
      kind: "schedule";
      schedule: AgentAutomationSchedule;
    }
  | {
      kind: "signal";
      signalTypes: readonly AgentAutomationSignalType[];
      minimumImportance: number;
    };

/**
 * agent-design AG15 (设计稿 §5.3, 附录 E 定时规则): what a rule checks, as capability and parameters — never the text of
 * a note read when it was made. The card lists these one by one; the dispatcher reads them again at every period.
 */
export interface AgentRuleNotify {
  inApp: boolean;
  /** The task's own reminder switch (AG16): a period with a result also sends one reminder to the owner's phone and browser. */
  push: boolean;
  /**
   * Written by the first AG16 build only and ignored since: the reminder's sentence follows the language of the task's
   * results (the run's locale) when it is sent, and switching the reminder drops this field. Kept so older records read.
   */
  pushLocale?: "zh" | "en" | "ja";
}

export interface AgentRuleReference {
  type: "memo";
  id: string;
  /** The name shown on the card; the record is read again by its id at every period. */
  title?: string;
}

export type AgentRuleScope =
  /** Orbit's public events starting in a window counted from the period: the weekend, the next 7 days, the rest of the month. */
  | { domain: "event"; window: "weekend" | "week" | "month" | "upcoming"; topics?: readonly string[] }
  /** The owner's contacts, narrowed by code: industry, place, days since the last recorded interaction. */
  | { domain: "contact"; industries?: readonly string[]; places?: readonly string[]; quietDays?: number }
  /** The owner's open to-dos past their planned day. */
  | { domain: "todo"; filter: "past_planned" };

export type AgentRuleRankField = "startsAt" | "lastInteraction" | "dueAt" | "plannedDate";

export interface AgentRuleRanking {
  /** A record field to order by. */
  field?: { name: AgentRuleRankField; direction: "asc" | "desc" };
  /** The user's own words of what makes one fit; a referenced note gives its text at run time instead. */
  topic?: string;
}

export interface AgentRuleSpec {
  /** pick: a list of records for the inbox. replan: a card that moves past-planned to-dos to the day of the period. */
  action: "pick" | "replan";
  scope: AgentRuleScope;
  /** The scope in the user's words, as the card shows it. */
  scopeText: string;
  references: readonly AgentRuleReference[];
  ranking: AgentRuleRanking;
  /** The ranking basis in one sentence, as the card shows it. */
  rankingBasis: string;
  maxItems: number;
  /** A period with nothing new is only written to the history. */
  onEmpty: "silent";
  /** The last local day (YYYY-MM-DD, the schedule's time zone) a period may fall on; null: no end. */
  validUntil: string | null;
  notify: AgentRuleNotify;
  locale: "zh" | "en" | "ja";
  /**
   * AG16: the earliest version whose periods still count as "already told". A change of the reminder switch alone makes
   * a new version but does not change what the task picks, so what it told before is not told again. Not set: this version.
   */
  toldFromVersion?: number;
}

export const AGENT_RULE_MAX_ITEMS = 20;

export interface AgentAutomationRevision {
  version: number;
  capabilityId: string;
  title: string;
  instruction: string;
  trigger: AgentAutomationTrigger;
  delivery: AgentAutomationDeliveryChannel;
  /** AG15: the rule's parameters at this version. */
  rule?: AgentRuleSpec;
  source: "manual" | "natural_language";
  changeNote: string;
  createdAt: string;
}

export interface AgentAutomationRunOutcome {
  status: "success" | "failure";
  summary: string;
  runId?: string;
  sourceModules?: readonly string[];
  evidenceIds?: readonly string[];
  triggerEventId?: string;
  completedAt: string;
}

export interface AgentAutomation {
  automationId: string;
  capabilityId: string;
  title: string;
  instruction: string;
  trigger: AgentAutomationTrigger;
  delivery: AgentAutomationDeliveryChannel;
  /** AG15: present on rules made with the fields of 设计稿 §5.3; absent on older playbooks. */
  rule?: AgentRuleSpec;
  status: AgentAutomationStatus;
  /**
   * AG15: with a due index attached, the next period lives there (the dispatcher never rewrites this record for a
   * run); this value is then only what was computed when the rule was last written.
   */
  nextRunAt: string | null;
  lastRun: AgentAutomationRunOutcome | null;
  runCount: number;
  version: number;
  revisions: readonly AgentAutomationRevision[];
  handledEventIds: readonly string[];
  lease?: {
    leaseId: string;
    workerId: string;
    claimedAt: string;
    resumeStatus: "active" | "paused";
    triggerEventId?: string;
    triggerEventIds?: readonly string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface AgentAutomationRecordPayload extends Record<string, unknown> {
  automation: AgentAutomation;
}

export interface CreateAgentAutomationInput {
  /**
   * AG15: set only by server code that needs a replay to find the same rule (a card's executor derives it from its
   * operation key). Never taken from a request body. A rule with this id that exists already is returned as it is.
   */
  automationId?: string;
  capabilityId: string;
  title: string;
  instruction: string;
  trigger: AgentAutomationTrigger;
  delivery: AgentAutomationDeliveryChannel;
  rule?: AgentRuleSpec;
  source?: "manual" | "natural_language";
}

export interface UpdateAgentAutomationInput {
  capabilityId?: string;
  title?: string;
  instruction?: string;
  trigger?: AgentAutomationTrigger;
  delivery?: AgentAutomationDeliveryChannel;
  rule?: AgentRuleSpec;
  status?: "active" | "paused";
  source?: "manual" | "natural_language";
  changeNote?: string;
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
  claimForSignal: (input: {
    batchId: string;
    eventIds: readonly string[];
    signalType: AgentAutomationSignalType;
    importance: number;
    claimedAt: string;
    workerId: string;
    limit: number;
  }) => Promise<readonly AgentAutomation[]>;
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

/**
 * The instant a local wall-clock time stands for (agent-design AG15, PLANNER 易错边界 3). A local time that occurs
 * twice (clocks set back) is its first occurrence, so a rule runs once that day; one that does not exist (clocks set
 * forward) is moved on by the width of the gap (02:30 → 03:30), so the period is not lost.
 */
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
  const offsetAt = (instant: number) => {
    const observed = zonedParts(instant, timeZone);
    return (
      Date.UTC(
        observed.year,
        observed.month - 1,
        observed.day,
        observed.hour,
        observed.minute,
      ) - instant
    );
  };
  // The offsets in force a day before and a day after cover any single transition around this local time.
  const offsets = [
    ...new Set([
      offsetAt(targetAsUtc - 86_400_000),
      offsetAt(targetAsUtc + 86_400_000),
    ]),
  ];
  const matching = offsets
    .map((offset) => targetAsUtc - offset)
    .filter((instant) => offsetAt(instant) === targetAsUtc - instant)
    .sort((left, right) => left - right);
  if (matching.length > 0) return matching[0];
  // AG21c (decision D5): in the gap (clocks went forward, so the offset grew) the task runs at the first valid minute after
  // it (02:30 → 03:00): the instant of the change, found between the two readings of the local time.
  const after = Math.max(...offsets);
  let early = targetAsUtc - after;
  let late = targetAsUtc - Math.min(...offsets);
  while (late - early > 60_000) {
    const middle = early + Math.floor((late - early) / 120_000) * 60_000;
    if (middle <= early) break;
    if (offsetAt(middle) === after) late = middle;
    else early = middle;
  }
  return late;
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

export function validateAgentAutomationTrigger(
  trigger: AgentAutomationTrigger,
): void {
  if (trigger.kind === "schedule") {
    validateAgentAutomationSchedule(trigger.schedule);
    return;
  }
  if (
    trigger.signalTypes.length === 0 ||
    trigger.signalTypes.some(
      (signalType) =>
        !AGENT_AUTOMATION_SIGNAL_TYPES.includes(signalType),
    )
  ) {
    throw new Error(
      "Signal-triggered automations require at least one allowed signal type.",
    );
  }
  if (
    !Number.isInteger(trigger.minimumImportance) ||
    trigger.minimumImportance < 0 ||
    trigger.minimumImportance > 100
  ) {
    throw new Error(
      "Signal trigger minimum importance must be an integer from 0 through 100.",
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

/** The local day (YYYY-MM-DD) of an instant in a time zone. */
export function agentAutomationLocalDay(instant: string, timeZone: string): string {
  const parts = zonedParts(requireInstant(instant, "Instant"), requireTimeZone(timeZone));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** The instant a local day starts at in a time zone (00:00 wall clock; moved on when that time does not exist). */
export function agentAutomationDayStart(day: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error("A local day must use YYYY-MM-DD.");
  return new Date(
    zonedLocalToInstant(
      { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: 0, minute: 0 },
      requireTimeZone(timeZone),
    ),
  ).toISOString();
}

export function agentAutomationScheduleTimeZone(schedule: AgentAutomationSchedule): string {
  return schedule.kind === "once" ? "UTC" : schedule.timeZone;
}

/** Whether a period at this instant is still inside the rule's validity (its last local day included). */
export function agentRulePeriodValid(
  schedule: AgentAutomationSchedule,
  validUntil: string | null | undefined,
  scheduledAt: string,
): boolean {
  if (!validUntil) return true;
  return agentAutomationLocalDay(scheduledAt, agentAutomationScheduleTimeZone(schedule)) <= validUntil;
}

/**
 * The next period after `after` that is still valid, or null when the rule has run out (a one-off that fired, or a
 * recurring rule past its last day).
 */
export function nextAgentRulePeriod(
  schedule: AgentAutomationSchedule,
  validUntil: string | null | undefined,
  after: string,
): string | null {
  const next = nextAgentAutomationRunAt(schedule, after);
  return next && agentRulePeriodValid(schedule, validUntil, next) ? next : null;
}

/**
 * Catch-up after an interruption (设计稿 §5.3: 只补最近一期): of the periods from `firstDue` up to `now`, only the
 * latest is run; the others are counted as skipped and written to that run's history line.
 */
export function latestDueAgentRulePeriod(
  schedule: AgentAutomationSchedule,
  validUntil: string | null | undefined,
  firstDue: string,
  now: string,
): { scheduledAt: string; skipped: number; skippedAt: string[] } | null {
  const nowMs = requireInstant(now, "Comparison time");
  if (requireInstant(firstDue, "First due period") > nowMs) return null;
  if (!agentRulePeriodValid(schedule, validUntil, firstDue)) return null;
  let latest = new Date(firstDue).toISOString();
  let skipped = 0;
  // The planned times passed over, oldest first (the history names them; only the first few are kept).
  const skippedAt: string[] = [];
  // Bounded: a daily rule left for ten years is 3,650 periods.
  for (let step = 0; step < 4_000; step += 1) {
    const next = nextAgentRulePeriod(schedule, validUntil, latest);
    if (!next || Date.parse(next) > nowMs) break;
    if (skippedAt.length < 12) skippedAt.push(latest);
    latest = next;
    skipped += 1;
  }
  return { scheduledAt: latest, skipped, skippedAt };
}

/** How a rule tells its owner (older playbooks keep one `delivery` value; it reads as this). */
export function agentAutomationNotify(
  automation: Pick<AgentAutomation, "delivery" | "rule">,
): AgentRuleNotify {
  return automation.rule?.notify ?? { inApp: true, push: automation.delivery === "push" };
}

export function validateAgentRuleSpec(rule: AgentRuleSpec): void {
  if (rule.action !== "pick" && rule.action !== "replan") throw new Error("A rule must pick records or re-plan to-dos.");
  if (!rule.scope || !["event", "contact", "todo"].includes(rule.scope.domain)) throw new Error("A rule needs a candidate scope.");
  if (rule.action === "replan" && rule.scope.domain !== "todo") throw new Error("Only to-dos can be re-planned by a rule.");
  if (!Number.isInteger(rule.maxItems) || rule.maxItems < 1 || rule.maxItems > AGENT_RULE_MAX_ITEMS) {
    throw new Error(`A rule lists from 1 to ${AGENT_RULE_MAX_ITEMS} items.`);
  }
  if (rule.validUntil !== null && !/^\d{4}-\d{2}-\d{2}$/.test(rule.validUntil)) throw new Error("A rule's last day must use YYYY-MM-DD.");
  if (!rule.scopeText?.trim() || !rule.rankingBasis?.trim()) throw new Error("A rule needs its scope and ranking basis in words.");
  if (rule.action === "pick" && !rule.ranking.field && !rule.ranking.topic && rule.references.length === 0) {
    throw new Error("A rule that picks records needs a ranking basis: a field, a topic or a referenced note.");
  }
  if (!rule.notify || rule.notify.inApp !== true) throw new Error("A rule's results always go to the in-app inbox.");
  if (rule.references.some((reference) => reference.type !== "memo" || !reference.id?.trim())) throw new Error("A rule may reference notes only.");
  if (!["zh", "en", "ja"].includes(rule.locale)) throw new Error("A rule's language must be zh, en or ja.");
}
