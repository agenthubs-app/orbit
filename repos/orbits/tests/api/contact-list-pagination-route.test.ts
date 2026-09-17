import assert from "node:assert/strict";
import test from "node:test";
import { createContactsGetHandler } from "../../app/api/contacts/handler";
import { contactsListSearchAndFilterServiceFactory } from "../../features/contacts/service-factory";
import { createMockContactsListSearchAndFilterService } from "../../features/contacts/mock-service";

test("contacts HTTP route forwards paging, retains filters and does not truncate unpaged clients", async (t) => {
  const resolution = contactsListSearchAndFilterServiceFactory.create("mock");
  t.mock.method(contactsListSearchAndFilterServiceFactory, "create", () => ({ ...resolution, service: createMockContactsListSearchAndFilterService() }));
  const get = createContactsGetHandler(async () => ({ id: "actor:test" }));
  const firstResponse = await get(new Request("https://orbit.test/api/contacts?limit=2"));
  assert.equal(firstResponse.status, 200);
  const first = (await firstResponse.json()).data;
  assert.equal(first.contacts.length, 2);
  assert.equal(first.total, 4);
  assert.ok(first.nextCursor);
  const second = (await (await get(new Request(`https://orbit.test/api/contacts?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`))).json()).data;
  assert.equal(second.contacts.length, 2);
  assert.equal(new Set([...first.contacts, ...second.contacts].map(item => item.id)).size, 4);
  const all = (await (await get(new Request("https://orbit.test/api/contacts"))).json()).data;
  assert.equal(all.contacts.length, 4);
  const invalid = await get(new Request("https://orbit.test/api/contacts?limit=bogus"));
  assert.equal(invalid.status, 400);
  assert.equal((await get(new Request("https://orbit.test/api/contacts?limit=0"))).status, 400);
  const filtered = (await (await get(new Request("https://orbit.test/api/contacts?limit=1&status=active"))).json()).data;
  assert.ok(filtered.contacts.length <= 1);
  assert.ok(filtered.contacts.every((item: { status: string }) => item.status === "active"));
});
