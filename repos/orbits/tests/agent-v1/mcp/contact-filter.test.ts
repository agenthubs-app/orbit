import assert from "node:assert/strict";
import test from "node:test";

import { contact, memo } from "../read-kit";
import { A, B, mcpKit } from "./kit";

/**
 * AG21c, coordinator's decision D3: the outside assistant's note search accepts "only this person's notes" — a contact id
 * as a filter on memos. Only for memos, only when the connection may read contacts too, only the account's own notes, and
 * the cursor of such a page is bound to the filter.
 */

const records = () => [
  contact(A, "contact:p1", "Wren Okafor", { organization: "Okafor Tiles" }),
  contact(A, "contact:p2", "麦", { organization: "麦田书房" }),
  ...Array.from({ length: 12 }, (_, index) => memo(A, `note:w${String(index).padStart(2, "0")}`, `Tile samples round ${index}.`, new Date(Date.UTC(2026, 10, 1 + index)).toISOString(), ["contact:p1"])),
  memo(A, "note:m1", "和麦聊了秋季书单。", "2026-11-14T01:00:00.000Z", ["contact:p2"]),
  memo(A, "note:both", "Joint call with Wren and 麦.", "2026-11-14T02:00:00.000Z", ["contact:p1", "contact:p2"]),
  memo(B, "note:theirs", "B's note that names the same id.", "2026-11-14T03:00:00.000Z", ["contact:p2"]),
];

const ids = (result: { data: Record<string, any> | null }) => (result.data!.records as { id: string }[]).map((record) => record.id);

test("only the notes linked to that person, among the account's own", async () => {
  const kit = mcpKit({ records: records() });
  const tokens = await kit.connect({ scopes: ["memos:read", "contacts:read"] });
  const found = await kit.call(tokens.accessToken, "search_records", { contact: "contact:p2", domain: "memos" });
  assert.equal(found.isError, false, JSON.stringify(found.data));
  assert.deepEqual(ids(found).sort(), ["note:both", "note:m1"]);
  const withWords = await kit.call(tokens.accessToken, "search_records", { contact: "contact:p1", domain: "memos", query: "Joint" });
  assert.deepEqual(ids(withWords), ["note:both"]);
});

test("pages of one person's notes: the cursor is bound to the filter", async () => {
  const kit = mcpKit({ records: records() });
  const tokens = await kit.connect({ scopes: ["memos:read", "contacts:read"] });
  const first = await kit.call(tokens.accessToken, "search_records", { contact: "contact:p1", domain: "memos" });
  assert.equal(ids(first).length, 10);
  const cursor = first.data!.next_cursor as string;
  assert.ok(cursor);
  const second = await kit.call(tokens.accessToken, "search_records", { contact: "contact:p1", cursor, domain: "memos" });
  assert.equal(ids(second).length, 3);
  assert.ok(ids(second).every((id) => id === "note:both" || id.startsWith("note:w")));
  const other = await kit.call(tokens.accessToken, "search_records", { contact: "contact:p2", cursor, domain: "memos" });
  assert.equal(other.isError, true, "a cursor of one person's notes is not another's");
});

test("refused for other kinds and without contacts:read", async () => {
  const kit = mcpKit({ records: records() });
  const narrow = await kit.connect({ scopes: ["memos:read"] });
  assert.equal((await kit.call(narrow.accessToken, "search_records", { contact: "contact:p2", domain: "memos" })).status, 403);
  const wide = await kit.connect({ scopes: ["memos:read", "contacts:read", "todos:read"] });
  const todos = await kit.call(wide.accessToken, "search_records", { contact: "contact:p2", domain: "todos" });
  assert.equal(todos.isError, true);
  assert.equal(todos.data!.error.code, "invalid_arguments");
});
