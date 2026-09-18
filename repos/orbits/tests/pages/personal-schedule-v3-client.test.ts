import assert from "node:assert/strict";
import test from "node:test";
import { createPersonalScheduleClient } from "../../app/(app)/app/tasks/personal-schedule-client";

const base = { id: "personal:series", sourceId: "personal:series", accountId: "owner", ownerUserId: "owner", kind: "personal", category: "personal", state: "upcoming", title: "Rules", startsAt: "2026-09-17T00:15:42Z", endsAt: "2026-09-17T00:45:12Z", timeZone: "Asia/Tokyo", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" } as const;
const rules = { reminderMinutes: 15 as const, recurrence: { frequency: "daily" as const, until: "2026-09-19" } };
const instance = { ...base, ...rules, id: "personal:series:occurrence:2026-09-18", seriesId: base.id, occurrenceDate: "2026-09-18", startsAt: "2026-09-18T00:15:42Z", endsAt: "2026-09-18T00:45:12Z" };

test("v3 client reads stable instances with negotiated version and bounded from/to calendar window", async () => {
  let requested = "";
  const client = createPersonalScheduleClient("owner", async (input, init) => {
    requested = String(input);
    assert.equal(new Headers(init?.headers).get("x-orbit-personal-schedule-version"), "3");
    return Response.json({ success: true, data: { scheduleItems: [instance] } });
  });
  const result = await client.list();
  const url = new URL(requested, "https://orbit.test");
  assert.equal(url.searchParams.get("scope"), "personal");
  assert.ok(Number.isFinite(Date.parse(url.searchParams.get("from") ?? "")));
  assert.ok(Number.isFinite(Date.parse(url.searchParams.get("to") ?? "")));
  assert.ok(Date.parse(url.searchParams.get("to")!) > Date.parse(url.searchParams.get("from")!));
  assert.equal(result[0]?.id, "personal:series:occurrence:2026-09-18");
});

for (const mismatch of [false, true]) test(`nested rules ACK and independent readback agree by value; mismatched until=${mismatch}`, async () => {
  const saved = { ...base, ...rules, updatedAt: "2026-09-17T01:00:00Z" };
  let reads = 0;
  const client = createPersonalScheduleClient("owner", async (_input, init) => {
    if (init?.method === "GET") reads++;
    return Response.json({ success: true, data: { scheduleItem: init?.method === "GET" && mismatch ? { ...saved, recurrence: { frequency: "daily", until: "2026-09-20" } } : structuredClone(saved) } });
  });
  const operation = client.save(base, rules as any);
  if (mismatch) await assert.rejects(operation, /回执|确认/);
  else assert.deepEqual((await operation).recurrence, { frequency: "daily", until: "2026-09-19" });
  assert.equal(reads, 1, "real client must reach its separate verification GET");
});

test("empty association query uses strict summary GET without private note bodies", async () => {
  const client = createPersonalScheduleClient("owner", async (input, init) => {
    assert.equal(String(input), "/api/schedule-items/association-options/notes?q=&limit=20");
    assert.equal(init?.method, "GET");
    return Response.json({ success: true, data: { actorId: "owner", kind: "note", options: [{ id: "note:one", title: "Private title" }], sourceVersion: "version:one", partial: false } });
  });
  assert.deepEqual(await client.searchAssociations("note", ""), { items: [{ id: "note:one", title: "Private title" }], nextCursor: null });
});

test("an occurrence without explicit scope cannot send a mutation", async () => {
  let requests = 0;
  const client = createPersonalScheduleClient("owner", async () => { requests++; return Response.json({ success: true, data: { scheduleItem: instance } }); });
  await assert.rejects(client.save(instance, { title: "Changed" }), /本次|范围|scope/);
  await assert.rejects(client.remove(instance), /本次|范围|scope/);
  assert.equal(requests, 0);
});

for (const damage of ["actor", "source", "date", "missing-date"] as const) test(`stable occurrence identity rejects ${damage} damage`, async () => {
  const damaged = { ...instance, ...(damage === "actor" ? { accountId: "other" } : damage === "source" ? { sourceId: "personal:other" } : damage === "date" ? { occurrenceDate: "2026-09-19" } : { occurrenceDate: undefined }) };
  const client = createPersonalScheduleClient("owner", async () => Response.json({ success: true, data: { scheduleItem: damaged } }));
  await assert.rejects(client.get(instance.id));
});

test("delete ACK alone is not success; independent GET must prove removal", async () => {
  const calls: string[] = [];
  const client = createPersonalScheduleClient("owner", async (_input, init) => {
    calls.push(init?.method ?? "GET");
    return Response.json({ success: true, data: init?.method === "DELETE" ? { deleted: true, scheduleItem: { ...base, state: "cancelled", updatedAt: "2026-09-17T01:00:00Z" } } : { scheduleItem: base } });
  });
  await assert.rejects(client.remove(base), /确认|删除/);
  assert.deepEqual(calls, ["DELETE", "GET"]);
});

test("late JSON after account abort cannot publish an otherwise valid record", async () => {
  const controller = new AbortController();
  let finish!: (value: unknown) => void;
  let started!: () => void;
  const decoding = new Promise<void>(resolve => { started = resolve; });
  const client = createPersonalScheduleClient("owner", async () => ({ ok: true, status: 200, json: () => { started(); return new Promise(resolve => { finish = resolve; }); } }) as Response, controller.signal);
  const read = client.get(base.id);
  await decoding; controller.abort(); finish({ success: true, data: { scheduleItem: base } });
  await assert.rejects(read, /关闭|abort/i);
});

for (const kind of ["note", "contact"] as const) test(`summary ${kind} rejects wrong actor rather than rendering private titles`, async () => {
  const client = createPersonalScheduleClient("owner", async () => Response.json({ success: true, data: { actorId: "other", kind, options: [{ id: "private", title: "Other private title" }], sourceVersion: "v1", partial: false } }));
  await assert.rejects(client.searchAssociations(kind, ""));
});

test("explicit occurrence edit sends stable identity, version and scope without inherited rule writes", async () => {
  let body: any;
  const saved = { ...instance, title: "Moved only this", updatedAt: "2026-09-17T01:00:00Z" };
  const client = createPersonalScheduleClient("owner", async (input, init) => {
    assert.equal(String(input), "/api/schedule-items/personal%3Aseries%3Aoccurrence%3A2026-09-18");
    if (init?.method === "PATCH") body = JSON.parse(String(init.body));
    return Response.json({ success: true, data: { scheduleItem: saved } });
  });
  const result = await (client.save as any)(instance, { title: "Moved only this" }, "occurrence");
  assert.equal(body.scope, "occurrence");
  assert.equal(body.expectedUpdatedAt, "2026-09-01T00:00:00Z");
  assert.deepEqual(body.patch, { title: "Moved only this" });
  assert.equal(result.startsAt, "2026-09-18T00:15:42Z");
  assert.deepEqual(result.recurrence, rules.recurrence);
});

test("delete succeeds only after separate exact-identity GET yields 404", async () => {
  const methods: string[] = [];
  const client = createPersonalScheduleClient("owner", async (input, init) => {
    assert.equal(String(input), "/api/schedule-items/personal%3Aseries");
    methods.push(init?.method ?? "GET");
    return init?.method === "DELETE" ? Response.json({ success: true, data: { deleted: true, scheduleItem: { ...base, state: "cancelled", updatedAt: "2026-09-17T01:00:00Z" } } }) : Response.json({ success: false, error: { message: "Not found" } }, { status: 404 });
  });
  await client.remove(base);
  assert.deepEqual(methods, ["DELETE", "GET"]);
});

test("rule clear keeps explicit nulls and verifies omission after independent GET", async () => {
  let patch: unknown;
  const client = createPersonalScheduleClient("owner", async (_input, init) => {
    if (init?.method === "PATCH") patch = JSON.parse(String(init.body)).patch;
    return Response.json({ success: true, data: { scheduleItem: { ...base, updatedAt: "2026-09-17T01:00:00Z" } } });
  });
  await (client.save as any)({ ...base, ...rules }, { reminderMinutes: null, recurrence: null }, "series");
  assert.deepEqual(patch, { reminderMinutes: null, recurrence: null });
});

test("409 retry preserves draft and idempotency key without a verification GET", async () => {
  const bodies: any[] = [];
  const client = createPersonalScheduleClient("owner", async (_input, init) => {
    assert.equal(init?.method, "PATCH"); bodies.push(JSON.parse(String(init.body)));
    return Response.json({ success: false, error: { message: "Conflict" } }, { status: 409 });
  });
  const fields = { title: "Keep my draft" };
  await assert.rejects(client.save(base, fields), /草稿已保留/);
  await assert.rejects(client.save(base, fields), /草稿已保留/);
  assert.equal(bodies[0].idempotencyKey, bodies[1].idempotencyKey);
  assert.deepEqual(fields, { title: "Keep my draft" });
});
