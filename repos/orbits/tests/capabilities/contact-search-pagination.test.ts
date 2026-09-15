import assert from "node:assert/strict";
import test from "node:test";

import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import { createMockContactsListSearchAndFilterService } from "../../features/contacts/mock-service";
import { createPostgresContactRecordPageReader } from "../../features/contacts/storage/contact-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";

test("contact search returns bounded stable pages and never repeats a candidate", async () => {
  const service = createMockContactsListSearchAndFilterService();
  const first = await service.searchContacts({ query: "", limit: 2 });
  assert.equal(first.success, true);
  if (!first.success) return;
  assert.equal(first.data.contacts.length, 2);
  assert.equal(first.data.total, 4);
  assert.ok(first.data.nextCursor);

  const second = await service.searchContacts({ query: "", limit: 2, cursor: first.data.nextCursor });
  assert.equal(second.success, true);
  if (!second.success) return;
  assert.equal(second.data.contacts.length, 2);
  assert.equal(second.data.nextCursor, undefined);
  assert.deepEqual(
    new Set([...first.data.contacts, ...second.data.contacts].map((contact) => contact.id)).size,
    4,
  );

  const invalid = await service.searchContacts({ query: "", limit: Number.NaN });
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.equal(invalid.error.code, "CONTACTS_FILTER_NOT_SUPPORTED");
});

test("the live provider reads only one contact-id page from a 10,000-contact match", async () => {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  const reader = createPostgresContactRecordPageReader({
    workspaceId: "workspace:test",
    client: {
      async query<TRow>(text: string, values: readonly unknown[] = []) {
        calls.push({ text, values });
        if (text.includes("count(*)")) return { rows: [{ total: "10000" }] as TRow[] };
        const offset = Number(values[7]);
        return {
          rows: Array.from({ length: 20 }, (_, index) => ({ record_id: `contact:${offset + index}` })) as TRow[],
        };
      },
    },
  });

  const first = await reader({ query: "佐", limit: 20 }, "account:one");
  assert.equal(first?.recordIds.length, 20);
  assert.equal(first?.total, 10_000);
  assert.ok(first?.nextCursor);
  assert.equal(calls.find((call) => call.text.includes("limit $7"))?.values[6], 20);
  assert.equal(calls.find((call) => call.text.includes("limit $7"))?.values[7], 0);
  assert.ok(calls.every((call) => call.values.includes("account:one")));

  calls.length = 0;
  const second = await reader({ query: "佐", limit: 20, cursor: first?.nextCursor }, "account:one");
  assert.equal(second?.recordIds[0], "contact:20");
  assert.equal(calls.find((call) => call.text.includes("limit $7"))?.values[7], 20);

  const reusedByAnotherActor = await reader({ query: "佐", limit: 20, cursor: first?.nextCursor }, "account:two");
  assert.equal(reusedByAnotherActor?.recordIds[0], "contact:0");
});

test("the live service trusts a bounded database page without filtering it a second time", async () => {
  const contact = defaultMockFixtures.contacts[0]!;
  const service = createLiveContactsListSearchAndFilterService({
    provider: {
      source: "postgres:test",
      sourceLabel: "Postgres test",
      readContactGraph: () => ({
        connections: [],
        contacts: [],
        evidence: [],
        generatedAt: "2026-09-15T00:00:00.000Z",
      }),
      readContactGraphForList: () => ({
        connections: defaultMockFixtures.connections.filter((item) => item.contactId === contact.id),
        contacts: [contact],
        evidence: defaultMockFixtures.evidence.filter((item) => contact.evidenceIds.includes(item.id)),
        generatedAt: "2026-09-15T00:00:00.000Z",
        boundedPage: {
          total: 66,
          nextCursor: "database-page-2",
        },
      }),
    },
  });

  const result = await service.searchContacts({
    actorId: "account:test",
    query: "qa-index-only-token",
    limit: 20,
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.contacts.map((item) => item.id), [contact.id]);
  assert.equal(result.data.total, 66);
  assert.equal(result.data.nextCursor, "database-page-2");
});
