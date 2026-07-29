import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

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

test("/app/agent GET q renders ordinary assistant turns without a stale tool result panel", async () => {
  const serviceModule = await importProjectModule<{
    createOrbitAgentConversationPreviewService: () => {
      sendMessage: (input: {
        locale?: "en" | "zh";
        message?: string | null;
      }) => {
        success: boolean;
        data?: {
          artifacts: readonly unknown[];
          assistantMessage: string;
          proposedToolIntents: readonly unknown[];
          routingDecision?: { intent: string; needsTool: boolean };
        };
      };
    };
  }>("features/orbit-ai/conversation-preview-service.ts");

  const result = serviceModule
    .createOrbitAgentConversationPreviewService()
    .sendMessage({
      locale: "en",
      message: "Good morning, Orbit. I prefer concise English replies.",
    });

  assert.equal(result.success, true);
  assert.equal(result.data?.routingDecision?.intent, "general_conversation");
  assert.equal(result.data?.routingDecision?.needsTool, false);
  assert.equal(result.data?.artifacts.length, 0);
  assert.equal(result.data?.proposedToolIntents.length, 0);
  assert.match(result.data?.assistantMessage ?? "", /concise|morning|Orbit/i);
});

test("/app/agent source clears stale panels only for turns that do not return a tool panel", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /const items =\s*kind === "events"/);
  assert.match(
    agentSource,
    /setPanel\(items\.length > 0 \? \{ items, kind, panelTitle \} : null\)/,
  );
  assert.doesNotMatch(agentSource, /if \(items\.length > 0\) \{\s*setPanel/);
});

test("/app/agent source preserves recent conversation context for the next turn", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /function historyContentFor/);
  assert.match(agentSource, /const history = messagesRef\.current/);
  assert.match(agentSource, /\.slice\(-8\)/);
  assert.match(agentSource, /JSON\.stringify\(\{ history, locale, message: query \}\)/);
  assert.match(agentSource, /\[本轮推荐明细\]/);
});

test("/app/agent keeps ordinary assistant bubbles visible without inline API panels", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /message\.role === "user" \?/);
  assert.match(agentSource, /<AgentMarkdown text=\{message\.text\}/);
  assert.match(agentSource, /inlinePanel && message\.items\.length > 0/);
  assert.match(agentSource, /items:\s*\[\],\s*kind:\s*"people"/);
});

test("/app/agent input explains the no-tool privacy boundary before sensitive context is shared", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /data-orbit-agent-privacy-boundary/);
  assert.match(agentSource, /Normal chat does not send messages or execute external actions/);
  assert.match(agentSource, /普通聊天不会发送消息或执行外部动作/);
  assert.match(agentSource, /Actions still require confirmation/);
  assert.match(agentSource, /aria-describedby=\{boundaryId\}/);
});
