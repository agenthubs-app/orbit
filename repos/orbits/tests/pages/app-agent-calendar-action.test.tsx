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
  if (conversation.success === false) return;
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
  assert.match(html, /在 Today 查看/);
  assert.match(html, /全部安排/);
  assert.doesNotMatch(html, /确认执行/);
});

test("to-do artifacts preserve their source link and local calendar safety boundary", () => {
  const conversation = syncResult(createMockOrbitAgentConversationService().sendMessage({
    locale: "zh",
    message: "今日待办",
  }));

  assert.equal(conversation.success, true);
  if (conversation.success === false) return;
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
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
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
  assert.match(agentSource, /payload\.data\.actionIds/);
  assert.match(agentSource, /<AgentActionStatusCard/);
  assert.match(actionSource, /riskLevel !== "external"/);
  assert.match(actionSource, /Review external action details in Today/);
  assert.match(actionSource, /\/api\/agent\/ledger\//);
  assert.match(serviceDoc, /live calendar adapter/i);
  assert.match(serviceDoc, /no-side-effect default/i);
});
