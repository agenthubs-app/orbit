/**
 * agent-design AG17 (approved visual draft, boards 1–4, 10; D1, D2, D9): the consent page — six kinds of record at
 * three levels, what the client asked to read pre-set to 只读 and «可以提修改» only by the user's own click; where a kind
 * cannot be changed yet the third level is off with the draft's line; the two fixed sentences; already connected: the
 * current choice as it is and only what is new marked; another account in between: the page comes again and says so.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { ConsentPage } from "../../app/(app)/app/orbit-2026/agent-connections/ConsentPage";
import { agentConnectionsCopy } from "../../app/(app)/app/orbit-2026/copy/agent-connections";
import { shellAppliesTo, shellFrameFor } from "../../app/(app)/app/orbit-2026/shell/shell-routes";
import type { AgentConnectionConsentContract } from "../../shared/contract/agent-v1";

(globalThis as { self?: unknown }).self ??= globalThis;

const OPTIONS = [
  { domain: "contacts", propose: null, read: "contacts:read" },
  { domain: "events", propose: null, read: "events:read" },
  { domain: "attendance", propose: null, read: "attendance:read" },
  { domain: "todos", propose: "todos:propose", read: "todos:read" },
  { domain: "memos", propose: "memos:propose", read: "memos:read" },
  { domain: "schedule", propose: null, read: "schedule:read" },
] as const;

const first: AgentConnectionConsentContract = {
  account: { email: "agent-eval-l@orbit.test", key: "acct_l", name: "测试用户L" },
  clientHost: "claude.ai",
  clientName: "Claude",
  current: null,
  options: OPTIONS,
  preselectedScopes: ["contacts:read", "todos:read", "memos:read", "proposals:read"],
  redirectHost: "claude.ai",
  redirectIsLoopback: false,
  requestedScopes: ["contacts:read", "todos:read", "memos:read", "proposals:read", "todos:propose"],
};
const textOf = (html: string) => html.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

const levelOf = (renderer: ReactTestRenderer, domain: string) => renderer.root.find((node) => node.props["data-consent-domain"] === domain).findAll((node) => node.type === "button" && node.props["aria-checked"] === true)[0]?.props["data-level"];

test("the consent page has no navigation (board 1); the confirm page is framed with «确认修改» before it mounts", () => {
  assert.equal(shellAppliesTo("/app/settings/agent-connections/authorize", true), false);
  assert.equal(shellFrameFor("/app/settings/agent-connections/authorize"), null);
  assert.equal(shellFrameFor("/app/agent/proposals/prop_abcdefghijklmnopqrst")?.title, "proposal");
  assert.equal(shellAppliesTo("/app/agent/proposals/prop_abcdefghijklmnopqrst", true), true);
});

test("first connection: who asks, which account, six kinds at three levels, the two sentences, allow and refuse", () => {
  const text = textOf(renderToStaticMarkup(<ConsentPage initial={{ kind: "ready", ticket: "t", view: first }} />));
  for (const words of ["Claude 想连接你的 Orbit", "连上以后，你在 Claude 里问到自己的事，它可以来查你允许的记录。", "连到这个账号", "测试用户L", "agent-eval-l@orbit.test", "换个账号", "给 Claude 看哪些", "「可以提修改」也包含能看",
    "联系人", "活动", "我去过", "待办", "笔记", "日程", "不给看", "只读", "可以提修改", "Claude 想要「可以提修改」",
    "它改不了你的东西", "它提的每一项修改，都要你回到 Orbit 点「确认」才会改。", "这三样永远不给", "iOrbit 记住的事、你和 iOrbit 的完整对话、任何人的电话和邮箱。",
    "不允许", "允许", "点「允许」后回到 claude.ai。以后可以在「设置 › 外部 AI 助手」随时断开。"]) assert.ok(text.includes(words), words);
  assert.doesNotMatch(text, /授权|范围|令牌|scope|token|MCP/iu);
});

test("D2: asked-for reading pre-set to 只读, the rest 不给看; «可以提修改» is only marked, the user's click sets it; kinds that cannot be changed yet have it off", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ConsentPage initial={{ kind: "ready", ticket: "t", view: first }} />); });
  assert.equal(levelOf(renderer, "contacts"), "read");
  assert.equal(levelOf(renderer, "todos"), "read", "asked for «可以提修改», still 只读");
  assert.equal(levelOf(renderer, "events"), "none");
  const contactsPropose = renderer.root.find((node) => node.props["data-consent-domain"] === "contacts").find((node) => node.type === "button" && node.props["data-level"] === "propose");
  assert.equal(contactsPropose.props.disabled, true);
  const todosPropose = renderer.root.find((node) => node.props["data-consent-domain"] === "todos").find((node) => node.type === "button" && node.props["data-level"] === "propose");
  await act(async () => { todosPropose.props.onClick(); });
  assert.equal(levelOf(renderer, "todos"), "propose");

  const sent: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ data: { redirectTo: "https://claude.ai/api/mcp/auth_callback?code=x" }, success: true }), { status: 200 }); }) as typeof fetch;
  const assigned: string[] = [];
  (globalThis as { window?: unknown }).window = { location: { assign: (to: string) => assigned.push(to) } };
  try {
    await act(async () => { await renderer.root.find((node) => node.props["data-consent-allow"] !== undefined).props.onClick(); });
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
  assert.deepEqual(sent[0], { accountKey: "acct_l", decision: "allow", request: "t", scopes: ["contacts:read", "todos:read", "todos:propose", "memos:read", "proposals:read"] });
  assert.deepEqual(assigned, ["https://claude.ai/api/mcp/auth_callback?code=x"]);
  assert.ok(JSON.stringify(renderer.toJSON()).includes("连好了"));
});

test("a kind that cannot be changed yet says so in the draft's words", () => {
  const text = textOf(renderToStaticMarkup(<ConsentPage initial={{ kind: "ready", ticket: "t", view: first }} />));
  assert.equal(text.split("这一类暂时只能看，还不能提修改").length - 1, 4, "contacts, events, attended, schedule");
});

test("already connected, asking for more (board 3): the current choice as it is, the new kind pre-set and marked, «可以提修改» only marked; keep or allow", async () => {
  const more: AgentConnectionConsentContract = { ...first, current: { connectedAt: "2026-11-12T02:00:00.000Z", scopes: ["contacts:read", "todos:read", "memos:read", "proposals:read"] }, preselectedScopes: ["contacts:read", "todos:read", "memos:read", "proposals:read", "schedule:read"], requestedScopes: ["contacts:read", "todos:read", "memos:read", "schedule:read", "proposals:read", "todos:propose"] };
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ConsentPage initial={{ kind: "ready", ticket: "t", view: more }} />); });
  const text = JSON.stringify(renderer.toJSON());
  for (const words of ["Claude 想多要一点", "新 · 原来是「不给看」", "Claude 这次想要「可以提修改」", "保持原样", "允许这些改动", "点「允许这些改动」后回到 claude.ai。"]) assert.ok(text.includes(words), words);
  assert.equal(levelOf(renderer, "schedule"), "read");
  assert.equal(levelOf(renderer, "todos"), "read");
  // The user may lower a level in the same step.
  await act(async () => { renderer.root.find((node) => node.props["data-consent-domain"] === "memos").find((node) => node.type === "button" && node.props["data-level"] === "none").props.onClick(); });
  assert.equal(levelOf(renderer, "memos"), "none");
});

test("the account changed in another tab (board 2): the server refuses; the page comes again for the new account and says so", async () => {
  const other = { ...first, account: { email: "agent-eval-b@orbit.test", key: "acct_b", name: "测试用户乙" } };
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: other, error: { code: "CONFLICT", context: { reason: "ACCOUNT_CHANGED" } }, success: false }), { status: 409 })) as typeof fetch;
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ConsentPage initial={{ kind: "ready", ticket: "t", view: first }} />); });
  await act(async () => { await renderer.root.find((node) => node.props["data-consent-allow"] !== undefined).props.onClick(); });
  const text = JSON.stringify(renderer.toJSON());
  assert.ok(text.includes("登录的账号变了。这一页打开时是「测试用户L」，现在是「测试用户乙」。看清下面的账号，再点一次。"), text);
  assert.ok(text.includes("agent-eval-b@orbit.test"));
});

test("the result and failure cards (board 4) use the draft's words", () => {
  const text = (initial: Parameters<typeof ConsentPage>[0]["initial"]) => textOf(renderToStaticMarkup(<ConsentPage initial={initial} />));
  assert.ok(text({ kind: "unsupported" }).includes("这个应用现在连不了 Orbit") && text({ kind: "unsupported" }).includes("目前能连的只有 Claude。"));
  assert.ok(text({ clientName: null, kind: "stale" }).includes("这次连接请求已经过期"));
  for (const key of ["allowedTitle", "refusedTitle", "refusedLine", "failedTitle", "staleTitle", "staleLine"] as const) assert.ok(agentConnectionsCopy[key].zh.length > 0);
  assert.equal(agentConnectionsCopy.refusedLine.zh, "{client} 看不到你 Orbit 里的任何东西。这一页可以关掉了。");
  assert.equal(agentConnectionsCopy.staleLine.zh, "回到 {client}，重新点一次连接就行。");
});

test("only what is true about who can connect: no fixed sentence names Codex until its sign-in is verified (coordinator)", () => {
  for (const [key, words] of Object.entries(agentConnectionsCopy)) for (const value of Object.values(words)) assert.doesNotMatch(value, /Codex/u, `${key}: ${value}`);
  assert.equal(agentConnectionsCopy.settingsIntro.zh, "你自己的 Claude 连到 Orbit 之后，能看什么、能提什么修改，都在这里。随时可以断开。");
  assert.equal(agentConnectionsCopy.stepOne.zh, "在 Claude 里添加 Orbit，填这个地址");
});

test("no page says 授权、范围、令牌、scope、token or MCP, in any language", () => {
  for (const [key, words] of Object.entries(agentConnectionsCopy)) for (const value of Object.values(words)) assert.doesNotMatch(value, /授权|範囲|范围|令牌|トークン|scope|token|MCP|認可/iu, `${key}: ${value}`);
});
