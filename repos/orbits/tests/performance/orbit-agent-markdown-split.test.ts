import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

// iOrbit 任务 3：助手回合搬进 `iorbit-0918/iorbit-chat.tsx`，`AgentMarkdown` 的
// `next/dynamic` 也随之搬家。任务 6a：`orbit-real-agent.tsx` 已删除，它那份动态导入
// 跟着仍在售的富组件搬进 `iorbit-0918/iorbit-rich-components.tsx`（草稿卡的正文要
// 渲染 markdown），门禁改指那个文件；两处都断「不得直接 import react-markdown /
// remark-gfm」，防回流。
test("assistant markdown stays out of the unopened Agent first-load module", () => {
  const chatSource = readFileSync(
    join(projectRoot, "app/(app)/app/agent/iorbit-0918/iorbit-chat.tsx"),
    "utf8",
  );
  const richSource = readFileSync(
    join(projectRoot, "app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx"),
    "utf8",
  );
  const markdownSource = readFileSync(
    join(projectRoot, "app/(app)/app/agent/agent-markdown.tsx"),
    "utf8",
  );

  assert.match(chatSource, /dynamic\(\(\) => import\("\.\.\/agent-markdown"\)/);
  assert.match(richSource, /dynamic\(\(\) => import\("\.\.\/agent-markdown"\)/);
  for (const source of [chatSource, richSource]) {
    assert.doesNotMatch(source, /from "react-markdown"/);
    assert.doesNotMatch(source, /from "remark-gfm"/);
  }
  assert.match(markdownSource, /from "react-markdown"/);
  assert.match(markdownSource, /from "remark-gfm"/);
});
