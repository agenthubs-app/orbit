import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

async function importProjectModule<TModule>(
  relativePath: string,
): Promise<TModule> {
  return (await import(pathToFileURL(path.join(projectRoot, relativePath)).href)) as TModule;
}

test("/app/agent?action=calendar-preview preserves the AI answer and stages a calendar action", async () => {
  const Page = (await importProjectModule<{
    default: (input?: {
      searchParams?: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<JSX.Element>;
  }>("app/(app)/app/agent/page.tsx")).default;

  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        action: "calendar-preview",
        lang: "en",
      }),
    }),
  );

  assert.match(html, /I understand you need event recommendations/);
  assert.match(html, /data-orbit-agent-calendar-action-state="staged_unconfirmed"/);
  assert.match(html, /data-orbit-agent-calendar-action-affordance=/);
  assert.match(html, /data-orbit-agent-calendar-preview-title=/);
  assert.match(html, /data-orbit-agent-calendar-preview-time=/);
  assert.match(html, /data-orbit-agent-calendar-preview-date="2026-07-09"/);
  assert.match(html, /data-orbit-agent-calendar-preview-start="09:00"/);
  assert.match(html, /data-orbit-agent-calendar-preview-end="12:00"/);
  assert.match(html, /data-orbit-agent-calendar-preview-time-zone="Asia\/Tokyo"/);
  assert.match(html, /data-orbit-agent-calendar-preview-location="Orbit Relationship Room"/);
  assert.match(html, /data-orbit-agent-calendar-preview-source=/);
  assert.match(html, /data-orbit-agent-calendar-preview-scope="local-preview-only"/);
  assert.match(html, /data-orbit-agent-calendar-preview-confirmation="unconfirmed"/);
  assert.match(html, /data-orbit-agent-calendar-confirm-boundary="awaiting_live_calendar_adapter"/);
  assert.match(html, /data-orbit-agent-calendar-no-event-created="true"/);
  assert.match(html, /data-orbit-agent-calendar-confirm-disabled=/);
  assert.match(html, /Preview add to calendar|预览加入日历/);
  assert.match(html, /What would be added|将加入什么/);
  assert.match(html, /Date|日期/);
  assert.match(html, /Start|开始/);
  assert.match(html, /End|结束/);
  assert.match(html, /Time zone|时区/);
  assert.match(html, /Location|地点/);
  assert.match(html, /Data source|数据来源/);
  assert.match(html, /Local preview only|仅本地预览/);
  assert.match(html, /Unconfirmed|未确认/);
  assert.match(html, /No calendar event created|尚未创建日历事件/);
  assert.match(html, /Confirmation unavailable|暂不能确认/);
  assert.match(html, /Cancel|取消/);
  assert.match(html, /href="[^"]*\/app\/agent/);
});

test("/app/agent?action=calendar-preview renders localized staged calendar previews with one clear visible action", async () => {
  const Page = (await importProjectModule<{
    default: (input?: {
      searchParams?: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<JSX.Element>;
  }>("app/(app)/app/agent/page.tsx")).default;

  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        action: "calendar-preview",
        lang: "zh",
      }),
    }),
  );

  assert.match(html, /我理解你需要活动推荐/);
  assert.match(html, /任何报名、日历或外部联系动作仍需要你确认/);
  assert.match(html, /data-orbit-agent-calendar-action-state="staged_unconfirmed"/);
  assert.match(html, /预览加入日历/);
  assert.match(html, /仅本地预览/);
  assert.match(html, /未确认/);
  assert.match(html, /将加入什么/);
  assert.match(html, /日期/);
  assert.match(html, /开始/);
  assert.match(html, /结束/);
  assert.match(html, /时区/);
  assert.match(html, /地点/);
  assert.match(html, /2026-07-09/);
  assert.match(html, /09:00/);
  assert.match(html, /12:00/);
  assert.match(html, /Asia\/Tokyo/);
  assert.match(html, /Orbit Relationship Room/);
  assert.match(html, /参会者意图记录/);
  assert.doesNotMatch(html, />Attendee intent notes</);
  assert.match(html, /尚未创建日历事件/);
  assert.match(html, /data-orbit-agent-calendar-next-action="view-source"/);
  assert.match(html, /当前预览仅用于复核/);
  assert.match(html, /查看活动详情/);
  assert.match(html, /data-orbit-agent-calendar-confirm-secondary=/);
  assert.match(html, /暂不能确认/);
  assert.match(html, /data-orbit-agent-calendar-cancel=/);
  assert.match(html, /取消/);
  assert.match(html, /data-orbit-agent-calendar-evidence=/);
  assert.match(html, /查看依据/);
  assert.doesNotMatch(
    html,
    /data-orbit-agent-artifact-action="event:review:event_003"/,
  );
  assert.doesNotMatch(
    html,
    /data-orbit-agent-artifact-action="event:review:event_004"/,
  );
  assert.doesNotMatch(
    html,
    /data-orbit-agent-calendar-action-affordance="[^"]*event_003/,
  );
  assert.doesNotMatch(
    html,
    /data-orbit-agent-calendar-action-affordance="[^"]*event_004/,
  );
});

test("/app/agent?action=calendar-preview&q=to-do stages a calendar preview on to-do cards", async () => {
  const Page = (await importProjectModule<{
    default: (input?: {
      searchParams?: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<JSX.Element>;
  }>("app/(app)/app/agent/page.tsx")).default;

  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        action: "calendar-preview",
        lang: "zh",
        q: "今日待办",
      }),
    }),
  );

  assert.match(html, /data-orbit-agent-todo-summary=/);
  assert.match(html, /data-orbit-agent-todo-item=/);
  assert.match(html, /data-orbit-agent-calendar-action-state="staged_unconfirmed"/);
  assert.match(html, /data-orbit-agent-calendar-action-affordance=/);
  assert.match(html, /data-orbit-agent-calendar-preview-date="2026-07-08"/);
  assert.match(html, /data-orbit-agent-calendar-preview-start="15:00"/);
  assert.match(html, /data-orbit-agent-calendar-preview-scope="local-preview-only"/);
  assert.match(html, /data-orbit-agent-calendar-preview-confirmation="unconfirmed"/);
  assert.match(html, /data-orbit-agent-calendar-no-event-created="true"/);
  assert.match(html, /预览加入日历/);
  assert.match(html, /已保存关系对话|跟进来源/);
});

test("/app/agent calendar-action source keeps route composition out of API routes", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );
  const serviceDoc = readProjectFile(
    "features/orbit-ai/CALENDAR_ACTION_LIVE_IMPLEMENTATION.md",
  );

  assert.match(pageSource, /createOrbitAiCalendarActionService/);
  assert.match(pageSource, /calendar-preview/);
  assert.doesNotMatch(pageSource, /app\/api/);
  assert.match(agentSource, /data-orbit-agent-calendar-action-state/);
  assert.match(agentSource, /data-orbit-agent-calendar-confirm-boundary/);
  assert.match(agentSource, /data-orbit-agent-calendar-cancel/);
  assert.match(serviceDoc, /live calendar adapter/i);
  assert.match(serviceDoc, /no-side-effect default/i);
});
