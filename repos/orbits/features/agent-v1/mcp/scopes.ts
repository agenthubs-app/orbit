/**
 * agent-design AG17 (设计稿 §5.4「授权范围」; CONVENTIONS §1): what an external connection may be granted.
 *
 * Every domain has `<domain>:read` and `<domain>:propose`; `proposals:read` lets a connection look at the state of what
 * it proposed. Personal memory, whole conversations and contact methods are in no scope at all: asking for them is
 * answered with a plain refusal, whatever the connection holds.
 */
import type { DomainKind } from "../domains/types";

export const MCP_DOMAINS = ["contacts", "events", "attendance", "todos", "memos", "schedule"] as const;
export type McpDomain = (typeof MCP_DOMAINS)[number];

export const PROPOSALS_READ = "proposals:read";

export type McpScope = `${McpDomain}:read` | `${McpDomain}:propose` | typeof PROPOSALS_READ;

/** The operations an external agent may propose, and the scope each needs. A domain without one here has no «可提议». */
export const PROPOSABLE_OPERATIONS = {
  "memo.create": "memos:propose",
  "todo.create": "todos:propose",
  "todo.update": "todos:propose",
} as const satisfies Record<string, McpScope>;
export type ProposableOperation = keyof typeof PROPOSABLE_OPERATIONS;

const PROPOSE_DOMAINS = new Set<string>(Object.values(PROPOSABLE_OPERATIONS).map((scope) => scope.slice(0, scope.indexOf(":"))));

/** Every scope this server can grant, in the order the consent page lists them. */
export const MCP_SCOPES: readonly McpScope[] = [
  ...MCP_DOMAINS.flatMap((domain) => [`${domain}:read` as McpScope, ...(PROPOSE_DOMAINS.has(domain) ? [`${domain}:propose` as McpScope] : [])]),
  PROPOSALS_READ,
];

const KNOWN = new Set<string>(MCP_SCOPES);

export const isMcpScope = (value: string): value is McpScope => KNOWN.has(value);

/** "todos:read memos:read" → the known scopes in it, in catalogue order; `unknown` lists what is not a scope here. */
export function parseScopes(value: string | readonly string[] | null | undefined): { scopes: McpScope[]; unknown: string[] } {
  const words = (Array.isArray(value) ? value : String(value ?? "").split(/\s+/u)).map((word) => String(word).trim()).filter(Boolean);
  const wanted = new Set(words);
  return { scopes: MCP_SCOPES.filter((scope) => wanted.has(scope)), unknown: [...wanted].filter((word) => !KNOWN.has(word)) };
}

/**
 * The names a tool argument may use for a domain (the cases write `todos`, `memo`, `contact` …): singular and plural
 * both mean the same scope. `kind` is the read adapter's kind; attendance notes are read through the event adapter.
 */
const DOMAIN_NAMES: Record<string, McpDomain> = {
  attendance: "attendance",
  attendances: "attendance",
  contact: "contacts",
  contacts: "contacts",
  event: "events",
  events: "events",
  memo: "memos",
  memos: "memos",
  note: "memos",
  notes: "memos",
  schedule: "schedule",
  schedules: "schedule",
  task: "todos",
  tasks: "todos",
  todo: "todos",
  todos: "todos",
};

/** Kinds of content no connection can read (设计稿 §5.4「不开放的内容」). */
const NEVER_READABLE = new Set(["memory", "memories", "conversation", "conversations", "message", "messages", "chat", "chats", "session", "sessions", "contact_method", "contact_methods", "email", "emails", "phone", "phones"]);

export const KIND_OF_DOMAIN: Record<McpDomain, DomainKind> = {
  attendance: "event",
  contacts: "contact",
  events: "event",
  memos: "memo",
  schedule: "schedule",
  todos: "todo",
};

/** The singular word a record carries as its `type` in tool results. */
export const TYPE_OF_DOMAIN: Record<McpDomain, string> = {
  attendance: "attendance",
  contacts: "contact",
  events: "event",
  memos: "memo",
  schedule: "schedule",
  todos: "todo",
};

export type DomainName = { kind: "domain"; domain: McpDomain } | { kind: "never" } | { kind: "unknown" };

export function domainOf(name: unknown): DomainName {
  const word = typeof name === "string" ? name.trim().toLowerCase() : "";
  if (NEVER_READABLE.has(word)) return { kind: "never" };
  const domain = DOMAIN_NAMES[word];
  return domain ? { domain, kind: "domain" } : { kind: "unknown" };
}

export const readScopeOf = (domain: McpDomain): McpScope => `${domain}:read`;

export const TOOL_NAMES = ["search_records", "get_record", "propose_change", "get_proposal"] as const;
export type McpToolName = (typeof TOOL_NAMES)[number];

/** Which tools a connection sees (设计稿 §5.4「工具清单按已授予的范围过滤」). Calling one outside the list is refused the same way. */
export function toolsFor(scopes: readonly string[]): McpToolName[] {
  const reads = scopes.some((scope) => scope.endsWith(":read") && scope !== PROPOSALS_READ && isMcpScope(scope));
  const proposes = scopes.some((scope) => scope.endsWith(":propose") && isMcpScope(scope));
  return TOOL_NAMES.filter((tool) => (tool === "search_records" || tool === "get_record" ? reads : tool === "propose_change" ? proposes : scopes.includes(PROPOSALS_READ)));
}

/** What the consent page offers per domain: whether «可以提修改» exists for it. */
export function scopeCatalogue(): { domain: McpDomain; read: McpScope; propose: McpScope | null }[] {
  return MCP_DOMAINS.map((domain) => ({ domain, propose: PROPOSE_DOMAINS.has(domain) ? (`${domain}:propose` as McpScope) : null, read: `${domain}:read` as McpScope }));
}
