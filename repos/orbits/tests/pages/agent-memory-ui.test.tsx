/**
 * agent-design AG14 UI (web, approved visual draft 2026-11-20): the memory cards on the confirmation card, the memory chips
 * at the start of an answer, the memory note with 「去设置 ›」, and the memory part of the settings page.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AnswerBlocks } from "../../app/(app)/app/orbit-2026/iorbit/answer-blocks";
import { BasisLine, ConfirmationCard, MemoryChipRow, MemoryChips } from "../../app/(app)/app/orbit-2026/iorbit/confirmation-card";
import { memorySettingsHref } from "../../app/(app)/app/orbit-2026/iorbit/action-preview-client";
import { MemorySettings } from "../../app/(app)/app/orbit-2026/account/MemorySettings";
import { prepareMemoryOperation, type MemoryCardIntent } from "../../features/agent-v1/domains/memory/ops";
import type { AgentActionPreviewContract, AgentMemoryEntryContract, AgentMemoryListContract } from "../../shared/contract/agent-v1";

const noop = async () => true;
const textOf = (html: string) => html.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const card = (intent: MemoryCardIntent, title: string): AgentActionPreviewContract => {
  const op = prepareMemoryOperation({ actionId: "a1", index: 0, intent, locale: "zh", revision: 1 });
  return { actionId: "a1", locale: "zh", operations: [{ capability: op.capability, display: op.display, operationId: op.operationId, status: "pending", text: op.preview } as never], payloadHash: "h", revision: 1, revisions: [], status: "awaiting_confirmation", summary: "s", title, updatedAt: "2026-11-20T00:00:00.000Z" } as AgentActionPreviewContract;
};
const MM1 = { appliesTo: ["event.recommend" as const], category: "preference" as const, content: "推荐活动时优先周末上午", structured: null };

test("board 1: the new entry — 新增, 记忆「…」, 用在, 归到; 到期 only with a limit in the words (D2)", () => {
  const text = textOf(renderToStaticMarkup(<ConfirmationCard card={card({ capability: "memory.create", set: MM1, sourceMessageRef: "request:r1" }, "新增1项")} language="zh" online onDecide={noop} onRegenerate={noop} />));
  assert.match(text, /等你确认 新增1项 新增 记忆「推荐活动时优先周末上午」 用在 推荐活动时 归到 酌情参考的 确认以上1项 不改了 点确认之前，什么都不会改。/u);
  assert.doesNotMatch(text, /到期/u);
  const dated = textOf(renderToStaticMarkup(<ConfirmationCard card={card({ capability: "memory.create", set: { ...MM1, validUntil: "2026-11-30" }, sourceMessageRef: "request:r1" }, "新增1项")} language="zh" online onDecide={noop} onRegenerate={noop} />));
  assert.match(dated, /到期 11月30日（周一）/u);
});

test("board 2: a change — 改, 记忆, 原来 and 改成 side by side (D1), 用在 as it is", () => {
  const html = renderToStaticMarkup(<ConfirmationCard card={card({ capability: "memory.update", expectedRevision: 1, set: { content: "推荐活动时优先周末下午" }, shown: MM1, targetId: "MM1" }, "修改1项")} language="zh" online onDecide={noop} onRegenerate={noop} />);
  assert.match(html, /data-orbit-agent-card-pair="content"/u);
  assert.match(textOf(html), /修改1项 改 记忆 原来 推荐活动时优先周末上午 改成 推荐活动时优先周末下午 用在 推荐活动时/u);
  assert.match(html, /<s>推荐活动时优先周末上午<\/s>/u);
  assert.match(html, /<b>推荐活动时优先周末下午<\/b>/u);
});

test("board 3: a deletion — the coral 删除 badge, the entry named, 用在, what follows", () => {
  const html = renderToStaticMarkup(<ConfirmationCard card={card({ capability: "memory.delete", expectedRevision: 1, shown: MM1, targetId: "MM1" }, "删除1项")} language="zh" online onDecide={noop} onRegenerate={noop} />);
  assert.match(html, /data-orbit-agent-card-badge="delete"/u);
  assert.match(textOf(html), /删除1项 删除 记忆「推荐活动时优先周末上午」 用在 推荐活动时 删掉以后，新对话和以前的对话都不再用它。/u);
});

test("board 5 (D4–D6): the memory chips follow the basis chip in the same row; 修改 › opens that entry in settings; 只这一次 has none", () => {
  const chips = [{ kind: "used" as const, memoryId: "MM1", text: "按你存的偏好「周末上午」挑的" }, { kind: "skipped" as const, memoryId: "MM2", text: "只这一次：没按你存的「周末上午」" }];
  const html = renderToStaticMarkup(<BasisLine basis={{ links: [], text: "按你的3条记录回答" }} language="zh" navigate={() => undefined} cardsBelow><MemoryChips memoryUse={chips} language="zh" navigate={() => undefined} /></BasisLine>);
  assert.equal(textOf(html), "按你的3条记录回答 按你存的偏好「周末上午」挑的 修改 › 只这一次：没按你存的「周末上午」");
  assert.match(html, /href="\/app\/settings\/iorbit\?memory=MM1#memory"[^>]*data-orbit-agent-memory-chip="used"/u);
  assert.doesNotMatch(html, /data-orbit-agent-memory-chip="skipped"[^>]*href/u);
  assert.match(renderToStaticMarkup(<MemoryChipRow memoryUse={chips} language="zh" navigate={() => undefined} />), /data-orbit-agent-basis="memory"/u);
  assert.equal(memorySettingsHref(), "/app/settings/iorbit#memory");
});

test("board 4 (D3): the memory note — what happened, the two ways (the doable half in dark), 「去设置 ›」", () => {
  const html = renderToStaticMarkup(<AnswerBlocks blocks={[{ text: "这次按「周末上午」排在前面，先看 3 场：", type: "paragraph" }, { go: { label: "去设置", to: "memory_settings" }, items: [{ action: "打开「从对话里记住新的」再说一次，或者到设置里自己加一条。", text: "「推荐活动时优先周末上午」下次不会自动用。想让我一直记着：" }], title: "只用在这一次，没有存下来", type: "note" }]} gone={new Set()} language="zh" navigate={() => undefined} />);
  assert.match(html, /data-orbit-answer-note="memory"/u);
  assert.match(textOf(html), /只用在这一次，没有存下来 「推荐活动时优先周末上午」下次不会自动用。想让我一直记着： 打开「从对话里记住新的」再说一次，或者到设置里自己加一条。 去设置 ›/u);
  assert.match(html, /href="\/app\/settings\/iorbit#memory"/u);
});

let n = 0;
const entry = (over: Partial<AgentMemoryEntryContract>): AgentMemoryEntryContract => ({ appliesTo: ["event.recommend"], category: "preference", content: `条目${++n}`, createdAt: "2026-11-01T00:00:00Z", memoryId: `m${n}`, revision: 1, source: "manual", sourceMessageRef: null, status: "active", structured: null, updatedAt: "2026-11-01T00:00:00Z", validFrom: null, validUntil: null, ...over });
const list = (memories: AgentMemoryEntryContract[], settings = { allowConversationLearning: true, enabled: true }): AgentMemoryListContract => ({ memories, memoryVersion: 1, ruleLimit: 20, settings: { ...settings, updatedAt: "" } });
const page = (value: AgentMemoryListContract) => renderToStaticMarkup(<MemorySettings list={value} language="zh" why="" onList={() => undefined} />);

test("board 6 (D7, D8): two switches, groups with their counts, 用在 on each row, 改 and 删 buttons, 还有 N 条", () => {
  const rules = Array.from({ length: 7 }, () => entry({ appliesTo: ["all"], category: "constraint" }));
  const html = page(list([...rules, entry({ content: "推荐活动时优先周末" })]));
  const text = textOf(html);
  for (const words of ["iOrbit 记住的信息", "添加一条", "回答时参考这些", "关掉后条目都还在，只是回答时不用。", "从对话里记住新的（会先问你）", "一直遵守的 7条 · 每次回答都照做", "酌情参考的 1条 · 和手上的事有关时才用", "还有2条", "用在：推荐活动时"]) assert.ok(text.includes(words), words);
  assert.equal(html.match(/aria-label="改"/gu)?.length, 6, "five rules shown and one preference");
  assert.equal(html.match(/aria-label="删除"/gu)?.length, 6);
  assert.doesNotMatch(text, /笔记|对话里记的/u, "D8: no source");
});

test("board 7: empty; both switches off (rows fade, still editable); expired; unclassified; the rule limit", () => {
  assert.match(textOf(page(list([]))), /还没有记住任何事 在对话里说一句「记住……」，或者点右上角的「添加」。/u);
  const off = page(list([entry({})], { allowConversationLearning: false, enabled: false }));
  assert.match(off, /data-orbit-memory-dim="true"/u);
  assert.match(textOf(off), /现在关着：回答时不会用下面这些，条目都还在。 .*现在关着：你说「记住……」只用在那一次，不会存。/u);
  assert.match(off, /aria-label="改"/u);
  const expired = page(list([entry({ appliesTo: ["schedule.plan"], content: "下个月把日程里的空档用起来", validUntil: "2020-01-01" })]));
  assert.match(textOf(expired), /用在：安排日程时 · 1月1日（周三）已到期 延期 删除/u);
  assert.match(textOf(page(list([entry({ appliesTo: [], content: "我习惯用中文记笔记" })]))), /还没说用在哪的 1条 · 只在明显有关时参考 我习惯用中文记笔记 以前存的，没写用在哪 补上/u);
  const full = page({ ...list(Array.from({ length: 2 }, () => entry({ appliesTo: ["all"], category: "constraint" }))), ruleLimit: 2 });
  assert.match(textOf(full), /已经2条了。再加之前，先合并或删掉几条。/u);
});
