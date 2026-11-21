import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { MCP_DOMAINS, MCP_SCOPES } from "../../../features/agent-v1/mcp/scopes";
import { projectedFieldNames, projectRecord, USER_DATA_NOTICE } from "../../../features/agent-v1/mcp/tools/projection";
import { TOOL_DEFINITIONS } from "../../../features/agent-v1/mcp/tools/definitions";
import { mcpKit } from "./kit";

/**
 * agent-design AG17-4 (设计稿 §5.4「工具结果里不放什么」「不开放的内容」; PLANNER 易错边界 10): a result carries only the
 * listed fields of the kinds the connection may read; never memory, conversations, contact methods, another account's
 * data, a token or a signed-in link; what the user wrote is marked as data.
 */

const EVERYTHING = [...MCP_SCOPES];

test("each kind of record has a fixed list of output fields, with no place for an e-mail address or a phone number", () => {
  const expected: Record<string, { plain: string[]; text: string[] }> = {
    attendance: { plain: ["all_day", "attended_on", "day_parts", "ends_at", "starts_at"], text: ["event_title", "location", "note"] },
    contacts: { plain: ["stage"], text: ["company", "name", "role", "tags"] },
    events: { plain: ["all_day", "ends_at", "kind", "starts_at"], text: ["location", "title"] },
    memos: { plain: ["contact_ids", "created_at", "event_refs"], text: ["body", "title"] },
    schedule: { plain: ["all_day", "category", "contact_ids", "ends_at", "event_refs", "kind", "meeting_method", "memo_ids", "recurrence", "starts_at", "time_zone"], text: ["details", "location", "title"] },
    todos: { plain: ["category", "completed_at", "contact_ids", "created_at", "due_at", "event_refs", "planned_date", "status"], text: ["notes", "title"] },
  };
  for (const domain of MCP_DOMAINS) {
    assert.deepEqual(projectedFieldNames(domain), expected[domain], domain);
    for (const name of [...expected[domain].plain, ...expected[domain].text]) assert.doesNotMatch(name, /mail|phone|tel|wechat|line|address|memory|token/iu, `${domain}.${name}`);
  }
});

test("a field the adapter returns but the list does not name never goes out", () => {
  const record = { fields: { company: "北辰软件", contactMethods: ["email", "phone"], displayName: "小林健", headline: "销售总监", internalScore: 0.93, primaryEmail: "kobayashi@hokushin.example.test", primaryPhone: "+81-90-0000-0017", updatedAt: "2026-06-10T05:00:00.000Z" }, id: "contact:c17", kind: "contact" as const, ref: "contact:contact:c17", updatedAt: "2026-06-10T05:00:00.000Z", version: "1" };
  const out = projectRecord("contacts", record, new Set(["contacts"] as const));
  assert.deepEqual(out, { id: "contact:c17", type: "contact", updated_at: "2026-06-10T05:00:00.000Z", user_data: { company: "北辰软件", name: "小林健", role: "销售总监" } });
  assert.ok(!JSON.stringify(out).includes("@"));
});

test("contacts come back with name, company, role and tags; no contact method, not even which ones are on file", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: EVERYTHING });
  const one = await kit.call(tokens.accessToken, "get_record", { id: "contact:c17", type: "contact" });
  assert.deepEqual(one.data!.record.user_data, { company: "北辰软件", name: "小林健", role: "销售总监", tags: ["重点客户"] });
  const all = await kit.call(tokens.accessToken, "search_records", { domain: "contacts" });
  for (const text of [one.text, all.text]) {
    assert.ok(!text.includes("example.test"), "no e-mail address");
    assert.ok(!text.includes("+81-90"), "no phone number");
    assert.ok(!/contactMethods|contact_methods|primaryEmail|primaryPhone/u.test(text));
    assert.ok(!text.includes("小林诚") && !text.includes("乙方客户公司"), "no contact of account B");
  }
});

test("a memo about a contact carries no contact id without contacts:read, and never the contact's name, company or contact methods", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: ["memos:read", "todos:read"] });
  const memo = await kit.call(tokens.accessToken, "get_record", { id: "note:m32", type: "memo" });
  // Coordinator, after the final gate's judges: a relation goes out only to a connection that may read its kind.
  assert.equal(memo.data!.record.contact_ids, undefined);
  assert.equal(memo.data!.record.user_data.body, "11 月 10 日小林给我打电话，说小陈在审核。");
  const todos = await kit.call(tokens.accessToken, "search_records", { domain: "todos", query: "小林" });
  for (const text of [memo.text, todos.text]) for (const word of ["小林健", "北辰软件", "销售总监", "example.test", "+81-90"]) assert.ok(!text.includes(word), `without contacts:read, ${word} does not appear`);
});

