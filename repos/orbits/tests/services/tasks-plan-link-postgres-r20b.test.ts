import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";
import { isActivePlanTypeLink } from "../../features/tasks/plan-link";
import { createTaskCollectionHandlers } from "../../app/api/tasks/collection-handler";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService, TaskServiceError } from "../../features/tasks/service";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ANY_REFERENCES, draftInput, steppingClock } from "../plans/v2-fixture";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";

const A = "actor:plan-task-a";
const B = "actor:plan-task-b";

test("PostgreSQL plan/type ownership gates task writes, and archive hides the link but not the task", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool, client }) => {
    const plans = createPostgresPlanV2Repository({ pool });
    const planService = createPlanV2Service({ repository: plans, scope: { actorId: A, workspaceId: WORKSPACE },
      references: ANY_REFERENCES, now: steppingClock(), newId: (() => { let next = 0; return () => `r20b${++next}`; })() });
    const createdPlan = (await planService.createPlanFromDraft(draftInput())).plan;
    const planLink = { planId: createdPlan.planId, typeItemId: createdPlan.content.personTypes[0]!.itemId };
    const repository = createTaskRepository({ store: createPostgresLiveRecordStore({ client }),
      workspaceId: WORKSPACE, transactionClient: client });
    const tasks = createTaskService({ repository, planLinkReader: { isActiveTypeLink: ({ actorId, ...link }) =>
      isActivePlanTypeLink(plans, { actorId, workspaceId: WORKSPACE }, link) } });
    const saved = await tasks.create({ actorId: A, title: "会う準備", category: "relationship", planLink,
      idempotencyKey: "task:plan-linked", now: "2026-10-18T08:00:00.000Z" });
    assert.deepEqual((await tasks.get({ actorId: A, taskId: saved.task.id }))?.planLink, planLink);
    assert.deepEqual((await tasks.list({ actorId: A, planId: planLink.planId, typeItemId: planLink.typeItemId })).map((task) => task.id), [saved.task.id]);
    const collection = createTaskCollectionHandlers({ service: tasks, resolveActor: async () => ({ id: A, workspaceId: WORKSPACE }),
      conditionalRead: { client, workspaceId: WORKSPACE, version: "r20b-plan-link" } });
    const listUrl = "https://orbit.local/api/tasks";
    const firstList = await collection.GET(new Request(listUrl));
    assert.equal(firstList.status, 200);
    assert.deepEqual(((await firstList.json()) as any).data.tasks[0].planLink, planLink);
    const etag = firstList.headers.get("etag");
    assert.ok(etag);
    assert.equal((await collection.GET(new Request(listUrl, { headers: { "if-none-match": etag } }))).status, 304);
    await assert.rejects(tasks.create({ actorId: B, title: "偽リンク", category: "relationship", planLink,
      idempotencyKey: "task:foreign-plan", now: "2026-10-18T08:00:00.000Z" }),
    (error: unknown) => error instanceof TaskServiceError && error.code === "TASK_INVALID_PLAN_LINK");
    await pool.query("update plans set status = 'archived', archived_at = $3 where workspace_id = $1 and id = $2",
      [WORKSPACE, planLink.planId, "2026-10-18T08:01:00.000Z"]);
    const afterArchive = await collection.GET(new Request(listUrl, { headers: { "if-none-match": etag } }));
    assert.equal(afterArchive.status, 200, "archiving a plan invalidates the task list even when the task and plan updated_at remain unchanged");
    assert.equal(((await afterArchive.json()) as any).data.tasks[0].planLink, undefined);
    assert.equal((await tasks.get({ actorId: A, taskId: saved.task.id }))?.planLink, undefined);
    assert.deepEqual(await tasks.list({ actorId: A, planId: planLink.planId, typeItemId: planLink.typeItemId }), []);
    assert.deepEqual((await repository.get(A, saved.task.id))?.payload.task.planLink, planLink);
  }, { syncRevision: true });
});

test("a deleted type invalidates only its owner's task-list ETag", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool, client }) => {
    const plans = createPostgresPlanV2Repository({ pool });
    const createPlan = async (actorId: string, prefix: string) => {
      let next = 0;
      const service = createPlanV2Service({ repository: plans, scope: { actorId, workspaceId: WORKSPACE },
        references: ANY_REFERENCES, now: steppingClock(), newId: () => `${prefix}${++next}` });
      const created = (await service.createPlanFromDraft(draftInput())).plan;
      return { planId: created.planId, typeItemId: created.content.personTypes[0]!.itemId };
    };
    const link = await createPlan(A, "etag-a-");
    const otherLink = await createPlan(B, "etag-b-");
    const tasks = createTaskService({
      repository: createTaskRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId: WORKSPACE, transactionClient: client }),
      planLinkReader: { isActiveTypeLink: ({ actorId, ...link }) => isActivePlanTypeLink(plans, { actorId, workspaceId: WORKSPACE }, link) },
    });
    await tasks.create({ actorId: A, title: "Linked", category: "relationship", planLink: link,
      idempotencyKey: "task:etag-type", now: "2026-10-18T08:00:00.000Z" });
    const collection = createTaskCollectionHandlers({ service: tasks, resolveActor: async () => ({ id: A, workspaceId: WORKSPACE }),
      conditionalRead: { client, workspaceId: WORKSPACE, version: "r20b-plan-link" } });
    const url = "https://orbit.local/api/tasks";
    const first = await collection.GET(new Request(url));
    assert.equal(first.status, 200);
    assert.deepEqual(((await first.json()) as any).data.tasks[0].planLink, link);
    const etag = first.headers.get("etag");
    assert.ok(etag);
    await pool.query("delete from plan_items where workspace_id = $1 and actor_id = $2 and id = $3", [WORKSPACE, B, otherLink.typeItemId]);
    assert.equal((await collection.GET(new Request(url, { headers: { "if-none-match": etag } }))).status, 304);
    await pool.query("delete from plan_items where workspace_id = $1 and actor_id = $2 and id = $3", [WORKSPACE, A, link.typeItemId]);
    const changed = await collection.GET(new Request(url, { headers: { "if-none-match": etag } }));
    assert.equal(changed.status, 200);
    assert.equal(((await changed.json()) as any).data.tasks[0].planLink, undefined);
  }, { syncRevision: true });
});
