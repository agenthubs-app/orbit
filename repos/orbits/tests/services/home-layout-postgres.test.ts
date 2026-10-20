import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HOME_LAYOUT } from "../../shared/api-schema/home-layout";
import { createHomeLayoutService } from "../../features/home-layout/service";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";

const alice = "actor:home-layout-alice";
const bob = "actor:home-layout-bob";

test("home layout is actor scoped, revisioned, and durable in PostgreSQL", databaseTest, async () => {
  await withNetworkDatabase(async ({ client, meter }) => {
    const service = createHomeLayoutService({ client, workspaceId: WORKSPACE });
    const writes = meter.writes.length;
    assert.deepEqual(await service.get(alice), DEFAULT_HOME_LAYOUT);
    assert.equal(meter.writes.length, writes, "a first read does not create a record");

    const app = [...DEFAULT_HOME_LAYOUT.app].reverse();
    const first = await service.put(alice, {
      expectedRevision: 0, mutationId: "edit-a", app, web: DEFAULT_HOME_LAYOUT.web,
    });
    assert.equal(first.kind, "saved");
    if (first.kind !== "saved") return;
    assert.equal(first.layout.revision, 1);
    assert.deepEqual(first.layout.app, app);
    assert.deepEqual(first.layout.web, DEFAULT_HOME_LAYOUT.web);
    assert.deepEqual(await service.get(alice), first.layout);
    assert.deepEqual(await service.get(bob), DEFAULT_HOME_LAYOUT);

    const reopened = createHomeLayoutService({ client, workspaceId: WORKSPACE });
    assert.deepEqual(await reopened.get(alice), first.layout);
    assert.deepEqual(await reopened.put(alice, {
      expectedRevision: 0, mutationId: "edit-a", app, web: DEFAULT_HOME_LAYOUT.web,
    }), first, "same mutation replays the original result after restart");
    assert.equal((await reopened.put(alice, {
      expectedRevision: 0, mutationId: "edit-a", app: DEFAULT_HOME_LAYOUT.app, web: DEFAULT_HOME_LAYOUT.web,
    })).kind, "mutation_reused", "the same id with another body is rejected");

    const [left, right] = await Promise.all([
      service.put(alice, { expectedRevision: 1, mutationId: "race-left", app, web: [] }),
      reopened.put(alice, { expectedRevision: 1, mutationId: "race-right", app: [], web: DEFAULT_HOME_LAYOUT.web }),
    ]);
    assert.deepEqual([left.kind, right.kind].sort(), ["conflict", "saved"]);
    assert.equal((await service.get(alice)).revision, 2);
    const stale = await service.put(alice, { expectedRevision: 0, mutationId: "stale", app, web: [] });
    assert.equal(stale.kind, "conflict");
    if (stale.kind === "conflict") assert.deepEqual(stale.current, await service.get(alice));
    assert.deepEqual(await service.put(alice, { expectedRevision: 0, mutationId: "stale", app, web: [] }), stale);
    assert.deepEqual(await service.get(bob), DEFAULT_HOME_LAYOUT);
  });
});
