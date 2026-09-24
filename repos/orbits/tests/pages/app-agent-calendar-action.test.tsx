import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AgentActionStatusCard,
  agentChatActionCanConfirm,
} from "../../app/(app)/app/agent/agent-action-status-card";
import { createOrbitAiCalendarActionService } from "../../features/orbit-ai/calendar-action-service";
import { createMockOrbitAgentConversationService } from "../../features/orbit-ai/mock-conversation-service";
import { syncResult } from "../support/sync-result";
import { iorbitChatSurfaceSource } from "./iorbit-chat-surface-source";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("event recommendations still produce a local, unconfirmed calendar preview contract", () => {
  const conversation = syncResult(createMockOrbitAgentConversationService().sendMessage({
    locale: "en",
    message:
      "Recommend events where I can meet investors for seed fundraising and founder feedback.",
  }));

  assert.equal(conversation.success, true);
  const preview = createOrbitAiCalendarActionService().createPreviews({
    conversation: conversation.data,
    locale: "en",
  }).data.previews[0];

  assert.ok(preview);
  assert.equal(preview.state, "staged_unconfirmed");
  assert.equal(preview.confirmationStatus, "unconfirmed");
  assert.equal(preview.localOnly, true);
  assert.equal(preview.completionBoundary.confirmationAvailable, false);
  assert.equal(preview.completionBoundary.noExternalEventCreated, true);
  assert.equal(
    preview.completionBoundary.state,
    "awaiting_live_calendar_adapter",
  );
  assert.equal(preview.sideEffects.externalCalendarMutation, false);
  assert.equal(preview.sideEffects.savedRecordWrite, false);
  assert.equal(preview.wouldAdd.date, "2026-07-09");
  assert.equal(preview.wouldAdd.startTime, "09:00");
  assert.equal(preview.wouldAdd.endTime, "12:00");
  assert.equal(preview.wouldAdd.timeZone, "Asia/Tokyo");
  assert.equal(preview.wouldAdd.location, "Orbit Relationship Room");
});

test("external calendar actions remain reviewable but cannot be confirmed inside chat", () => {
  assert.equal(
    agentChatActionCanConfirm({
      actionId: "action:external-calendar",
      operationIds: ["operation:calendar-write"],
      preview: "Create an external calendar event",
      riskLevel: "external",
      status: "awaiting_confirmation",
      title: "Write to external calendar",
    }),
    false,
  );

  const html = renderToStaticMarkup(
    <AgentActionStatusCard
      actionIds={["action:external-calendar"]}
      language="zh"
      navigate={() => undefined}
      runId="run:external-calendar"
    />,
  );

  assert.match(html, /data-agent-run-id="run:external-calendar"/);
  assert.match(html, /data-agent-action-id="action:external-calendar"/);
  assert.match(html, /在安排里查看/);
  assert.match(html, /全部安排/);
  assert.doesNotMatch(html, /确认执行/);
});

test("to-do artifacts preserve their source link and local calendar safety boundary", () => {
  const conversation = syncResult(createMockOrbitAgentConversationService().sendMessage({
    locale: "zh",
    message: "今日待办",
  }));

  assert.equal(conversation.success, true);
  const preview = createOrbitAiCalendarActionService().createPreviews({
    conversation: conversation.data,
    locale: "zh",
  }).data.previews[0];

  assert.ok(preview);
  assert.match(preview.wouldAdd.relatedLink.href, /^\/app\/contacts\//);
  assert.equal(preview.wouldAdd.date, "2026-07-08");
  assert.equal(preview.wouldAdd.startTime, "15:00");
  assert.equal(preview.localOnly, true);
  assert.equal(preview.completionBoundary.noExternalEventCreated, true);
  assert.equal(preview.sideEffects.externalCalendarMutation, false);
});

test("/app/agent composes calendar proposals through the conversation run and action ledger", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
// iOrbit 任务 6a：`orbit-real-agent.tsx` 已删除；对话面的源码断言改读
// `iorbit-chat-surface-source.ts` 合并的那一组在售文件（内容同源，只是换了住处）。
  const agentSource = iorbitChatSurfaceSource();
  const chatHookSource = readProjectFile(
    "app/(app)/app/agent/iorbit-0918/use-agent-chat.ts",
  );
  const actionSource = readProjectFile(
    "app/(app)/app/agent/agent-action-status-card.tsx",
  );
  const serviceDoc = readProjectFile(
    "features/orbit-ai/CALENDAR_ACTION_LIVE_IMPLEMENTATION.md",
  );

  assert.match(pageSource, /loadAppChatRouteViewModel/);
  assert.doesNotMatch(pageSource, /calendar-preview/);
  assert.doesNotMatch(pageSource, /app\/api\//);
  // iOrbit 任务 1b：读 actionIds 的是 hook（`use-agent-chat.ts`），渲染卡片的仍是 JSX。
  assert.match(chatHookSource, /payload\.data\.actionIds/);
  assert.match(agentSource, /<AgentActionStatusCard/);
  assert.match(actionSource, /riskLevel !== "external"/);
  assert.match(actionSource, /Review external action details in All arrangements/);
  // iOrbit 合并前终审 1：回合卡上的两枚跳转都必须落在仍然存在的兄弟屏；
  // `/today?entry=` 会被 `productHref` 送到已删除的 `/app/today`。
  assert.match(actionSource, /\/app\/agent\/actions\?entry=/);
  assert.doesNotMatch(actionSource, /navigate\(\s*`\/today\?/);
  assert.match(actionSource, /\/api\/agent\/ledger\//);
  assert.match(serviceDoc, /live calendar adapter/i);
  assert.match(serviceDoc, /no-side-effect default/i);
});
