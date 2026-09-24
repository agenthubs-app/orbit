/**
 * Ratchet gate for T5 (audit P1-2 + P1-3): button system enforcement.
 *
 * The `.btn` system (orbit-reference-styles.tsx) plus the `IconButton`
 * primitive (orbit-reference-primitives.tsx) are now the canonical way to
 * build a button in app/(app)/app. This test does not try to migrate the
 * whole app in one shot — it locks in what T5 already migrated and stops
 * new hand-rolled `<button>`s from creeping back in:
 *
 * (a) Sitewide: the number of non-`.btn` `<button>` elements under
 *     app/(app)/app must not go up. T5 brought it from 145 to 129 — that
 *     129 is a ceiling, not a target; future migrations should lower it.
 * (b) The five core surfaces migrated in T5 (today, all-actions controls (now agent/actions),
 *     contacts list, agent, events explore) must have zero *unexplained*
 *     non-`.btn` buttons — every remaining one is named in EXEMPTIONS below
 *     with a reason (drag handle, filter chip, established card-hover
 *     pattern, or a pre-existing bespoke component with its own dedicated
 *     CSS + test coverage).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const APP_DIR = join(projectRoot, "app/(app)/app");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, out);
    } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extracts the opening-tag text starting at a `<button` match, tracking
 * brace depth (for `style={{...}}` / `onClick={() => {...}}`) and string
 * state (so a `>` inside `t({ en: "a>b" })` doesn't end the tag early).
 */
function extractOpeningTag(text: string, startIdx: number): string {
  let i = startIdx;
  let depth = 0;
  let inString: string | null = null;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }
    if (ch === "{") { depth++; continue; }
    if (ch === "}") { depth--; continue; }
    if (ch === ">" && depth === 0) return text.slice(startIdx, i + 1);
  }
  return text.slice(startIdx, i);
}

