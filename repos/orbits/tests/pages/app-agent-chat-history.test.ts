import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  agentChatHistorySessionsToHistory,
  parseAgentChatHistoryStorage,
  titleFromMessages,
} from "../../app/(app)/app/agent/orbit-real-agent";
import { chatRouteToOrbitAgentViewModel } from "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

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

test("agent chat history parser keeps refreshable sessions under the older group", () => {
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
  const history = agentChatHistorySessionsToHistory(sessions, "zh");

  assert.equal(history.length, 1);
  assert.equal(history[0].group, "更早");
  assert.equal(history[0].sessionId, "session-1");
  assert.equal(history[0].title, "食品供应链人脉");
  assert.doesNotMatch(history.map((item) => item.group).join(" "), /关系聊天/);
});

test("agent chat history keeps initial message order after a previous session is reopened", () => {
  const history = agentChatHistorySessionsToHistory(
    [
      {
        createdAt: "2026-07-09T02:00:00.000Z",
        id: "older-session",
        messages: [{ role: "user", text: "第一段对话" }],
        title: "第一段对话",
        updatedAt: "2026-07-09T04:30:00.000Z",
      },
      {
        createdAt: "2026-07-09T03:00:00.000Z",
        id: "newer-session",
        messages: [{ role: "user", text: "第二段对话" }],
        title: "第二段对话",
        updatedAt: "2026-07-09T03:05:00.000Z",
      },
    ],
    "zh",
  );

  assert.deepEqual(
    history.map((item) => item.sessionId),
    ["newer-session", "older-session"],
  );
});

test("agent chat history pins sessions above normal initial-time ordering and keeps custom titles", () => {
  const sessions = parseAgentChatHistoryStorage(
    JSON.stringify([
      {
        createdAt: "2026-07-09T02:00:00.000Z",
        customTitle: "Maya 活动跟进",
        id: "pinned-older-session",
        messages: [{ role: "user", text: "帮我推荐下周适合见 Maya 的活动" }],
        pinned: true,
        title: "旧标题",
        updatedAt: "2026-07-09T02:05:00.000Z",
      },
      {
        createdAt: "2026-07-09T03:00:00.000Z",
        id: "normal-newer-session",
        messages: [{ role: "user", text: "帮我找适合聊食品供应链的人" }],
        title: "食品供应链人脉",
        updatedAt: "2026-07-09T03:05:00.000Z",
      },
    ]),
  );
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
});

test("agent sidebar persists sessions through the Orbit Agent sessions API", () => {
  const source = readProjectFile("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(source, /\/api\/ai\/conversations\/sessions/);
  assert.match(source, /loadStoredAgentChatSessions/);
  assert.match(source, /persistStoredAgentChatSession/);
  assert.match(source, /history=\{storedHistory\}/);
  assert.match(source, /restoreSession\(session\)/);
  assert.match(source, /currentAgentSessionId\(\)/);
  assert.doesNotMatch(source, /localStorage\.getItem\(AGENT_CHAT_HISTORY_STORAGE_KEY\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\(\s*AGENT_CHAT_HISTORY_STORAGE_KEY/);
  assert.doesNotMatch(source, /history=\{viewModel\.history\}/);
});

test("agent sidebar exposes deletion and width resizing controls for history", () => {
  const source = readProjectFile("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(source, /deleteStoredAgentChatSession/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /data-orbit-agent-history-menu-button/);
  assert.match(source, /data-orbit-agent-history-menu/);
  assert.match(source, /data-orbit-agent-history-delete/);
  assert.match(source, /data-orbit-agent-history-pin/);
  assert.match(source, /data-orbit-agent-history-rename/);
  assert.match(source, /<Icon name="more"/);
  assert.doesNotMatch(
    source,
    /data-orbit-agent-history-delete[\s\S]{0,700}<Icon name="x"/,
  );
  assert.match(source, /onDelete=\{deleteHistorySession\}/);
  assert.match(source, /onRename=\{renameHistorySession\}/);
  assert.match(source, /onTogglePin=\{togglePinnedHistorySession\}/);
  assert.match(source, /data-orbit-agent-history-resize-handle/);
  assert.match(source, /setHistorySidebarWidth/);
  assert.match(source, /role="separator"/);
});
