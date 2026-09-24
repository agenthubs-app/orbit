import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OpsHub } from "../../app/(app)/app/events/ops-0918/ops-hub";
import { OPS_STYLES, OpsConsoleShell, OpsDetailsMenu, OpsHubHead, OpsToast } from "../../app/(app)/app/events/ops-0918/ops-shell";
import type { EventCenterItem } from "../../app/(app)/app/events/ops-0918/use-event-center";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const HOUR = 60 * 60 * 1000;

function item(overrides: Partial<EventCenterItem> = {}): EventCenterItem {
  const now = Date.now();
  return {
    endsAt: new Date(now + 5 * HOUR).toISOString(),
    eventId: "event:hub",
    lifecycleState: "published",
    migrationPending: false,
    owner: true,
    revision: 1,
    role: "owner",
    startsAt: new Date(now + 3 * HOUR).toISOString(),
    title: "秋季主办方沙龙",
    venue: "Shibuya",
    ...overrides,
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

/** `/api/events/center` 返回 `events`；aggregate 按 eventId 查表（缺省 403）。 */
function mockFetch(events: readonly EventCenterItem[], aggregates: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === "/api/events/center") {
      assert.equal(init?.cache, "no-store");
      return Response.json({ data: events, success: true });
    }
    const match = url.match(/^\/api\/events\/([^/]+)\/analytics\/aggregate$/u);
    if (match) {
      assert.equal(init?.cache, "no-store");
      const aggregate = aggregates[decodeURIComponent(match[1])];
      if (!aggregate) return Response.json({ error: { message: "forbidden" }, success: false }, { status: 403 });
      return Response.json({ data: aggregate, success: true });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

async function renderHub(events: readonly EventCenterItem[], aggregates: Record<string, unknown> = {}) {
  const { calls, fetchImpl } = mockFetch(events, aggregates);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<OpsHub />);
    await flush();
  });
  await act(async () => {
    await flush();
  });
  return {
    calls,
    renderer,
    cleanup() {
      globalThis.fetch = originalFetch;
      renderer.unmount();
    },
  };
}

const AGGREGATE = {
  checkIns: { checkedIn: 1 },
  eventId: "event:hub",
  grouping: { published: true, roundOne: { assignedParticipants: 2, tables: 1 }, roundTwo: { assignedParticipants: 2, tables: 1 } },
  kind: "organizer_aggregate",
  registrations: { active: 2, cancelled: 0 },
};

test("hub SSR renders the design head, tabs and search while the list loads", () => {
  const html = renderToStaticMarkup(<OpsHub />);
  assert.match(html, /class="op-main"/u);
  assert.match(html, /<h1 class="op-hub-h1">活动中心<\/h1>/u);
  assert.match(html, /管理你负责的活动。/u);
  for (const label of ["全部", "即将开始", "进行中", "已结束"]) assert.match(html, new RegExp(`class="btn op-tab op-tab-(on|off)"[^>]*>${label}<`, "u"));
  assert.match(html, /placeholder="搜索活动名称、地点或关键词…"/u);
  assert.match(html, /正在读取你可访问的活动…/u);
  // 页头身份 chip 只在有活动后出现；无「＋ 创建活动」
  assert.doesNotMatch(html, /当前身份/u);
  assert.doesNotMatch(html, /创建活动/u);
  // 无设计 mock 文案
  for (const mock of ["Tokyo AI Meetup", ">86<", ">64<", ">320<", "创业峰会", "Orbit 开发者大会"]) assert.doesNotMatch(html, new RegExp(mock, "u"));
});

