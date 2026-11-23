import assert from "node:assert/strict";
import { test } from "node:test";

import { CHECKS, NOT_YET, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";
import type { TraceEvent } from "./lib/trace-log";

/**
 * agent-design AG17 (eval/README.md §3.2 `mcp_result_excludes`, `http_status`, `pages_read`; §3.4 `mcp_collected`,
 * `mcp_result_has`, `mcp_tool_list`): the checks read what the simulated external agent logged — every tool call and
 * its answer, the tool lists and the paging — never the product's own account of it.
 */

const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };
const IDS: Record<string, string> = { M32: "note:m32", MB1: "note:mb1", T42: "task:t42", TB1: "task:tb1" };
let seq = 0;
const event = (type: string, extra: Record<string, unknown>): TraceEvent => ({ at: "2026-11-15T01:00:00.000Z", caseId: "AE-MCP-T", origin: "runner", realAt: "2026-11-19T00:00:00.000Z", seq: (seq += 1), type, ...extra }) as TraceEvent;
const response = (status: number, result: Record<string, unknown> | null, extra: Record<string, unknown> = {}) => event("mcp.response", { as: "conn-claude", error: null, isError: result ? false : null, result, status, tool: "search_records", ...extra });
const obs = (events: TraceEvent[]): Observation => ({
  account: "A", accounts: { A: "user_a", B: "user_b" }, answers: [], businessChanges: [], cards: [], caseId: "AE-MCP-T", clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events, fake: false,
  fixtureIdOf: (id) => Object.entries(IDS).find(([, product]) => product === id)?.[0] ?? null, idMap: IDS, reads: [], requests: [], unsupported: [],
});

test("the four MCP checks and pages_read are implemented", () => {
  for (const name of ["mcp_collected", "mcp_result_excludes", "mcp_result_has", "mcp_tool_list", "pages_read"]) {
    assert.equal(NOT_YET[name], undefined, name);
    assert.equal(typeof CHECKS[name], "function", name);
  }
});

test("http_status judges the last tool call of the external agent, not a later housekeeping read of the runner", () => {
  const events = [response(200, { records: [] }), response(403, null, { error: { code: -32003 } }), event("http.response", { path: "/api/agent/ledger/x", status: 200 })];
  assert.equal(CHECKS.http_status(403, obs(events), context).status, "pass");
  assert.equal(CHECKS.http_status(200, obs(events), context).status, "fail");
  // Without any tool call it is the last HTTP response, as before.
  assert.equal(CHECKS.http_status(409, obs([event("http.response", { status: 409 })]), context).status, "pass");
});

test("mcp_result_excludes looks at every tool answer: texts anywhere, fixture ids as record ids", () => {
  const clean = [response(200, { records: [{ id: "task:t42", user_data: { title: "给小林发修订报价" } }] }), response(403, null, { error: { message: "Missing: contacts:read" } })];
  assert.equal(CHECKS.mcp_result_excludes(["kobayashi@hokushin.example.test", "小林诚", "TB1", "MB1"], obs(clean), context).status, "pass");
  // A text that appears in an earlier answer, not only in the last one.
  const leakedText = [response(200, { records: [{ id: "task:t42", user_data: { title: "给小林诚回电" } }] }), response(200, { records: [] })];
  assert.equal(CHECKS.mcp_result_excludes(["小林诚"], obs(leakedText), context).status, "fail");
  // Another account's record, by its product id.
  const leakedRecord = [response(200, { records: [{ id: "task:tb1", user_data: { title: "x" } }] })];
  const found = CHECKS.mcp_result_excludes(["TB1"], obs(leakedRecord), context);
  assert.equal(found.status, "fail");
  assert.match(found.detail, /TB1/u);
  // An error body counts too.
  assert.equal(CHECKS.mcp_result_excludes(["销售总监"], obs([response(403, null, { error: { message: "销售总监" } })]), context).status, "fail");
  // The three letters of a fixture id inside an opaque cursor or a proposal id are not that record.
  const opaque = [response(200, { next_cursor: "abcTB1xyzMB1", records: [] }), response(200, { confirm_url: "https://orbit.example.test/app/agent/proposals/prop_xxTB1xx", proposal_id: "prop_xxTB1xx" })];
  assert.equal(CHECKS.mcp_result_excludes(["TB1", "MB1"], obs(opaque), context).status, "pass");
  // No tool call at all: nothing to judge.
  assert.equal(CHECKS.mcp_result_excludes(["x"], obs([]), context).status, "cannot_judge");
});

