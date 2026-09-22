/**
 * iOrbit 任务 4：对话屏右栏（`iorbit-chat-aside.tsx`，设计 321–343）与历史记录抽屉
 * （`iorbit-history-drawer.tsx`，设计 786–804 + 「能力保全决定」）。
 *
 * 断言分三组，与任务 2 / 3 的两套新屏用例同一口径：
 *   1. SSR 结构 + 设计 mock 黑名单 + 作用域形态（每个 button 都是 `btn ir-*`、
 *      `.btn` 基类整段中和、同一个类同时用于 <a> 与 button 时写两条规则）
 *   2. 抽屉行为：开关三条路径（遮罩自身、Esc、✕）、当前会话底色、逐段展开、
 *      分组筛选、`···` 菜单的置顶 / 重命名 / 移动 / 删除二次确认的**请求体**与 toast
 *   3. 右栏行为：两条真实 suggests 发问、第三条是导航、「编辑」落到人物画像
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, type ReactTestRenderer } from "react-test-renderer";

import { IOrbitHistoryDrawer } from "../../app/(app)/app/agent/iorbit-0918/iorbit-history-drawer";
import { IOrbitShell, IORBIT_STYLES } from "../../app/(app)/app/agent/iorbit-0918/iorbit-shell";
import { createOrbitAgentStarterViewModel } from "../../app/(app)/app/orbit-agent-route-view-model";
import type { OrbitAgentHistoryView } from "../../app/(app)/app/orbit-agent-route-view-model";
import { ORBIT_Z } from "../../app/(app)/app/orbit-z";
import {
  buttonWithText,
  mountAgent,
  textOf,
  type StoredSessionFixture,
} from "./app-agent-characterization-harness";

const VIEW_MODEL = createOrbitAgentStarterViewModel();
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function source(path: string): string {
  return readFileSync(join(PROJECT_ROOT, path), "utf8");
}

const ASIDE_PATH = "app/(app)/app/agent/iorbit-0918/iorbit-chat-aside.tsx";
const DRAWER_PATH = "app/(app)/app/agent/iorbit-0918/iorbit-history-drawer.tsx";

function homeFixture(
  overrides: {
    events?: unknown[];
    targetRelationshipTypes?: string[];
    topics?: string[];
  } = {},
) {
  return {
    account: {
      fullName: "QA Tester",
      headline: "Orbit",
      initial: "Q",
      relationshipGoal: "",
      targetRelationshipTypes: overrides.targetRelationshipTypes,
      topics: overrides.topics,
    },
    events: overrides.events ?? [],
    stats: { events: 0, inProgress: 0, people: 0 },
  };
}

function eventFixture(id: string, name: string, startsAt: string) {
  return {
    endsAt: startsAt,
    id,
    name,
    place: "东京",
    startsAt,
    stats: { youRsvped: true },
    venue: "会场",
    youRsvped: true,
  };
}

function shellMarkup(home: ReturnType<typeof homeFixture>): string {
  return renderToStaticMarkup(
    <IOrbitShell home={home as never} initialDeepLink viewModel={VIEW_MODEL} />,
  );
}

function historyItem(
  id: string,
  title: string,
  extra: Partial<OrbitAgentHistoryView> = {},
): OrbitAgentHistoryView {
  return {
    date: "2026年9月18日",
    group: "未分组",
    groupId: null,
    id: `session:${id}`,
    q: title,
    sessionId: id,
    title,
    when: "未分组",
    ...extra,
  };
}

function drawer(props: Partial<React.ComponentProps<typeof IOrbitHistoryDrawer>> = {}) {
  return (
    <IOrbitHistoryDrawer
      activeQ=""
      activeSessionId={null}
      groupMutationPending={false}
      groups={[]}
      history={[historyItem("session:a", "第一条对话")]}
      language="zh"
      onClose={() => undefined}
      onCreateGroup={() => undefined}
      onDelete={() => undefined}
      onDeleteGroup={() => undefined}
      onFilterGroup={() => undefined}
      onMove={() => undefined}
      onNewChat={() => undefined}
      onNewInGroup={() => undefined}
      onPick={() => undefined}
      onRename={() => undefined}
      onRenameGroup={() => undefined}
      onTogglePin={() => undefined}
      pendingSessionId={null}
      selectedGroupId={null}
      {...props}
    />
  );
}

/* ── 1. SSR 结构 / mock 黑名单 / 作用域形态 ─────────────────────────────── */

