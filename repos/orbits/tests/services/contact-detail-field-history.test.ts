import assert from "node:assert/strict";
import test from "node:test";

import { contactDetailFieldHistory } from "../../features/contacts/live-detail-service";

// R11a SC-09（以前の値，R11-08）：详情带上 fieldHistory（含 offering / seeking），坏条目跳过，最多 20 条。
test("the detail carries the field history the writers left on the contact", () => {
  const contact = { id: "c1", fieldHistory: [
    { field: "role", previous: "取締役 COO", next: "代表取締役", source: "invite_sync", at: "2026-10-12T00:00:00.000Z" },
    { field: "offering", previous: "製造業の現場ネットワーク", next: "製造業の現場ネットワーク、PoC 先の紹介", source: "invite_sync", at: "2026-10-12T00:00:00.000Z" },
    { field: 3, previous: "x" },
    "junk",
  ] } as never;
  assert.deepEqual(contactDetailFieldHistory(contact).fieldHistory?.map((entry) => entry.field), ["role", "offering"]);
  assert.deepEqual(contactDetailFieldHistory({ id: "c2" } as never), {});
  const many = { id: "c3", fieldHistory: Array.from({ length: 30 }, (_, n) => ({ field: "role", previous: String(n), next: String(n + 1), source: "manual", at: "2026-10-01T00:00:00.000Z" })) } as never;
  const history = contactDetailFieldHistory(many).fieldHistory!;
  assert.equal(history.length, 20);
  assert.equal(history.at(-1)!.previous, "29");
});
