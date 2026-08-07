import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createMockOrbitAgentConversationService } from "../../features/orbit-ai/mock-conversation-service";
import { localizeOrbitAiPanelProactiveContext } from "../../features/orbit-ai/panel-localization";
import { loadOrbitAiProactiveCalendarMessagesForApp } from "../../features/orbit-ai/proactive-calendar-service";
import { syncResult } from "../support/sync-result";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("/app/agent Chinese contact artifacts carry localized product labels and answers", () => {
  const result = syncResult(createMockOrbitAgentConversationService().sendMessage({
    locale: "zh",
    message:
      "Find a Japan SMB manufacturing AI workflow PoC buyer with follow-up context.",
  }));

  assert.equal(result.success, true);
  if (result.success === false) return;
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
  if (result.success === false) return;
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
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(pageSource, /requestedLanguage/);
  assert.match(pageSource, /localizeOrbitTree/);
  assert.match(agentSource, /const locale = languageRef\.current === "zh" \? "zh" : "en"/);
  assert.match(
    agentSource,
    /JSON\.stringify\(\{ history, locale, message: query \}\)/,
  );
  assert.match(agentSource, /artifactMetadataValue\(item, \["分数", "Score"\]\)/);
  assert.match(agentSource, /locale === "zh"/);
  assert.doesNotMatch(agentSource, /localizeOrbitAiPanel/);
});