test("mcp_result_has: present means there and not empty; a time is compared as an instant, within the moving eval clock", () => {
  const proposed = [response(200, { confirm_url: "https://orbit.example.test/app/agent/proposals/prop_a", expires_at: "2026-11-16T01:00:03.512Z", proposal_id: "prop_a" })];
  assert.equal(CHECKS.mcp_result_has({ confirm_url: "present", expires_at: "2026-11-16T10:00:00+09:00", proposal_id: "present" }, obs(proposed), context).status, "pass");
  // The eval clock starts at the case's time and moves with real time; a proposal made a few seconds into the case ends a few seconds after the hour.
  assert.equal(CHECKS.mcp_result_has({ expires_at: "2026-11-16T10:03:00+09:00" }, obs(proposed), context).status, "fail");
  assert.equal(CHECKS.mcp_result_has({ expires_at: "2026-11-23T10:00:00+09:00" }, obs(proposed), context).status, "fail");
  assert.equal(CHECKS.mcp_result_has({ proposal_id: "present" }, obs([response(200, { proposal_id: "" })]), context).status, "fail");
  assert.equal(CHECKS.mcp_result_has({ status: "expired" }, obs([response(200, { status: "awaiting_confirmation" }), response(200, { status: "expired" })]), context).status, "pass");
  assert.equal(CHECKS.mcp_result_has({ status: "expired" }, obs([response(200, { status: "expired" }), response(401, null)]), context).status, "fail", "the last answer is judged");
});

test("mcp_tool_list: the connection's list is exactly the named tools", () => {
  const events = [event("mcp.tools", { as: "conn-codex", status: 200, tools: [{ name: "search_records" }, { name: "get_record" }] }), event("mcp.tools", { as: "conn-claude", status: 200, tools: [{ name: "search_records" }, { name: "get_record" }, { name: "propose_change" }, { name: "get_proposal" }] })];
  assert.equal(CHECKS.mcp_tool_list({ as: "conn-codex", tools: ["search_records", "get_record"] }, obs(events), context).status, "pass");
  assert.equal(CHECKS.mcp_tool_list({ as: "conn-codex", tools: ["search_records", "get_record", "propose_change"] }, obs(events), context).status, "fail");
  assert.equal(CHECKS.mcp_tool_list({ as: "conn-claude", tools: ["get_proposal", "propose_change", "get_record", "search_records"] }, obs(events), context).status, "pass", "order does not matter");
  assert.equal(CHECKS.mcp_tool_list({ as: "conn-other", tools: [] }, obs(events), context).status, "cannot_judge");
});

