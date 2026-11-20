/**
 * agent-design AG16 interface (web; approved visual draft 16-1 to 16-5, D16-1 to D16-4):
 *   - 16-1: a task's page has 「有新结果时提醒我」, one switch for phone and browser, flipped at once without a card; the
 *     list marks a task whose reminder is on with 「🔔 有新结果时提醒」; with the reminder on, 「怎么通知你」 is not repeated;
 *   - 16-3: this browser's line — not asked yet (the browser's own prompt appears only after the button), allowed,
 *     refused (with 「怎么重新打开」), allowed then switched off (found out by a reminder that could not be sent, naming
 *     that period); with the switch off nothing about devices is shown and the browser is asked nothing;
 *   - 16-2: under a confirmed card that turned a reminder on, 「已打开。这个浏览器还没允许通知」 with the button;
 *   - 16-4: the history's two lines in every wording of the draft's table;
 *   - 16-5: a reminder's id opens that period's inbox entry, and only an inbox entry;
 *   - the web notification settings no longer say browser notifications are not open.
 * Nothing internal on screen.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { notificationCopy } from "../../app/(app)/app/orbit-2026/copy/notifications";
import { ConfirmationCard } from "../../app/(app)/app/orbit-2026/iorbit/confirmation-card";
import { BrowserReminderLine, ReminderBlock } from "../../app/(app)/app/orbit-2026/account/ScheduledTaskReminder";
import { ScheduledTaskDetail, ScheduledTaskList } from "../../app/(app)/app/orbit-2026/account/ScheduledTasks";
import type { WebPushBrowser } from "../../app/(app)/app/orbit-2026/account/web-push-client";
import { ToastProvider } from "../../app/(app)/app/orbit-2026/ui";
import { inboxEntryFromDeliveryAnswer } from "../../app/(app)/app/inbox/delivery-entry";
import { resetLastAnswersForTests } from "../../app/(app)/app/orbit-last-answer";
import { cardTurnedReminderOn, reminderLineOf, showsReminderLines } from "../../shared/compute/agent-reminder";
import type { AgentActionPreviewContract, AgentScheduledTaskContract, AgentScheduledTaskHistoryContract } from "../../shared/contract/agent-v1";

(globalThis as { self?: unknown }).self ??= globalThis;

type Node = ReactTestRenderer["root"];
type Run = AgentScheduledTaskHistoryContract["runs"][number];
const textIn = (node: Node | string): string => (typeof node === "string" ? node : node.children.map((child) => textIn(child as Node | string)).join(""));
const buttonWith = (renderer: ReactTestRenderer, words: string) => renderer.root.findAll((node) => node.type === "button" && textIn(node).includes(words))[0];
const INTERNAL = /来源|证据|授权|引用|范围|规则|派发|payload|revision|automation|provider|revoked|undefined|null|VAPID|endpoint/u;

const task = (overrides: Partial<AgentScheduledTaskContract> = {}): AgentScheduledTaskContract => ({
  createdAt: "2026-10-01T03:00:00.000Z", domain: "event", id: "t1", last: { opens: "result", runId: "r1", text: "有 2 场新活动", when: "今天 9:04" }, lastRun: null, needsAttention: false,
  next: { day: "11月27日（周五）", time: "9:00 之后约10分钟内" }, nextRunAt: "2026-11-27T00:00:00.000Z", notify: { inApp: true, push: true },
  rows: [
    { field: "schedule", label: "什么时候查", note: "东京时间。不保证整点开始。", value: "每周五 9:00 之后约10分钟内" }, { field: "scope", label: "从哪里挑", value: "那个周末在东京办的公开活动" },
    { field: "rankingBasis", label: "按什么挑", note: "每次运行读它当时的内容", value: "笔记「兴趣笔记」" }, { field: "maxItems", label: "挑几条", value: "最多 3 场" },
    { field: "validUntil", label: "跑到哪天", value: "一直跑，直到你暂停或删除" }, { field: "notify", label: "怎么通知你", note: "没有新的就不打扰", value: "放进收件箱，并提醒你" }, { field: "nextRunAt", label: "下次运行", value: "11月27日（周五）" },
  ],
  status: "active", summary: { attention: null, schedule: "每周五 9:00 之后约10分钟内", status: "下次 11月27日（周五） · 上次 今天 9:04：有 2 场新活动" }, timeZone: "Asia/Tokyo", title: "每周五挑 3 场周末活动", updatedAt: "2026-11-20T00:04:00.000Z", version: 2,
  ...overrides,
});
const run = (runId: string, day: string, time: string | null, text: string, outcome: Run["outcome"], push: Run["push"]): Run => ({
  computeAttempts: 1, computedAt: "2026-11-20T00:04:00.000Z", delivery: { attempts: 1, state: "delivered" }, display: { day, opens: outcome === "delivered" ? "result" : null, skippedNote: null, text, time },
  items: [], line: "x", outcome, push, runId, scheduledAt: "2026-11-20T00:00:00.000Z", skipped: 0, skippedDays: [], taskId: "t1", text: "",
});
/** The draft's table (16-4), with the lines the server writes. */
const tableRuns: Run[] = [
  run("r1", "11月20日（周五）", "9:04", "有 2 场新活动", "delivered", { attempts: 1, deliveredAt: "2026-11-20T00:04:00.000Z", line: "提醒已送到 9:04", state: "delivered", targets: [{ deviceId: "ios-1", platform: "ios", state: "delivered" }] }),
  run("r2", "11月13日（周五）", "9:07", "没有新的", "no_match", { attempts: 0, line: "没有新的，所以不提醒", state: "not_requested", targets: [] }),
  run("r3", "11月6日（周五）", "9:03", "有 3 场新活动", "delivered", { attempts: 1, line: "提醒没送到：手机和浏览器的通知都被关了。结果在收件箱里。", reason: "permission_revoked", state: "failed", targets: [{ deviceId: "ios-1", platform: "ios", state: "revoked" }, { deviceId: "web:dev1", platform: "web", state: "revoked" }] }),
  run("r4", "10月16日（周五）", "9:05", "有 1 场新活动", "delivered", { attempts: 2, deliveredAt: "2026-10-16T00:20:00.000Z", line: "第一次没送出去，9:20 补送到了。没有重新算。", state: "delivered", targets: [] }),
  run("r5", "10月9日（周五）", "23:10", "有 1 场新活动", "delivered", { attempts: 0, line: "没有提醒：当时是免打扰时段。结果在收件箱里。", reason: "quiet_hours", state: "skipped", targets: [] }),
  run("r6", "10月2日（周五）", "9:04", "有 3 场新活动", "delivered", { attempts: 0, line: "当时没开提醒", state: "not_requested", targets: [] }),
];

