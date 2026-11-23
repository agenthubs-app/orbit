/**
 * agent-design AG19 (web; approved visual draft 2026-11-19): the answer rendered from its blocks.
 *   - AG19-1: every listed record is one card and the whole card is a link to that record's page — all six kinds;
 *   - AG19-2: more than five: five cards, then "还有 N 位"; a click unfolds the rest in place and "收起" folds it again;
 *   - AG19-3: conclusion, paragraphs and points are laid out by the page; no Markdown symbol is shown; mentioned records
 *     are small cards and the row of small labels is not repeated;
 *   - AG19-4: what was not done is the note, apart from the answer, and absent when there is none;
 *   - AG19-5: a record that is gone is a dashed card that is not a link;
 *   - AG19-7: a document without blocks (an older conversation) is still shown as its text.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";

import { agentLinkHref, agentRecordHref } from "../../app/(app)/app/orbit-2026/iorbit/action-preview-client";
import { AnswerBlocks } from "../../app/(app)/app/orbit-2026/iorbit/answer-blocks";
import { BasisLine } from "../../app/(app)/app/orbit-2026/iorbit/confirmation-card";
import { answerBlocksOf, answerRecordCheckInput, answerRecordsIn, answerTileOf, recordsShown } from "../../shared/compute/agent-answer-blocks";
import type { AgentAnswerBlockContract, AgentAnswerRecordContract, AgentResultDocument } from "../../shared/contract/agent-v1";

const textOf = (html: string) => html.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const none: ReadonlySet<string> = new Set();
const render = (blocks: AgentAnswerBlockContract[], gone: ReadonlySet<string> = none) => renderToStaticMarkup(<AnswerBlocks blocks={blocks} gone={gone} language="zh" navigate={() => undefined} />);

const SIX: AgentAnswerRecordContract[] = [
  { eventKind: "platform", id: "event:e1", kind: "event", sub: "ザ 東京タワーズ シータワー", title: "第1回 中日创业交流会", top: "3月22日（周日）18:00" },
  { id: "contact:c46", kind: "contact", sub: "最近一次往来 8月12日（周三）", title: "王强", top: "青松物流 · 运营经理" },
  { id: "task:t44", kind: "todo", sub: "已过期2天", subTone: "late", title: "回复田中的询价", top: "截止 11月16日（周一）18:00" },
  { contactId: "contact:c30", id: "note:m31", kind: "memo", sub: "田中浩 · 想先试用三个月，再谈正式合同", title: "客户访谈", top: "11月10日（周二）" },
  { day: "2026-11-19", id: "schedule:s1", kind: "schedule", sub: "涩谷 Stream 3 楼", title: "和田中午餐", top: "11月19日（周四）12:00" },
  { day: "2026-10-25", eventId: "private_event:p1", eventKind: "private", id: "attendance:a1", kind: "attendance", sub: "自己记的 · 私人", title: "大学同学聚会", top: "10月25日（周日）" },
];

test("AG19-1: the link table — each of the six kinds opens that record's own page", () => {
  assert.deepEqual(SIX.map((record) => agentRecordHref(record)), [
    "/app/events/event%3Ae1",
    "/app/contacts/contact%3Ac46",
    "/app/tasks/task%3At44",
    "/app/contacts/contact%3Ac30",
    "/app/tasks?tab=calendar&date=2026-11-19",
    "/app/events?privateEvent=private_event%3Ap1&tab=going",
  ]);
  // D5: a note with no person opens in the notes tab, selected. D3: a to-do opens that one to-do, not the list.
  assert.equal(agentRecordHref({ id: "note:m9", kind: "memo" }), "/app/tasks?memo=note%3Am9&tab=memo");
  assert.equal(agentRecordHref({ eventId: "event:e7", eventKind: "platform", id: "attendance:a2", kind: "attendance" }), "/app/events/event%3Ae7");
  assert.equal(agentRecordHref({ eventKind: "private", id: "private_event:p2", kind: "event" }), "/app/events?privateEvent=private_event%3Ap2&tab=going");
  // The basis line's links use the same table (schedule had none before).
  assert.equal(agentLinkHref({ id: "task:t42", label: "x", type: "todo" }), "/app/tasks/task%3At42");
  assert.equal(agentLinkHref({ id: "schedule:s1", label: "x", type: "schedule" }), "/app/tasks?tab=calendar");
});

test("AG19-1: a list — the lead, then one card per record in order; the whole card is the link; the three lines are the document's", () => {
  const html = render([{ text: "共6条：", type: "paragraph" }, { items: SIX.slice(0, 5), shown: 5, type: "records" }]);
  const cards = [...html.matchAll(/<a class="[^"]*"[^>]*href="([^"]+)"[^>]*data-orbit-answer-card="([^"]+)"/gu)].map((match) => [match[2], match[1]]);
  assert.deepEqual(cards.map(([key]) => key), ["event:event:e1", "contact:contact:c46", "todo:task:t44", "memo:note:m31", "schedule:schedule:s1"]);
  assert.equal(cards[2][1], "/app/tasks/task%3At44");
  const text = textOf(html);
  assert.ok(text.startsWith("共6条： 🥂 活动 3月22日（周日）18:00 第1回 中日创业交流会 ザ 東京タワーズ シータワー 王 联系人 青松物流 · 运营经理 王强 最近一次往来 8月12日（周三）"), text);
  for (const kind of ["待办", "笔记", "日程"]) assert.ok(text.includes(kind), kind);
  assert.doesNotMatch(html, /data-orbit-answer-more/u, "five or fewer: no 还有 N 条 line");
  assert.doesNotMatch(html, /data-orbit-answer-note/u, "nothing was left undone: no note");
});

test("AG19-2: eight records — five first, 「还有 3 位」 unfolds in place, 「收起」 folds again; nothing is fetched", async () => {
  const people = Array.from({ length: 8 }, (_, index): AgentAnswerRecordContract => ({ id: `contact:c${index}`, kind: "contact", title: `联系人${index}` }));
  const block: AgentAnswerBlockContract = { items: people, lessLabel: "收起", moreLabel: "还有 3 位", shown: 5, type: "records" };
  assert.deepEqual([recordsShown(block as never, false).items.length, recordsShown(block as never, false).hidden, recordsShown(block as never, true).items.length], [5, 3, 8]);
  const fetched: unknown[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (...input: unknown[]) => { fetched.push(input); throw new Error("no request expected"); }) as never;
  try {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<AnswerBlocks blocks={[block]} gone={none} language="zh" navigate={() => undefined} />); });
    const cards = () => renderer.root.findAll((node) => typeof node.props["data-orbit-answer-card"] === "string" && typeof node.type === "string").length;
    const more = () => renderer.root.find((node) => node.props["data-orbit-answer-more"] !== undefined && node.type === "button");
    assert.equal(cards(), 5);
    assert.deepEqual([more().children.join(""), more().props["aria-expanded"]], ["还有 3 位", false]);
    await act(async () => { more().props.onClick(); });
    assert.equal(cards(), 8);
    assert.deepEqual([more().children.join(""), more().props["aria-expanded"]], ["收起", true]);
    await act(async () => { more().props.onClick(); });
    assert.equal(cards(), 5);
    assert.equal(fetched.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("AG19-3: a discussion — bold conclusion, paragraph, points with bold heads, small cards of what it mentions; no symbol", () => {
  const html = render([
    { text: "建议优先参加第1回，不必三场都去。", type: "conclusion" },
    { text: "三场是同一系列，重复参加边际收益递减。", type: "paragraph" },
    { items: [{ head: "第1回", text: "先去能判断质量。" }, { text: "第3回是下午场。" }], type: "points" },
    { caption: "提到的活动", items: [SIX[0], { ...SIX[0], id: "event:e2", title: "第2回 中日创业交流会", top: "4月25日（周六）18:30" }], shown: 2, size: "mini", type: "records" },
  ]);
  assert.match(html, /<p[^>]*data-orbit-answer-conclusion="true"[^>]*>建议优先参加第1回，不必三场都去。<\/p>/u);
  assert.match(html, /<li><span><b>第1回<\/b>　先去能判断质量。<\/span><\/li><li><span>第3回是下午场。<\/span><\/li>/u);
  assert.match(html, /data-orbit-answer-records="mini"/u);
  const text = textOf(html);
  assert.ok(text.includes("提到的活动 🥂 第1回 中日创业交流会 3月22日（周日）18:00 🥂 第2回 中日创业交流会 4月25日（周六）18:30"), text);
  assert.doesNotMatch(text, /[*#`]/u);
  // The cards are the entry: the basis line keeps its sentence and drops the row of small labels.
  const basis = { links: [{ id: "event:e1", label: "活动「第1回」", type: "event" as const }, { id: "event:e2", label: "活动「第2回」", type: "event" as const }], text: "按你的2条记录回答" };
  assert.equal(textOf(renderToStaticMarkup(<BasisLine basis={basis} language="zh" navigate={() => undefined} cardsBelow />)), "按你的2条记录回答");
  assert.match(renderToStaticMarkup(<BasisLine basis={basis} language="zh" navigate={() => undefined} />), /href="\/app\/events\/event%3Ae1"/u, "without cards the labels stay");
});

test("AG19-4: the note of what was not done — its own block, the user's words first, the thing to do now set apart", () => {
  const html = render([
    { text: "田中浩说想先试用三个月，再谈正式合同。", type: "paragraph" },
    { items: [{ action: "用 @ 选一场活动，我可以读它的内容。", quote: "顺便帮我找几场适合带他去的活动", text: "这要按条件在 Orbit 活动目录里找活动，现在还不能这样找，所以这次没有找。" }], title: "这次没做的部分", type: "note" },
  ]);
  const note = html.slice(html.indexOf("data-orbit-answer-note"));
  assert.ok(html.indexOf("田中浩说") < html.indexOf("data-orbit-answer-note"), "the answer first, the note below");
  assert.equal(textOf(`<div ${note}`), "这次没做的部分 「顺便帮我找几场适合带他去的活动」 这要按条件在 Orbit 活动目录里找活动，现在还不能这样找，所以这次没有找。 用 @ 选一场活动，我可以读它的内容。");
  assert.match(note, /<b>「顺便帮我找几场适合带他去的活动」<\/b>/u);
  assert.doesNotMatch(render([{ text: "只有回答。", type: "paragraph" }]), /data-orbit-answer-note/u);
});

test("AG19-5: a record that is gone — dashed card, the word 打不开了, no link; the others stay links", () => {
  const html = render([{ items: SIX.slice(0, 2), shown: 2, type: "records" }], new Set(["event:event:e1"]));
  assert.match(html, /<div[^>]*data-orbit-answer-card="event:event:e1"[^>]*data-orbit-answer-card-state="gone"/u);
  assert.doesNotMatch(html, /href="\/app\/events\/event%3Ae1"/u);
  assert.ok(textOf(html).includes("活动 打不开了 第1回 中日创业交流会"));
  assert.match(html, /<a class="[^"]*"[^>]*href="\/app\/contacts\/contact%3Ac46"/u);
  // The server may mark it too.
  assert.match(render([{ items: [{ ...SIX[1], gone: true }], shown: 1, type: "records" }]), /data-orbit-answer-card-state="gone"/u);
});

test("AG19-7: which blocks a document shows — none for an older document; the card line leaves when the card is shown", () => {
  const base = { partResults: [], requestId: "r1", revision: 1, schemaVersion: 1 as const, sessionId: "s1", status: "completed" as const, updatedAt: "2026-11-19T00:00:00.000Z" };
  const old: AgentResultDocument = { ...base, answer: { sourceRefs: [], text: "三场活动：…" } };
  assert.equal(answerBlocksOf(old, false), null);
  const withCard: AgentResultDocument = { ...base, answer: { blocks: [{ text: "查到了。", type: "paragraph" }, { text: "下面这张卡等你确认。", type: "paragraph" }], cardLine: "下面这张卡等你确认。", sourceRefs: [], text: "查到了。\n\n下面这张卡等你确认。" } };
  assert.deepEqual(answerBlocksOf(withCard, true)?.map((block) => (block.type === "paragraph" ? block.text : block.type)), ["查到了。"]);
  assert.equal(answerBlocksOf(withCard, false)?.length, 2);
  // Tiles: an event's emoji is the events page's; people get their first letter, the colour by position; the rest by kind.
  assert.deepEqual(answerTileOf(SIX[0], 0), { emoji: "🥂", shape: "emoji", tone: "lav" });
  assert.deepEqual([answerTileOf(SIX[1], 0), answerTileOf(SIX[1], 1)], [{ letter: "王", shape: "avatar", tone: "lav" }, { letter: "王", shape: "avatar", tone: "pink" }]);
  assert.deepEqual(answerTileOf(SIX[5], 0), { icon: "attendance", shape: "icon", tone: "plum" });
  // What the "still there?" check sends: each record once, a marked one not at all.
  const all = answerRecordsIn([{ items: [...SIX, SIX[0]], shown: 5, type: "records" }, { items: [{ ...SIX[1], id: "contact:c9", gone: true }], shown: 1, type: "records" }]);
  assert.equal(all.length, 7);
  assert.deepEqual(answerRecordCheckInput(all).map((item) => item.type), ["event", "contact", "todo", "memo", "schedule", "attendance"]);
  assert.deepEqual(answerRecordCheckInput(all)[0], { eventKind: "platform", id: "event:e1", type: "event" });
});
