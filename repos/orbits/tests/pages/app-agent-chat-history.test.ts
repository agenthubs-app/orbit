import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  agentChatHistoryMutationWasPersisted,
  agentChatHistorySessionsToHistory,
  loadStoredAgentChatSessions,
  parseAgentChatHistoryStorage,
  titleFromMessages,
  upsertAgentChatSummary,
} from "../../app/(app)/app/agent/iorbit-0918/iorbit-model";

const summary = (input: {
  id: string; title: string; firstUserText: string; createdAt: string; updatedAt: string;
  customTitle?: string | null; pinned?: boolean; groupId?: string | null;
}) => ({
  id: input.id,
  title: input.title,
  firstUserText: input.firstUserText,
  lastMessagePreview: "preview",
  createdAt: input.createdAt,
  updatedAt: input.updatedAt,
  messageRevision: 2,
  organization: { customTitle: input.customTitle ?? null, groupId: input.groupId ?? null, pinned: input.pinned === true, revision: 1 },
});
import { chatRouteToOrbitAgentViewModel } from "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

// iOrbit 任务 1b：纯函数搬到 `iorbit-model.ts`、对话状态/hydration 搬到
// `use-agent-chat.ts`，JSX 留在 `orbit-real-agent.tsx`。源码断言按此拆成两半。
// iOrbit 任务 1c：会话列表 / 分组 / 置顶 / 重命名 / 删除 / 乐观写队列 / toast /
// 侧栏拖拽宽度搬到 `use-agent-history.ts`，JSX（菜单、二次确认对话框、resize
// handle、toast 容器）仍留在 JSX。
// iOrbit 任务 6a：`orbit-real-agent.tsx` 删除，JSX 一侧的断言改指新壳
// `iorbit-shell.tsx` 与新抽屉 `iorbit-history-drawer.tsx`（常驻侧栏与拖拽宽度是任务 4
// 记过的能力移除，相关断言已在任务 4 删除）。
const IORBIT_MODEL_PATH = "app/(app)/app/agent/iorbit-0918/iorbit-model.ts";
const IORBIT_CHAT_HOOK_PATH = "app/(app)/app/agent/iorbit-0918/use-agent-chat.ts";
const IORBIT_HISTORY_HOOK_PATH = "app/(app)/app/agent/iorbit-0918/use-agent-history.ts";
const IORBIT_SHELL_PATH = "app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx";
const IORBIT_DRAWER_PATH = "app/(app)/app/agent/iorbit-0918/iorbit-history-drawer.tsx";

function minimalChatRouteModel() {
  return {
    state: "success",
    workspace: {
      conversations: [
        {
          conversationId: "conversation-a",
          evidenceIds: [],
          lastMessagePreview: "Latest relationship chat",
          organization: "北星食品",
          participantName: "佐藤 健一",
          statusLabel: "Active",
          title: "佐藤 健一 conversation",
        },
      ],
      primaryAssist: null,
      relationshipContext: {
        latestContext: "Recent relationship context",
        organization: "北星食品",
        participantName: "佐藤 健一",
        recommendedFollowup: "Follow up after the event.",
        relationshipReason: "Existing source-backed relationship.",
      },
      selectedConversation: {
        conversationId: "conversation-a",
        evidenceIds: [],
        lastMessagePreview: "Latest relationship chat",
        organization: "北星食品",
        participantName: "佐藤 健一",
        statusLabel: "Active",
        title: "佐藤 健一 conversation",
      },
      threadSummary: "Conversation summary",
    },
  };
}

test("agent sidebar adapter does not expose relationship chat groups as history", () => {
  const viewModel = chatRouteToOrbitAgentViewModel(
    minimalChatRouteModel() as unknown as Parameters<
      typeof chatRouteToOrbitAgentViewModel
    >[0],
  );

  assert.deepEqual(viewModel.history, []);
});

