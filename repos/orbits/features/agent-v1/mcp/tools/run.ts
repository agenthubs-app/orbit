/**
 * agent-design AG17 (设计稿 §5.4): the four tools. Reads go through the same read adapters the Agent uses (the account's
 * own records, a field list per kind, ten records a page and a sealed cursor) and are then projected again for the
 * outside (projection.ts). A proposal becomes a waiting card; nothing here writes a business record or decides a card.
 *
 * What a call may do is decided from the connection's scopes as stored now, not from the token and not from the tool
 * list the client happened to see.
 */
import type { CardOperationIntent } from "../../../agent/runtime/card-operations";
import type { DomainReader, DomainScope } from "../../domains/types";
import type { McpAddresses } from "../auth/config";
import type { ProposalService } from "../confirm-link";
import type { AgentConnection } from "../connections";
import { domainOf, KIND_OF_DOMAIN, MCP_DOMAINS, PROPOSABLE_OPERATIONS, PROPOSALS_READ, readScopeOf, TOOL_NAMES, type McpDomain, type McpScope, type McpToolName } from "../scopes";
import { getProposalInput, getRecordInput, inputProblem, proposeChangeInput, searchRecordsInput, type ProposedOperation } from "./definitions";
import type { CursorSealer } from "./cursor";
import { projectRecord, USER_DATA_NOTICE } from "./projection";

export type ToolOutcome =
  /** HTTP 200 with the tool's result. `count` is how many records went back (for the call log). */
  | { kind: "result"; payload: Record<string, unknown>; count: number }
  /** HTTP 200 with isError: the call was understood and cannot be done (bad arguments, nothing found, not readable at all). */
  | { kind: "tool_error"; code: string; message: string }
  /** HTTP 403 insufficient_scope, naming every scope this one call needs. */
  | { kind: "insufficient_scope"; scopes: McpScope[]; message: string }
  /** HTTP 401: the connection ended while the call ran. */
  | { kind: "revoked" }
  | { kind: "unknown_tool" };

export interface ToolDeps {
  /** The read adapters and the scope of one account (the server's own; a caller never supplies an account). */
  records: (accountId: string) => { reader: DomainReader; scope: DomainScope } | null;
  proposals: ProposalService;
  /** Seals the adapters' paging cursor for the outside (tools/cursor.ts); required — there is no plain cursor. */
  cursors: CursorSealer;
  now: () => string;
}

const NEVER_READABLE = "External connections cannot read this kind of content. Personal memory, conversations and contact details (e-mail, phone) are not available to any connection.";

const DOMAIN_WORDS: Record<McpDomain, string> = { attendance: "attendance notes", contacts: "contacts", events: "events", memos: "memos", schedule: "schedule items", todos: "to-dos" };

const STATUS_WORDS: Record<string, string> = {
  approved: "confirmed by the user; being carried out",
  awaiting_confirmation: "waiting for the user to confirm in Orbit",
  canceled: "canceled (the connection was revoked or the user stopped it); it will not be carried out",
  completed: "completed",
  deferred: "waiting for the user to confirm in Orbit",
  executing: "confirmed by the user; being carried out",
  expired: "expired; propose it again with propose_change if it is still wanted",
  failed: "confirmed by the user, but it could not be carried out",
  partially_failed: "confirmed by the user; some items could not be carried out",
  rejected: "rejected by the user; nothing was changed",
  undone: "undone by the user",
};

const BAD_CURSOR = "The cursor is not valid for this connection and query (or it has expired). Start again without a cursor.";

const lacks = (connection: AgentConnection, scope: McpScope) => !connection.scopes.includes(scope);

/** The kinds this connection may read now: a relation to any other kind is left out of what it reads. */
const readableDomains = (connection: AgentConnection): ReadonlySet<McpDomain> => new Set(MCP_DOMAINS.filter((domain) => !lacks(connection, readScopeOf(domain))));

function missingScope(scopes: McpScope[], what: string): ToolOutcome {
  return { kind: "insufficient_scope", message: `This connection is not allowed to ${what}. Missing: ${scopes.join(", ")}. The user can allow it in Orbit by connecting again and choosing it.`, scopes };
}

/** Attendance notes and events share one read adapter; the id says which a record is. */
const isAttendanceId = (id: string) => id.startsWith("attendance:");