test("mcp_collected and pages_read judge the latest paging: how many, how many twice, which records, how many pages", () => {
  const events = [event("mcp.paginate", { as: "rconn-claude", complete: true, duplicates: 0, ids: ["note:m32", "task:t42", "note:x1"], pages: 2 })];
  assert.equal(CHECKS.mcp_collected({ count: 3, duplicates: 0, includes: ["M32", "T42"] }, obs(events), context).status, "pass");
  assert.equal(CHECKS.mcp_collected({ count: 4, duplicates: 0 }, obs(events), context).status, "fail");
  assert.equal(CHECKS.mcp_collected({ count: 3, duplicates: 0, includes: ["MB1"] }, obs(events), context).status, "fail");
  const twice = [event("mcp.paginate", { as: "x", complete: true, duplicates: 1, ids: ["note:m32", "note:m32"], pages: 2 })];
  assert.equal(CHECKS.mcp_collected({ count: 2, duplicates: 0 }, obs(twice), context).status, "fail");
  assert.equal(CHECKS.mcp_collected({ count: 3, duplicates: 0 }, obs([event("mcp.paginate", { as: "x", complete: false, duplicates: 0, ids: ["a", "b", "c"], pages: 2 })]), context).status, "fail", "stopped before the last page");
  assert.equal(CHECKS.pages_read({ min: 2 }, obs(events), context).status, "pass");
  assert.equal(CHECKS.pages_read({ min: 3 }, obs(events), context).status, "fail");
  assert.equal(CHECKS.pages_read({ min: 2 }, obs([]), context).status, "cannot_judge");
  assert.equal(CHECKS.mcp_collected({ count: 0, duplicates: 0 }, obs([]), context).status, "cannot_judge");
});

test("mcp_result_excludes also reads every cursor the way a client could: decoded, it must not hold an account, a workspace or a record of the fixture", () => {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const withCursor = (cursor: string) => obs([response(200, { next_cursor: cursor, records: [{ id: "task:t42" }] })]);
  // The shape the read adapters use inside Orbit: readable claims and a signature.
  const leaking = CHECKS.mcp_result_excludes(["TB1"], withCursor(`${b64({ position: "[\"2026-11-12\",\"note:m32\"]", scope: { actorId: "user_a", workspaceId: "workspace:agent-eval" } })}.c2lnbmF0dXJl`), context);
  assert.equal(leaking.status, "fail");
  assert.match(leaking.detail, /cursor/u);
  assert.match(leaking.detail, /user_a/u);
  // A record id alone, or the workspace alone, is enough.
  assert.equal(CHECKS.mcp_result_excludes([], withCursor(b64({ after: "task:t42" })), context).status, "fail");
  assert.equal(CHECKS.mcp_result_excludes([], withCursor(b64({ w: "workspace:agent-eval" })), context).status, "fail");
  assert.equal(CHECKS.mcp_result_excludes([], withCursor(b64({ at: "2026-11-12T09:40:00.000Z" })), context).status, "fail", "a readable time is a position");
  // Opaque bytes say nothing.
  assert.equal(CHECKS.mcp_result_excludes(["TB1"], withCursor("AfQ3k9ZxT0mVb2c8Jw1hYpLr7uNs5eKd4gHa6iOqPzXyWvUtSr"), context).status, "pass");
});

test("mcp_result_excludes: a connection's answers carry no id of a kind it was not granted (relations included)", () => {
  const connect = (granted: string[]) => event("mcp.connect", { as: "conn-claude", steps: [{ granted, step: "consent (the signed-in user)" }] });
  const memo = { records: [{ contact_ids: ["contact:c17"], event_refs: ["private_event:p1"], id: "note:m32", type: "memo", user_data: { body: "b" } }] };
  // Notes only: a contact id and an event id in a note are ids of kinds it may not read.
  const narrow = CHECKS.mcp_result_excludes([], obs([connect(["memos:read"]), response(200, memo)]), context);
  assert.equal(narrow.status, "fail");
  assert.match(narrow.detail, /contacts/u);
  assert.match(narrow.detail, /events/u);
  // Granted, the same answer is fine.
  assert.equal(CHECKS.mcp_result_excludes([], obs([connect(["memos:read", "contacts:read", "events:read"]), response(200, memo)]), context).status, "pass");
  // A relation field to an ungranted kind fails even when its value is not in a known id form.
  assert.equal(CHECKS.mcp_result_excludes([], obs([connect(["memos:read"]), response(200, { records: [{ contact_ids: ["x1"], id: "note:m32" }] })]), context).status, "fail");
  // The connection's own kind is never flagged.
  assert.equal(CHECKS.mcp_result_excludes([], obs([connect(["memos:read"]), response(200, { records: [{ id: "note:m32" }] })]), context).status, "pass");
});