test("agent chat history parser keeps refreshable sessions under the ungrouped section", () => {
  const sessions = parseAgentChatHistoryStorage(
    JSON.stringify([
      {
        createdAt: "2026-07-09T02:00:00.000Z",
        id: "session-1",
        messages: [
          { role: "user", text: "帮我找适合聊食品供应链的人" },
          {
            items: [],
            kind: "people",
            panelTitle: "",
            role: "assistant",
            text: "可以，先看北星食品附近的联系人。",
          },
        ],
        title: "食品供应链人脉",
        updatedAt: "2026-07-09T02:30:00.000Z",
      },
    ]),
  );
  const history = agentChatHistorySessionsToHistory([
    summary({ id: sessions[0].id, title: sessions[0].title, firstUserText: "帮我找适合聊食品供应链的人", createdAt: sessions[0].createdAt, updatedAt: sessions[0].updatedAt }),
  ], "zh");

  assert.equal(history.length, 1);
  assert.equal(history[0].group, "未分组");
  assert.equal(history[0].sessionId, "session-1");
  assert.equal(history[0].title, "食品供应链人脉");
  assert.doesNotMatch(history.map((item) => item.group).join(" "), /关系聊天/);
});

test("agent chat history loader requests exactly one filtered summary page", async (t) => {
  const session = (index: number) => summary({
    createdAt: `2026-07-09T02:${String(index).padStart(2, "0")}:00.000Z`,
    id: `session-${index}`,
    firstUserText: `问题 ${index}`,
    title: `会话 ${index}`,
    updatedAt: `2026-07-09T02:${String(index).padStart(2, "0")}:30.000Z`,
  });
  const items = Array.from({ length: 20 }, (_, index) => session(index));
  const requested: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    requested.push(String(input));
    return Response.json({ success: true, data: {
      items,
      hasMore: true,
      nextCursor: "page-two",
      storage: { configured: true, persisted: true },
    } });
  });

  const page = await loadStoredAgentChatSessions({
    groupId: "group-1",
    limit: 20,
    q: "needle",
  });

  assert.deepEqual(page?.items.map((item) => item.id), items.map((item) => item.id));
  assert.equal(page?.hasMore, true);
  assert.equal(page?.nextCursor, "page-two");
  assert.equal(requested.length, 1);
  const query = new URL(requested[0]!, "https://orbit.test").searchParams;
  assert.equal(query.get("limit"), "20");
  assert.equal(query.get("groupId"), "group-1");
  assert.equal(query.get("q"), "needle");
});

test("explicitly loaded summary pages are not silently truncated at the former 10k request cap", () => {
  const sessions = Array.from({ length: 10_001 }, (_, index) => summary({
    createdAt: `2026-07-09T02:${String(index % 60).padStart(2, "0")}:00.000Z`,
    id: `session-${index}`,
    firstUserText: `问题 ${index}`,
    title: `会话 ${index}`,
    updatedAt: `2026-07-09T02:${String(index % 60).padStart(2, "0")}:30.000Z`,
  }));
  const history = agentChatHistorySessionsToHistory(sessions, "zh");

  assert.equal(history.length, 10_001);
  const withNewSession = upsertAgentChatSummary(sessions, summary({
    createdAt: "2026-07-10T00:00:00.000Z",
    id: "new-session",
    firstUserText: "new question",
    title: "New session",
    updatedAt: "2026-07-10T00:00:00.000Z",
  }));
  assert.equal(withNewSession.length, 10_002);
  assert.equal(withNewSession.at(-1)?.id, "session-10000");
});

