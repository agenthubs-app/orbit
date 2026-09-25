import assert from "node:assert/strict";
import test from "node:test";
import { decodeConversationSummaryPage, conversationSummaryView, conversationSummaryReadItems, decodeRelationshipMessagePage, relationshipMessagePageView } from "../src/view-models/relationship-pages";

const at = "2026-09-25T00:00:00Z";
const item = { conversationId: "c", contactId: "contact", participantAccountIds: ["a", "b"], participantDisplayNames: { a: "Me", b: "Ren" }, qualificationVersion: "q", status: "active", createdAt: at, updatedAt: at, unreadCount: 10000,
  lastMessage: { messageId: "last", senderAccountId: "b", sentAt: at, bodyPreview: "Preview only" } };
const page = { actorId: "a", items: [item], hasMore: true, nextCursor: "signed", asOf: at };

test("summary previews and bulk read cursors never require a message history", () => {
  const decoded = decodeConversationSummaryPage(page, "a"); assert.ok(decoded);
  const view = conversationSummaryView(decoded, "a", "en");
  assert.equal(view.conversations[0]?.preview, "Preview only");
  assert.equal(view.conversations[0]?.unreadCount, 10000);
  assert.deepEqual(conversationSummaryReadItems(decoded, "a", "en")[0]?.readAction?.body, { lastReadMessageId: "last" });
  assert.ok(!("messages" in decoded.items[0]!));
});

test("summary decoder rejects cross-account, invalid membership, duplicate ids and inconsistent cursors", () => {
  for (const invalid of [
    { ...page, actorId: "other" }, { ...page, items: [item, item] },
    { ...page, hasMore: false }, { ...page, items: [], hasMore: true },
    { ...page, items: [{ ...item, participantAccountIds: ["a", "a"] }] },
    { ...page, items: [{ ...item, participantDisplayNames: { a: "Me" } }] },
    { ...page, items: [{ ...item, lastMessage: { ...item.lastMessage, senderAccountId: "stranger" } }] },
    { ...page, items: [{ ...item, lastMessage: null }] },
  ]) assert.equal(decodeConversationSummaryPage(invalid, "a"), null);
});

test("message windows validate identity and full bodies without pretending to contain the entire history", () => {
  const {unreadCount,lastMessage,...conversation} = item;
  const message = {messageId:"last",conversationId:"c",senderAccountId:"b",senderDisplayName:"Ren",body:"A complete message",sentAt:at,deliveryState:"delivered"};
  const window = {actorId:"a",conversation,items:[message],hasMore:true,nextCursor:"older",newestCursor:"newer",direction:"older",asOf:at};
  const decoded = decodeRelationshipMessagePage(window,"a","c"); assert.ok(decoded);
  assert.equal(relationshipMessagePageView(decoded,"a","en").messages[0]?.body,"A complete message");
  for (const invalid of [{...window,actorId:"b"},{...window,items:[message,message]},{...window,items:[{...message,body:" "}]},{...window,items:[{...message,conversationId:"other"}]},{...window,items:[{...message,senderAccountId:"stranger"}]}]) {
    assert.equal(decodeRelationshipMessagePage(invalid,"a","c"),null);
  }
});