// Matches a standalone "btn" / "btn-*" class token, bounded by quote/brace/
// whitespace/comma — NOT by a hyphen, so page-specific suffixes like
// `orbit-agent-history-btn` or `orbit-top-icon-btn` correctly don't count.
const BTN_TOKEN = /(^|[\s"'`{,])btn(?:-[\w]+)?(?=[\s"'`},]|$)/;
const BUTTON_OPEN = /<button(?=[\s>])/g;

interface ButtonHit {
  file: string;
  line: number;
  isBtn: boolean;
  tag: string;
}

function findButtons(file: string): ButtonHit[] {
  const text = readFileSync(file, "utf8");
  const rel = relative(projectRoot, file);
  const hits: ButtonHit[] = [];
  let m: RegExpExecArray | null;
  BUTTON_OPEN.lastIndex = 0;
  while ((m = BUTTON_OPEN.exec(text))) {
    const tag = extractOpeningTag(text, m.index);
    const line = text.slice(0, m.index).split("\n").length;
    hits.push({ file: rel, line, isBtn: BTN_TOKEN.test(tag), tag });
  }
  return hits;
}

// ---- (a) sitewide ratchet: non-.btn <button> count must not increase ----

test("non-.btn <button> count in app/(app)/app does not increase", () => {
  const allHits = walk(APP_DIR).flatMap(findButtons);
  const nonBtn = allHits.filter((hit) => !hit.isBtn);

  // T5 migrated the five core surfaces below and brought this from 145 to
  // 129. The Orbit_0918 UI redesign (batches 0–3, user-sanctioned) introduced
  // design-spec tab / segmented / chip controls that are intentionally not
  // .btn — for CORE_FILES they are documented in EXEMPTIONS below; the rest
  // raised the raw count to 153. The connect placeholder tab (user-sanctioned
  // 2026-09-19 "connect 先占位" decision) adds one more design-spec tab control
  // in orbit-real-profile.tsx → 154. Orbit_0918 task 8 deleted the legacy
  // orbit-real contact views (orbit-real-contacts / cards-pipeline-view /
  // cards-import / card-connection, analysis workspace, V1 card import) → 142.
  // 个人中心 task 6 deleted the legacy orbit-real-profile.tsx (its 12 non-.btn
  // buttons incl. the connect placeholder tab) → 130.
  // Events task 6 (2026-09-22) deleted /app/party* (orbit-real-party.tsx +
  // event-operations-controls.tsx) and turned the two always-disabled detail
  // CTAs into aria-disabled spans → 118 (measured).
  // 运营台 task 4 (2026-09-22) deleted limited-check-in-roster.tsx (ci-btn /
  // ci-segment controls) and event-admission-review-workspace.tsx (card-flat
  // applicant buttons); the ops-0918 people / check-in screens are all .btn
  // → 106 (measured).
  // 运营台 task 5 (2026-09-22) deleted event-experience-editor.tsx (ex-btn
  // controls) and analytics/event-analytics-route.tsx (an-switch-btn /
  // an-alert-retry); the ops-0918 form / report screens are all .btn → 98 (measured).
  // 运营台 task 6 (2026-09-22) deleted roles/event-role-management-workspace.tsx
  // (all .btn already); the ops-0918 collaborators drawer is all .btn → 98 (unchanged).
  // iOrbit task 6a (2026-09-23) deleted the fused agent files (orbit-real-agent /
  // orbit-agent-dashboard / orbit-agent-today-workspace), the three old sibling
  // screens, chat/ and the /app/today · /app/schedule · /app/followups routes;
  // the surviving rich components moved to iorbit-0918/iorbit-rich-components.tsx
  // → 79 (measured).
  const CEILING = 79;

  assert.ok(
    nonBtn.length <= CEILING,
    `expected <= ${CEILING} non-.btn <button> elements in app/(app)/app, found ${nonBtn.length} ` +
      `(${nonBtn.length - CEILING} over ceiling):\n` +
      nonBtn.map((hit) => `  ${hit.file}:${hit.line}`).join("\n"),
  );
});

// ---- (b) the five T5 core surfaces: every non-.btn button is a named exemption ----

// iOrbit 任务 6a（2026-09-23）：`/app/today` 三个 T5 核心表面随路由删除；
// `orbit-today-decision-form.tsx` 是其中唯一还有消费者的文件（`/app/agent/actions`
// 的行内写控件），移到 `agent/actions/` 后留在表里。`orbit-real-agent.tsx` 删除，
// 它的 10 条 EXEMPTIONS 随之移除——其中仍在售的控件跟着组件搬进
// `iorbit-0918/iorbit-rich-components.tsx`，该文件不是 T5 核心表面，只受上面的
// 全局上限约束。
// 任务 6b 更正：搬过去的非 `.btn` 按钮是 **7 枚**（6a 报告误写为 2 枚）：
// `orbit-agent-message-copy`、`chip`、四枚 `linkish`、`todo-peek`。
// 收尾（2026-09-24）：选择「补 CORE_FILES + 7 条 EXEMPTIONS」而不是迁成 `.btn`。
// 理由是渲染面必须逐位不变——这四个类在 `console-styles.ts` 里都自带
// `background:none; border:0; font:inherit`（`.linkish` :240、`.todo-peek` :222）
// 或自带整套几何（`.chip` :36 的 30px 药丸），`.btn` 基类会把 padding / 高度 /
// 边框 / 背景重新加回来，属于改设计稿外观。它们是任务 6a 逐字搬迁的遗留富组件，
// 活在 `[data-orbit-real-page="agent"]` 皮肤里，不走 `.btn` 系统。
const CORE_FILES = [
  "app/(app)/app/agent/actions/orbit-today-decision-form.tsx",
  "app/(app)/app/agent/actions/orbit-all-actions-controls.tsx",
  "app/(app)/app/settings/orbit-agent-execution-settings.tsx",
  "app/(app)/app/events/events-0918/events-list.tsx",
  "app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx",
];

// Every non-.btn <button> left in the core surfaces after T5, identified by a
// stable opening-tag marker rather than a source line. Line-number exemptions
// made unrelated imports and markup insertions invalidate the whole table.
const EXEMPTIONS: {
  count: number;
  file: string;
  marker: string;
  reason: string;
}[] = [
  // Events 任务 1（2026-09-22）：events explore 迁入 events-0918/events-list.tsx 后所有按钮都是
  // `.btn ev-*`（整段中和基类），该表面不再有豁免项。

  // iOrbit 收尾（2026-09-24）：`iorbit-rich-components.tsx` 是任务 6a 从
  // `orbit-real-agent.tsx` 逐字搬来的遗留富组件，跑在 `[data-orbit-real-page="agent"]`
  // 皮肤下。下面 7 枚控件各自有 console-styles.ts 里的专属 CSS，加 `.btn` 会改外观，
  // 因此按「逐条署名」而不是「迁移」处理。
  {
    count: 1,
    file: "app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx",
    marker: "data-orbit-agent-message-copy",
    reason:
      "消息复制的 hover 浮标：console-styles.ts:174-175 用 `.msg-user-row:hover .orbit-agent-message-copy { opacity }` 控制显隐，是图标浮标而不是按钮面。",
  },
  {
    count: 1,
    file: "app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx",
    marker: 'className="chip"',
    reason:
      "欢迎屏的建议 chip：console-styles.ts:36-37 的 30px 药丸有自己的一整套几何与 hover，属设计稿的 chip 形态，不是 `.btn`。",
  },
  {
    count: 1,
    file: "app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx",
    marker: "openRelationshipInbox()",
    reason:
      "草稿行的「打开草稿箱」：`.linkish`（console-styles.ts:240）是带下划线的纯文字链形态，`background:none; border:0; font:inherit`。",
  },
  {
    count: 1,
    file: "app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx",
    marker: "draft.reopen()",
    reason: "草稿行的「查看草稿」：同上 `.linkish` 文字链形态。",
  },
  {
    count: 1,
    file: "app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx",
    marker: "void draft.generate(currentPurpose)",
    reason:
      "过期草稿提示里的「重新生成」：同上 `.linkish` 文字链形态（同文件 :308 那枚同名回调的控件已经是 `.btn`，本条只署名非 `.btn` 的那枚）。",
  },
  {
    count: 1,
    file: "app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx",
    marker: "linkish todo-view",
    reason: "待办卡的「查看联系人」：`.linkish` 文字链 + `.todo-view` 位置修正。",
  },
  {
    count: 1,
    file: "app/(app)/app/agent/iorbit-0918/iorbit-rich-components.tsx",
    marker: 'className="todo-peek"',
    reason:
      "待办卡的折叠头：`.todo-peek`（console-styles.ts:222-225）是带三角的 disclosure，`aria-expanded` 驱动 `.todo-tri` 旋转，不是按钮面。",
  },
];

test("the five T5 core surfaces have no non-.btn <button> outside the documented exemption list", () => {
  for (const exemption of EXEMPTIONS) {
    if (!CORE_FILES.includes(exemption.file)) {
      throw new Error(`EXEMPTIONS references a file outside CORE_FILES: ${exemption.file}`);
    }
  }

  const unexplained: ButtonHit[] = [];
  for (const relPath of CORE_FILES) {
    const hits = findButtons(join(projectRoot, relPath));
    for (const hit of hits) {
      const matched = EXEMPTIONS.filter(
        (exemption) =>
          exemption.file === hit.file && hit.tag.includes(exemption.marker),
      );
      if (!hit.isBtn && matched.length === 0) unexplained.push(hit);
      assert.ok(
        hit.isBtn || matched.length <= 1,
        `non-.btn <button> matched multiple exemptions at ${hit.file}:${hit.line}`,
      );
    }
  }

  assert.equal(
    unexplained.length,
    0,
    `found non-.btn <button> in a T5 core surface without a documented exemption:\n` +
      unexplained.map((hit) => `  ${hit.file}:${hit.line}`).join("\n") +
      `\nEither migrate it to .btn/IconButton, or add it to EXEMPTIONS with a reason.`,
  );
});

test("EXEMPTIONS stays in sync with source — every entry still points at a real non-.btn <button>", () => {
  const stale: string[] = [];
  for (const exemption of EXEMPTIONS) {
    const hits = findButtons(join(projectRoot, exemption.file));
    const matching = hits.filter(
      (hit) => !hit.isBtn && hit.tag.includes(exemption.marker),
    );
    if (matching.length !== exemption.count) {
      stale.push(
        `${exemption.file} marker=${JSON.stringify(exemption.marker)} expected=${exemption.count} actual=${matching.length}`,
      );
    }
  }

  assert.equal(
    stale.length,
    0,
    `EXEMPTIONS markers no longer match their documented non-.btn controls:\n` +
      stale.map((entry) => `  ${entry}`).join("\n"),
  );
});
