/**
 * The prompt that reads a scheduled-task request (agent-design AG15; 设计稿 §5.3). The model only points at the user's
 * words and gives its reading of the schedule and the end date; code checks every piece against the message and
 * decides what the rule is (rule/parse.ts, graph/nodes/rule.ts). It sees the message only — no records.
 */
import { rejectModelApprovalClaims } from "../entry/approval-claims";
import { parseModelJson } from "../understand/validate";

export const RULE_PROMPT_VERSION = "rule@ag15.1";

export function ruleSystemPrompt(): string {
  return [
    "You are a step of Orbit, a personal relationship assistant. The user asks to set up, change, pause, resume or remove a scheduled task: something Orbit runs by itself at set times, whose results go to the in-app inbox. Say what they asked for, as JSON. You do not look anything up, you do not decide how to pick when the user did not say, and you never approve anything: code does the rest and the user confirms on a card.",
    "",
    "Output exactly one JSON object:",
    "{",
    '  "verb": "create" | "update" | "pause" | "resume" | "delete",',
    '  "target": for update, pause, resume and delete — the words of the CURRENT message that name the existing task (its title, or what it does), copied; otherwise null,',
    '  "scheduleText": the words that say when it runs, copied (e.g. "每周五上午九点", "Every Friday at 9am", "毎週金曜の朝9時"); null when none,',
    '  "schedule": your reading of scheduleText: {"kind": "weekly", "daysOfWeek": [numbers 0-6, Sunday is 0], "time": "HH:mm" in 24-hour time} or {"kind": "daily", "time": "HH:mm"}; null when none,',
    '  "domain": "event" (Orbit\'s public events) | "contact" (the user\'s contacts) | "todo" (the user\'s to-dos) — what the task picks from; null when it cannot be told,',
    '  "scopeText": the words that say which ones it picks from, copied (e.g. "周末活动", "events happening that weekend", "その週末のイベント", "行业是半导体、60 天没联系的联系人"); null when none,',
    '  "basisText": the words that say how to pick or order them, copied (e.g. "soonest first", "開始時間が早い順", "和摄影有关的", "by start time"); null when the user did not say how. Never invent one and never repeat the scope words here,',
    '  "count": how many to pick, a number; null when not said,',
    '  "untilText": the words that say until when it keeps running, copied (e.g. "先跑到 11 月底", "through the end of November", "11月末まで"); null when none,',
    '  "until": your reading of untilText as the last day, "YYYY-MM-DD"; null when none',
    "}",
    "",
    "Rules:",
    "1. scheduleText, scopeText, basisText, untilText and target must be copied character for character from the CURRENT message.",
    "2. Do not output account ids, approval flags or any field not listed above.",
  ].join("\n");
}

export function ruleUserText(input: { today: string; message: string; quote: string }): string {
  return [`Today: ${input.today}.`, "", "CURRENT message:", input.message, "", `The part about the scheduled task: "${input.quote}"`].join("\n");
}

export function ruleRepairText(user: string, previous: string, problems: readonly string[]): string {
  return [user, "", "Your previous output could not be used:", previous.slice(0, 2000), "", "Problems:", ...problems.slice(0, 12).map((problem) => `- ${problem}`), "", "Output the corrected JSON object only."].join("\n");
}

/** The model's reading, checked: every text is a piece of the message, kept as [start, end). */
export interface RuleModelDraft {
  verb: "create" | "update" | "pause" | "resume" | "delete";
  target: [number, number] | null;
  scheduleText: [number, number] | null;
  schedule: { kind: "weekly"; daysOfWeek: number[]; time: string } | { kind: "daily"; time: string } | null;
  domain: "event" | "contact" | "todo" | null;
  scopeText: [number, number] | null;
  basisText: [number, number] | null;
  count: number | null;
  untilText: [number, number] | null;
  until: string | null;
}

const VERBS = ["create", "update", "pause", "resume", "delete"] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;

export function checkRuleDraft(text: string, message: string): { ok: true; draft: RuleModelDraft } | { ok: false; errors: string[] } {
  const parsed = parseModelJson(text);
  if (parsed.ok === false) return { errors: [parsed.error], ok: false };
  const value = rejectModelApprovalClaims(parsed.value, "rule") as Record<string, unknown> | null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { errors: ["the output must be one JSON object"], ok: false };
  const errors: string[] = [];
  const span = (words: unknown, what: string): [number, number] | null => {
    if (words === null || words === undefined || words === "") return null;
    if (typeof words !== "string") {
      errors.push(`${what} must be a string or null`);
      return null;
    }
    const trimmed = words.trim();
    const at = message.indexOf(trimmed);
    if (!trimmed || at < 0) {
      errors.push(`${what} "${trimmed.slice(0, 60)}" is not copied from the CURRENT message`);
      return null;
    }
    return [at, at + trimmed.length];
  };
  const verb = VERBS.find((item) => item === value.verb);
  if (!verb) errors.push(`verb must be one of ${VERBS.join(", ")}`);
  let schedule: RuleModelDraft["schedule"] = null;
  const raw = value.schedule as { kind?: unknown; daysOfWeek?: unknown; time?: unknown } | null | undefined;
  // The model's own reading is only a fallback for code's (rule/parse.ts); a malformed one is dropped, not an error.
  if (raw && typeof raw === "object" && typeof raw.time === "string" && TIME.test(raw.time)) {
    if (raw.kind === "daily") schedule = { kind: "daily", time: raw.time };
    else if (raw.kind === "weekly" && Array.isArray(raw.daysOfWeek) && raw.daysOfWeek.length > 0 && raw.daysOfWeek.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) schedule = { daysOfWeek: [...new Set(raw.daysOfWeek as number[])].sort((left, right) => left - right), kind: "weekly", time: raw.time };
  }
  const draft: RuleModelDraft = {
    basisText: span(value.basisText, "basisText"),
    count: typeof value.count === "number" && Number.isInteger(value.count) && value.count > 0 ? value.count : null,
    domain: value.domain === "event" || value.domain === "contact" || value.domain === "todo" ? value.domain : null,
    schedule,
    scheduleText: span(value.scheduleText, "scheduleText"),
    scopeText: span(value.scopeText, "scopeText"),
    target: span(value.target, "target"),
    until: typeof value.until === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value.until) ? value.until : null,
    untilText: span(value.untilText, "untilText"),
    verb: verb ?? "create",
  };
  return errors.length ? { errors, ok: false } : { draft, ok: true };
}