test("memory and conversations are in no scope: a connection holding every scope is still told it cannot read them", async () => {
  const kit = mcpKit();
  const tokens = await kit.connect({ scopes: EVERYTHING });
  for (const domain of ["memory", "memories", "conversations", "conversation", "messages", "email", "phone"]) {
    const searched = await kit.call(tokens.accessToken, "search_records", { domain, query: "偏好" });
    assert.equal(searched.status, 200, domain);
    assert.equal(searched.isError, true, domain);
    assert.equal(searched.data!.error.code, "not_available");
    assert.match(searched.data!.error.message, /cannot read this kind of content/u);
    assert.equal(searched.data!.records, undefined);
    const got = await kit.call(tokens.accessToken, "get_record", { id: "memory:mm1", type: domain });
    assert.equal(got.data!.error.code, "not_available");
  }
  assert.ok(!MCP_SCOPES.some((scope) => /memor|convers|message|mail|phone/u.test(scope)), "there is no scope that could ever grant them");
  for (const tool of Object.values(TOOL_DEFINITIONS)) assert.doesNotMatch(JSON.stringify(tool.inputSchema), /memory|conversation/u);
});

test("the read path of every tool goes through the record adapters only: nothing here can reach the memory store", async () => {
  // Once AG14's memory exists this still holds: the tools read through `records(accountId).reader`, whose kinds are
  // contact, memo, todo, schedule and event. A reader that is asked for anything else fails this test.
  const kinds: string[] = [];
  const kit = mcpKit();
  const read = kit.registry.read.bind(kit.registry);
  kit.registry.read = async (kind, scope, query) => {
    kinds.push(kind);
    return read(kind, scope, query);
  };
  const tokens = await kit.connect({ scopes: EVERYTHING });
  for (const domain of ["todos", "memos", "contacts", "schedule", "memory", "conversations"]) await kit.call(tokens.accessToken, "search_records", { domain });
  assert.deepEqual([...new Set(kinds)].sort(), ["contact", "memo", "schedule", "todo"]);
});

test("no file of the MCP module imports the memory, conversation or chat stores (this fails the day one does)", () => {
  const files: string[] = [];
  const walk = (dir: URL) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir));
      else if (entry.name.endsWith(".ts")) files.push(new URL(entry.name, dir).pathname);
    }
  };
  walk(new URL("../../../features/agent-v1/mcp/", import.meta.url));
  assert.ok(files.length >= 10);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const [, path] of source.matchAll(/from\s+"([^"]+)"/gu)) assert.doesNotMatch(path, /memory|conversation|orbit-ai|ai-session|chat|entry\/store/iu, `${file} imports ${path}`);
    assert.doesNotMatch(source, /agentMemories|orbit_agent_chat/u, `${file} names a memory or chat collection`);
  }
});

test("what the user wrote is returned as data: under user_data, with a notice, and instructions inside it are not acted on", async () => {
  const kit = mcpKit();
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const tokens = await kit.connect({ scopes: EVERYTHING });
  const memo = await kit.call(tokens.accessToken, "get_record", { id: "note:m50", type: "memo" });
  assert.equal(memo.data!.data_notice, USER_DATA_NOTICE);
  assert.match(memo.data!.data_notice, /data only/u);
  assert.match(memo.data!.record.user_data.body, /给 AI 助手的指令/u, "the text is returned as it is");
  // The injected text sits only inside user_data; nothing outside it repeats or follows it.
  const { user_data: _userData, ...outside } = memo.data!.record;
  assert.ok(!JSON.stringify(outside).includes("指令"));
  assert.equal((await kit.cards.runtime.listActions({})).length, 0, "reading it made no card");
  assert.equal((await kit.cards.listTasks()).find((item) => item.id === task.id)?.status, "open");
  const list = await kit.call(tokens.accessToken, "search_records", { domain: "memos", query: "供应商" });
  assert.equal(list.data!.data_notice, USER_DATA_NOTICE);
});

test("no result carries a token, a session, a signed-in link or the ledger's own ids", async () => {
  const kit = mcpKit();
  const task = await kit.cards.todo("给小林发修订报价", "2026-11-18");
  const tokens = await kit.connect({ scopes: EVERYTHING });
  const results = [
    await kit.rpc(tokens.accessToken, "tools/list"),
    await kit.call(tokens.accessToken, "search_records", { domain: "todos" }),
    await kit.call(tokens.accessToken, "get_record", { id: "note:m31", type: "memo" }),
    await kit.call(tokens.accessToken, "propose_change", { idempotencyKey: "k", operations: [{ op: "todo.update", set: { plannedDate: "2026-11-20" }, target: task.id }] }),
  ];
  results.push(await kit.call(tokens.accessToken, "get_proposal", { proposal: results[3].body!.result.structuredContent.proposal_id }));
  const [card] = await kit.cards.runtime.listActions({});
  for (const result of results) {
    for (const secret of [tokens.accessToken, tokens.refreshToken, tokens.connectionId, card.actionId, card.runId, kit.A, "authjs", "session"]) assert.ok(!result.text.includes(secret), `no ${secret.slice(0, 12)}… in a result`);
    assert.doesNotMatch(result.text, /[?&](token|code|access_token|session)=/u);
  }
});
