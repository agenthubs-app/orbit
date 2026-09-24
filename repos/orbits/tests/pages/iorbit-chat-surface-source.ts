/**
 * iOrbit（对话域）在售源码面的共享读取器（iOrbit 任务 6a）。
 *
 * 任务 6a 删除了 `app/(app)/app/agent/orbit-real-agent.tsx`（3892 → 1966 行的融合态
 * 组件）。此前约 20 个套件对那**一个**文件做源码正则；对话屏今天是 `iorbit-0918/`
 * 下的一组文件（壳 / 对话 / 右栏 / 抽屉 / 概览 / 富组件 / 两个 hook / 纯模型）。
 *
 * 这个模块把它们按同一顺序拼成一份源码，供那些断言原样使用：断的还是「这段渲染
 * 代码在不在」，只是它现在住在多个文件里。需要**区分**某段代码落在哪一层的套件
 * （例如 `orbit-agent-api-ui.test.ts` 的 AST 断言、`app-agent-chat-history.test.ts`
 * 的 model / hook / JSX 三分）保持各自直接读具体文件，不要用这里的合并视图。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** 在售对话面的全部源码文件，按「壳 → 屏 → 组件 → 状态 → 模型」排列。 */
export const IORBIT_CHAT_SURFACE_FILES = [
  "app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-chat.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-chat-aside.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-history-drawer.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-home.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx",
  "app/(app)/app/agent/iorbit-0918/console-styles.ts",
  "app/(app)/app/agent/iorbit-0918/use-agent-chat.ts",
  "app/(app)/app/agent/iorbit-0918/use-agent-history.ts",
  "app/(app)/app/agent/iorbit-0918/iorbit-model.ts",
] as const;

export function iorbitChatSurfaceSource(): string {
  return IORBIT_CHAT_SURFACE_FILES.map((relativePath) =>
    readFileSync(join(projectRoot, relativePath), "utf8"),
  ).join("\n");
}