test("the chat aside ships every design block from lines 321–343 with real data", () => {
  const html = shellMarkup(
    homeFixture({
      events: [eventFixture("event:a", "真实报名的活动", "2026-09-18T10:00:00.000Z")],
      targetRelationshipTypes: ["真实目标人脉"],
      topics: ["真实关注话题"],
    }),
  );

  for (const copy of [
    "本次对话可继续",
    "先联系谁比较好？",
    "上下文",
    "基于以下信息为你提供建议",
    "编辑",
    "◇ 兴趣方向",
    "▦ 已报名活动",
    "⚇ 目标人脉",
    // 真实数据：话题 / 目标人脉 来自个人资料，活动来自已报名列表（设计 340 的「（9/18）」形）
    "真实关注话题",
    "真实目标人脉",
    "真实报名的活动（9/18）",
  ]) {
    assert.ok(html.includes(copy), `design copy missing from the chat aside: ${copy}`);
  }

  for (const className of [
    "ir-aside",
    "ir-aside-card",
    "ir-aside-next",
    "ir-aside-context-head",
    "ir-aside-group",
    "ir-aside-tags",
    "ir-aside-tag",
  ]) {
    assert.match(html, new RegExp(`class="[^"]*\\b${className}\\b`), `missing .${className}`);
  }

  // 设计 334 的「编辑」必须是真落点（审阅修订 17），不是 href="#"。
  assert.match(html, /<a class="ir-aside-edit" href="\/app\/profile\?view=persona">编辑<\/a>/);
  // 326 的第三条是导航（`goContacts`），不是发消息。
  assert.match(html, /<a class="ir-aside-next" href="\/app\/agent\/strategy\?view=contacts">/);
  assert.ok(!html.includes('href="#"'));
});

test("the chat aside never renders the design's mock context", () => {
  const html = shellMarkup(
    homeFixture({
      events: [eventFixture("event:a", "真实报名的活动", "2026-09-18T10:00:00.000Z")],
      targetRelationshipTypes: ["真实目标人脉"],
      topics: ["真实关注话题"],
    }),
  ).replace(/<style>[\s\S]*?<\/style>/g, "");

  for (const mock of [
    "AI 与大模型",
    "产品管理",
    "日本市场",
    "产品负责人",
    "投资人",
    "日本本地合作伙伴",
    "东京 AI 创业者交流会",
    "日本 · 亚洲创业峰会",
    "推荐下个月的行业峰会",
    "有没有适合产品经理的活动？",
  ]) {
    assert.ok(!html.includes(mock), `design mock leaked into the chat aside: ${mock}`);
  }
});

test("an empty profile gets the aside's empty-state copy, never invented tags", () => {
  const html = shellMarkup(homeFixture()).replace(/<style>[\s\S]*?<\/style>/g, "");

  assert.ok(html.includes("资料里还没有填写关注话题。"));
  assert.ok(html.includes("还没有已报名的活动。"));
  assert.ok(html.includes("资料里还没有填写想认识的人。"));
  assert.ok(!html.includes("ir-aside-tag"), "no chips may render without a source");
});

