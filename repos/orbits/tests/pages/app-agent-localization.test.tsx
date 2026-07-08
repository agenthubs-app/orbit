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

async function renderAgent(searchParams: Record<string, string>) {
  const Page = (await importProjectModule<{
    default: (input?: {
      searchParams?: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<JSX.Element>;
  }>("app/(app)/app/agent/page.tsx")).default;

  return renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

function assertNoMixedEnglishPanelChrome(html: string) {
  assert.doesNotMatch(
    html,
    />\s*(?:Recommended contacts|Recommended events|Follow-up queue|Goal-based contact recommendations|Event matches|Prioritized next actions|Review contact|Review event|Review person|Review source|Preview add to calendar|High confidence|Medium confidence|Evidence snippets|Source context|Data source|Local preview only|Unconfirmed|Confirmation unavailable|Orbit could not reply right now|People context|Preparation prompt)\s*</,
  );
  assert.doesNotMatch(html, /Generated contact profile|Relationship graph|Event attendance|Conversation summary|Attendee intent notes|Local calendar fixture/);
}

test("/app/agent Chinese GET contact tool panels render localized labels and Chinese assistant answer", async () => {
  const html = await renderAgent({
    lang: "zh",
    q: "Find a Japan SMB manufacturing AI workflow PoC buyer with follow-up context.",
  });

  assert.match(html, /我理解你需要人脉推荐/);
  assert.match(html, /推荐人脉|可复核人脉路径/);
  assert.match(html, /联系人/);
  assert.match(html, /匹配分|分数/);
  assert.match(html, /高可信|有证据支撑/);
  assert.match(html, /查看人脉/);
  assert.match(html, /证据片段/);
  assertNoMixedEnglishPanelChrome(html);
});

test("/app/agent Chinese GET event and calendar panels use one localized panel source", async () => {
  const html = await renderAgent({
    action: "calendar-preview",
    lang: "zh",
    q: "推荐适合见投资人并获得创始人反馈的活动",
  });

  assert.match(html, /我理解你需要活动推荐/);
  assert.match(html, /推荐活动/);
  assert.match(html, /活动匹配|活动推荐/);
  assert.match(html, /查看活动/);
  assert.match(html, /中等可信|高可信/);
  assert.match(html, /预览加入日历/);
  assert.match(html, /仅本地预览/);
  assert.match(html, /未确认/);
  assert.match(html, /数据来源/);
  assert.match(html, /参会者意图记录|活动主题记录/);
  assert.match(html, /暂不能确认/);
  assertNoMixedEnglishPanelChrome(html);
});

test("/app/agent Chinese proactive page localizes reminder context and keeps technical ids intact", async () => {
  const proactiveModule = await importProjectModule<{
    loadOrbitAiProactiveCalendarMessagesForApp: () => {
      data: {
        messages: readonly { messageId: string }[];
      };
      success: true;
    };
  }>("features/orbit-ai/proactive-calendar-service.ts");
  const messageId =
    proactiveModule.loadOrbitAiProactiveCalendarMessagesForApp().data.messages[0]
      ?.messageId ?? "";
  const html = await renderAgent({
    lang: "zh",
    proactive: messageId,
  });

  assert.match(html, /主动日历活动上下文/);
  assert.match(html, /种子投资人准备电话/);
  assert.match(html, /人物上下文/);
  assert.match(html, /本地日历记录/);
  assert.match(html, new RegExp(messageId));
  assertNoMixedEnglishPanelChrome(html);
});

test("/app/agent source routes all API panel copy through the feature localization boundary", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(pageSource, /localizeOrbitAiPanel/);
  assert.match(agentSource, /localizeOrbitAiPanel/);
  assert.doesNotMatch(agentSource, /panelTitle: t\(\{ en: "Orbit result", zh: "Orbit 结果" \}\),\s*source: "api"/);
  assert.match(agentSource, /panelFromApiData\(\s*data,\s*(?:language|locale),\s*t/);
});
