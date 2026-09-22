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

// 特征化渲染测试（iOrbit 任务 1a，历史侧）：锁定 `orbit-real-agent.tsx` 今天的
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
    .findAll((node) => typeof node.type === "string" && node.props.className === "orbit-agent-history-title")
    .map((node) => textOf(node.children as unknown));
}

function groupHeadings(root: Parameters<typeof renderedText>[0]): string[] {
  return root.root
    .findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.className === "eyebrow orbit-agent-history-group",
    )
    .map((node) => textOf(node.children as unknown));
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

  assert.deepEqual(groupHeadings(harness.root), ["工作", "未分组"]);
  assert.deepEqual(historyTitles(harness.root), ["工作里的对话", "没有分组的对话"]);

  act(() => buttonWithText(harness.root, "分组").props.onClick());
  act(() => buttonWithText(harness.root, "打开").props.onClick());
  await harness.settle(1);

  assert.deepEqual(historyTitles(harness.root), ["工作里的对话"]);
  assert.deepEqual(groupHeadings(harness.root), ["工作"]);

  act(() => buttonWithText(harness.root, "全部会话").props.onClick());
  await harness.settle(1);
  assert.deepEqual(historyTitles(harness.root), ["工作里的对话", "没有分组的对话"]);
});

test("renaming a conversation patches its organization and confirms with a toast", async (t) => {
  const harness = await mountAgent(t, {
    sessionPages: [[session("session:a", "原来的名字", "2026-09-20T00:00:00.000Z")]],
  });

  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-menu-button": "session:a" }).props.onClick());
  act(() => harness.root.root.findByProps({ "data-orbit-agent-history-rename": "session:a" }).props.onClick());
  act(() =>
    harness.root.root
      .findByProps({ "data-orbit-agent-history-rename-input": "session:a" })
      .props.onChange({ target: { value: "改过的名字" } }),
  );
  await act(async () => {
    harness.root.root.findByType("form").props.onSubmit({ preventDefault() {} });
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

test("returning to the tab refreshes history and groups written by another client", async (t) => {
  const pages: StoredSessionFixture[][] = [[session("session:a", "本标签页的对话", "2026-09-20T00:00:00.000Z")]];
  const harness = await mountAgent(t, { sessionPages: pages });
  assert.deepEqual(historyTitles(harness.root), ["本标签页的对话"]);

  pages[0] = [
    ...pages[0],
    session("session:b", "另一个标签页写的对话", "2026-09-21T00:00:00.000Z"),
  ];
  await harness.fireWindowEvent("focus");

  assert.deepEqual(historyTitles(harness.root), ["另一个标签页写的对话", "本标签页的对话"]);
});
