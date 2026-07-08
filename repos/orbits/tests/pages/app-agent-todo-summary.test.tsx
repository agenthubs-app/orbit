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

test("/app/agent GET q to-do prompts render source-backed upcoming work", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentConversationService: () => {
      sendMessage: (input: {
        locale?: "en" | "zh";
        message?: string | null;
      }) => {
        success: boolean;
        data?: {
          artifacts: readonly {
            result: {
              generatedView: {
                sections: readonly {
                  items: readonly {
                    actions: readonly {
                      href?: string;
                      label: string;
                      requiresConfirmation: boolean;
                    }[];
                    body?: string;
                    evidenceIds: readonly string[];
                    metadata: readonly { label: string; value: string }[];
                    reason?: string;
                    title: string;
                  }[];
                }[];
                summary: string;
              } | null;
            };
            task: { kind: string; query: string };
          }[];
          routingDecision?: {
            intent: string;
            needsTool: boolean;
            toolFamily: string | null;
          };
        };
      };
    };
  }>("features/orbit-ai/mock-conversation-service.ts");

  const prompt =
    "What should I do today? Summarize my to-do list from conversations and schedule.";
  const result = serviceModule.createMockOrbitAgentConversationService().sendMessage({
    locale: "en",
    message: prompt,
  });
  const artifact = result.data?.artifacts[0];
  const items = artifact?.result.generatedView?.sections[0]?.items ?? [];
  const metadataText = items
    .flatMap((item) => item.metadata.map((entry) => `${entry.label}: ${entry.value}`))
    .join(" ");
  const visibleText = [
    artifact?.result.generatedView?.summary,
    ...items.flatMap((item) => [
      item.title,
      item.body,
      item.reason,
      item.actions[0]?.href,
    ]),
    metadataText,
  ].join(" ");

  assert.equal(result.success, true);
  assert.equal(result.data?.routingDecision?.intent, "todo_synthesis");
  assert.equal(result.data?.routingDecision?.toolFamily, "todo");
  assert.equal(result.data?.routingDecision?.needsTool, true);
  assert.equal(artifact?.task.kind, "followup_queue");
  assert.equal(artifact?.task.query, prompt);
  assert.ok(items.length >= 4);
  assert.match(visibleText, /Upcoming relationship work|upcoming work/i);
  assert.match(visibleText, /Due/i);
  assert.match(visibleText, /Reason/i);
  assert.match(visibleText, /Source context/i);
  assert.match(visibleText, /conversation/i);
  assert.match(visibleText, /schedule/i);
  assert.ok(items.some((item) => item.actions[0]?.href?.startsWith("/app/contacts/")));
  assert.ok(items.some((item) => item.actions[0]?.href?.startsWith("/app/events/")));
  assert.equal(items.every((item) => item.actions[0]?.requiresConfirmation), true);
});

test("/app/agent page renders submitted to-do prompts through the GET preview path", async () => {
  const Page = (await importProjectModule<{
    default: (input?: {
      searchParams?: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<JSX.Element>;
  }>("app/(app)/app/agent/page.tsx")).default;

  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        lang: "en",
        q: "What should I do today? Summarize my to-do list from conversations and schedule.",
      }),
    }),
  );

  assert.match(html, /data-orbit-agent-submitted-goal/);
  assert.match(html, /data-orbit-agent-todo-summary/);
  assert.match(html, /data-orbit-agent-todo-remaining-work/);
  assert.match(html, /data-orbit-agent-todo-source-context/);
  assert.match(html, /Upcoming relationship work|upcoming work|关系待办摘要|关系待办/i);
  assert.match(html, /More upcoming work|更多关系待办/);
  assert.match(html, /conversation|对话/i);
  assert.match(html, /schedule|日程/i);
  assert.match(html, /\/app\/contacts\//);
  assert.match(html, /\/app\/events\//);
});

test("/app/agent GET q=今日待办 renders the answered to-do state above the launcher", async () => {
  const Page = (await importProjectModule<{
    default: (input?: {
      searchParams?: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<JSX.Element>;
  }>("app/(app)/app/agent/page.tsx")).default;

  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        q: "今日待办",
      }),
    }),
  );

  assert.match(html, /data-orbit-agent-submitted-goal="今日待办"/);
  assert.match(html, /data-orbit-agent-todo-summary/);
  assert.match(html, /data-orbit-agent-todo-visible-rank="1"/);
  assert.match(html, /data-orbit-agent-todo-visible-rank="2"/);
  assert.match(html, /data-orbit-agent-todo-visible-rank="3"/);
  assert.match(html, /关系待办摘要/);
  assert.match(html, /Send the Aoba pilot timeline recap/);
  assert.match(html, /Storage Operators Breakfast|Ask Maya whether she is comfortable/);
  assert.match(html, /到期/);
  assert.match(html, /原因/);
  assert.match(html, /来源上下文/);
  assert.match(html, /conversation|对话/);
  assert.match(html, /schedule|日程/);
  assert.match(html, /\/app\/contacts\//);
  assert.match(html, /\/app\/events\//);
  assert.match(html, /需确认/);
  assert.doesNotMatch(
    html.slice(0, html.indexOf("data-orbit-agent-todo-summary")),
    /data-orbit-agent-todo-example-prompt/,
    "submitted q state should show the answered summary before launcher prompts",
  );
});

test("/app/agent source exposes to-do prompt affordances without owning business logic", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(pageSource, /createOrbitAgentConversationPreviewService/);
  assert.match(pageSource, /initialSubmittedGoal/);
  assert.doesNotMatch(pageSource, /mockFollowupTasks|mockEventRecords/);
  assert.match(agentSource, /data-orbit-agent-todo-goal/);
  assert.match(agentSource, /data-orbit-agent-todo-example-prompt/);
  assert.match(agentSource, /Today agenda/);
  assert.match(agentSource, /Weekend social reminder/);
  assert.match(agentSource, /Birthday mention/);
  assert.match(agentSource, /Introduction request/);
});

test("/app/agent input has an explicit to-do capable accessible name", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /aria-label=\{t\(\{ en: "Ask Orbit relationship to-dos"/);
  assert.match(agentSource, /zh: "询问 Orbit 关系待办"/);
  assert.match(agentSource, /aria-describedby="orbit-agent-input-boundary"/);
  assert.match(agentSource, /aria-label=\{t\(\{ en: "Submit Ask Orbit relationship to-dos"/);
});