test("hub cards show real fields, status chip, role chip and counts from the aggregate", async () => {
  const events = [item()];
  const { calls, renderer, cleanup } = await renderHub(events, { "event:hub": AGGREGATE });
  try {
    assert.deepEqual(calls, ["/api/events/center", "/api/events/event%3Ahub/analytics/aggregate"]);
    const card = renderer.root.find((node) => node.props["data-event-center-card"] === "event:hub");
    assert.deepEqual(card.findAllByType("h2").map((node) => node.children.join("")), ["秋季主办方沙龙"]);
    const status = card.find((node) => node.props["data-event-center-status"] !== undefined);
    assert.equal(status.props["data-event-center-status"], "soon");
    assert.equal(status.children.join(""), "即将开始");
    assert.deepEqual(status.props.style, { background: "#ECEEFB", color: "#2E3270" });
    assert.equal(card.find((node) => node.props["data-event-center-role"] === "owner").children.join(""), "活动负责人");
    const counts = Object.fromEntries(
      card.findAll((node) => typeof node.props["data-event-center-count"] === "string").map((node) => [node.props["data-event-center-count"], node.children.join("")]),
    );
    assert.deepEqual(counts, { signup: "2", match: "2", checkin: "1" });
    const cta = card.find((node) => node.props["data-event-center-cta"] === "operations");
    assert.equal(cta.type, "a");
    assert.equal(cta.props.href, "/app/events/event%3Ahub/operations");
    assert.equal(cta.children.join(""), "进入运营 →");
    assert.deepEqual(cta.props.style, { background: "#0E1225", color: "#FFFFFF", borderColor: "#0E1225" });
    // 「···」菜单收纳次级动作，既有标记保留
    const menu = card.findAll((node) => node.props.role === "menuitem").map((node) => [node.children.join(""), node.props.href]);
    assert.deepEqual(menu, [
      ["报名审核", "/app/events/event%3Ahub/operations/admission"],
      ["签到台", "/app/events/event%3Ahub/operations/check-in"],
      ["查看数据", "/app/events/event%3Ahub/analytics"],
      ["查看活动页面", "/app/events/event%3Ahub"],
      ["管理角色", "/app/events/event%3Ahub/operations?drawer=roles"],
    ]);
    assert.equal(card.findAll((node) => node.props["data-event-center-admission"] === "event:hub").length, 1);
    assert.equal(card.findAll((node) => node.props["data-event-center-analytics"] === "event:hub").length, 1);
    assert.equal(card.findAll((node) => node.props["data-event-center-manage-roles"] === "event:hub").length, 1);
    // 地点 / 时间真实
    const meta = card.findAll((node) => node.props.className === "op-card-meta").map((node) => node.children.join(""));
    assert.equal(meta.length, 2);
    assert.match(meta[0], /^▦ \d{4}年\d{1,2}月\d{1,2}日（周.）　\d{2}:\d{2} – \d{2}:\d{2}$/u);
    assert.equal(meta[1], "◎ Shibuya");
    // 页头身份 chip
    assert.match(JSON.stringify(renderer.toJSON()), /当前身份：活动负责人/u);
  } finally {
    cleanup();
  }
});

// 任务 7 评审遗留 5：每卡 aggregate 逐卡写入（不再等最慢的一张）；草稿卡的 chip 先于时间
test("hub fills each card's counts as its own aggregate arrives (a slow card does not hold the others) and a live-window draft still reads 草稿", async () => {
  const now = Date.now();
  const events = [
    item(),
    item({ eventId: "event:slow", lifecycleState: "draft", startsAt: new Date(now - HOUR).toISOString(), title: "草稿沙龙" }),
  ];
  let releaseSlow: (() => void) | undefined;
  const slowGate = new Promise<void>((resolve) => { releaseSlow = resolve; });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/events/center") return Response.json({ data: events, success: true });
    if (url === "/api/events/event%3Ahub/analytics/aggregate") return Response.json({ data: AGGREGATE, success: true });
    if (url === "/api/events/event%3Aslow/analytics/aggregate") {
      await slowGate;
      return Response.json({ data: { ...AGGREGATE, checkIns: { checkedIn: 0 }, eventId: "event:slow", registrations: { active: 7, cancelled: 0 } }, success: true });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(<OpsHub />);
      await flush();
    });
    await act(async () => { await flush(); });
    const counts = (id: string) => Object.fromEntries(
      renderer.root.find((node) => node.props["data-event-center-card"] === id)
        .findAll((node) => typeof node.props["data-event-center-count"] === "string")
        .map((node) => [node.props["data-event-center-count"], node.children.join("")]),
    );
    assert.deepEqual(counts("event:hub"), { signup: "2", match: "2", checkin: "1" }, "first card is filled while the second is still pending");
    assert.deepEqual(counts("event:slow"), { signup: "—", match: "—", checkin: "—" });
    const draftChip = renderer.root.find((node) => node.props["data-event-center-card"] === "event:slow").find((node) => node.props["data-event-center-status"] !== undefined);
    assert.equal(draftChip.children.join(""), "草稿");
    assert.equal(draftChip.props["data-event-center-status"], "draft");
    await act(async () => {
      releaseSlow!();
      await flush();
    });
    assert.deepEqual(counts("event:slow"), { signup: "7", match: "2", checkin: "0" });
    assert.deepEqual(counts("event:hub"), { signup: "2", match: "2", checkin: "1" }, "earlier card keeps its values");
  } finally {
    globalThis.fetch = originalFetch;
    renderer.unmount();
  }
});