const router = { back() {}, forward() {}, prefetch() {}, push() {}, refresh() {}, replace() {} } as unknown as AppRouterInstance;
async function mount(node: React.ReactNode, responses: Record<string, unknown> = {}): Promise<{ renderer: ReactTestRenderer; calls: string[] }> {
  resetLastAnswersForTests();
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}${init?.body ? ` ${String(init.body)}` : ""}`);
    const key = Object.keys(responses).find((prefix) => url.startsWith(prefix));
    return new Response(JSON.stringify(key ? responses[key] : { error: { code: "NOT_FOUND" } }), { status: key ? 200 : 404 });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<AppRouterContext.Provider value={router}><ToastProvider>{node}</ToastProvider></AppRouterContext.Provider>); });
  await settle();
  return { calls, renderer };
}
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

/** A browser the test controls: what it allows, what the server knows of it, and everything asked of it. */
function fakeBrowser(input: { permission: "default" | "granted" | "denied" | null; answer?: "granted" | "denied" | "default"; publicKey?: string | null; device?: { active: boolean; revokedReason?: "user" | "provider_rejected" } | null; deviceId?: string | null }) {
  const asked: string[] = [];
  let permission = input.permission;
  let device = input.device ?? null;
  let subscribed = permission === "granted" && Boolean(device?.active);
  const store = new Map<string, string>(input.deviceId === null ? [] : [["orbit.webPushDeviceId", input.deviceId ?? "web:dev1"]]);
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/x", toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { auth: "a", p256dh: "b" } }), unsubscribe: async () => { subscribed = false; return true; } };
  const json = (status: number, body: unknown) => ({ json: async () => body, ok: status < 300, status });
  const browser: WebPushBrowser = {
    async fetch(path, init) {
      const method = init?.method ?? "GET";
      asked.push(`${method} ${path}`);
      if (path === "/api/devices/web-push") return json(200, { data: { publicKey: input.publicKey === undefined ? "AQAB" : input.publicKey } });
      if (path === "/api/devices/push-tokens" && method === "POST") {
        const body = JSON.parse(init?.body ?? "{}") as { permission?: string; subscription?: unknown };
        device = body.permission === "granted" && body.subscription ? { active: true } : { active: false };
        return json(200, { data: {} });
      }
      if (path.startsWith("/api/devices/push-tokens/") && method === "DELETE") { device = { active: false, revokedReason: "user" }; return json(200, { data: {} }); }
      if (path.startsWith("/api/devices/push-tokens/")) return device ? json(200, { data: device }) : json(404, {});
      return json(404, {});
    },
    permission: () => permission,
    async pushManager() {
      asked.push("serviceWorker");
      return { getSubscription: async () => (subscribed ? subscription : null), subscribe: async () => { subscribed = true; asked.push("subscribe"); return subscription; } };
    },
    randomId: () => "dev1",
    async requestPermission() {
      asked.push("PROMPT");
      permission = input.answer ?? "granted";
      return permission;
    },
    storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); } },
  };
  return { asked, browser };
}

/* ── 16-1 / 16-4: the page ───────────────────────────────────────────────── */

test("16-1 and 16-4: the reminder block with the switch on, every history wording on its second line, and 「怎么通知你」 not repeated", async () => {
  const { renderer } = await mount(<ScheduledTaskDetail id="t1" onTitle={() => undefined} />, { "/api/agent/automations/t1/runs": { data: { runs: tableRuns, task: task() } } });
  const text = textIn(renderer.root);
  for (const words of ["有新结果时提醒我", "在手机和浏览器上弹一条「有新结果」，不写活动名称、时间和地点。", "两件事分开记：结果什么时候生成，提醒有没有送到",
    "结果已生成 9:04 · 有 2 场新活动", "提醒已送到 9:04", "9:07 · 没有新的", "没有新的，所以不提醒", "结果已生成 9:03 · 有 3 场新活动", "提醒没送到：手机和浏览器的通知都被关了。结果在收件箱里。",
    "结果已生成 9:05 · 有 1 场新活动", "第一次没送出去，9:20 补送到了。没有重新算。", "没有提醒：当时是免打扰时段。结果在收件箱里。", "当时没开提醒"]) assert.ok(text.includes(words), words);
  assert.ok(!text.includes("怎么通知你"), "the block says it; the fact row is not repeated");
  assert.ok(!text.includes("每期一行"));
  assert.ok(!text.includes("结果已生成 9:07"), "a period with nothing new is not a result");
  // Tones: delivered with a tick, the missed one in red, the others grey.
  const lines = renderer.root.findAll((node) => typeof node.props["data-orbit-scheduled-push"] === "string");
  assert.deepEqual(lines.map((node) => node.props["data-orbit-scheduled-push"]), ["delivered", "quiet", "missed", "delivered", "quiet", "quiet"]);
  assert.ok(textIn(lines[0]!).startsWith("✓"));
  assert.ok(!textIn(lines[2]!).includes("✓"));
  assert.ok(renderer.root.findAll((node) => node.props["data-orbit-scheduled-reminder"] === "on").length === 1);
  assert.doesNotMatch(text, INTERNAL);
});

test("16-1: a task whose reminder was never on keeps one line per period and its 「怎么通知你」 row; the switch is off and says so", async () => {
  const never = tableRuns.map((item) => ({ ...item, push: { attempts: 0, line: item.outcome === "no_match" ? "没有新的，所以不提醒" : "当时没开提醒", state: "not_requested" as const, targets: [] } }));
  const { renderer } = await mount(<ScheduledTaskDetail id="t1" onTitle={() => undefined} />, { "/api/agent/automations/t1/runs": { data: { runs: never, task: task({ notify: { inApp: true, push: false } }) } } });
  const text = textIn(renderer.root);
  for (const words of ["有新结果时提醒我", "现在只放进收件箱。", "怎么通知你", "每期一行", "9:04 · 有 2 场新活动"]) assert.ok(text.includes(words), words);
  for (const hidden of ["当时没开提醒", "没有新的，所以不提醒", "结果已生成", "这个浏览器", "在手机和浏览器上弹一条"]) assert.ok(!text.includes(hidden), hidden);
  assert.ok(renderer.root.findAll((node) => node.props["data-orbit-scheduled-reminder"] === "off").length === 1);
});

test("16-1: flipping the switch saves at once (no card), in the page's language; with it off the browser is asked nothing", async () => {
  const fake = fakeBrowser({ permission: "default" });
  const changed: string[] = [];
  const { calls, renderer } = await mount(<ReminderBlock task={task({ notify: { inApp: true, push: false } })} runs={[]} language="zh" onChanged={() => changed.push("x")} browser={fake.browser} />, { "/api/agent/automations/t1/reminder": { data: { task: task() } } });
  assert.deepEqual(fake.asked, [], "off: no device line, no reads of the browser");
  assert.ok(!textIn(renderer.root).includes("这个浏览器"));
  const toggle = renderer.root.findAll((node) => node.props.role === "switch")[0]!;
  assert.equal(toggle.props["aria-label"], "「每周五挑 3 场周末活动」有新结果时提醒我");
  await act(async () => { toggle.props.onClick(); });
  await settle();
  assert.ok(calls.includes("PUT /api/agent/automations/t1/reminder {\"push\":true}"), calls.join("\n"));
  assert.deepEqual(changed, ["x"]);
  // On: this browser's line appears; still no prompt (D16-3).
  assert.ok(textIn(renderer.root).includes("这个浏览器还没允许 Orbit 发通知"));
  assert.ok(!fake.asked.includes("PROMPT"));
});

test("16-1: the list marks a task whose reminder is on, and only that one", async () => {
  const { renderer } = await mount(<ScheduledTaskList />, { "/api/agent/automations?language=zh": { data: { tasks: [task(), task({ id: "t2", notify: { inApp: true, push: false }, title: "每周一列出 5 位该联系的人" })] } } });
  const rows = renderer.root.findAll((node) => typeof node.props["data-orbit-scheduled-task"] === "string");
  assert.ok(textIn(rows[0]!).includes("🔔 有新结果时提醒"));
  assert.ok(!textIn(rows[1]!).includes("🔔"));
});

/* ── 16-3: this browser ──────────────────────────────────────────────────── */

test("16-3 ①: not asked yet — the button, and the browser's own prompt only after it; allowed, the line turns to ②", async () => {
  const fake = fakeBrowser({ deviceId: null, permission: "default" });
  const { renderer } = await mount(<BrowserReminderLine language="zh" browser={fake.browser} />);
  const text = textIn(renderer.root);
  for (const words of ["这个浏览器还没允许 Orbit 发通知", "允许之后，这里才会弹提醒。不允许也没关系，结果照常在收件箱。", "允许这个浏览器通知"]) assert.ok(text.includes(words), words);
  assert.ok(!fake.asked.includes("PROMPT") && !fake.asked.includes("serviceWorker"), fake.asked.join(","));
  await act(async () => { buttonWith(renderer, "允许这个浏览器通知")!.props.onClick(); });
  await settle();
  assert.deepEqual(fake.asked.filter((step) => step === "PROMPT" || step === "subscribe" || step.startsWith("POST")), ["PROMPT", "subscribe", "POST /api/devices/push-tokens"]);
  const after = textIn(renderer.root);
  assert.ok(after.includes("这个浏览器会收到提醒") && after.includes("不在这个浏览器上提醒"), after);
});

test("16-3 ③: refused in the browser's prompt — no reminders here, the inbox and the task as usual, and how to turn it back on", async () => {
  const fake = fakeBrowser({ answer: "denied", deviceId: null, permission: "default" });
  const { renderer } = await mount(<BrowserReminderLine language="zh" browser={fake.browser} />);
  await act(async () => { buttonWith(renderer, "允许这个浏览器通知")!.props.onClick(); });
  await settle();
  const text = textIn(renderer.root);
  for (const words of ["这个浏览器不让 Orbit 发通知", "所以这里不会弹提醒。结果照常在收件箱，任务照常运行。", "怎么重新打开"]) assert.ok(text.includes(words), words);
  assert.ok(!fake.asked.includes("subscribe"), "refused: nothing subscribed");
  assert.ok(fake.asked.includes("POST /api/devices/push-tokens"), "the server is told so it has no device here");
  await act(async () => { buttonWith(renderer, "怎么重新打开")!.props.onClick(); });
  assert.ok(textIn(renderer.root).includes("点地址栏左边的图标，找到「通知」，改成「允许」。"));
  // Opened again later: still refused, no prompt.
  const again = fakeBrowser({ permission: "denied" });
  const second = await mount(<BrowserReminderLine language="zh" browser={again.browser} />);
  assert.ok(textIn(second.renderer.root).includes("这个浏览器不让 Orbit 发通知"));
  assert.ok(!again.asked.includes("PROMPT"));
});

test("16-3 ②: allowed — the line says so, and 「不在这个浏览器上提醒」 stops it here only", async () => {
  const fake = fakeBrowser({ device: { active: true }, permission: "granted" });
  const { renderer } = await mount(<BrowserReminderLine language="zh" browser={fake.browser} />);
  assert.ok(textIn(renderer.root).includes("这个浏览器会收到提醒"));
  await act(async () => { buttonWith(renderer, "不在这个浏览器上提醒")!.props.onClick(); });
  await settle();
  assert.ok(fake.asked.includes("DELETE /api/devices/push-tokens/web%3Adev1"), fake.asked.join(","));
  const text = textIn(renderer.root);
  assert.ok(text.includes("这个浏览器现在不弹提醒") && text.includes("在这个浏览器上提醒"), text);
});

test("16-3 ④: allowed, later switched off in the system — found out by a reminder that failed; names that period and offers 「重新允许」", async () => {
  const fake = fakeBrowser({ device: { active: false, revokedReason: "provider_rejected" }, permission: "granted" });
  const { renderer } = await mount(<BrowserReminderLine language="zh" runs={tableRuns} browser={fake.browser} />);
  const text = textIn(renderer.root);
  for (const words of ["上一次提醒没送到：这个浏览器的通知被关掉了", "11月6日（周五）那期的结果在收件箱里。任务照常运行，之后不再往这个浏览器发。", "重新允许"]) assert.ok(text.includes(words), words);
  assert.ok(!fake.asked.includes("PROMPT"));
  // Another task's history does not have that period: the same line without a day.
  const other = await mount(<BrowserReminderLine language="zh" runs={[]} browser={fakeBrowser({ device: { active: false, revokedReason: "provider_rejected" }, permission: "granted" }).browser} />);
  assert.ok(textIn(other.renderer.root).includes("结果照常在收件箱里。任务照常运行，之后不再往这个浏览器发。"));
});

test("16-3: a deployment without browser reminders, or a browser that cannot show them, shows no browser line", async () => {
  for (const fake of [fakeBrowser({ permission: "default", publicKey: null }), fakeBrowser({ permission: null })]) {
    const { renderer } = await mount(<BrowserReminderLine language="zh" browser={fake.browser} />);
    assert.equal(textIn(renderer.root), "");
    assert.ok(!fake.asked.includes("PROMPT"));
  }
  const none = await mount(<BrowserReminderLine language="zh" browser={null} />);
  assert.equal(textIn(none.renderer.root), "");
});

/* ── 16-2: after the card ─────────────────────────────────────────────────── */

const reminderCard = (overrides: Partial<AgentActionPreviewContract> = {}): AgentActionPreviewContract => ({
  actionId: "a9", locale: "zh", operations: [{ after: { notify: { inApp: true, push: true } }, before: { notify: { inApp: true, push: false } }, capability: "rule.update", display: { change: "update", note: "只改这一条，别的任务照旧只进收件箱。提醒上不写活动名称、时间和地点。", record: "定时任务「每周五挑 3 场周末活动」", rows: [{ after: "放进收件箱，并在手机和浏览器上提醒", before: "只放进收件箱", field: "notify", label: "有新结果" }] }, operationId: "a9:op1", status: "succeeded", text: "t" }],
  payloadHash: "h", revision: 1, revisions: [], status: "completed", summary: "s", title: "修改1项", updatedAt: "2026-11-20T01:00:00.000Z", ...overrides,
});

test("16-2: a confirmed card that turned a reminder on is recognised; one waiting, refused, or for a reminder already on is not", () => {
  assert.equal(cardTurnedReminderOn(reminderCard()), true);
  assert.equal(cardTurnedReminderOn(reminderCard({ status: "awaiting_confirmation" })), false);
  assert.equal(cardTurnedReminderOn(reminderCard({ status: "rejected" })), false);
  const already = reminderCard();
  assert.equal(cardTurnedReminderOn({ ...already, operations: [{ ...already.operations[0]!, before: { notify: { inApp: true, push: true } } }] }), false);
  assert.equal(cardTurnedReminderOn({ ...already, operations: [{ ...already.operations[0]!, after: { notify: { inApp: true, push: false } }, before: { notify: { inApp: true, push: true } } }] }), false, "turning it off");
  assert.equal(cardTurnedReminderOn({ ...already, operations: [{ ...already.operations[0]!, status: "failed" }] }), false);
  // The card itself is unchanged (D16 「卡的样式一点没变」), and renders where there is no browser.
  const html = renderToStaticMarkup(<ConfirmationCard card={reminderCard()} language="zh" online onDecide={async () => true} onRegenerate={async () => true} />);
  assert.ok(html.includes("定时任务「每周五挑 3 场周末活动」"));
});

test("16-2: under that card — 「已打开。这个浏览器还没允许通知」 with the button; nothing when this browser will already ring", async () => {
  const fake = fakeBrowser({ deviceId: null, permission: "default" });
  const { renderer } = await mount(<BrowserReminderLine afterCard language="zh" browser={fake.browser} />);
  const text = textIn(renderer.root);
  assert.ok(text.includes("已打开。这个浏览器还没允许通知") && text.includes("允许这个浏览器通知"), text);
  assert.ok(!fake.asked.includes("PROMPT"));
  const blocked = await mount(<BrowserReminderLine afterCard language="zh" browser={fakeBrowser({ permission: "denied" }).browser} />);
  assert.ok(textIn(blocked.renderer.root).includes("已打开。这个浏览器不让 Orbit 发通知"));
  const on = await mount(<BrowserReminderLine afterCard language="zh" browser={fakeBrowser({ device: { active: true }, permission: "granted" }).browser} />);
  assert.equal(textIn(on.renderer.root), "");
});

/* ── shared choices, 16-5, settings ──────────────────────────────────────── */

test("the shared rule: second lines only for a task that has or had its reminder on; the tone follows the state", () => {
  assert.equal(showsReminderLines({ notify: { inApp: true, push: false } }, [{ push: { attempts: 0, line: "当时没开提醒", state: "not_requested" } }]), false);
  assert.equal(showsReminderLines({ notify: { inApp: true, push: false } }, [{ push: { attempts: 1, line: "提醒已送到 9:04", state: "delivered" } }]), true);
  assert.equal(showsReminderLines({ notify: { inApp: true, push: true } }, []), true);
  assert.deepEqual(reminderLineOf({ push: { attempts: 1, line: "提醒没送到。", state: "failed" } }), { text: "提醒没送到。", tone: "missed" });
  assert.equal(reminderLineOf({ push: { attempts: 0, line: null, state: "not_requested" } }), null);
});

test("16-5: a reminder's id opens the inbox entry the server names for this account, and nothing else", () => {
  const id = "rule-push:0123456789abcdef0123456789abcdef";
  const answer = (target: Record<string, unknown>) => ({ data: { body: "有新结果，请到 Orbit 查看。", deliveryId: id, target: { deliveryId: id, kind: "inbox", ...target }, title: "Orbit" } });
  assert.equal(inboxEntryFromDeliveryAnswer(answer({ href: "/inbox/notifications/inbox%3Aabc", status: "available" }), id), "inbox:abc");
  assert.equal(inboxEntryFromDeliveryAnswer(answer({ status: "unavailable" }), id), null);
  assert.equal(inboxEntryFromDeliveryAnswer(answer({ href: "/inbox/notifications/inbox%3Aabc", status: "available" }), "rule-push:ffffffffffffffffffffffffffffffff"), null);
  for (const href of ["https://evil.invalid/x", "/settings", "/inbox/notifications/a/b", "/inbox/notifications/..", "/inbox/notifications/a?x=1"]) assert.equal(inboxEntryFromDeliveryAnswer(answer({ href, status: "available" }), id), null, href);
  assert.equal(inboxEntryFromDeliveryAnswer({ error: { code: "NOT_FOUND" } }, id), null);
});

test("the web notification settings no longer say browser notifications are not open", () => {
  const words = JSON.stringify(notificationCopy);
  for (const gone of ["浏览器通知尚未开放", "Browser notifications are coming later", "ブラウザ通知は準備中です"]) assert.ok(!words.includes(gone), gone);
});
