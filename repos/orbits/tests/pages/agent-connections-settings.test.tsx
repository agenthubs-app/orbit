/**
 * agent-design AG17-5 (approved visual draft, boards 7, 8, 10): settings › 外部 AI 助手 — a card per connection with
 * what it may see and propose, «它提的 N 项修改等你确认 · 去看» (D10), «断开连接» (D4) behind a three-line
 * confirmation (the second line only when something waits), and only that (D5); with no connection the three steps and
 * the address to copy (D11); bones of the same cards until the list is read, never an empty state first.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { AgentConnectionsSettings } from "../../app/(app)/app/orbit-2026/account/AgentConnectionsSettings";
import { accountSectionFor } from "../../app/(app)/app/orbit-2026/account/AccountLayout";
import { ToastProvider } from "../../app/(app)/app/orbit-2026/ui";
import { resetLastAnswersForTests } from "../../app/(app)/app/orbit-last-answer";
import type { AgentConnectionListContract } from "../../shared/contract/agent-v1";

(globalThis as { self?: unknown }).self ??= globalThis;
// The dialog listens on the document for Esc and outside clicks; the test renderer has no DOM, so a bare stand-in.
const stubDocument = { activeElement: null, addEventListener() {}, body: {}, removeEventListener() {} };
(globalThis as { document?: unknown }).document ??= stubDocument;
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame ??= (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle);

const OPTIONS = [
  { domain: "contacts", propose: null, read: "contacts:read" },
  { domain: "events", propose: null, read: "events:read" },
  { domain: "attendance", propose: null, read: "attendance:read" },
  { domain: "todos", propose: "todos:propose", read: "todos:read" },
  { domain: "memos", propose: "memos:propose", read: "memos:read" },
  { domain: "schedule", propose: null, read: "schedule:read" },
] as const;

const LIST: AgentConnectionListContract = {
  connectAddress: "https://orbit.example.test/connect",
  connections: [
    { clientHost: "claude.ai", clientName: "Claude", createdAt: "2026-11-12T02:00:00.000Z", id: "conn_a", lastUsedAt: "2026-11-20T05:20:00.000Z", scopes: ["contacts:read", "todos:read", "todos:propose", "memos:read", "proposals:read"], waitingProposals: 2 },
    { clientHost: "claude.ai", clientName: "Codex", createdAt: "2026-11-03T02:00:00.000Z", id: "conn_b", lastUsedAt: null, scopes: ["memos:read"], waitingProposals: 0 },
  ],
  options: OPTIONS,
};

const calls: { url: string; method: string }[] = [];
let answer: AgentConnectionListContract = LIST;
let release: (() => void) | null = null;
const original = globalThis.fetch;

beforeEach(() => {
  resetLastAnswersForTests();
  calls.length = 0;
  answer = LIST;
  release = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(url) });
    if (init?.method === "DELETE") return new Response(JSON.stringify({ data: { id: "conn_a", revokedAt: "2026-11-20T07:05:00.000Z", voidedProposals: 2 }, success: true }), { status: 200 });
    if (release === null) return new Response(JSON.stringify({ data: answer, success: true }), { status: 200 });
    await new Promise<void>((resolve) => { release = resolve; });
    return new Response(JSON.stringify({ data: answer, success: true }), { status: 200 });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = original; });

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON()).replace(/"[a-zA-Z]+":/gu, " ").replace(/[{}[\]",]+/gu, " ").replace(/\s+/gu, " ");

async function mount() {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ToastProvider><AgentConnectionsSettings /></ToastProvider>); });
  return renderer;
}

test("the menu has 外部 AI 助手 under 连接, and its path selects it", () => {
  assert.equal(accountSectionFor("/app/settings/agent-connections"), "agentConnections");
});

test("one card per connection: what it may see and propose (不能 when nothing), the waiting line to the inbox, and only «断开连接»", async () => {
  const renderer = await mount();
  const shown = text(renderer);
  for (const words of ["Claude", "Codex", "已连接", "能看", "联系人、待办、笔记", "能提修改", "待办", "不能", "它提的 2 项修改等你确认", "去看", "断开连接", "不管连的是哪个，都一样", "iOrbit 记住的事 · 完整对话", "任何人的电话和邮箱"]) assert.ok(shown.includes(words), words);
  assert.equal((shown.match(/它提的 \d+ 项修改等你确认/gu) ?? []).length, 1, "only the connection with waiting changes has the line");
  const waiting = renderer.root.find((node) => node.props.href === "/app/inbox");
  assert.ok(waiting);
  // D5: nothing in settings changes a level; the only button on a card is 断开连接.
  const cardButtons = renderer.root.findAll((node) => node.type === "button" && typeof node.props.children === "string").map((node) => node.props.children);
  assert.deepEqual(cardButtons, ["断开连接", "断开连接"]);
  assert.doesNotMatch(shown, /授权|范围|令牌|scope|token|MCP/iu);
});

test("断开连接: three lines (the second says how many will be voided), then DELETE, and a line saying what happened", async () => {
  const renderer = await mount();
  const buttons = renderer.root.findAll((node) => node.type === "button" && node.props.children === "断开连接");
  await act(async () => { buttons[0].props.onClick(); });
  const dialog = text(renderer);
  for (const words of ["断开 Claude？", "马上生效：", "Claude 立刻读不到你的 Orbit。", "没确认的作废：", "它提的 2 项修改还没确认，会一起作废。", "改好的不动：", "你已经确认改好的，照旧保留。", "取消"]) assert.ok(dialog.includes(words), words);
  const confirm = renderer.root.find((node) => node.props.label === "断开连接" && node.props.variant === "danger");
  await act(async () => { await confirm.props.onClick(); });
  assert.ok(calls.some((call) => call.method === "DELETE" && call.url === "/api/agent/connections/conn_a"));
  assert.ok(text(renderer).includes("已断开 Claude，2 项没确认的修改已作废"));
});

test("a connection with nothing waiting: the confirmation has no «没确认的作废» line", async () => {
  const renderer = await mount();
  const buttons = renderer.root.findAll((node) => node.type === "button" && node.props.children === "断开连接");
  await act(async () => { buttons[1].props.onClick(); });
  const dialog = text(renderer);
  assert.ok(dialog.includes("断开 Codex？"));
  assert.ok(!dialog.includes("没确认的作废："));
});

test("no connection: the three steps and the short address with «复制»; the promises are there too", async () => {
  answer = { ...LIST, connections: [] };
  const renderer = await mount();
  const shown = text(renderer);
  for (const words of ["还没有 AI 助手连到 Orbit", "在 Claude 里添加 Orbit，填这个地址", "orbit.example.test/connect", "复制", "它会打开 Orbit，让你选给它看哪几类。", "点「允许」就连上了。它提的修改，都要你回来点确认。", "不管连的是哪个，都一样"]) assert.ok(shown.includes(words), words);
  assert.ok(!shown.includes("https://"), "the address is shown short; the copy carries the whole address");
});

test("before the list is read: bones of the cards, no empty state that turns into cards", async () => {
  release = () => undefined;
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ToastProvider><AgentConnectionsSettings /></ToastProvider>); });
  const shown = text(renderer);
  assert.ok(!shown.includes("还没有 AI 助手连到 Orbit"));
  assert.ok(!shown.includes("断开连接"));
  assert.ok(renderer.root.findAll((node) => node.props["aria-busy"] === "true").length >= 1);
  await act(async () => { release?.(); });
});
