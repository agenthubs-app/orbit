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

// iOrbit 任务 1b：纯函数在 `iorbit-model.ts`、对话状态/`ask` 在 `use-agent-chat.ts`，
// JSX 留在 `orbit-real-agent.tsx`。源码断言按此拆成两半。
const IORBIT_MODEL_PATH = "app/(app)/app/agent/iorbit-0918/iorbit-model.ts";
const IORBIT_CHAT_HOOK_PATH = "app/(app)/app/agent/iorbit-0918/use-agent-chat.ts";

async function importProjectModule<TModule>(
  relativePath: string,
): Promise<TModule> {
  return (await import(pathToFileURL(path.join(projectRoot, relativePath)).href)) as TModule;
}

test("agent message copy helper writes text through the Clipboard API", async () => {
  const mod = await importProjectModule<{
    copyAgentMessageText: (text: string) => Promise<boolean>;
  }>("app/(app)/app/agent/orbit-real-agent.tsx");
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const copied: string[] = [];

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text: string) => {
          copied.push(text);
        },
      },
    },
  });

  try {
    assert.equal(await mod.copyAgentMessageText("可复制的 AI 回复"), true);
    assert.deepEqual(copied, ["可复制的 AI 回复"]);
  } finally {
    if (previousNavigator) {
      Object.defineProperty(globalThis, "navigator", previousNavigator);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
  }
});

test("agent chat bubbles expose copy buttons for user and assistant messages", () => {
  const source = readProjectFile("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(source, /data-orbit-agent-message-copy/);
  assert.match(source, /aria-label=\{t\(\{ en: "Copy message", zh: "复制消息" \}\)\}/);
  assert.match(source, /<AgentMessageCopyButton text=\{message\.text\}/);
  // 复制的实现（clipboard / textarea 兜底）搬到了 model，按钮仍在 JSX。
  assert.match(readProjectFile(IORBIT_MODEL_PATH), /navigator\.clipboard\.writeText/);
});