test("agent chat history parser preserves minimal persisted assistant messages", () => {
  const sessions = parseAgentChatHistoryStorage(
    JSON.stringify([
      {
        createdAt: "2026-07-30T18:52:05.854Z",
        id: "minimal-assistant-session",
        messages: [
          { role: "user", text: "保留这段对话" },
          { role: "assistant", text: "这条消息来自共享会话存储合同。" },
        ],
        pinned: false,
        title: "共享存储合同",
        updatedAt: "2026-07-30T18:52:05.854Z",
      },
    ]),
  );

  assert.equal(sessions.length, 1);
  assert.deepEqual(
    sessions[0].messages.map((message) => ({
      role: message.role,
      text: message.text,
    })),
    [
      { role: "user", text: "保留这段对话" },
      { role: "assistant", text: "这条消息来自共享会话存储合同。" },
    ],
  );
  assert.deepEqual(sessions[0].messages[1], {
    items: [],
    kind: "people",
    panelTitle: "",
    role: "assistant",
    text: "这条消息来自共享会话存储合同。",
  });
});

test("agent chat history merges duplicate and overlapping persisted evidence references", () => {
  const duplicateReference = {
    evidenceIds: ["evidence:event:1", "evidence:event:2"],
    generatedAt: "2026-07-29T10:00:00.000Z",
    itemCount: 2,
    label: "推荐活动",
    sourceModules: ["orbit-ai", "events"],
  };
  const overlappingReference = {
    ...duplicateReference,
    evidenceIds: ["evidence:event:2"],
    itemCount: 1,
  };
  const sessions = parseAgentChatHistoryStorage(
    JSON.stringify([
      {
        createdAt: "2026-07-29T10:00:00.000Z",
        id: "duplicate-evidence-session",
        messages: [
          { role: "user", text: "推荐活动" },
          {
            evidenceRefs: [
              duplicateReference,
              duplicateReference,
              overlappingReference,
            ],
            items: [],
            kind: "events",
            panelTitle: "推荐活动",
            role: "assistant",
            text: "找到两个活动。",
          },
        ],
        title: "推荐活动",
        updatedAt: "2026-07-29T10:01:00.000Z",
      },
    ]),
  );
  const assistant = sessions[0]?.messages[1];

  assert.equal(assistant?.role, "assistant");
  assert.deepEqual(
    assistant?.role === "assistant" ? assistant.evidenceRefs : undefined,
    [duplicateReference],
  );
});

test("agent chat history preserves a failed message's retry request", () => {
  const sessions = parseAgentChatHistoryStorage(
    JSON.stringify([
      {
        createdAt: "2026-07-29T09:00:00.000Z",
        id: "failed-session",
        messages: [
          { role: "user", text: "重新检查这段关系" },
          {
            items: [],
            kind: "people",
            panelTitle: "",
            retryRequest: "重新检查这段关系",
            role: "assistant",
            text: "Agent 暂时无法完成这次回复，请稍后再试。",
          },
        ],
        title: "关系检查",
        updatedAt: "2026-07-29T09:01:00.000Z",
      },
    ]),
  );
  const failedMessage = sessions[0]?.messages[1];

  assert.equal(failedMessage?.role, "assistant");
  assert.equal(
    failedMessage?.role === "assistant"
      ? failedMessage.retryRequest
      : undefined,
    "重新检查这段关系",
  );
});

test("agent chat history keeps initial message order after a previous session is reopened", () => {
  const history = agentChatHistorySessionsToHistory(
    [
      summary({
        createdAt: "2026-07-09T02:00:00.000Z",
        id: "older-session",
        firstUserText: "第一段对话",
        title: "第一段对话",
        updatedAt: "2026-07-09T04:30:00.000Z",
      }),
      summary({
        createdAt: "2026-07-09T03:00:00.000Z",
        id: "newer-session",
        firstUserText: "第二段对话",
        title: "第二段对话",
        updatedAt: "2026-07-09T03:05:00.000Z",
      }),
    ],
    "zh",
  );

  assert.deepEqual(
    history.map((item) => item.sessionId),
    ["older-session", "newer-session"],
  );
});

