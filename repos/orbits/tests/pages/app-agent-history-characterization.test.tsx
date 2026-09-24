import assert from "node:assert/strict";
import test from "node:test";

import { act } from "react-test-renderer";

import {
  buttonWithText,
  mountAgent,
  renderedText,
  textOf,
  type StoredSessionFixture,
} from "./app-agent-characterization-harness";

// iOrbit 任务 6a：`orbit-real-agent.tsx` 已删除，这套特征化改跑在在售的壳 +
// 「◷ 历史记录」抽屉上（常驻侧栏是任务 4 记过的唯一能力移除）。断言的行为
// 一条没少，只有两处形态改动：① 每条用例先打开抽屉；② 抽屉是**扁平列表**
// （设计 786–804），分组以筛选条表达，没有分组小标题，因此 `groupHeadings`
// 那两处断言换成只断列表内容。
//
// 特征化渲染测试（iOrbit 任务 1a，历史侧）：锁定
// 历史记录行为，使 `use-agent-history` 抽出后「零变化」可证。覆盖 cursor 分页抽干、
// 分组筛选、置顶排序、重命名、删除二次确认与乐观队列失败文案、toast、跨标签
// window.focus 刷新。断言全部落在渲染结果与真实请求上，不做源码正则。

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

const GROUP = {
  createdAt: "2026-09-01T00:00:00.000Z",
  id: "group:work",
  name: "工作",
  revision: 1,
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function historyTitles(root: Parameters<typeof renderedText>[0]): string[] {
  return root.root
    .findAll((node) => typeof node.type === "string" && node.props.className === "ir-hist-title")
    .map((node) => textOf(node.children as unknown));
}

async function openDrawer(harness: Awaited<ReturnType<typeof mountAgent>>) {
  await act(async () => {
    buttonWithText(harness.root, "历史记录").props.onClick();
  });
  await harness.settle(1);
}

function toast(root: Parameters<typeof renderedText>[0]) {
  const nodes = root.root.findAll(
    (node) => typeof node.type === "string" && node.props["data-orbit-agent-history-feedback"] !== undefined,
  );
  return nodes[0] ?? null;
}

test("history follows every server cursor page and shows all of the drained conversations", async (t) => {
  const harness = await mountAgent(t, {
    sessionPages: [
      [session("session:a", "第一页对话", "2026-09-20T00:00:00.000Z")],
      [session("session:b", "第二页对话", "2026-09-19T00:00:00.000Z")],
      [session("session:c", "第三页对话", "2026-09-18T00:00:00.000Z")],
    ],
  });
  await openDrawer(harness);

  const listCalls = harness.calls.filter((call) => call.url.startsWith("/api/ai/conversations/sessions?"));
  assert.equal(listCalls.length, 3);
  assert.ok(listCalls[0].url.includes("limit=50"));
  assert.ok(listCalls[0].url.includes("v=2"));
  assert.equal(listCalls[0].url.includes("cursor="), false);
  assert.ok(listCalls[1].url.includes("cursor=1"));
  assert.ok(listCalls[2].url.includes("cursor=2"));
  assert.deepEqual(historyTitles(harness.root), ["第一页对话", "第二页对话", "第三页对话"]);
});

test("pinned conversations sort above newer ones and keep their custom title", async (t) => {
  const harness = await mountAgent(t, {
    sessionPages: [
      [
        session("session:new", "最新的对话", "2026-09-21T00:00:00.000Z"),
        session("session:old", "很久以前", "2026-09-01T00:00:00.000Z", {
          customTitle: "钉在最上面",
          organization: { customTitle: "钉在最上面", groupId: null, pinned: true, revision: 2 },
        }),
      ],
    ],
  });
  await openDrawer(harness);

  assert.deepEqual(historyTitles(harness.root), ["钉在最上面", "最新的对话"]);
});

test("filtering by a group narrows the list to that group's conversations", async (t) => {
  const harness = await mountAgent(t, {
    groups: [GROUP],
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

  assert.deepEqual(historyTitles(harness.root), ["工作里的对话", "没有分组的对话"]);

  act(() => buttonWithText(harness.root, "分组").props.onClick());
  act(() => buttonWithText(harness.root, "打开").props.onClick());
  await harness.settle(1);

  assert.deepEqual(historyTitles(harness.root), ["工作里的对话"]);

  act(() => buttonWithText(harness.root, "全部会话").props.onClick());
  await harness.settle(1);
  assert.deepEqual(historyTitles(harness.root), ["工作里的对话", "没有分组的对话"]);
});

test("renaming a conversation patches its organization and confirms with a toast", async (t) => {
  const harness = await mountAgent(t, {
    sessionPages: [[session("session:a", "原来的名字", "2026-09-20T00:00:00.000Z")]],
  });
  await openDrawer(harness);

  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-menu-button": "session:a" }).props.onClick());
  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-rename": "session:a" }).props.onClick());
  act(() =>
    harness.root.root
      .findByProps({ "data-orbit-agent-history-rename-input": "session:a" })
      .props.onChange({ target: { value: "改过的名字" } }),
  );
  await act(async () => {
    // 任务 6a：对话屏的输入区也是 `<form>`，抽屉里的重命名表单要按它自己的
    // 输入标记挑出来（旧壳只有侧栏那一个 form）。
    harness.root.root
      .findAllByType("form")
      .find((form) =>
        form.findAll((node) => Boolean(node.props["data-orbit-agent-history-rename-input"])).length > 0,
      )!
      .props.onSubmit({ preventDefault() {} });
  });
  await harness.settle();

  assert.equal(harness.organizationPatches.length, 1);
  assert.equal(harness.organizationPatches[0].sessionId, "session:a");
  const body = harness.organizationPatches[0].body;
  assert.deepEqual(body.patch, { customTitle: "改过的名字" });
  assert.equal(body.expectedRevision, 0);
  assert.equal(typeof body.mutationId, "string");
  assert.deepEqual(historyTitles(harness.root), ["改过的名字"]);
  const banner = toast(harness.root);
  assert.ok(banner);
  assert.equal(banner.props["data-orbit-agent-history-feedback"], "success");
  assert.equal(banner.props.role, "status");
  assert.ok(textOf(banner.children as unknown).includes("对话已重命名"));
});

test("pinning a conversation sends the pin patch and reorders the list", async (t) => {
  const harness = await mountAgent(t, {
    sessionPages: [
      [
        session("session:new", "较新的对话", "2026-09-21T00:00:00.000Z"),
        session("session:old", "较旧的对话", "2026-09-01T00:00:00.000Z"),
      ],
    ],
  });
  await openDrawer(harness);

  assert.deepEqual(historyTitles(harness.root), ["较新的对话", "较旧的对话"]);
  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-menu-button": "session:old" }).props.onClick());
  await act(async () => {
    harness.root.root.findByProps({ "data-orbit-agent-history-pin": "session:old" }).props.onClick();
  });
  await harness.settle();

  assert.deepEqual(harness.organizationPatches[0].body.patch, { pinned: true });
  assert.deepEqual(historyTitles(harness.root), ["较旧的对话", "较新的对话"]);
  assert.ok(textOf(toast(harness.root)!.children as unknown).includes("对话已置顶"));
});

test("a rejected organization write keeps the list unchanged and says so in an alert toast", async (t) => {
  const harness = await mountAgent(t, {
    organizationPersisted: false,
    sessionPages: [[session("session:a", "原来的名字", "2026-09-20T00:00:00.000Z")]],
  });
  await openDrawer(harness);

  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-menu-button": "session:a" }).props.onClick());
  await act(async () => {
    harness.root.root.findByProps({ "data-orbit-agent-history-pin": "session:a" }).props.onClick();
  });
  await harness.settle();

  assert.deepEqual(historyTitles(harness.root), ["原来的名字"]);
  const banner = toast(harness.root);
  assert.ok(banner);
  assert.equal(banner.props["data-orbit-agent-history-feedback"], "error");
  assert.equal(banner.props.role, "alert");
  assert.ok(
    textOf(banner.children as unknown).includes("未能保存对话历史更改，页面保持原状态。请稍后重试。"),
  );
});

test("the toast can be dismissed by its close button", async (t) => {
  const harness = await mountAgent(t, {
    sessionPages: [[session("session:a", "一个对话", "2026-09-20T00:00:00.000Z")]],
  });
  await openDrawer(harness);

  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-menu-button": "session:a" }).props.onClick());
  await act(async () => {
    harness.root.root.findByProps({ "data-orbit-agent-history-pin": "session:a" }).props.onClick();
  });
  await harness.settle();
  assert.ok(toast(harness.root));

  act(() => harness.root.root.findByProps({ "aria-label": "关闭提示" }).props.onClick());
  assert.equal(toast(harness.root), null);
});

test("deleting a conversation asks for confirmation first and only then calls DELETE", async (t) => {
  const harness = await mountAgent(t, {
    sessionPages: [[session("session:a", "要删掉的对话", "2026-09-20T00:00:00.000Z")]],
  });
  await openDrawer(harness);

  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-menu-button": "session:a" }).props.onClick());
  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-delete": "session:a" }).props.onClick());

  const dialog = harness.root.root.findByProps({ role: "alertdialog" });
  assert.equal(dialog.props["aria-modal"], "true");
  assert.ok(renderedText(harness.root).includes("删除这个对话？"));
  assert.deepEqual(harness.deletedSessionIds, []);

  // 「保留对话」取消：既不请求也不改列表。
  act(() => buttonWithText(harness.root, "保留对话").props.onClick());
  assert.deepEqual(harness.deletedSessionIds, []);
  assert.deepEqual(historyTitles(harness.root), ["要删掉的对话"]);

  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-menu-button": "session:a" }).props.onClick());
  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-delete": "session:a" }).props.onClick());
  await act(async () => {
    harness.root.root.findByProps({ "data-orbit-agent-history-confirm-delete": true }).props.onClick();
  });
  await harness.settle();

  assert.deepEqual(harness.deletedSessionIds, ["session:a"]);
  assert.deepEqual(historyTitles(harness.root), []);
  assert.equal(harness.root.root.findAllByProps({ role: "alertdialog" }).length, 0);
  assert.ok(textOf(toast(harness.root)!.children as unknown).includes("对话已删除"));
});

test("a delete the queue could not persist keeps the conversation and explains inside the dialog", async (t) => {
  const harness = await mountAgent(t, {
    removePersisted: false,
    sessionPages: [[session("session:a", "删不掉的对话", "2026-09-20T00:00:00.000Z")]],
  });
  await openDrawer(harness);

  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-menu-button": "session:a" }).props.onClick());
  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-delete": "session:a" }).props.onClick());
  await act(async () => {
    harness.root.root.findByProps({ "data-orbit-agent-history-confirm-delete": true }).props.onClick();
  });
  await harness.settle();

  assert.deepEqual(harness.deletedSessionIds, ["session:a"]);
  assert.deepEqual(historyTitles(harness.root), ["删不掉的对话"]);
  const alert = harness.root.root.findAllByProps({ role: "alert" })[0];
  assert.ok(
    textOf(alert.children as unknown).includes("未能删除这个对话，历史记录保持不变。请稍后重试。"),
  );
  // 对话框留在原地，用户可以重试。
  assert.ok(harness.root.root.findByProps({ role: "alertdialog" }));
});

// iOrbit 任务 1c 修订轮 1：上面两条删除用例删的都是**非当前**会话，
// `confirmDeleteHistorySession` 里「删掉的就是当前会话」那一支（九个对话侧重置 +
// 清 `orbit-agent-chat-active-session-v1` + 回 `/app/agent`）在全仓没有任何覆盖。
// 1c 把这一支改走 `bindChat` 注册的桥接对象后，接线写错（hook 顺序反了、漏调
// `bindChat`）会让被删的会话连同 `?session=` URL 与陈旧 localStorage 留在屏幕上，
// 而 toast 还报「对话已删除」。这条用例锁住那一支。
test("deleting the conversation you are in clears the thread, the active-session key and the deep link", async (t) => {
  const harness = await mountAgent(t, {
    search: "?session=session%3Arestored",
    sessionPages: [
      [
        {
          createdAt: "2026-09-20T00:00:00.000Z",
          id: "session:restored",
          messages: [
            { role: "user", text: "上次问过的问题" },
            { items: [], kind: "people", panelTitle: "", role: "assistant", text: "上次的回答" },
          ],
          title: "上次的对话",
          updatedAt: "2026-09-20T01:00:00.000Z",
        },
      ],
    ],
  });
  await openDrawer(harness);

  // 前提：这条会话确实是「当前会话」——线程渲染出来了，active key 也写了。
  assert.ok(renderedText(harness.root).includes("上次的回答"));
  assert.equal(harness.localValues.get("orbit-agent-chat-active-session-v1"), "session:restored");
  assert.deepEqual(harness.pushedUrls, []);

  act(() =>
    harness.root.root
      .findByProps({ "data-orbit-agent-history-menu-button": "session:restored" })
      .props.onClick(),
  );
  act(() =>
    harness.root.root
      .findByProps({ "data-orbit-agent-history-delete": "session:restored" })
      .props.onClick(),
  );
  await act(async () => {
    harness.root.root.findByProps({ "data-orbit-agent-history-confirm-delete": true }).props.onClick();
  });
  await harness.settle();

  assert.deepEqual(harness.deletedSessionIds, ["session:restored"]);
  // 对话侧重置：线程清空、深链回到 /app/agent、active key 清掉。
  assert.equal(renderedText(harness.root).includes("上次的回答"), false);
  assert.equal(renderedText(harness.root).includes("上次问过的问题"), false);
  assert.equal(harness.pushedUrls.at(-1), "/app/agent");
  assert.equal(harness.localValues.has("orbit-agent-chat-active-session-v1"), false);
  // 历史侧：列表空了，toast 报成功。
  assert.deepEqual(historyTitles(harness.root), []);
  assert.ok(textOf(toast(harness.root)!.children as unknown).includes("对话已删除"));
});

test("returning to the tab refreshes history and groups written by another client", async (t) => {
  const pages: StoredSessionFixture[][] = [[session("session:a", "本标签页的对话", "2026-09-20T00:00:00.000Z")]];
  const harness = await mountAgent(t, { sessionPages: pages });
  await openDrawer(harness);
  assert.deepEqual(historyTitles(harness.root), ["本标签页的对话"]);

  pages[0] = [
    ...pages[0],
    session("session:b", "另一个标签页写的对话", "2026-09-21T00:00:00.000Z"),
  ];
  await harness.fireWindowEvent("focus");

  assert.deepEqual(historyTitles(harness.root), ["另一个标签页写的对话", "本标签页的对话"]);
});