test("hub counts fall back to — when the aggregate is forbidden and 查看数据 leads ended events", async () => {
  const now = Date.now();
  const ended = item({
    endsAt: new Date(now - HOUR).toISOString(),
    eventId: "event:ended",
    startsAt: new Date(now - 4 * HOUR).toISOString(),
    title: "已经结束的活动",
  });
  const { renderer, cleanup } = await renderHub([ended]);
  try {
    const card = renderer.root.find((node) => node.props["data-event-center-card"] === "event:ended");
    const counts = card.findAll((node) => typeof node.props["data-event-center-count"] === "string").map((node) => node.children.join(""));
    assert.deepEqual(counts, ["—", "—", "—"]);
    assert.equal(card.find((node) => node.props["data-event-center-status"] !== undefined).children.join(""), "已结束");
    const cta = card.find((node) => node.props["data-event-center-cta"] === "analytics");
    assert.equal(cta.children.join(""), "查看数据");
    assert.equal(cta.props.href, "/app/events/event%3Aended/analytics");
    assert.deepEqual(cta.props.style, { background: "#FFFFFF", color: "#2E3270", borderColor: "#B9BCEB" });
    assert.equal(cta.props["data-event-center-analytics"], "event:ended");
  } finally {
    cleanup();
  }
});

test("hub tabs filter by phase and the search filters by title", async () => {
  const now = Date.now();
  const events = [
    item(),
    item({ eventId: "event:live", startsAt: new Date(now - HOUR).toISOString(), title: "正在进行的活动" }),
    item({ eventId: "event:ended", startsAt: new Date(now - 4 * HOUR).toISOString(), endsAt: new Date(now - HOUR).toISOString(), title: "结束的活动" }),
  ];
  const { renderer, cleanup } = await renderHub(events);
  try {
    const cards = () => renderer.root.findAll((node) => typeof node.props["data-event-center-card"] === "string").map((node) => node.props["data-event-center-card"]);
    assert.deepEqual(cards(), ["event:hub", "event:live", "event:ended"]);
    const tab = (label: string) => renderer.root.find((node) => node.props.role === "tab" && node.children.join("") === label);
    await act(async () => { tab("进行中").props.onClick(); });
    assert.deepEqual(cards(), ["event:live"]);
    assert.equal(tab("进行中").props["aria-selected"], true);
    await act(async () => { tab("已结束").props.onClick(); });
    assert.deepEqual(cards(), ["event:ended"]);
    await act(async () => { tab("即将开始").props.onClick(); });
    assert.deepEqual(cards(), ["event:hub"]);
    await act(async () => { tab("全部").props.onClick(); });
    const input = renderer.root.findByType("input");
    await act(async () => { input.props.onChange({ target: { value: "结束" } }); });
    assert.deepEqual(cards(), ["event:ended"]);
    await act(async () => { input.props.onChange({ target: { value: "不存在" } }); });
    assert.deepEqual(cards(), []);
    assert.equal(renderer.root.findAll((node) => node.props["data-event-center-filtered-empty"] !== undefined).length, 1);
  } finally {
    cleanup();
  }
});