test("the history drawer ships every design block from lines 786–804", () => {
  const html = renderToStaticMarkup(
    drawer({ history: [historyItem("session:a", "第一条对话")] }),
  );

  for (const copy of [
    "◷",
    "历史记录",
    "查看你与 iOrbit 的过往对话记录。",
    "✕",
    "最近的对话",
    "▤",
    "第一条对话",
    "2026年9月18日",
    // 能力保全决定：设计没有这两个，既有能力不丢
    "新对话",
    "分组",
  ]) {
    assert.ok(html.includes(copy), `design copy missing from the history drawer: ${copy}`);
  }

  // 抽屉与弹窗统一口径（计划陷阱 10 / 审阅修订 13）。
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /class="ir-drawer-scrim"/);
  assert.match(html, /class="ir-drawer"/);
  assert.match(html, new RegExp(`z-index:${ORBIT_Z.modal}`));
  assert.match(html, /data-orbit-agent-history-drawer/);
  // 移动端不再单独一棵树：根节点不得带 `orbit-mobile-only`（那条类在参考样式表里
  // 是 display:none !important，桌面宽度下会让整组历史能力不可见）。
  assert.ok(!html.includes("orbit-mobile-only"));
  // 一段六条：第七条起要点「加载更多历史记录 ⌄」才出现。
  assert.ok(!html.includes("加载更多历史记录"));
});

