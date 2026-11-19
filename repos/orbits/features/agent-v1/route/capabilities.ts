/**
 * The capability list of 设计稿附录 A. The model names capabilities from this list only; code
 * decides from them where a part goes (route/decide.ts). `card: true` means the capability changes
 * the user's data and can only run after a confirmation card.
 */
export const CAPABILITY_TABLE = {
  "contact.read": { card: false, kind: "read" },
  "event.read": { card: false, kind: "read" },
  "attendance.read": { card: false, kind: "read" },
  "todo.read": { card: false, kind: "read" },
  "memo.read": { card: false, kind: "read" },
  "schedule.read": { card: false, kind: "read" },
  "profile.read": { card: false, kind: "read" },
  "view.context": { card: false, kind: "read" },
  "view.timeline": { card: false, kind: "read" },
  "view.recentInteraction": { card: false, kind: "read" },
  "contact.create": { card: true, kind: "write" },
  "contact.update": { card: true, kind: "write" },
  "contact.delete": { card: true, kind: "write" },
  "contact.restore": { card: true, kind: "write" },
  "contact.import": { card: true, kind: "write" },
  "privateEvent.create": { card: true, kind: "write" },
  "privateEvent.update": { card: true, kind: "write" },
  "privateEvent.delete": { card: true, kind: "write" },
  "attendance.create": { card: true, kind: "write" },
  "attendance.update": { card: true, kind: "write" },
  "attendance.delete": { card: true, kind: "write" },
  "todo.create": { card: true, kind: "write" },
  "todo.update": { card: true, kind: "write" },
  "todo.complete": { card: true, kind: "write" },
  "todo.reopen": { card: true, kind: "write" },
  "todo.delete": { card: true, kind: "write" },
  "memo.create": { card: true, kind: "write" },
  "memo.update": { card: true, kind: "write" },
  "memo.unlink": { card: true, kind: "write" },
  "memo.delete": { card: true, kind: "write" },
  "schedule.create": { card: true, kind: "write" },
  "schedule.update": { card: true, kind: "write" },
  "schedule.delete": { card: true, kind: "write" },
  "rule.create": { card: true, kind: "write" },
  "rule.update": { card: true, kind: "write" },
  "rule.pause": { card: true, kind: "write" },
  "rule.resume": { card: true, kind: "write" },
  "rule.cancel": { card: true, kind: "write" },
  "memory.create": { card: true, kind: "write" },
  "memory.update": { card: true, kind: "write" },
  "memory.delete": { card: true, kind: "write" },
  "fn.rank": { card: false, kind: "function" },
  "fn.extractInteractions": { card: false, kind: "function" },
  "fn.extractFollowUps": { card: false, kind: "function" },
  "fn.compare": { card: false, kind: "function" },
  "fn.group": { card: false, kind: "function" },
  "fn.summarize": { card: false, kind: "function" },
  "web.search": { card: false, kind: "web" },
  "web.fetch": { card: false, kind: "web" },
  "external.deepResearch": { card: false, kind: "external" },
  "external.otherTool": { card: false, kind: "external" },
} as const satisfies Record<string, { card: boolean; kind: "read" | "write" | "function" | "web" | "external" }>;

export type Capability = keyof typeof CAPABILITY_TABLE;
export type CapabilityKind = (typeof CAPABILITY_TABLE)[Capability]["kind"];

export const CAPABILITIES = Object.keys(CAPABILITY_TABLE) as Capability[];

export function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CAPABILITY_TABLE, value);
}

export function capabilityKind(capability: Capability): CapabilityKind {
  return CAPABILITY_TABLE[capability].kind;
}

export function needsCard(capability: Capability): boolean {
  return CAPABILITY_TABLE[capability].card;
}

/** 附录 A 的取值。 */
export const VERDICTS = ["accept", "convert", "decline"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const ROUTES = ["answer", "read", "probe", "web_lookup", "propose_write", "offer_alternative", "suggest_external_agent", "explain_limit", "clarify"] as const;
export type Route = (typeof ROUTES)[number];
export const WAIT_REASONS = ["object_ambiguous", "permission_missing", "dependency_pending", "service_unavailable", "awaiting_acceptance", "awaiting_external_result"] as const;
export type WaitReason = (typeof WAIT_REASONS)[number];