test("hub renders the empty state and the error state with a retry", async () => {
  const empty = await renderHub([]);
  try {
    assert.equal(empty.renderer.root.findAll((node) => node.props["data-event-center-empty"] !== undefined).length, 1);
    assert.match(JSON.stringify(empty.renderer.toJSON()), /还没有可运营的活动/u);
    assert.doesNotMatch(JSON.stringify(empty.renderer.toJSON()), /当前身份/u);
  } finally {
    empty.cleanup();
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ error: { message: "读取失败" }, success: false }, { status: 500 })) as typeof fetch;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(<OpsHub />);
      await flush();
    });
    const alert = renderer.root.find((node) => node.props.role === "alert");
    assert.equal(alert.findAllByType("span")[0].children.join(""), "读取失败");
    assert.equal(alert.findByType("button").children.join(""), "重试");
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

test("OpsConsoleShell renders crumb, title, actions and six tab links for the event", () => {
  const event = { endsAt: "", id: "event:ops", startsAt: "", title: "我的活动" };
  const html = renderToStaticMarkup(
    <OpsConsoleShell event={event} toast="已发布" view="match">
      <p>body</p>
    </OpsConsoleShell>,
  );
  assert.match(html, /<span class="op-crumb"><a class="op-crumb-link" href="\/app\/events\/center">活动中心<\/a> \/ <a class="op-crumb-link" href="\/app\/events\/event%3Aops\/operations">我的活动<\/a> \/ <a class="op-crumb-link" href="\/app\/events\/event%3Aops\/operations">运营台<\/a> \/ 匹配与分组<\/span>/u);
  assert.match(html, /<h1 class="op-h1">匹配与分组<\/h1>/u);
  assert.match(html, /<p class="op-sub">根据参会者资料生成推荐和现场分组。<\/p>/u);
  assert.match(html, /<a class="btn op-btn-dark" href="\/app\/events\/event%3Aops">查看活动页面 →<\/a>/u);
  assert.match(html, /<a class="btn op-btn-ghost" data-ops-more="true" href="\/app\/events\/event%3Aops\/operations\?drawer=roles">更多 ⌄<\/a>/u);
  const tabs = [...html.matchAll(/<a (?:aria-current="page" )?class="op-tab op-tab-(on|off)" href="([^"]+)" role="tab">([^<]+)<\/a>/gu)].map((m) => [m[3], m[2], m[1]]);
  assert.deepEqual(tabs, [
    ["概览", "/app/events/event%3Aops/operations", "off"],
    ["匹配与分组", "/app/events/event%3Aops/operations?tab=match", "on"],
    ["参会者", "/app/events/event%3Aops/operations/admission", "off"],
    ["签到", "/app/events/event%3Aops/operations/check-in", "off"],
    ["报名设置", "/app/events/event%3Aops/operations/experience", "off"],
    ["数据报告", "/app/events/event%3Aops/analytics", "off"],
  ]);
  assert.match(html, /<p>body<\/p>/u);
  assert.match(html, /<div class="op-toast" role="status">已发布<\/div>/u);
  // ops 视图标题 = 「{活动} · 运营台」
  assert.match(renderToStaticMarkup(<OpsConsoleShell event={event} view="ops"><span /></OpsConsoleShell>), /<h1 class="op-h1">我的活动 · 运营台<\/h1>/u);
  assert.doesNotMatch(html, /Tokyo AI Meetup/u);
  assert.equal(renderToStaticMarkup(<OpsToast text="" />), "");
});

