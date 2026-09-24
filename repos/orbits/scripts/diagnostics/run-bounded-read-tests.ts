import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {APPOINTMENT_SCHEMA_SQL} from '../../features/appointments/storage/migrations';

const isolatedTests=[
  'tests/services/inbox-record-service.test.ts','tests/services/inbox-business-projections.test.ts',
  'tests/services/notification-interaction-persistence.test.ts','tests/services/read-budget-gate.test.ts',
  'tests/capabilities/followup-task-generation-live-store.test.ts','tests/capabilities/reminder-schedule-notification-live-store.test.ts',
  'tests/capabilities/agent-signals.test.ts','tests/storage/live-provider-pool-reuse.test.ts','tests/storage/postgres-read-metrics.test.ts',
  'tests/api/relationship-unread-summary.test.ts','tests/api/legacy-notification-unread-summary.test.ts',
  'tests/performance/relationship-unread-summary.test.ts','tests/performance/legacy-unread-summary.test.ts',
  'tests/performance/inbox-bounded-read.test.ts','tests/performance/relationship-graph-scope.test.ts',
  'tests/performance/read-cost-baseline.test.ts','tests/performance/egress-capacity-model.test.ts','tests/performance/postgres-metric-aggregation.test.ts',
];
const integrationTests=['tests/services/inbox-record-postgres.test.ts','tests/services/inbox-meeting-precedence-postgres.test.ts','tests/capabilities/relationship-communication-live-store.test.ts'];

async function main() {
  const raw=process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
  if(!raw)throw new Error('Set ORBIT_LIFECYCLE_TEST_DATABASE_URL to a disposable local test database');
  const url=new URL(raw);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1'].includes(url.hostname)||!/test|audit/.test(url.pathname)||url.search)throw new Error('Local test/audit database without URL options required');
  // An allowlist, not a copied process environment: no Neon, provider or .env
  // credentials can leak into child tests even if the caller has loaded them.
  const clean={PATH:process.env.PATH??'',NODE_ENV:'test' as const,ORBIT_LIFECYCLE_TEST_DATABASE_URL:raw};
  const run=(tests:string[],env:NodeJS.ProcessEnv)=>{
    const child=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=2',...tests],{cwd:process.cwd(),env,stdio:'inherit'});
    if(child.status!==0)throw new Error('Bounded-read regression failed');
  };
  run(isolatedTests,clean);
  const schema='bounded_suite_'+randomUUID().replaceAll('-','');
  const admin=new Pool({connectionString:raw,max:1});
  url.searchParams.set('options',`-c search_path=${schema} -c statement_timeout=20000`);
  const scoped=url.toString(),pool=new Pool({connectionString:scoped,max:1});
  let created=false;
  try {
    await admin.query(`create schema ${schema}`);created=true;
    // These existing integration tests target the normal record/appointment
    // schema. The separately deployed sync-trigger migration has its own suite.
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);await pool.query(APPOINTMENT_SCHEMA_SQL);
    run(integrationTests,{...clean,ORBIT_DATABASE_TARGET:'local',ORBIT_LOCAL_DATABASE_URL:scoped,ORBIT_EVENT_DATABASE_URL:scoped});
  }finally{await pool.end();if(created)await admin.query(`drop schema ${schema} cascade`);await admin.end();}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Local regression failed');process.exitCode=1;});
