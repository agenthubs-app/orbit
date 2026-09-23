/**
 * iOrbit 皮肤死类护栏（收尾 2026-09-24，遗留清单「console-styles 死 CSS」）。
 *
 * `console-styles.ts` 是任务 6a 从 `orbit-real-agent.tsx` 逐字搬来的
 * `[data-orbit-real-page="agent"]` 作用域皮肤。`/app/today` 与旧 agent 工作台随
 * 6a 删除后，它的「骨架」「Dashboard」「对话页」三段在这个作用域里一个渲染点都没有
 * 了（对话屏整屏已换成 `ir-*`）。本轮把这些规则删掉，本测试守住「不回来」：
 *
 * 判据不是「文件里不许出现这个词」（`act` / `appt` 这种短词会误伤注释），而是
 * 「不许再出现以这个类打头的选择器」——也就是不许再为它写规则。
 *
 * 要放行某个名字（比如设计稿真的把它请回来了），从 REMOVED_CLASSES 里删掉它，
 * 并在 PR 里说明这个类在哪个组件里重新有了渲染点。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const CONSOLE_STYLES_PATH = join(
  projectRoot,
  "app/(app)/app/agent/iorbit-0918/console-styles.ts",
);

/** 2026-09-24 删除的零消费者类；逐个都做过全仓 grep（app / features / shared / public / tests / scripts）。 */
const REMOVED_CLASSES = [
  "act",
  "act-badge",
  "act-ic",
  "act-top",
  "action-card-guard",
  "agent-chat-composer",
  "agent-chat-composer-dock",
  "agent-chat-composer-submit",
  "agent-history",
  "agent-history-actions",
  "agent-history-heading",
  "agent-history-scroll",
  "appt",
  "appt-actions",
  "appt-main",
  "appt-title-row",
  "appt-when",
  "appt-who",
  "brief-action-button-spacer",
  "brief-action-buttons",
  "brief-action-context",
  "brief-action-copy",
  "brief-action-index",
  "brief-action-list",
  "brief-action-more",
  "brief-action-row",
  "brief-chips",
  "brief-head",
  "brief-input",
  "brief-lede",
  "brief-mark",
  "brief-note",
  "brief-refresh",
  "brief-send",
  "btn-back",
  "hub-head",
  "hub-stats",
  "ic-amber",
  "ic-gray",
  "ic-green",
  "ic-teal",
  "j-arrow",
  "j-date",
  "j-main",
  "j-row",
  "journeys",
  "msg-a",
  "msg-note",
  "msg-tools",
  "msg-user",
  "msg-user-row",
  "orbit-agent-history-group",
  "orbit-agent-new-chat",
  "s-dot",
  "s-link",
  "stage-row",
  "thread-bar",
  "ws-body",
  "ws-inner",
  "ws-main",
  "ws-scroll",
];

test("console-styles.ts does not reintroduce a rule for a removed zero-consumer class", () => {
  const css = readFileSync(CONSOLE_STYLES_PATH, "utf8");
  const declared = new Set<string>();
  for (const line of css.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("[data-orbit-real-page=")) continue;
    const selectorList = trimmed.split("{")[0];
    // 每个逗号分段的第一个 `.class` 就是这条规则的「主类」。
    for (const selector of selectorList.split(",")) {
      const match = /\.([a-zA-Z][\w-]*)/.exec(selector);
      if (match) declared.add(match[1]);
    }
  }

  const back = REMOVED_CLASSES.filter((name) => declared.has(name));
  assert.deepEqual(
    back,
    [],
    "以下类在 2026-09-24 作为零消费者删除，现在又被写了规则：\n" +
      back.map((name) => `  .${name}`).join("\n") +
      "\n若确实重新有了渲染点，请把它从 REMOVED_CLASSES 移除并说明在哪个组件里渲染。",
  );
});

test("the removed-class list itself stays honest — every entry is absent from the app source", () => {
  const css = readFileSync(CONSOLE_STYLES_PATH, "utf8");
  // 反向自检：护栏若指着一个仍然在写规则的类，本测试上一条就会红；
  // 这一条守住列表不为空（删空了等于护栏失效）。
  assert.ok(REMOVED_CLASSES.length >= 50, `REMOVED_CLASSES 不该被清空，当前 ${REMOVED_CLASSES.length} 条`);
  assert.ok(css.includes("data-orbit-real-page"), "console-styles.ts 应仍是作用域皮肤");
});