// 任务 7 评审遗留 4（任务 2 / 3 minor）：<details> 菜单 aria-haspopup / aria-expanded + 点击菜单外 / Esc 关闭
test("OpsDetailsMenu: summary carries aria-haspopup/aria-expanded from the details open state; outside pointerdown and Esc close it, inside clicks do not", async () => {
  const ssr = renderToStaticMarkup(
    <OpsDetailsMenu className="op-head-more" summary="更多 ⌄" summaryClassName="btn op-btn-ghost op-head-more-summary" summaryMarker="data-ops-more">
      <div className="op-menu" role="menu"><a className="op-menu-item" href="#x" role="menuitem">导出 CSV</a></div>
    </OpsDetailsMenu>,
  );
  assert.match(ssr, /^<details class="op-head-more"><summary aria-expanded="false" aria-haspopup="menu" class="btn op-btn-ghost op-head-more-summary" data-ops-more="true">更多 ⌄<\/summary><div class="op-menu" role="menu">/u);
  assert.match(renderToStaticMarkup(<OpsDetailsMenu className="op-more" summary="···" summaryClassName="op-more-summary" summaryLabel="更多操作"><i /></OpsDetailsMenu>), /<summary aria-expanded="false" aria-haspopup="menu" aria-label="更多操作" class="op-more-summary">···<\/summary>/u);

  const removed: string[] = [];
  const inside = { name: "inside" };
  const detailsNode = {
    contains(node: unknown) { return (node as { name?: string }).name === inside.name; },
    removeAttribute(name: string) { removed.push(name); },
  };
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      addEventListener(type: string, handler: (event: unknown) => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(handler);
      },
      removeEventListener(type: string, handler: (event: unknown) => void) { listeners.get(type)?.delete(handler); },
    },
  });
  const originalNode = globalThis.Node;
  // `event.target instanceof Node` 判定：测试环境无 DOM，用最小桩
  (globalThis as { Node: unknown }).Node = class {};
  const dispatch = (type: string, event: unknown) => { for (const handler of listeners.get(type) ?? []) handler(event); };
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(
        <OpsDetailsMenu className="op-head-more" summary="更多 ⌄" summaryClassName="btn op-head-more-summary">
          <div className="op-menu" role="menu" />
        </OpsDetailsMenu>,
        { createNodeMock: (element) => (element.type === "details" ? detailsNode : null) },
      );
    });
    const summary = () => renderer!.root.findByType("summary");
    const details = () => renderer!.root.findByType("details");
    assert.equal(summary().props["aria-expanded"], false);
    assert.equal(summary().props["aria-haspopup"], "menu");
    assert.equal(listeners.get("pointerdown")?.size ?? 0, 0, "closed menu registers no document listeners");

    await act(async () => { details().props.onToggle({ currentTarget: { open: true } }); });
    assert.equal(summary().props["aria-expanded"], true);
    assert.equal(listeners.get("pointerdown")?.size, 1);
    assert.equal(listeners.get("keydown")?.size, 1);

    const insideTarget = Object.assign(Object.create((globalThis as { Node: new () => object }).Node.prototype), inside);
    dispatch("pointerdown", { target: insideTarget });
    assert.deepEqual(removed, [], "clicks inside the menu keep it open");
    dispatch("keydown", { key: "Enter" });
    assert.deepEqual(removed, []);

    const outsideTarget = Object.create((globalThis as { Node: new () => object }).Node.prototype);
    dispatch("pointerdown", { target: outsideTarget });
    assert.deepEqual(removed, ["open"], "outside pointerdown removes the open attribute (native details closes)");
    dispatch("keydown", { key: "Escape" });
    assert.deepEqual(removed, ["open", "open"]);

    await act(async () => { details().props.onToggle({ currentTarget: { open: false } }); });
    assert.equal(summary().props["aria-expanded"], false);
    assert.equal(listeners.get("pointerdown")?.size, 0, "listeners are removed once closed");
    assert.equal(listeners.get("keydown")?.size, 0);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    (globalThis as { Node: unknown }).Node = originalNode;
  }
});

