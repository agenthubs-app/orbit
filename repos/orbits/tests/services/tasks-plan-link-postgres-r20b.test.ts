import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";
import { isActivePlanTypeLink } from "../../features/tasks/plan-link";
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
    await assert.rejects(tasks.create({ actorId: B, title: "偽リンク", category: "relationship", planLink,
      idempotencyKey: "task:foreign-plan", now: "2026-10-18T08:00:00.000Z" }),
    (error: unknown) => error instanceof TaskServiceError && error.code === "TASK_INVALID_PLAN_LINK");
    await pool.query("update plans set status = 'archived', archived_at = $3 where workspace_id = $1 and id = $2",
      [WORKSPACE, planLink.planId, "2026-10-18T08:01:00.000Z"]);
    assert.equal((await tasks.get({ actorId: A, taskId: saved.task.id }))?.planLink, undefined);
    assert.deepEqual(await tasks.list({ actorId: A, planId: planLink.planId, typeItemId: planLink.typeItemId }), []);
    assert.deepEqual((await repository.get(A, saved.task.id))?.payload.task.planLink, planLink);
  }, { syncRevision: true });
});
