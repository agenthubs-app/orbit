import assert from "node:assert/strict";
import test from "node:test";

import { domainOf, MCP_SCOPES, scopeCatalogue, toolsFor } from "../../../features/agent-v1/mcp/scopes";
import { consentView } from "../../../features/agent-v1/mcp/views";
import { memo } from "../read-kit";
import { A, mcpKit, world } from "./kit";

/**
 * agent-design AG17-1, AG17-2 (设计稿 §5.4「工具只有四个」「授权范围」; PLANNER 易错边界 5, 8): the tool list a
 * connection sees follows its scopes; calling past the list is refused the same way; the annotations; both spellings
 * of a domain; paging with the cursor.
 */

const names = (response: { body: Record<string, any> | null }) => (response.body?.result.tools as { name: string }[]).map((tool) => tool.name);

test("the tool list is filtered by what was granted", async () => {
  const kit = mcpKit();
  // One connection per client per account (approved draft, board 3): each authorisation below changes the same
  // connection, so each list is read right after its own authorisation.
  const all = await kit.connect({ scopes: ["memos:read", "todos:read", "todos:propose", "proposals:read"] });
  assert.deepEqual(names(await kit.rpc(all.accessToken, "tools/list")), ["search_records", "get_record", "propose_change", "get_proposal"]);
  const readOnly = await kit.connect({ scopes: ["todos:read"] });
  assert.deepEqual(names(await kit.rpc(readOnly.accessToken, "tools/list")), ["search_records", "get_record"]);
  const proposeOnly = await kit.connect({ scopes: ["todos:propose"] });
  assert.deepEqual(names(await kit.rpc(proposeOnly.accessToken, "tools/list")), ["propose_change"]);
  const receiptsOnly = await kit.connect({ scopes: ["memos:read", "proposals:read"] });
  assert.deepEqual(names(await kit.rpc(receiptsOnly.accessToken, "tools/list")), ["search_records", "get_record", "get_proposal"]);
  assert.deepEqual(toolsFor([]), []);
  assert.deepEqual(toolsFor(["proposals:read"]), ["get_proposal"]);
});

test("calling a tool that is not on the connection's list is refused by scope, not by the list", async () => {
  const kit = mcpKit();
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const readOnly = await kit.connect({ scopes: ["todos:read"] });
  const propose = await kit.call(readOnly.accessToken, "propose_change", { idempotencyKey: "ext-ro-001", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: task.id }] });
  assert.equal(propose.status, 403);
  assert.match(propose.headers.get("www-authenticate") ?? "", /error="insufficient_scope", scope="todos:propose"/u);
  assert.equal((await kit.cards.runtime.listActions({})).length, 0, "no card");
  const receipt = await kit.call(readOnly.accessToken, "get_proposal", { proposal: "prop_x" });
  assert.equal(receipt.status, 403);
  assert.match(receipt.headers.get("www-authenticate") ?? "", /scope="proposals:read"/u);
  // Even unreadable arguments do not get past the scope check.
  assert.equal((await kit.call(readOnly.accessToken, "propose_change", { nonsense: true })).status, 403);
  // A memo proposal needs the memo scope, whatever else the connection may propose.
  const todosOnly = await kit.connect({ scopes: ["todos:propose"] });
  const memoProposal = await kit.call(todosOnly.accessToken, "propose_change", { idempotencyKey: "m1", operations: [{ op: "memo.create", set: { body: "正文", title: "标题" } }] });
  assert.equal(memoProposal.status, 403);
  assert.match(memoProposal.headers.get("www-authenticate") ?? "", /scope="memos:propose"/u);
  const unknown = await kit.call(readOnly.accessToken, "confirm_proposal", { proposal: "prop_x" });
  assert.equal(unknown.body?.error.code, -32602);
});

test("annotations: the three read tools are read-only; propose_change is not read-only, not destructive, idempotent; none reaches outside", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: [...MCP_SCOPES] });
  const tools = (await kit.rpc(tokens.accessToken, "tools/list")).body?.result.tools as { name: string; title: string; description: string; inputSchema: { type: string; additionalProperties: boolean }; annotations: Record<string, unknown> }[];
  assert.equal(tools.length, 4);
  for (const tool of tools) {
    assert.ok(tool.title && tool.annotations.title, `${tool.name} has a title`);
    assert.equal(tool.annotations.openWorldHint, false);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, tool.name !== "propose_change", `${tool.name}: read-only unless it proposes`);
  }
  assert.equal(tools.find((tool) => tool.name === "propose_change")!.annotations.idempotentHint, true);
});

test("a domain may be written in the singular or the plural; both need the same scope", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["memos:read", "todos:read", "contacts:read", "schedule:read"] });
  for (const [domain, id] of [["todos", "task:t42"], ["todo", "task:t42"], ["memos", "note:m32"], ["memo", "note:m32"], ["contacts", "contact:c17"], ["contact", "contact:c17"], ["schedule", "personal:s10"]] as const) {
    const found = await kit.call(tokens.accessToken, "search_records", { domain });
    assert.equal(found.isError, false, `search ${domain}`);
    assert.ok(found.data!.records.some((record: { id: string }) => record.id === id), `${domain} lists ${id}`);
    const one = await kit.call(tokens.accessToken, "get_record", { id, type: domain });
    assert.equal(one.data!.record.id, id, `get ${domain}`);
  }
  assert.deepEqual(domainOf("Memo"), { domain: "memos", kind: "domain" });
  assert.deepEqual(domainOf("memory"), { kind: "never" });
  assert.deepEqual(domainOf("spreadsheet"), { kind: "unknown" });
  const none = await kit.connect({ scopes: ["todos:read"] });
  for (const domain of ["memo", "memos"]) assert.equal((await kit.call(none.accessToken, "search_records", { domain })).status, 403);
});

