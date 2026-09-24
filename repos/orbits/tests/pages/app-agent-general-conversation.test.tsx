import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  // iOrbit 任务 6a：`orbit-real-agent.tsx` 已删除；对话面的源码断言改读
  // `iorbit-chat-surface-source.ts` 合并的那一组在售文件（内容同源，换了住处）。
  const agentSource = iorbitChatSurfaceSource();

  const chatHookSource = readProjectFile(IORBIT_CHAT_HOOK_PATH);
  const historyHookSource = readProjectFile(IORBIT_HISTORY_HOOK_PATH);

  assert.match(chatHookSource, /const items =\s*kind === "events"/);
  assert.match(
    chatHookSource,
    /setPanel\(items\.length > 0 \? \{ items, kind, panelTitle \} : null\)/,
  );
  for (const checked of [agentSource, chatHookSource, historyHookSource]) {
    assert.doesNotMatch(checked, /if \(items\.length > 0\) \{\s*setPanel/);
  }
});

test("/app/agent source preserves recent conversation context for the next turn", () => {
  // iOrbit 任务 6a：`orbit-real-agent.tsx` 已删除；对话面的源码断言改读
  // `iorbit-chat-surface-source.ts` 合并的那一组在售文件（内容同源，换了住处）。
  const agentSource = iorbitChatSurfaceSource();

  const modelSource = readProjectFile(IORBIT_MODEL_PATH);
  const chatHookSource = readProjectFile(IORBIT_CHAT_HOOK_PATH);

  assert.match(modelSource, /function historyContentFor/);
  assert.match(
    chatHookSource,
    /const historySource = retry\?\.historyMessages \?\? messagesRef\.current/,
  );
  assert.match(chatHookSource, /const history = historySource/);
  assert.match(chatHookSource, /\.slice\(-8\)/);
  assert.match(chatHookSource, /JSON\.stringify\(\{ history, \.\.\.reliableRequest \}\)/);
  assert.match(modelSource, /\[本轮推荐明细\]/);
});

test("/app/agent keeps ordinary assistant bubbles visible without inline API panels", () => {
  // iOrbit 任务 6a：`orbit-real-agent.tsx` 已删除；对话面的源码断言改读
  // `iorbit-chat-surface-source.ts` 合并的那一组在售文件（内容同源，换了住处）。
  const agentSource = iorbitChatSurfaceSource();

  assert.match(agentSource, /message\.role === "user" \?/);
  assert.match(agentSource, /<AgentMarkdown text=\{message\.text\}/);
  assert.match(agentSource, /message\.items\.length > 0 \? \(/);
  // 失败回合的空 people 形状由 hook 构造。
  assert.match(readProjectFile(IORBIT_CHAT_HOOK_PATH), /items:\s*\[\],\s*kind:\s*"people"/);
});

test("/app/agent input explains the no-tool privacy boundary before sensitive context is shared", () => {
  // 隐私边界说明挂在输入框上，随输入框搬到了全局组件。
  const agentSource = readProjectFile("app/(app)/app/orbit-global-ask/orbit-global-ask.tsx");

  assert.match(agentSource, /data-orbit-agent-privacy-boundary/);
  assert.match(agentSource, /external actions always need your confirmation/);
  assert.match(agentSource, /涉及对外动作会先经你确认/);
});
