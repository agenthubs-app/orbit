import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Pool} from 'pg';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {APPOINTMENT_SCHEMA_SQL} from '../../features/appointments/storage/migrations';

// Local, disposable schema. Never inherit cloud/provider credentials into tests.
async function main() {
const raw=process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
if(!raw)throw new Error('Set ORBIT_LIFECYCLE_TEST_DATABASE_URL to a local test database');
const base=new URL(raw);
if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('Local PostgreSQL only');
base.search='';
const schema='inbox_batch_regression_'+randomUUID().replaceAll('-','');
const scoped=new URL(base);scoped.searchParams.set('options',`-c search_path=${schema} -c statement_timeout=20000`);
const admin=new Pool({connectionString:base.toString(),max:1});
const fixture=new Pool({connectionString:scoped.toString(),max:1});
try {
  await admin.query(`create schema ${schema}`);
  await fixture.query(ORBIT_RECORDS_SCHEMA_SQL);
  await fixture.query(APPOINTMENT_SCHEMA_SQL);
  const exitCode=await new Promise<number>((resolve,reject)=>{
    const child=spawn(process.execPath,['--import','tsx','--test',
      'tests/services/inbox-source-batch-postgres.test.ts','tests/services/inbox-record-postgres.test.ts',
      'tests/services/inbox-meeting-precedence-postgres.test.ts','tests/services/notification-discovery-worker-postgres.test.ts',
      'tests/services/personal-schedule-runtime.test.ts','tests/services/inbox-record-service.test.ts',
      'tests/performance/inbox-bounded-read.test.ts'],{
      stdio:'inherit',env:{PATH:process.env.PATH,NODE_ENV:'test',TZ:'Asia/Tokyo',ORBIT_DATABASE_TARGET:'local',
        ORBIT_LOCAL_DATABASE_URL:scoped.toString(),ORBIT_EVENT_DATABASE_URL:scoped.toString(),
        ORBIT_LIFECYCLE_TEST_DATABASE_URL:base.toString()},
    });
    child.on('error',reject);child.on('exit',code=>resolve(code??1));
  });
  process.exitCode=exitCode;
} finally {
  await fixture.end();await admin.query(`drop schema if exists ${schema} cascade`);await admin.end();
}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