function intentOf(operation: ProposedOperation): CardOperationIntent {
  if (operation.op === "todo.update") return { capability: "todo.update", set: { ...operation.set }, targetId: operation.target };
  if (operation.op === "todo.create") return { capability: "todo.create", set: { ...operation.set } };
  // A plain memo: the user's own records are linked later, by the user, in Orbit.
  return { capability: "memo.create", set: { body: operation.set.body, contactIds: [], names: {}, title: operation.set.title } };
}

/** The `op` names in arguments that may not have passed the input check yet. */
function rawOperationNames(args: unknown): string[] {
  const operations = (args as { operations?: unknown } | null)?.operations;
  return Array.isArray(operations) ? operations.map((operation) => (operation as { op?: unknown } | null)?.op).filter((op): op is string => typeof op === "string") : [];
}

export async function runTool(deps: ToolDeps, input: { connection: AgentConnection; addresses: McpAddresses; name: string; args: unknown }): Promise<ToolOutcome> {
  const { connection } = input;
  if (!(TOOL_NAMES as readonly string[]).includes(input.name)) return { kind: "unknown_tool" };
  const name = input.name as McpToolName;
  const args = input.args ?? {};

  if (name === "search_records" || name === "get_record") {
    const parsed = name === "search_records" ? searchRecordsInput.safeParse(args) : getRecordInput.safeParse(args);
    if (!parsed.success) return { code: "invalid_arguments", kind: "tool_error", message: inputProblem(parsed.error) };
    const named = domainOf(name === "search_records" ? (parsed.data as { domain: string }).domain : (parsed.data as { type: string }).type);
    if (named.kind === "never") return { code: "not_available", kind: "tool_error", message: NEVER_READABLE };
    if (named.kind === "unknown") return { code: "invalid_arguments", kind: "tool_error", message: "Unknown kind of record. Use one of: todos, memos, contacts, schedule, events, attendance." };
    const domain = named.domain;
    if (lacks(connection, readScopeOf(domain))) return missingScope([readScopeOf(domain)], `read ${DOMAIN_WORDS[domain]}`);
    const access = deps.records(connection.accountId);
    if (!access) return { code: "unavailable", kind: "tool_error", message: "Records cannot be read right now." };
    try {
      if (name === "get_record") {
        const { id } = parsed.data as { id: string };
        // An id of the other kind behind the same adapter is not this kind's record.
        if ((domain === "attendance") !== isAttendanceId(id) && (domain === "attendance" || domain === "events")) return { code: "not_found", kind: "tool_error", message: "No such record." };
        const page = await access.reader.read(KIND_OF_DOMAIN[domain], access.scope, { id });
        const record = page.items[0];
        if (!record) return { code: "not_found", kind: "tool_error", message: "No such record." };
        return { count: 1, kind: "result", payload: { data_notice: USER_DATA_NOTICE, record: projectRecord(domain, record, readableDomains(connection)) } };
      }
      const { contact, query, cursor, limit } = parsed.data as { contact?: string; query?: string; cursor?: string; limit?: number };
      if (domain === "attendance" || domain === "events") return { code: "not_searchable", kind: "tool_error", message: "These records can be read by id with get_record; they cannot be listed or searched here." };
      // AG21c (decision D3): a contact filter narrows notes to one person's. Only for memos, and only when the connection
      // may read contacts too (otherwise it would tell which people a note is linked to).
      if (contact !== undefined && domain !== "memos") return { code: "invalid_arguments", kind: "tool_error", message: "contact filters memos only." };
      if (contact !== undefined && lacks(connection, readScopeOf("contacts"))) return missingScope([readScopeOf("contacts")], "filter notes by a contact");
      // The client's cursor is opened for this connection, this kind of record and this query only; what it holds
      // (the adapters' own cursor) is then checked again by the adapters against the connection's account.
      const binding = { connectionId: connection.id, domain, query: `${query?.trim() ?? ""}${contact ? `\u0000contact:${contact}` : ""}` };
      const inner = cursor ? deps.cursors.open(cursor, binding) : null;
      if (cursor && !inner) return { code: "invalid_arguments", kind: "tool_error", message: BAD_CURSOR };
      const page = await access.reader.read(KIND_OF_DOMAIN[domain], access.scope, { ...(query?.trim() ? { text: query.trim() } : {}), ...(contact ? { contactId: contact } : {}), ...(inner ? { cursor: inner } : {}), ...(limit ? { limit } : {}) });
      const readable = readableDomains(connection);
      const records = page.items.map((record) => projectRecord(domain, record, readable));
      return {
        count: records.length,
        kind: "result",
        payload: { data_notice: USER_DATA_NOTICE, records, ...(page.nextCursor ? { next_cursor: deps.cursors.seal(page.nextCursor, binding) } : {}), ...(page.total !== undefined ? { total: page.total } : {}) },
      };
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      if (code === "READ_NOT_FOUND") return { code: "not_found", kind: "tool_error", message: "No such record." };
      if (code === "INVALID_READ_INPUT" || /CURSOR/u.test(code)) return { code: "invalid_arguments", kind: "tool_error", message: BAD_CURSOR };
      return { code: "unavailable", kind: "tool_error", message: "Records cannot be read right now." };
    }
  }

  if (name === "propose_change") {
    const parsed = proposeChangeInput.safeParse(args);
    // Checked before the arguments' problems are described: a connection that may not propose learns nothing more.
    const named = rawOperationNames(args).map((op) => (PROPOSABLE_OPERATIONS as Record<string, McpScope | undefined>)[op]).filter((scope): scope is McpScope => Boolean(scope));
    const wanted = named.length ? [...new Set(named)] : ([...new Set(Object.values(PROPOSABLE_OPERATIONS))] as McpScope[]);
    // With unreadable arguments, a connection that holds no propose scope at all is still told so first.
    const missing = named.length || !connection.scopes.some((scope) => scope.endsWith(":propose")) ? wanted.filter((scope) => lacks(connection, scope)) : [];
    if (missing.length) return missingScope(missing, "propose these changes");
    if (!parsed.success) return { code: "invalid_arguments", kind: "tool_error", message: `${inputProblem(parsed.error)}. A proposal carries only operations and idempotencyKey; nothing in it can confirm for the user.` };
    const outcome = await deps.proposals.propose({ connection, idempotencyKey: parsed.data.idempotencyKey, intents: parsed.data.operations.map(intentOf), request: parsed.data.operations });
    if (outcome.kind === "revoked") return { kind: "revoked" };
    if (outcome.kind === "conflict") return { code: "idempotency_conflict", kind: "tool_error", message: "This idempotencyKey was already used for a different proposal. Use a new key for a new proposal." };
    if (outcome.kind === "missing") return { code: "not_found", kind: "tool_error", message: "A record to change was not found. Nothing was proposed." };
    if (outcome.kind === "paused") return { code: "proposals_paused", kind: "tool_error", message: "Orbit is not taking new changes right now. Nothing was proposed and nothing was written; try again later." };
    if (outcome.kind === "too_many") return { code: "too_many_proposals", kind: "tool_error", message: `This connection already made ${outcome.limit} proposals in the last 24 hours. Ask the user to look at the ones that are waiting before proposing more.` };
    return {
      count: 0,
      kind: "result",
      payload: {
        confirm_url: deps.proposals.confirmUrl(input.addresses, outcome.proposal.id),
        expires_at: outcome.action.expiresAt ?? null,
        next_step: "Nothing has changed yet. Give the user the confirm_url: they sign in to Orbit, look at the change and confirm it there.",
        proposal_id: outcome.proposal.id,
      },
    };
  }

  // get_proposal
  if (lacks(connection, PROPOSALS_READ)) return missingScope([PROPOSALS_READ], "look at its proposals");
  const parsed = getProposalInput.safeParse(args);
  if (!parsed.success) return { code: "invalid_arguments", kind: "tool_error", message: inputProblem(parsed.error) };
  const receipt = await deps.proposals.receipt({ connection, proposalId: parsed.data.proposal });
  if (!receipt) return { code: "not_found", kind: "tool_error", message: "No such proposal for this connection." };
  return {
    count: 0,
    kind: "result",
    payload: {
      expires_at: receipt.expiresAt,
      items: receipt.items,
      proposal_id: receipt.proposal.id,
      status: receipt.status,
      status_text: STATUS_WORDS[receipt.status] ?? receipt.status,
    },
  };
}
