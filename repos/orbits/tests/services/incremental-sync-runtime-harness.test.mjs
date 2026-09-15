import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let h;
before(async () => { h = await import('../../scripts/verify-incremental-sync-runtime.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; }); });
const url = 'postgresql://tester@127.0.0.1:5432/orbit_sync_acceptance_unit';
const tap = (pass = 2, skip = 0) => `TAP version 13\n1..2\n# tests 2\n# suites 0\n# pass ${pass}\n# fail 0\n# cancelled 0\n# skipped ${skip}\n# todo 0\n# duration_ms 1.2\n`;
test('database URL requires literal loopback, explicit port/user, dedicated name and no connection overrides', () => {
  assert.equal(typeof h.databaseTarget, 'function');
  assert.equal(h.databaseTarget(url).database, 'orbit_sync_acceptance_unit');
  for (const bad of [undefined, '', ...['localhost','127.1','2130706433','db.example.test'].map(host => url.replace('127.0.0.1',host)), url.replace('5432','0'), url.replace('5432','65536'), url.replace('orbit_sync_acceptance_unit','orbit'), `${url}?host=remote`, `${url}#secret`, `${url}/other`, url.replace('tester@',''), url.replace('postgresql:','https:')]) assert.throws(() => h.databaseTarget(bad));
});
test('read-only preflight verifies actual server, database marker and no user objects before writes', async () => {
  assert.equal(typeof h.probeDatabase, 'function');
  const target = h.databaseTarget(url);
  const good = { database: target.database, host: '127.0.0.1', port: 5432, marker: 'orbit:sprint-0033:disposable', objects: 0 };
  for (const row of [good, { ...good, database:'production' }, { ...good, host:'10.0.0.1' }, { ...good, port:5433 }, { ...good, marker:null }, { ...good, objects:1 }]) {
    const calls = []; const client = { query:async sql => { calls.push(sql); return { rows:[row] }; } };
    if (row === good) await h.probeDatabase(client,target); else await assert.rejects(h.probeDatabase(client,target));
    assert.equal(calls[0],'BEGIN READ ONLY'); assert.equal(calls.at(-1),'ROLLBACK');
    assert.ok(calls.every(sql => !/\b(create|insert|update|delete|drop|alter)\b/i.test(sql)));
  }
});
test('minimal child environment removes provider/auth/PG secrets and node injection', () => {
  assert.equal(typeof h.childEnvironment,'function');
  const dirty = { PATH:'/bin',HOME:'/tmp',AUTH_SECRET:'sentinel',PGHOST:'remote',PGPASSWORD:'sentinel',OPENAI_API_KEY:'sentinel',NODE_OPTIONS:'--require evil',NODE_TEST_CONTEXT:'child-v8',ORBIT_EVENT_DATABASE_URL:'sentinel' };
  const env = h.childEnvironment(dirty,url);
  assert.equal(env.ORBIT_SYNC_TEST_DATABASE_URL,url); assert.equal(env.ORBIT_TASKS_TEST_DATABASE_URL,url); assert.equal(env.NODE_ENV,'test');
  for (const key of Object.keys(dirty).filter(k => !['PATH','HOME'].includes(k))) assert.equal(env[key],undefined);
});
test('fixed manifests require every file and reject env files before execution', async () => {
  assert.equal(typeof h.assertCheckout,'function');
  assert.ok(h.WEB_FILES.includes('tests/services/sync-migrations.test.ts'));
  assert.ok(h.WEB_FILES.includes('tests/services/task-mutations-postgres.test.ts'));
  assert.deepEqual(h.APP_FILES,['tests/incremental-sync-coordinator.test.ts','tests/sync-freshness.test.ts']);
  const dir = await mkdtemp(join(tmpdir(),'sync-harness-test-'));
  try {
    await assert.rejects(h.assertCheckout(dir,['tests/required.test.ts'])); await mkdir(join(dir,'tests')); await writeFile(join(dir,'tests/required.test.ts'),'');
    await h.assertCheckout(dir,['tests/required.test.ts']); await writeFile(join(dir,'.env.production.local'),'SENTINEL=never-read');
    await assert.rejects(h.assertCheckout(dir,['tests/required.test.ts']));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('summary cannot pass missing/duplicate/malformed/skipped/todo/failed/empty results or nonzero exit', () => {
  assert.equal(typeof h.summarizeTests,'function');
  assert.deepEqual(h.summarizeTests(tap(),0),{passed:2,failed:0,skipped:0,pass:true});
  for (const output of ['',tap(1,1),tap(0),tap().replace('# todo 0','# todo 1'),tap().replace('# fail 0','# fail 1'),tap().replace('# cancelled 0','# cancelled 1'),tap()+'# tests 2\n',tap().replace('# tests 2','# tests 0')]) assert.equal(h.summarizeTests(output,0).pass,false);
  assert.equal(h.summarizeTests(tap(),1).pass,false);
});
test('subprocess hides raw output and fails on timeout/output budget', async () => {
  assert.equal(typeof h.runBounded,'function');
  const options={cwd:process.cwd(),env:h.childEnvironment(process.env),timeoutMs:2000,maxBytes:4096};
  const good=await h.runBounded(process.execPath,['-e',`console.log(${JSON.stringify(tap())}); console.error('private-cookie');`],options);
  assert.equal(good.pass,true); assert.equal(JSON.stringify(good).includes('private-cookie'),false);
  assert.equal((await h.runBounded(process.execPath,['-e','setInterval(() => {}, 1000)'],{...options,timeoutMs:40})).pass,false);
  assert.equal((await h.runBounded(process.execPath,['-e',"process.stdout.write('x'.repeat(8192))"],{...options,maxBytes:64})).pass,false);
});
test('orchestrator preflights before suites, checks residue, closes after failure and never infers Simulator', async () => {
  assert.equal(typeof h.executeAcceptance,'function');
  const events=[];
  const deps={prepare:async()=>{events.push('prepare');return {databaseHash:'a'.repeat(64),sourceHash:'b'.repeat(64)};},probe:async()=>{events.push('probe');},run:async name=>{events.push(name);return {passed:2,failed:0,skipped:0,pass:true};},close:async()=>{events.push('close');}};
  const good=await h.executeAcceptance(deps);
  assert.deepEqual(events,['prepare','probe','web','app','probe','close']); assert.equal(good.pass,true); assert.equal(good.simulatorPending,true); assert.equal(good.servicePending,true);
  assert.ok(Object.values(good).every(v=>typeof v==='boolean'||typeof v==='number'||/^[a-f0-9]{64}$/.test(v)));
  let writes=0; const bad=await h.executeAcceptance({...deps,probe:async()=>{throw new Error('private URL cookie');},run:async()=>{writes++;}});
  assert.equal(writes,0); assert.equal(bad.pass,false); assert.equal(JSON.stringify(bad).includes('private'),false);
  const cleanup=await h.executeAcceptance({...deps,close:async()=>{throw new Error('private');}}); assert.equal(cleanup.cleanupPassed,false); assert.equal(cleanup.pass,false);
  let probes=0; const residue=await h.executeAcceptance({...deps,probe:async()=>{if(++probes===2)throw new Error('residue');}}); assert.equal(residue.cleanupPassed,false); assert.equal(residue.pass,false);
  const skipped=await h.executeAcceptance({...deps,run:async()=>({passed:1,failed:0,skipped:1,pass:false})}); assert.equal(skipped.pass,false); assert.equal(skipped.suitesPassed,0);
});
test('CLI import is offline and missing configuration emits only safe JSON with exit 1',()=>{
  assert.equal(typeof h.executeAcceptance,'function');
  const options={encoding:'utf8',env:h.childEnvironment(process.env),timeout:2000};
  const imported=spawnSync(process.execPath,['--input-type=module','-e',"import './scripts/verify-incremental-sync-runtime.mjs'"],options);
  assert.equal(imported.status,0); assert.equal(imported.stdout,'');
  const result=spawnSync(process.execPath,['scripts/verify-incremental-sync-runtime.mjs'],options);
  assert.equal(result.status,1); assert.equal(result.stderr,''); const evidence=JSON.parse(result.stdout); assert.equal(evidence.pass,false); assert.equal(evidence.simulatorPending,true);
});
test('every fixed Web test path exists in this checkout', async () => {
  await h.assertCheckout(process.cwd(),h.WEB_FILES);
});
test('parent preflight rejects PG defaults and child cannot read the user password file', () => {
  assert.equal(typeof h.assertParentEnvironment,'function');
  assert.doesNotThrow(()=>h.assertParentEnvironment({PATH:'/bin'}));
  for(const key of ['PGOPTIONS','PGPASSWORD','PGPASSFILE','PGSERVICE','PGAPPNAME','NODE_OPTIONS']) assert.throws(()=>h.assertParentEnvironment({[key]:'private'}));
  assert.equal(h.childEnvironment({}).PGPASSFILE,'/dev/null');
});
test('CLI invoked through a filesystem symlink still fails closed rather than silently importing', async () => {
  const {symlink}=await import('node:fs/promises');
  const dir=await mkdtemp(join(tmpdir(),'sync-entry-test-'));
  try {
    const entry=join(dir,'entry.mjs'); await symlink(join(process.cwd(),'scripts/verify-incremental-sync-runtime.mjs'),entry);
    const result=spawnSync(process.execPath,[entry],{encoding:'utf8',env:h.childEnvironment(process.env),timeout:2000});
    assert.equal(result.status,1); assert.equal(JSON.parse(result.stdout).pass,false);
  } finally {await rm(dir,{recursive:true,force:true});}
});