test("search finds by words, only among the account's own records", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["memos:read", "todos:read"] });
  const todos = await kit.call(tokens.accessToken, "search_records", { domain: "todos", query: "小林" });
  assert.deepEqual(todos.data!.records.map((record: { id: string }) => record.id), ["task:t42"], "B's «给小林诚回电» is not found");
  const first = todos.data!.records[0];
  assert.equal(first.type, "todo");
  assert.equal(first.status, "open");
  assert.equal(first.planned_date, "2026-11-18");
  assert.equal(first.user_data.title, "给小林发修订报价");
  const theirs = await kit.call(tokens.accessToken, "get_record", { id: "task:tb1", type: "todo" });
  assert.equal(theirs.isError, true);
  assert.equal(theirs.data!.error.code, "not_found");
  const missing = await kit.call(tokens.accessToken, "get_record", { id: "note:nope", type: "memo" });
  assert.equal(missing.data!.error.code, "not_found");
});

test("paging: ten at a time, the cursor walks every record once, and a cursor does not work for another query", async () => {
  const many = Array.from({ length: 34 }, (_, index) => memo(A, `note:gen${String(index).padStart(2, "0")}`, `第 ${index} 篇`, new Date(Date.UTC(2026, 0, 1 + index)).toISOString()));
  const kit = mcpKit({ records: world(many) });
  const tokens = await kit.connect({ scopes: ["memos:read"] });
  const seen: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await kit.call(tokens.accessToken, "search_records", { domain: "memo", ...(cursor ? { cursor } : {}) });
    assert.equal(page.isError, false);
    assert.ok(page.data!.records.length <= 10);
    seen.push(...page.data!.records.map((record: { id: string }) => record.id));
    cursor = page.data!.next_cursor;
    pages += 1;
  } while (cursor && pages < 20);
  assert.equal(pages, 4);
  assert.equal(seen.length, 37);
  assert.equal(new Set(seen).size, 37, "no record twice");
  assert.ok(!seen.includes("note:mb1"), "none of account B's");

  const firstPage = await kit.call(tokens.accessToken, "search_records", { domain: "memo" });
  const wrong = await kit.call(tokens.accessToken, "search_records", { cursor: firstPage.data!.next_cursor, domain: "memo", query: "小林" });
  assert.equal(wrong.isError, true, "a cursor is sealed to its own query");
  assert.equal((await kit.call(tokens.accessToken, "search_records", { domain: "memo", limit: 50 })).isError, true, "no page larger than ten");
  assert.equal((await kit.call(tokens.accessToken, "search_records", { domain: "memo", limit: 3 })).data!.records.length, 3);
});

test("inputs are strict: an unknown field or a missing one is an error result, not a guess", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["memos:read"] });
  assert.equal((await kit.call(tokens.accessToken, "search_records", { domain: "memos", everything: true })).data!.error.code, "invalid_arguments");
  assert.equal((await kit.call(tokens.accessToken, "search_records", {})).data!.error.code, "invalid_arguments");
  assert.equal((await kit.call(tokens.accessToken, "get_record", { type: "memo" })).data!.error.code, "invalid_arguments");
  assert.equal((await kit.call(tokens.accessToken, "search_records", { domain: "spreadsheet" })).data!.error.code, "invalid_arguments");
});

test("the consent page offers «可以提修改» only where a proposal can be prepared", () => {
  const catalogue = Object.fromEntries(scopeCatalogue().map((option) => [option.domain, option.propose]));
  assert.deepEqual(catalogue, { attendance: null, contacts: null, events: null, memos: "memos:propose", schedule: null, todos: "todos:propose" });
  assert.ok(MCP_SCOPES.includes("proposals:read"));
});

test("the consent page pre-selects read scopes only: «可以提修改» is always the user's own tick, even when the client asked for it", () => {
  const view = consentView({ clientId: "https://claude.ai/oauth/claude-code-client-metadata", clientName: "Claude Code", codeChallenge: "x", redirectUri: "http://127.0.0.1:53111/callback", scopes: ["todos:read", "todos:propose", "memos:propose", "proposals:read"] });
  assert.deepEqual(view.requestedScopes, ["todos:read", "todos:propose", "memos:propose", "proposals:read"]);
  assert.deepEqual(view.preselectedScopes, ["todos:read", "proposals:read"]);
  // The page names the host the client's document lives on, and warns when the browser goes back to this machine.
  assert.equal(view.clientHost, "claude.ai");
  assert.equal(view.redirectHost, "127.0.0.1");
  assert.equal(view.redirectIsLoopback, true);
  assert.equal(consentView({ clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata", clientName: "Claude", codeChallenge: "x", redirectUri: "https://claude.ai/api/mcp/auth_callback", scopes: [] }).redirectIsLoopback, false);
});