test("agent chat history pins sessions above normal initial-time ordering and keeps custom titles", () => {
  const sessions = [
    summary({ createdAt: "2026-07-09T02:00:00.000Z", customTitle: "Maya 活动跟进", firstUserText: "帮我推荐下周适合见 Maya 的活动", id: "pinned-older-session", pinned: true, title: "旧标题", updatedAt: "2026-07-09T02:05:00.000Z" }),
    summary({ createdAt: "2026-07-09T03:00:00.000Z", firstUserText: "帮我找适合聊食品供应链的人", id: "normal-newer-session", title: "食品供应链人脉", updatedAt: "2026-07-09T03:05:00.000Z" }),
  ];
  const history = agentChatHistorySessionsToHistory(sessions, "zh");

  assert.deepEqual(
    history.map((item) => item.sessionId),
    ["pinned-older-session", "normal-newer-session"],
  );
  assert.equal(history[0].pinned, true);
  assert.equal(history[0].title, "Maya 活动跟进");
});

test("agent chat history titles are compact phrases derived from the first question", () => {
  assert.equal(
    titleFromMessages([
      {
        role: "user",
        text: "帮我找适合聊食品供应链的人，最好在东京和零售相关",
      },
    ]),
    "食品供应链人脉",
  );
  assert.equal(
    titleFromMessages([
      {
        role: "user",
        text: "帮我推荐下周适合见 Maya 的活动",
      },
    ]),
    "Maya 见面活动",
  );
  assert.notEqual(
    titleFromMessages([
      {
        role: "user",
        text: "帮我推荐下周适合见 Maya 的活动",
      },
    ]),
    "帮我推荐下周适合见 Maya 的活动",
  );
  assert.equal(
    titleFromMessages([
      {
        role: "user",
        text: "请基于我在 Orbit 中已有的人脉与活动数据，推荐下周最值得联系的人；不要发送消息或创建日程",
      },
    ]),
    "人脉与活动数据",
  );
  assert.equal(
    titleFromMessages([
      {
        role: "user",
        text: "在我现有的人脉中找适合聊出海的人",
      },
    ]),
    "聊出海人脉",
  );
});