test("the drawer keeps the Esc trap in the shared hook instead of hand-rolling one", () => {
  const text = source(DRAWER_PATH);

  assert.match(text, /import\s*\{\s*useOrbitModalA11y\s*\}\s*from\s*"\.\.\/\.\.\/orbit-modal-a11y"/);
  assert.match(text, /useOrbitModalA11y\(onClose\)/);
  assert.match(text, /zIndex:\s*ORBIT_Z\.modal/);
  assert.ok(
    !/addEventListener\(\s*["']keydown["']/.test(text),
    "the drawer must not hand-roll its own keydown listener",
  );
});

test("every aside and drawer <button> carries the btn ir-* contract", () => {
  for (const path of [ASIDE_PATH, DRAWER_PATH]) {
    const buttons = source(path).match(/<button[\s\S]{0,600}?>/g) ?? [];
    // aside 只有一处 `<button>` 字面量（三条里两条在 map 里、第三条是 <a>）。
    assert.ok(buttons.length >= 1, `expected buttons in ${path}, found ${buttons.length}`);
    for (const tag of buttons) {
      assert.match(tag, /className="btn ir-[a-z-]+/, `button without btn ir-* class: ${tag}`);
    }
  }
});

test("every new .btn rule neutralises the shared base class and its :active transform", () => {
  const flat = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");

  for (const className of [
    "ir-aside-next",
    "ir-drawer-close",
    "ir-drawer-new",
    "ir-drawer-more",
    "ir-hist-open",
    "ir-hist-menu-item",
  ]) {
    const match = flat.match(new RegExp(`\\.btn\\.${className}(?![-a-z])[^{]*\\{[^}]*\\}`));
    assert.ok(match, `missing .btn override for .${className}`);
    for (const declaration of [
      "height:",
      "display:",
      "align-items:",
      "justify-content:",
      "white-space:",
      "letter-spacing:",
      "line-height:",
      "transition:",
    ]) {
      assert.ok(
        match![0].includes(declaration),
        `.btn override for .${className} misses ${declaration}`,
      );
    }
    const active = flat.match(new RegExp(`\\.btn\\.${className}(?![-a-z]):active[^{]*\\{[^}]*\\}`));
    assert.ok(
      active && active[0].includes("transform: none"),
      `missing :active{transform:none} neutralisation for .${className}`,
    );
  }

  // `···` 钮的定位靠 transform，:active 还原成同一个位移而不是 none。
  const more = flat.match(/\.btn\.ir-hist-more:active[^{]*\{[^}]*\}/);
  assert.ok(more && more[0].includes("transform: translateY(-50%)"));

  // 同一个类同时用于 <a>（导航那条）与 <button>（两条提问）→ 两条规则。
  assert.match(flat, /\[data-orbit-real-page="iorbit-0918"\] \.ir-aside-next \{/);
  assert.match(flat, /\[data-orbit-real-page="iorbit-0918"\] \.btn\.ir-aside-next \{/);
});

/* ── 2. 抽屉行为 ───────────────────────────────────────────────────────── */

function rows(root: ReactTestRenderer) {
  return root.root.findAll(
    (node) => typeof node.props?.className === "string" && node.props.className.startsWith("ir-hist-row"),
  );
}

function rowTitles(root: ReactTestRenderer): string[] {
  return root.root
    .findAll((node) => node.props?.className === "ir-hist-title")
    .map((node) => textOf(node.children as unknown));
}

function drawerOpen(root: ReactTestRenderer): boolean {
  return root.root.findAll((node) => node.props?.className === "ir-drawer").length > 0;
}

function toastNode(root: ReactTestRenderer) {
  return (
    root.root.findAll(
      (node) => node.props?.["data-orbit-agent-history-feedback"] !== undefined,
    )[0] ?? null
  );
}

function session(
  id: string,
  title: string,
  createdAt: string,
  extra: Partial<StoredSessionFixture> = {},
): StoredSessionFixture {
  return {
    createdAt,
    id,
    messages: [{ role: "user", text: title }],
    title,
    updatedAt: createdAt,
    ...extra,
  };
}

async function mountShell(
  t: Parameters<typeof mountAgent>[0],
  options: Parameters<typeof mountAgent>[1] = {},
) {
  const harness = await mountAgent(t, {
    ...options,
    element: <IOrbitShell home={homeFixture() as never} initialDeepLink viewModel={VIEW_MODEL} />,
  });
  return harness;
}

async function openDrawer(harness: Awaited<ReturnType<typeof mountShell>>) {
  await act(async () => {
    buttonWithText(harness.root, "◷ 历史记录").props.onClick();
  });
  await harness.settle(1);
}

test("the chat screen's history button opens the design drawer, and ✕ closes it", async (t) => {
  const harness = await mountShell(t, {
    sessionPages: [[session("session:a", "第一条对话", "2026-09-18T00:00:00.000Z")]],
  });

  assert.equal(drawerOpen(harness.root), false);
  await openDrawer(harness);
  assert.equal(drawerOpen(harness.root), true);
  assert.deepEqual(rowTitles(harness.root), ["第一条对话"]);

  await act(async () => {
    buttonWithText(harness.root, "✕").props.onClick();
  });
  assert.equal(drawerOpen(harness.root), false);
});

test("the scrim closes the drawer only when the click lands on the scrim itself", async (t) => {
  const harness = await mountShell(t, {
    sessionPages: [[session("session:a", "第一条对话", "2026-09-18T00:00:00.000Z")]],
  });
  await openDrawer(harness);

  const scrim = harness.root.root.findAll((node) => node.props?.className === "ir-drawer-scrim")[0]!;
  const panel = { id: "panel" };
  await act(async () => {
    scrim.props.onClick({ currentTarget: scrim, target: panel });
  });
  assert.equal(drawerOpen(harness.root), true, "a click inside the panel must not close the drawer");

  await act(async () => {
    scrim.props.onClick({ currentTarget: scrim, target: scrim });
  });
  assert.equal(drawerOpen(harness.root), false);
});

test("Escape closes the drawer through useOrbitModalA11y", async (t) => {
  const harness = await mountShell(t, {
    sessionPages: [[session("session:a", "第一条对话", "2026-09-18T00:00:00.000Z")]],
  });
  await openDrawer(harness);

  await harness.fireDocumentEvent("keydown", { key: "Escape" });
  assert.equal(drawerOpen(harness.root), false);
});

test("the current session's row is tinted, keyed on the active session id", async (t) => {
  const harness = await mountShell(t, {
    search: "?session=session%3Arestored",
    sessionPages: [
      [
        session("session:restored", "正在看的对话", "2026-09-20T00:00:00.000Z"),
        session("session:other", "另一条对话", "2026-09-19T00:00:00.000Z"),
      ],
    ],
  });
  await openDrawer(harness);

  const tinted = rows(harness.root).filter((row) => row.props.className.includes("ir-hist-row-on"));
  assert.equal(tinted.length, 1, "exactly the active session's row carries the tint");
  assert.ok(textOf(tinted[0]!.children as unknown).includes("正在看的对话"));
});

test("the drawer reveals more of the already-drained list instead of paging the API", async (t) => {
  const many = Array.from({ length: 8 }, (_, index) =>
    session(`session:${index}`, `对话 ${index}`, `2026-09-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`),
  );
  const harness = await mountShell(t, { sessionPages: [many] });
  await openDrawer(harness);

  assert.equal(rows(harness.root).length, 6);
  const listCallsBefore = harness.calls.filter((call) =>
    call.url.startsWith("/api/ai/conversations/sessions?"),
  ).length;

  await act(async () => {
    buttonWithText(harness.root, "加载更多历史记录 ⌄").props.onClick();
  });
  await harness.settle(1);

  assert.equal(rows(harness.root).length, 8);
  assert.equal(
    harness.calls.filter((call) => call.url.startsWith("/api/ai/conversations/sessions?")).length,
    listCallsBefore,
    "revealing more must not hit the sessions API again (审阅修订 11)",
  );
});

test("the group filter strip narrows the drawer's list", async (t) => {
  const harness = await mountShell(t, {
    groups: [
      {
        createdAt: "2026-09-01T00:00:00.000Z",
        id: "group:work",
        name: "工作",
        revision: 1,
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    sessionPages: [
      [
        session("session:work", "工作里的对话", "2026-09-20T00:00:00.000Z", {
          organization: { customTitle: null, groupId: "group:work", pinned: false, revision: 1 },
        }),
        session("session:loose", "没有分组的对话", "2026-09-19T00:00:00.000Z"),
      ],
    ],
  });
  await openDrawer(harness);

  assert.deepEqual(rowTitles(harness.root), ["工作里的对话", "没有分组的对话"]);
  await act(async () => {
    buttonWithText(harness.root, "分组").props.onClick();
  });
  await act(async () => {
    buttonWithText(harness.root, "打开").props.onClick();
  });
  await harness.settle(1);
  assert.deepEqual(rowTitles(harness.root), ["工作里的对话"]);

  await act(async () => {
    buttonWithText(harness.root, "全部会话").props.onClick();
  });
  await harness.settle(1);
  assert.deepEqual(rowTitles(harness.root), ["工作里的对话", "没有分组的对话"]);
});

test("pinning from the row menu sends the pin patch and confirms with a toast", async (t) => {
  const harness = await mountShell(t, {
    sessionPages: [
      [
        session("session:new", "较新的对话", "2026-09-21T00:00:00.000Z"),
        session("session:old", "较旧的对话", "2026-09-01T00:00:00.000Z"),
      ],
    ],
  });
  await openDrawer(harness);

  await act(async () => {
    harness.root.root
      .findByProps({ "data-orbit-agent-history-menu-button": "session:old" })
      .props.onClick();
  });
  await act(async () => {
    harness.root.root.findByProps({ "data-orbit-agent-history-pin": "session:old" }).props.onClick();
  });
  await harness.settle();

  assert.equal(harness.organizationPatches.length, 1);
  assert.equal(harness.organizationPatches[0]!.sessionId, "session:old");
  assert.deepEqual(harness.organizationPatches[0]!.body.patch, { pinned: true });
  assert.deepEqual(rowTitles(harness.root), ["较旧的对话", "较新的对话"]);
  const banner = toastNode(harness.root);
  assert.ok(banner);
  assert.equal(banner.props["data-orbit-agent-history-feedback"], "success");
  assert.ok(textOf(banner.children as unknown).includes("对话已置顶"));
});

test("renaming from the row menu patches the custom title", async (t) => {
  const harness = await mountShell(t, {
    sessionPages: [[session("session:a", "原来的名字", "2026-09-20T00:00:00.000Z")]],
  });
  await openDrawer(harness);

  await act(async () => {
    harness.root.root
      .findByProps({ "data-orbit-agent-history-menu-button": "session:a" })
      .props.onClick();
  });
  await act(async () => {
    harness.root.root.findByProps({ "data-orbit-agent-history-rename": "session:a" }).props.onClick();
  });
  await act(async () => {
    harness.root.root
      .findByProps({ "data-orbit-agent-history-rename-input": "session:a" })
      .props.onChange({ target: { value: "改过的名字" } });
  });
  await act(async () => {
    harness.root.root
      .findAll((node) => node.props?.className === "ir-hist-rename")[0]!
      .props.onSubmit({ preventDefault() {} });
  });
  await harness.settle();

  assert.deepEqual(harness.organizationPatches[0]!.body.patch, { customTitle: "改过的名字" });
  assert.deepEqual(rowTitles(harness.root), ["改过的名字"]);
});

test("moving a conversation into a group patches its groupId", async (t) => {
  const harness = await mountShell(t, {
    groups: [
      {
        createdAt: "2026-09-01T00:00:00.000Z",
        id: "group:work",
        name: "工作",
        revision: 1,
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    sessionPages: [[session("session:a", "没有分组的对话", "2026-09-20T00:00:00.000Z")]],
  });
  await openDrawer(harness);

  await act(async () => {
    harness.root.root
      .findByProps({ "data-orbit-agent-history-menu-button": "session:a" })
      .props.onClick();
  });
  await act(async () => {
    harness.root.root
      .findAll(
        (node) =>
          node.type === "button" &&
          node.props?.role === "menuitem" &&
          textOf(node.props.children) === "工作",
      )[0]!
      .props.onClick();
  });
  await harness.settle();

  assert.deepEqual(harness.organizationPatches[0]!.body.patch, { groupId: "group:work" });
  assert.ok(textOf(toastNode(harness.root)!.children as unknown).includes("已移动对话"));
});

test("deleting from the row menu goes through the confirmation dialog before the DELETE", async (t) => {
  const harness = await mountShell(t, {
    sessionPages: [[session("session:a", "要删掉的对话", "2026-09-20T00:00:00.000Z")]],
  });
  await openDrawer(harness);

  await act(async () => {
    harness.root.root
      .findByProps({ "data-orbit-agent-history-menu-button": "session:a" })
      .props.onClick();
  });
  await act(async () => {
    harness.root.root.findByProps({ "data-orbit-agent-history-delete": "session:a" }).props.onClick();
  });

  const dialog = harness.root.root.findAll(
    (node) => node.props?.["data-orbit-agent-history-delete-confirmation"] !== undefined,
  );
  assert.equal(dialog.length, 1, "delete must ask first");
  assert.deepEqual(harness.deletedSessionIds, []);

  await act(async () => {
    harness.root.root.findByProps({ "data-orbit-agent-history-confirm-delete": true }).props.onClick();
  });
  await harness.settle();

  assert.deepEqual(harness.deletedSessionIds, ["session:a"]);
  assert.deepEqual(rowTitles(harness.root), []);
  assert.ok(textOf(toastNode(harness.root)!.children as unknown).includes("对话已删除"));
});

/* ── 3. 右栏行为 ───────────────────────────────────────────────────────── */

test("the aside's first two rows ask through the conversations API", async (t) => {
  const harness = await mountShell(t);

  const asks = harness.root.root.findAll(
    (node) => node.type === "button" && node.props?.className === "btn ir-aside-next",
  );
  assert.equal(asks.length, 2, "two ask rows plus one navigation link (design 323–326)");

  await act(async () => {
    asks[0]!.props.onClick();
  });
  await harness.settle();

  const ask = harness.conversationRequests[0];
  assert.ok(ask, "the aside must POST to /api/ai/conversations");
  assert.equal(ask.message, VIEW_MODEL.suggests[0]!.q);
});
