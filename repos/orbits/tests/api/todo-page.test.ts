import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../../app/api/todo/page/route";
import { todoPageSchema } from "../../shared/api-schema/todo-page";
import { getCapabilityRegistration } from "../../shared/services/capability-registry";
import { DEMO_PEOPLE } from "../../shared/mock/demo-world";

test("mock todo route serves one read-only, board-sized page with stable demo-world identities", async () => {
  const previous = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = "mock";
  try {
    const response = await GET(new Request("http://localhost/api/todo/page"));
    assert.equal(response.status, 200);
    const page = todoPageSchema.parse((await response.json()).data);
    assert.deepEqual(page.counts, { decisions: 4, nextMoves: 3, followups: 3, overdue: 1 });
    assert.equal(page.decisions.items.length, 4);
    assert.equal(page.nextMoves.items.length, 3);
    assert.equal(page.followups.items.length, 3);
    for (const item of [...page.decisions.items, ...page.nextMoves.items, ...page.followups.items]) {
      assert.equal(item.key, `${item.source}:${item.sourceId}`);
      assert.equal(item.sample, true);
      const person = DEMO_PEOPLE.find(person => person.id === item.contactId);
      assert.ok(person);
      assert.equal(item.contactNamePreview, person.name);
    }
    assert.equal(page.followups.items.filter(item => item.overdue).length, 1);
    assert.equal(page.followups.items.find(item => item.kind === "lifecycle")?.deferralCount, undefined);
    const again = await GET(new Request("http://localhost/api/todo/page"));
    assert.deepEqual((await again.json()).data, page, "GET does not mutate its sources");
    const dated = await GET(new Request("http://localhost/api/todo/page?date=2027-01-01&timeZone=UTC"));
    const datedPage = todoPageSchema.parse((await dated.json()).data);
    assert.equal(datedPage.date, "2027-01-01");
    assert.equal(datedPage.timeZone, "UTC");
    assert.equal(datedPage.counts.overdue, 3);
  } finally { if (previous === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous; }
});

test("todo mock rejects extra/repeated/partial query values and unsigned paging tokens", async () => {
  const previous = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = "mock";
  try {
    for (const query of ["?actorId=b", "?date=2026-10-18&date=2026-10-19", "?limit=0", "?section=followups", "?section=followups&source=task&cursor=tampered"]) {
      const response = await GET(new Request(`http://localhost/api/todo/page${query}`));
      assert.equal(response.status, 400, query);
      assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
    }
  } finally { if (previous === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous; }
});

test("todo registry advertises its read-only API without claiming unfinished live readiness", () => {
  const registration = getCapabilityRegistration("todo-page");
  assert.deepEqual(registration.api.routes.map(route => [route.method, route.path]), [["GET", "/api/todo/page"]]);
  const live = registration.factory.create("live");
  assert.equal(live.success && live.service.status, "live-limited");
});