test("agent sidebar persists sessions through the Orbit Agent sessions API", () => {
  const source = readProjectFile(IORBIT_SHELL_PATH);
  const modelSource = readProjectFile(IORBIT_MODEL_PATH);
  const chatHookSource = readProjectFile(IORBIT_CHAT_HOOK_PATH);
  const historyHookSource = readProjectFile(IORBIT_HISTORY_HOOK_PATH);

  assert.match(modelSource, /\/api\/ai\/conversations\/sessions/);
  assert.match(historyHookSource, /loadStoredAgentChatSessions/);
  assert.match(chatHookSource, /persistStoredAgentChatSession/);
  assert.match(source, /history=\{storedHistory\}/);
  assert.match(chatHookSource, /restoreSession\(session\)/);
  assert.match(chatHookSource, /currentAgentSessionId\(\)/);
  for (const agentSource of [source, modelSource, chatHookSource, historyHookSource]) {
    assert.doesNotMatch(agentSource, /localStorage\.getItem\(AGENT_CHAT_HISTORY_STORAGE_KEY\)/);
    assert.doesNotMatch(agentSource, /localStorage\.setItem\(\s*AGENT_CHAT_HISTORY_STORAGE_KEY/);
  }
  assert.doesNotMatch(source, /history=\{viewModel\.history\}/);
});

test("agent history mutations require explicit persisted storage evidence", () => {
  assert.equal(
    agentChatHistoryMutationWasPersisted({
      data: { storage: { configured: true, persisted: true } },
      success: true,
    }),
    true,
  );
  assert.equal(
    agentChatHistoryMutationWasPersisted({
      data: { storage: { configured: false, persisted: false } },
      success: true,
    }),
    false,
  );
  assert.equal(
    agentChatHistoryMutationWasPersisted({
      error: { code: "SERVICE_UNAVAILABLE" },
      success: false,
    }),
    false,
  );
});

test("agent home starts fresh unless the URL explicitly selects a session", () => {
  // hydration 已整体搬进 use-agent-chat.ts，深链判定在 hook 文件上断言。
  const source = readProjectFile(IORBIT_CHAT_HOOK_PATH);

  assert.match(source, /const sessionId = currentAgentSessionId\(\);/);
  assert.doesNotMatch(
    source,
    /currentAgentSessionId\(\)\s*\|\|[\s\S]{0,240}AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY/,
  );
  assert.match(source, /if \(session\) \{\s*restoreSession\(session\);/);
  assert.match(source, /const query = currentAgentQuery\(\);/);
});

test("agent sidebar exposes deletion controls for history", () => {
  // iOrbit 任务 6a：删除控件今天分散在三个文件上——抽屉里的菜单与行内控件、壳上的
  // 二次确认与 toast、`iorbit-rich-components.tsx` 里的 `AgentHistoryDeleteDialog`
  // （从删除的 `orbit-real-agent.tsx` 逐字搬来）。断言因此对这三份拼起来的源码做。
  const source = [
    readProjectFile(IORBIT_SHELL_PATH),
    readProjectFile(IORBIT_DRAWER_PATH),
    readProjectFile("app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx"),
  ].join("\n");
  const accountShell = readProjectFile("app/(app)/app/orbit-account-shell.tsx");
  const publicShell = readProjectFile("app/(app)/app/orbit-public-shell.tsx");
  const styles = readProjectFile(
    "app/(app)/app/orbit-reference-styles.tsx",
  );

  const historyHookSource = readProjectFile(IORBIT_HISTORY_HOOK_PATH);

  // 删除请求本体在 model（`deleteStoredAgentChatSession`），调用点在
  // `use-agent-history`（任务 1c），菜单与二次确认在 JSX。
  assert.match(readProjectFile(IORBIT_MODEL_PATH), /deleteStoredAgentChatSession/);
  assert.match(historyHookSource, /deleteStoredAgentChatSession/);
  assert.match(readProjectFile(IORBIT_MODEL_PATH), /method: "DELETE"/);
  assert.match(source, /data-orbit-agent-history-menu-button/);
  assert.match(source, /data-orbit-agent-history-menu/);
  assert.match(source, /data-orbit-agent-history-delete/);
  assert.match(source, /data-orbit-agent-history-delete-confirmation/);
  assert.match(source, /data-orbit-agent-history-confirm-delete/);
  assert.match(source, /role="alertdialog"/);
  // 任务 6a：这条判据在 model 里（`deleteStoredAgentChatSession` 的返回值就是它）。
  assert.match(readProjectFile(IORBIT_MODEL_PATH), /agentChatHistoryMutationWasPersisted/);
  assert.match(historyHookSource, /historyMutationSessionIdRef/);
  assert.match(source, /data-orbit-agent-history-pin/);
  assert.match(source, /data-orbit-agent-history-rename/);
  assert.match(
    source,
    /aria-label=\{t\(\{ en: "Rename conversation", zh: "重命名对话" \}\)\}/,
  );
  assert.match(source, /data-orbit-agent-history-save-rename/);
  assert.match(source, /data-orbit-agent-history-cancel-rename/);
  assert.doesNotMatch(
    source,
    /data-orbit-agent-history-rename-input=\{item\.sessionId\}[\s\S]{0,180}onBlur=/,
  );
  assert.match(source, /onDelete=\{deleteHistorySession\}/);
  assert.match(source, /onRename=\{renameHistorySession\}/);
  assert.match(source, /onTogglePin=\{togglePinnedHistorySession\}/);
  // iOrbit 任务 4：常驻侧栏与拖拽宽度是本计划唯一的能力移除（设计 786–804 无侧栏），
  // 原来在这里的 7 条 resize 断言随之删除——它们只在已不再被渲染的
  // `orbit-real-agent.tsx` 上成立。新屏一侧由 `orbit-sidebar-width-constant.test.ts`
  // 的「the iOrbit history surface has no resizable sidebar」防回流。
  // 任务 6a：桌面/移动两套 DOM 随 `orbit-real-agent.tsx` 一起删除，抽屉只剩一套
  // （任务 4 的「壳形态变化」）。断言因此改指新抽屉的同名能力标记。
  assert.match(source, /function IOrbitHistoryDrawer/);
  assert.match(source, /data-orbit-agent-history-search/);
  assert.match(source, /setTimeout\(\(\) => onSearch\(searchDraft\.trim\(\)\), 250\)/);
  assert.match(source, /onLoadMore\(\)/);
  assert.match(source, /data-orbit-agent-history-drawer/);
  assert.match(source, /const panelRef = useOrbitModalA11y\(onClose\)/);
  assert.match(source, /aria-labelledby="orbit-iorbit-history-title"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /role="dialog"/);
  assert.match(
    accountShell,
    /mobileRightExtra=\{\s*<>\s*\{mobileRightExtra\}\s*<RelationshipInboxTrigger \/>/,
  );
  assert.match(publicShell, /className="orbit-nav-mobile-extra"/);
  assert.match(
    styles,
    /\[data-orbit-real-page\] \.orbit-nav-mobile-extra \{\s*display: none;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*\[data-orbit-real-page\] \.orbit-nav-extra,[\s\S]*display: none;[\s\S]*\[data-orbit-real-page\] \.orbit-nav-mobile-extra \{\s*display: contents;/,
  );
});

// iOrbit 任务 6a：原来这里有一条 "agent history uses a flat, left-aligned navigation
// list"，断的是常驻侧栏的旧皮肤类（`orbit-agent-new-chat` / `orbit-agent-history-entry`
// / `orbit-agent-history-title` / `orbit-agent-history-more`）。侧栏是任务 4 记过的唯一
// 能力移除，这些类随 `orbit-real-agent.tsx` 一起消失；在售的那一套由下面那条用例断。

// iOrbit 任务 4：今天跑在 /app/agent 上的历史面是 `iorbit-history-drawer.tsx`
// （设计 786–804）。上面那条用例断的是尚未删除的旧文件；这条断**在售的那一套**，
// 免得「能力保留」只是旧文件里还留着代码。
test("the shipped history surface is the Orbit_0918 drawer and keeps every write control", () => {
  const drawerSource = readProjectFile(
    "app/(app)/app/agent/iorbit-0918/iorbit-history-drawer.tsx",
  );
  const shellSource = readProjectFile("app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx");

  for (const marker of [
    "data-orbit-agent-history-drawer",
    "data-orbit-agent-history-menu-button",
    "data-orbit-agent-history-menu",
    "data-orbit-agent-history-pin",
    "data-orbit-agent-history-rename",
    "data-orbit-agent-history-rename-input",
    "data-orbit-agent-history-save-rename",
    "data-orbit-agent-history-cancel-rename",
    "data-orbit-agent-history-delete",
  ]) {
    assert.ok(drawerSource.includes(marker), `the drawer dropped ${marker}`);
  }

  // 删除二次确认与 toast 仍挂在壳上，走既有组件。
  assert.match(shellSource, /<AgentHistoryDeleteDialog/);
  assert.match(shellSource, /data-orbit-agent-history-feedback=\{historyFeedback\.kind\}/);
  assert.match(shellSource, /<IOrbitHistoryDrawer/);
  // 移动端不再单独一棵树：旧的 AgentMobileHistoryDrawer 不再被壳挂载
  // （文件头注释里还写着它的名字，所以断的是 JSX 用法而不是字面量）。
  assert.doesNotMatch(shellSource, /<AgentMobileHistoryDrawer/);
});
