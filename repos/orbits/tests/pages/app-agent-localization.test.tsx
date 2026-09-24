import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createMockOrbitAgentConversationService } from "../../features/orbit-ai/mock-conversation-service";
import { localizeOrbitAiPanelProactiveContext } from "../../features/orbit-ai/panel-localization";
import { loadOrbitAiProactiveCalendarMessagesForApp } from "../../features/orbit-ai/proactive-calendar-service";
import { syncResult } from "../support/sync-result";
import { iorbitChatSurfaceSource } from "./iorbit-chat-surface-source";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

// iOrbit 任务 1b：纯函数在 `iorbit-model.ts`、对话状态/`ask` 在 `use-agent-chat.ts`，
// JSX 留在 `orbit-real-agent.tsx`。源码断言按此拆成两半。
const IORBIT_MODEL_PATH = "app/(app)/app/agent/iorbit-0918/iorbit-model.ts";
const IORBIT_CHAT_HOOK_PATH = "app/(app)/app/agent/iorbit-0918/use-agent-chat.ts";
const IORBIT_HISTORY_HOOK_PATH = "app/(app)/app/agent/iorbit-0918/use-agent-history.ts";

test("/app/agent Chinese contact artifacts carry localized product labels and answers", () => {
  const result = syncResult(createMockOrbitAgentConversationService().sendMessage({
    locale: "zh",
    message:
      "Find a Japan SMB manufacturing AI workflow PoC buyer with follow-up context.",
  }));

  assert.equal(result.success, true);
  const visibleContract = JSON.stringify({
    artifacts: result.data.artifacts,
    assistantMessage: result.data.assistantMessage,
  });

  assert.match(visibleContract, /我理解你需要人脉推荐/);
  assert.match(visibleContract, /联系人/);
  assert.match(visibleContract, /匹配分/);
  assert.match(visibleContract, /高可信/);
  assert.match(visibleContract, /查看人脉/);
  assert.match(visibleContract, /证据片段/);
});

test("/app/agent Chinese event artifacts use the locale passed through the conversation API", () => {
  const result = syncResult(createMockOrbitAgentConversationService().sendMessage({
    locale: "zh",
    message: "推荐适合见投资人并获得创始人反馈的活动",
  }));

  assert.equal(result.success, true);
  const visibleContract = JSON.stringify({
    artifacts: result.data.artifacts,
    assistantMessage: result.data.assistantMessage,
  });

  assert.match(visibleContract, /我理解你需要活动推荐/);
  assert.match(visibleContract, /活动推荐/);
  assert.match(visibleContract, /复核活动/);
  assert.match(visibleContract, /高可信|证据匹配/);
  assert.match(visibleContract, /参会者意图记录/);
  assert.match(visibleContract, /活动主题记录/);
  assert.match(visibleContract, /任何报名、日历或外部联系动作仍需要你确认/);
});

test("/app/agent proactive calendar context remains localizable without changing technical ids", () => {
  const result = syncResult(loadOrbitAiProactiveCalendarMessagesForApp());
  const message = result.data.messages[0];
  const localized = localizeOrbitAiPanelProactiveContext(message, "zh");
  const visibleContract = JSON.stringify(localized);

  assert.ok(message);
  assert.match(visibleContract, /即将开始/);
  assert.match(visibleContract, /种子投资人准备电话/);
  assert.match(visibleContract, /人物上下文/);
  assert.match(visibleContract, /本地日历记录/);
  assert.match(visibleContract, new RegExp(message?.messageId ?? "$^"));
  assert.doesNotMatch(visibleContract, /starts at/);
  assert.doesNotMatch(visibleContract, /人物上下文：人物上下文/);
});

test("/app/agent localizes server view models and sends locale through the API boundary once", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
  // iOrbit 任务 6a：`orbit-real-agent.tsx` 已删除；对话面的源码断言改读
  // `iorbit-chat-surface-source.ts` 合并的那一组在售文件（内容同源，换了住处）。
  const agentSource = iorbitChatSurfaceSource();

  assert.match(pageSource, /requestedLanguage/);
  assert.match(pageSource, /localizeOrbitTree/);
  const modelSource = readProjectFile(IORBIT_MODEL_PATH);
  const chatHookSource = readProjectFile(IORBIT_CHAT_HOOK_PATH);
  const historyHookSource = readProjectFile(IORBIT_HISTORY_HOOK_PATH);

  assert.match(chatHookSource, /const locale = languageRef\.current === "zh" \? "zh" : "en"/);
  assert.match(
    chatHookSource,
    /JSON\.stringify\(\{ history, \.\.\.reliableRequest \}\)/,
  );
  assert.match(modelSource, /artifactMetadataValue\(item, \["分数", "Score"\]\)/);
  assert.match(chatHookSource, /locale === "zh"/);
  for (const checked of [agentSource, modelSource, chatHookSource, historyHookSource]) {
    assert.doesNotMatch(checked, /localizeOrbitAiPanel/);
  }
});