test("OpsHubHead shows the identity chip only with a role label", () => {
  const noop = () => undefined;
  const withRole = renderToStaticMarkup(<OpsHubHead activeTab="all" onQuery={noop} onTab={noop} query="" roleLabel="运营" />);
  assert.match(withRole, /当前身份：运营/u);
  assert.match(withRole, /仅展示你有权限操作的活动。/u);
  const withoutRole = renderToStaticMarkup(<OpsHubHead activeTab="live" onQuery={noop} onTab={noop} query="沙龙" roleLabel={null} />);
  assert.doesNotMatch(withoutRole, /当前身份/u);
  assert.match(withoutRole, /aria-selected="true" class="btn op-tab op-tab-on"[^>]*>进行中</u);
  assert.match(withoutRole, /value="沙龙"/u);
});

test("OPS_STYLES is scoped to ops-0918, neutralises .btn and contains no mock values", () => {
  const rules = OPS_STYLES.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("[") || line.startsWith("@"));
  for (const rule of rules) {
    if (rule.startsWith("@")) continue;
    assert.match(rule, /^\[data-orbit-real-page="ops-0918"\]/u, rule);
  }
  for (const cls of ["op-cta", "op-btn-dark", "op-btn-ghost", "op-tab"]) {
    assert.match(OPS_STYLES, new RegExp(`\\.btn\\.${cls}:active \\{ transform: none; \\}`, "u"), cls);
    assert.match(OPS_STYLES, new RegExp(`\\.btn\\.${cls} \\{[^}]*height: auto;`, "u"), cls);
  }
  assert.match(OPS_STYLES, /\.op-card \{ display: grid; grid-template-columns: 150px minmax\(0, 1\.5fr\) repeat\(3, minmax\(0, 72px\)\) 150px; gap: 22px;/u);
  assert.match(OPS_STYLES, /\.op-main \{ max-width: 1240px; margin: 0 auto; padding: 14px 40px 72px;/u);
  // 页面文件不含设计 mock 与「＋ 创建活动」
  const hub = readFileSync(join(projectRoot, "app/(app)/app/events/ops-0918/ops-hub.tsx"), "utf8");
  const shell = readFileSync(join(projectRoot, "app/(app)/app/events/ops-0918/ops-shell.tsx"), "utf8");
  for (const source of [hub, shell]) {
    assert.doesNotMatch(source, /Tokyo AI Meetup|创业峰会|开发者大会|全球人才交流会|创建活动/u);
  }
});

// 自 tests/pages/event-role-management-workspace.test.tsx:295 迁入（任务 6 删旧文件）。
test("migration-pending cards do not render legacy metadata or operation links", async () => {
  const originalFetch = globalThis.fetch;
  let renderer!: ReactTestRenderer;
  globalThis.fetch = (async (url) => {
    // 迁移待确认的活动不得触发 aggregate 读取：只允许列表请求。
    assert.equal(url, "/api/events/center");
    return Response.json({
      data: [{
        endsAt: null,
        eventId: "event:legacy-only",
        lifecycleState: "legacy_active",
        migrationPending: true,
        owner: true,
        revision: 0,
        role: "owner",
        startsAt: null,
        title: null,
        venue: null,
      }],
      success: true,
    });
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(<OpsHub />);
      await flush();
    });
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-event-center-migration-pending"] === "event:legacy-only",
      ).length,
      1,
    );
    assert.equal(
      renderer.root.findAll(
        (node) =>
          node.type === "a" &&
          typeof node.props.href === "string" &&
          node.props.href.includes(encodeURIComponent("event:legacy-only")),
      ).length,
      0,
    );
    const headings = renderer.root.findAllByType("h2").map((node) => node.children.join(""));
    assert.ok(headings.includes("活动资料待迁移"));
    assert.ok(!headings.includes("event:legacy-only"));
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

// 自 tests/pages/event-role-management-workspace.test.tsx:347 迁入（任务 6 删旧文件；:395 管理角色 → `?drawer=roles`）。
test("event center gates onsite actions by lifecycle and explains delegated bootstrap", async () => {
  const originalFetch = globalThis.fetch;
  let renderer!: ReactTestRenderer;
  globalThis.fetch = (async (url) => {
    // hub 每卡另读 aggregate（审阅修订 4）；这里一律 403 → 三计数「—」，不影响门禁断言。
    if (String(url).endsWith("/analytics/aggregate")) {
      return Response.json({ error: { message: "forbidden" }, success: false }, { status: 403 });
    }
    assert.equal(url, "/api/events/center");
    return Response.json({
      data: [
        {
          endsAt: null,
          eventId: "event:draft-owner",
          lifecycleState: "draft",
          migrationPending: false,
          owner: true,
          revision: 1,
          role: "owner",
          startsAt: null,
          title: "待发布活动",
          venue: null,
        },
        {
          endsAt: "2026-09-12T11:00:00.000Z",
          eventId: "event:published-operator",
          lifecycleState: "published",
          migrationPending: false,
          owner: false,
          revision: 2,
          role: "operations",
          startsAt: "2026-09-12T09:00:00.000Z",
          title: "已发布活动",
          venue: "Tokyo",
        },
      ],
      success: true,
    });
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(<OpsHub />);
      await flush();
    });
    const draftCard = renderer.root.find(
      (node) => node.props["data-event-center-card"] === "event:draft-owner",
    );
    const draftLinks = draftCard.findAllByType("a").map((node) => String(node.props.href));
    assert.equal(draftLinks.some((href) => href.endsWith("/operations")), false);
    assert.equal(draftLinks.some((href) => href.endsWith("/operations/check-in")), false);
    assert.equal(draftLinks.some((href) => href.endsWith("/operations/admission")), false);
    assert.equal(draftLinks.some((href) => href.endsWith("/analytics")), false);
    // 审阅修订 7：管理角色进 `?drawer=roles` 抽屉，不再有 /operations/roles 深链。
    assert.equal(draftLinks.some((href) => href.endsWith("/operations?drawer=roles")), true);
    assert.equal(draftLinks.some((href) => href.endsWith("/operations/roles")), false);
    assert.match(JSON.stringify(renderer.toJSON()), /活动发布前不开放运营台/u);

    const operatorCard = renderer.root.find(
      (node) => node.props["data-event-center-card"] === "event:published-operator",
    );
    assert.equal(
      operatorCard.findAll(
        (node) =>
          node.props["data-event-center-bootstrap-limited"] ===
          "event:published-operator",
      ).length,
      1,
    );
    assert.match(
      JSON.stringify(renderer.toJSON()),
      /首次运营配置必须由活动负责人初始化/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});

// 自 tests/pages/event-role-management-workspace.test.tsx:426 迁入（任务 6 删旧工作区）：旧文件对 roles 工作区源码的 auto-fit 网格
// 断言随文件删除作废，只保留活动中心的角色入口断言。
test("the center reserves only policy-valid role entry points", () => {
  // 活动中心 hub（ops-0918）：角色谓词在 ops-model.ts，`data-event-center-*` 标记随动作表落在 ops-model / ops-hub。
  const centerModel = readFileSync(
    join(projectRoot, "app/(app)/app/events/ops-0918/ops-model.ts"),
    "utf8",
  );
  const centerHub = readFileSync(
    join(projectRoot, "app/(app)/app/events/ops-0918/ops-hub.tsx"),
    "utf8",
  );
  assert.match(centerModel, /data-event-center-analytics/u);
  assert.match(centerModel, /function canOpenAnalytics/u);
  assert.match(centerModel, /item\.role === "operations"/u);
  assert.match(centerModel, /item\.role === "read_only_analyst"/u);
  assert.match(centerModel, /data-event-center-admission/u);
  for (const source of [centerModel, centerHub]) {
    assert.doesNotMatch(source, /审核入口待实现/u);
    assert.doesNotMatch(source, /role === "reviewer"[^\n]+analytics/u);
  }
});
