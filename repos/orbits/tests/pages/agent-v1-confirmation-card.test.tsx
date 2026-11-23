/**
 * agent-design AG07 (web): the confirmation card and the four small changes, rendered from the server's preview and
 * result document only (AG07-1, AG07-2, AG07-3, AG07-5).
 *   - every word on the card is the preview's or a fixed aiCard word of the card's language; a field the preview
 *     lacks is not on the card, and the client formats no date;
 *   - a refused click shows the latest card the server returned (expired, canceled), never an error code;
 *   - offline: only how many changes wait, nothing to press;
 *   - the basis line links the cited record; the options under a question are buttons; the card line leaves the text.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";

import { answerTextOf, BasisLine, ConfirmationCard, ProgressLine, QuestionOptions, QueuedNote } from "../../app/(app)/app/orbit-2026/iorbit/confirmation-card";
import { agentLinkHref, latestCard, requestIdOfAssistantMessage } from "../../app/(app)/app/orbit-2026/iorbit/action-preview-client";
import type { AgentActionPreviewContract, AgentResultDocument } from "../../shared/contract/agent-v1";

const preview = (overrides: Partial<AgentActionPreviewContract> = {}): AgentActionPreviewContract => ({
  actionId: "card1",
  locale: "zh",
  operations: [
    { after: { plannedDate: "2026-11-20" }, before: { plannedDate: "2026-11-18" }, capability: "todo.update", display: { change: "update", record: "待办「给小林发修订报价」", rows: [{ after: "11月20日（周五）", before: "11月18日（周三）", field: "plannedDate", label: "计划日期" }] }, operationId: "card1:op1", status: "pending", target: { collection: "tasks", id: "task:t42" }, text: "line 1" },
    { after: {}, capability: "memo.create", display: { change: "create", record: "笔记「小林今天来过电话」", rows: [{ after: "小林健", field: "interaction.actualContactIds", label: "往来对象" }, { after: "11月15日（周日）", field: "interaction.occurredOn", label: "日期" }, { after: "对方来电", field: "interaction.channel", label: "方式" }] }, operationId: "card1:op2", status: "pending", text: "line 2" },
  ],
  payloadHash: "h1",
  revision: 1,
  revisions: [],
  status: "awaiting_confirmation",
  summary: "s",
  title: "修改1项，新增1项",
  updatedAt: "2026-11-15T01:00:00.000Z",
  ...overrides,
});
const noop = async () => true;
const INTERNAL = /操作|载荷|版本|证据|来源|CARD_[A-Z_]+|payloadHash|revision/u;
const textOf = (html: string) => html.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();

test("the waiting card: count sentence, each item as the preview wrote it, both buttons, nothing internal", () => {
  const html = renderToStaticMarkup(<ConfirmationCard card={preview()} language="zh" online onDecide={noop} onRegenerate={noop} />);
  const text = textOf(html);
  for (const words of ["等你确认", "修改1项，新增1项", "改", "待办「给小林发修订报价」", "计划日期", "11月18日（周三）", "11月20日（周五）", "新增", "笔记「小林今天来过电话」", "往来对象", "小林健", "对方来电", "确认以上2项", "不改了", "点确认之前，什么都不会改。"]) assert.ok(text.includes(words), words);
  assert.match(html, /<s[^>]*>11月18日（周三）<\/s>/u, "the old value is struck through");
  assert.doesNotMatch(text, INTERNAL);
});

test("a field the preview does not have is not on the card; nothing is formatted by the client", () => {
  const base = preview();
  const lacking = preview({ operations: [{ ...base.operations[0], display: { ...base.operations[0].display!, rows: [] } }] });
  const text = textOf(renderToStaticMarkup(<ConfirmationCard card={lacking} language="zh" online onDecide={noop} onRegenerate={noop} />));
  assert.doesNotMatch(text, /计划日期|11月|2026-11/u, "no row is made up from before/after");
});

test("the same card in Japanese: fixed words follow the card's language, not the page's", () => {
  const ja = preview({ locale: "ja", title: "変更 1 件、追加 1 件" });
  const text = textOf(renderToStaticMarkup(<ConfirmationCard card={ja} language="zh" online onDecide={noop} onRegenerate={noop} />));
  assert.ok(text.includes("以上 2 件を確定") && text.includes("変更しない") && text.includes("確認待ち"), text);
  assert.doesNotMatch(text, /确认以上|不改了/u);
});

test("a click sends the decision; a refused one shows the latest state the server returned", async () => {
  const decided: string[] = [];
  let card = preview();
  let renderer!: ReturnType<typeof create>;
  const render = () => <ConfirmationCard card={card} language="zh" online onDecide={async (decision) => { decided.push(decision); card = preview({ status: "expired" }); renderer.update(render()); return true; }} onRegenerate={noop} />;
  await act(async () => { renderer = create(render()); });
  const confirm = renderer.root.findAll((node) => node.type === "button" && node.props["data-orbit-agent-card-confirm"] !== undefined)[0];
  await act(async () => { confirm.props.onClick(); });
  assert.deepEqual(decided, ["confirm"]);
  const text = JSON.stringify(renderer.toJSON());
  assert.ok(text.includes("这张卡放太久了，要重新生成一张吗？") && text.includes("放太久已失效") && text.includes("重新生成"));
  assert.doesNotMatch(text, /CARD_EXPIRED/u);
  const canceled = textOf(renderToStaticMarkup(<ConfirmationCard card={preview({ status: "rejected" })} language="zh" online onDecide={noop} onRegenerate={noop} />));
  assert.ok(canceled.includes("已取消") && canceled.includes("没有改任何记录。") && !canceled.includes("确认以上"));
  const done = textOf(renderToStaticMarkup(<ConfirmationCard card={preview({ operations: preview().operations.map((op) => ({ ...op, status: "succeeded" as const })), status: "completed" })} language="zh" online onDecide={noop} onRegenerate={noop} />));
  assert.ok(done.includes("已完成") && done.includes("已改") && done.includes("已新增"));
});

test("offline (AG07-3): only how many changes wait and that it needs the network; no item, no button", () => {
  const html = renderToStaticMarkup(<ConfirmationCard card={preview()} language="zh" online={false} onDecide={noop} onRegenerate={noop} />);
  assert.equal(textOf(html), "有1份待确认的修改 联网后才能确认");
  assert.doesNotMatch(html, /<button/u);
});

test("an unsynced edit of a record on the card disables confirm and says so (the App's case, same component rule)", () => {
  const text = textOf(renderToStaticMarkup(<ConfirmationCard card={preview()} language="zh" online pendingTargets={["tasks:task:t42"]} onDecide={noop} onRegenerate={noop} />));
  assert.ok(text.includes("先同步你的修改") && text.includes("这条待办你在手机上改过，还没同步"));
  const html = renderToStaticMarkup(<ConfirmationCard card={preview()} language="zh" online pendingTargets={["tasks:task:t42"]} onDecide={noop} onRegenerate={noop} />);
  assert.match(html, /<button[^>]*disabled=""[^>]*data-orbit-agent-card-confirm/u);
});

test("the basis line links the cited note; one link reads 打开 ›; the 来源 line is gone", () => {
  const navigated: string[] = [];
  const basis = { links: [{ contactId: "contact:c17", id: "note:m31", label: "11月12日的笔记", type: "memo" as const }], text: "按你11月12日记的笔记回答" };
  const html = renderToStaticMarkup(<BasisLine basis={basis} language="zh" navigate={(href) => navigated.push(href)} />);
  assert.match(html, /href="\/app\/contacts\/contact%3Ac17"/u);
  assert.equal(textOf(html), "按你11月12日记的笔记回答 打开 ›");
  assert.doesNotMatch(html, /来源/u);
  // AG19 (D3): a to-do link opens that one to-do, not the list.
  assert.equal(agentLinkHref({ id: "task:t42", label: "x", type: "todo" }), "/app/tasks/task%3At42");
});

test("options under a question are buttons; the card line leaves the text; queued and progress notes", () => {
  const picked: string[] = [];
  const set = { clarificationId: "q1", kind: "question" as const, options: [{ capability: "contact.read", label: "小林健（北辰软件）", optionId: "o1" }, { capability: "contact.read", label: "小林诚", optionId: "o2" }], partId: "p1", state: "open" as const };
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(<QuestionOptions clarifications={[set]} language="zh" disabled={false} onSelect={(_set, optionId) => picked.push(optionId)} />); });
  renderer.root.findAll((node) => node.type === "button")[1].props.onClick();
  assert.deepEqual(picked, ["o2"]);
  assert.ok(JSON.stringify(renderer.toJSON()).includes("也可以直接打字回答。"));
  const document = { answer: { cardLine: "确认卡（修改1项）：\n① …\n点卡上的「确认以上1项」之前，什么都不会改。", sourceRefs: [], text: "你们聊了报价初稿。\n\n确认卡（修改1项）：\n① …\n点卡上的「确认以上1项」之前，什么都不会改。" } } as unknown as AgentResultDocument;
  assert.equal(answerTextOf(document, true), "你们聊了报价初稿。");
  assert.equal(answerTextOf(document, false), document.answer!.text);
  assert.equal(textOf(renderToStaticMarkup(<QueuedNote language="zh" />)), "已收到，等前一条处理完");
  assert.equal(textOf(renderToStaticMarkup(<ProgressLine language="zh" stage="reading" />)), "正在查你的笔记… 通常不到一分钟");
  assert.equal(textOf(renderToStaticMarkup(<ProgressLine language="en" stage={null} />)), "Putting the answer together… Usually under a minute");
});

test("coordinator note: with a basis line the notes footnote is not shown again; without one it stays", () => {
  const basis = { links: [{ id: "note:m31", label: "11月12日的笔记", type: "memo" as const }], text: "按你11月12日记的笔记回答" };
  const withBasis = { answer: { basis, sourceRefs: ["memo:note:m31"], text: "你们聊了报价初稿。 （以上出自你的笔记。）" } } as unknown as AgentResultDocument;
  assert.equal(answerTextOf(withBasis, false), "你们聊了报价初稿。");
  const en = { answer: { basis, sourceRefs: [], text: "You went over the first quote. (From your notes.)" } } as unknown as AgentResultDocument;
  assert.equal(answerTextOf(en, false), "You went over the first quote.");
  const noBasis = { answer: { sourceRefs: [], text: "你们聊了报价初稿。 （以上出自你的笔记。）" } } as unknown as AgentResultDocument;
  assert.equal(answerTextOf(noBasis, false), "你们聊了报价初稿。 （以上出自你的笔记。）");
});

test("a restored assistant message names its request; the newer of the document's card and the clicked one is shown", () => {
  assert.equal(requestIdOfAssistantMessage("assistant:agreq_0123abcd"), "agreq_0123abcd");
  assert.equal(requestIdOfAssistantMessage("assistant:agreq_0123abcd:selection:1"), "agreq_0123abcd");
  assert.equal(requestIdOfAssistantMessage("message:1"), null);
  const old = preview();
  const clicked = preview({ status: "completed", updatedAt: "2026-11-15T01:05:00.000Z" });
  assert.equal(latestCard(old, clicked)?.status, "completed");
  assert.equal(latestCard(preview({ revision: 2 }), clicked)?.revision, 2);
});
