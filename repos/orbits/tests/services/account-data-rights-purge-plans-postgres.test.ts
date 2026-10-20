import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("plan purge removes the target actor's plan graph while preserving another actor", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(`create table plans (workspace_id text, actor_id text, id text, primary key(workspace_id,actor_id,id));
      create table plan_intakes (workspace_id text, actor_id text, id text, plan_id text, primary key(workspace_id,actor_id,id),
        foreign key(workspace_id,actor_id,plan_id) references plans(workspace_id,actor_id,id));
      create table plan_drafts (workspace_id text, actor_id text, id text, intake_id text,
        foreign key(workspace_id,actor_id,intake_id) references plan_intakes(workspace_id,actor_id,id));
      create table plan_items (workspace_id text, actor_id text, id text, plan_id text, primary key(workspace_id,actor_id,id),
        foreign key(workspace_id,actor_id,plan_id) references plans(workspace_id,actor_id,id));
      create table plan_log (workspace_id text, actor_id text, id text, plan_id text, item_id text,
        foreign key(workspace_id,actor_id,item_id) references plan_items(workspace_id,actor_id,id));
      create table plan_commands (workspace_id text, actor_id text, id text, plan_id text,
        foreign key(workspace_id,actor_id,plan_id) references plans(workspace_id,actor_id,id));
      create table plan_flow_commands (workspace_id text, actor_id text, id text);
      create table plan_match_jobs (workspace_id text, actor_id text, id text, primary key(workspace_id,actor_id,id));
      create table plan_match_candidates (workspace_id text, actor_id text, id text, job_id text,
        foreign key(workspace_id,actor_id,job_id) references plan_match_jobs(workspace_id,actor_id,id));
      create table plan_match_job_contacts (workspace_id text, actor_id text, id text, job_id text,
        foreign key(workspace_id,actor_id,job_id) references plan_match_jobs(workspace_id,actor_id,id));
      create table plan_revisions (workspace_id text, actor_id text, id text);
      create table ai_usage_ledger (workspace_id text, actor_id text, id text, primary key(workspace_id,id));
      create table ai_usage_calls (workspace_id text, operation_id text, id text,
        foreign key(workspace_id,operation_id) references ai_usage_ledger(workspace_id,id));`);
    for (const actor of ["owner", "other"]) {
      const workspace = "space";
      await pool.query(`insert into plans values($1,$2,'p')`, [workspace, actor]);
      await pool.query(`insert into plan_intakes values($1,$2,'i','p')`, [workspace, actor]);
      await pool.query(`insert into plan_drafts values($1,$2,'d','i')`, [workspace, actor]);
      await pool.query(`insert into plan_items values($1,$2,'s','p')`, [workspace, actor]);
      await pool.query(`insert into plan_log values($1,$2,'l','p','s')`, [workspace, actor]);
      await pool.query(`insert into plan_commands values($1,$2,'c','p')`, [workspace, actor]);
      await pool.query(`insert into plan_flow_commands values($1,$2,'f')`, [workspace, actor]);
      await pool.query(`insert into plan_match_jobs values($1,$2,'j')`, [workspace, actor]);
      await pool.query(`insert into plan_match_candidates values($1,$2,'m','j')`, [workspace, actor]);
      await pool.query(`insert into plan_match_job_contacts values($1,$2,'n','j')`, [workspace, actor]);
      await pool.query(`insert into plan_revisions values($1,$2,'r')`, [workspace, actor]);
      await pool.query(`insert into ai_usage_ledger values($1,$2,$3)`, [workspace, actor, `${actor}-usage`]);
      await pool.query(`insert into ai_usage_calls values($1,$2,'call')`, [workspace, `${actor}-usage`]);
    }
    const { purgeAccountPlans } = await import("../../features/account/data-rights/purge/plans");
    const result = await purgeAccountPlans({ query: async (sql, values) => pool.query(sql, values as unknown[]) }, "space", "owner");
    assert.ok(result.deleted > 0);
    for (const table of ["plans", "plan_intakes", "plan_drafts", "plan_items", "plan_log", "plan_commands", "plan_flow_commands", "plan_match_jobs", "plan_match_candidates", "plan_match_job_contacts", "plan_revisions", "ai_usage_ledger"]) {
      const rows = await pool.query(`select actor_id,count(*)::int as count from ${table} group by actor_id`);
      assert.deepEqual(rows.rows, [{ actor_id: "other", count: 1 }], table);
    }
    assert.equal((await pool.query("select count(*)::int as count from ai_usage_calls")).rows[0]?.count, 1);
    assert.equal((await purgeAccountPlans({ query: async (sql, values) => pool.query(sql, values as unknown[]) }, "space", "owner")).deleted, 0);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});
