import assert from "node:assert/strict";
import test from "node:test";
import { relationshipInboxToView } from "../src/view-models/relationship-inbox";

function inboxFor(subject: string, preview: string, body: string, draft = "") {
  return relationshipInboxToView({
    inbox: { conversations: [{ conversationId: "thread:real", participantName: "曾伟", subject, preview, unreadCount: 0 }] },
    selectedThread: { conversationId: "thread:real", subject, messages: [{ messageId: "message:real", senderRole: "contact", senderName: "曾伟", body }] },
    draftReply: { body: draft },
  });
}

test("mail placeholders identify missing content instead of impersonating received correspondence", () => {
  const view = inboxFor("与曾伟的关系跟进", "Review relationship context before external follow-up", "Generated relationship conversation");
  assert.equal(view.title, "收件箱");
  assert.equal(view.conversations[0]?.subject, "后续沟通");
  assert.equal(view.conversations[0]?.preview, "暂无消息正文");
  assert.equal(view.selected?.messages[0]?.body, "暂无消息正文");
  assert.equal(view.selected?.draftReply, "");
});

test("missing message bodies stay visibly empty, while genuine multilingual mail remains verbatim", () => {
  assert.equal(inboxFor("", "", "").conversations[0]?.preview, "暂无消息正文");
  for (const body of ["See you on Thursday.", "木曜日にお会いしましょう。", "请先复核预算，再发给我。", "Our provider confirmed the delivery."]) {
    const view = inboxFor("Project update", body, body, body);
    assert.equal(view.conversations[0]?.subject, "Project update");
    assert.equal(view.conversations[0]?.preview, body);
    assert.equal(view.selected?.messages[0]?.body, body);
    assert.equal(view.selected?.draftReply, body);
  }
});

test("known generated follow-up instructions are not presented as received mail", () => {
  const instruction = "Follow up about trusted tax and incorporation advisor for Japan entry with a concrete next step.";
  const view = inboxFor("与曾伟的关系跟进", instruction, instruction);
  assert.equal(view.conversations[0]?.preview, "暂无消息正文");
  assert.equal(view.selected?.messages[0]?.body, "暂无消息正文");
});
