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
  const good = { database: target.database, host: '127.0.0.1', port: 5432, marker: 'orbit:sprint-0033:disposable', objects: 0, owner: 'tester', current_user: 'tester' };
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

// Real Git fixtures verify porcelain behavior, including staged and untracked files.
async function gitFixture() {
  const top = await mkdtemp(join(tmpdir(), 'sync-tree-test-'));
  const web = join(top, 'repos/orbits'); const app = join(top, 'repos/orbit-app');
  await mkdir(web, { recursive: true }); await mkdir(app, { recursive: true });
  const git = (args, cwd = top) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: h.childEnvironment(process.env) });
    assert.equal(result.status, 0, 'fixture git command failed'); return result.stdout.trim();
  };
  git(['init', '-q']); git(['config', 'user.name', 'Acceptance']); git(['config', 'user.email', 'acceptance@example.test']);
  await writeFile(join(web, 'tracked'), 'original'); await writeFile(join(app, 'tracked'), 'original');
  git(['add', '.']); git(['commit', '-qm', 'fixture']);
  return { top, web, app, git };
}

test('source identity binds exact canonical directories and HEAD, rejecting dirty/staged/untracked Web and App', async () => {
  assert.equal(typeof h.assertSourceTree, 'function');
  const f = await gitFixture();
  try {
    const {createHash} = await import('node:crypto');
    assert.equal(await h.assertSourceTree(f.web, f.app), createHash('sha256').update(f.git(['rev-parse', 'HEAD'])).digest('hex'));
    for (const root of [f.web, f.app]) {
      await writeFile(join(root, 'tracked'), 'modified');
      await assert.rejects(h.assertSourceTree(f.web, f.app));
      f.git(['add', '.']); await assert.rejects(h.assertSourceTree(f.web, f.app));
      f.git(['reset', '--hard', 'HEAD']);
      await writeFile(join(root, 'untracked'), 'new'); await assert.rejects(h.assertSourceTree(f.web, f.app)); await rm(join(root, 'untracked'));
    }
    const sibling = join(f.top, 'repos/app-copy'); await mkdir(sibling); await writeFile(join(sibling, 'tracked'), 'original');
    await assert.rejects(h.assertSourceTree(f.web, sibling));
  } finally { await rm(f.top, { recursive: true, force: true }); }
});

test('source identity rejects another Git top-level and a nested App repository with different HEAD', async () => {
  assert.equal(typeof h.assertSourceTree, 'function');
  const a = await gitFixture(); const b = await gitFixture();
  try {
    await assert.rejects(h.assertSourceTree(a.web, b.app));
    a.git(['init', '-q'], a.app); a.git(['config', 'user.name', 'Acceptance'], a.app); a.git(['config', 'user.email', 'acceptance@example.test'], a.app);
    a.git(['add', '.'], a.app); a.git(['commit', '-qm', 'nested'], a.app);
    assert.notEqual(a.git(['rev-parse', 'HEAD']), a.git(['rev-parse', 'HEAD'], a.app));
    await assert.rejects(h.assertSourceTree(a.web, a.app));
  } finally { await rm(a.top, { recursive: true, force: true }); await rm(b.top, { recursive: true, force: true }); }
});

test('database probe checks owner and all user-object catalogs, with explicit system allowlists', async () => {
  const target = h.databaseTarget(url); let query = '';
  const good = { database: target.database, host: target.host, port: target.port, marker: 'orbit:sprint-0033:disposable', objects: 0, owner: 'tester', current_user: 'tester' };
  const client = row => ({query: async sql => { if (sql.startsWith('select')) query = sql; return {rows:[row]}; }});
  await h.probeDatabase(client(good),target);
  await assert.rejects(h.probeDatabase(client({...good,current_user:'foreign'}),target));
  for (const catalog of ['pg_namespace','pg_class','pg_proc','pg_type','pg_extension','pg_operator','pg_opclass','pg_opfamily','pg_collation','pg_conversion','pg_ts_config','pg_ts_dict','pg_ts_parser','pg_ts_template','pg_foreign_server','pg_foreign_data_wrapper','pg_event_trigger','pg_largeobject_metadata','pg_publication','pg_subscription','pg_default_acl']) assert.ok(query.includes(catalog), catalog);
  assert.ok(query.includes('pg_get_userbyid')); assert.ok(query.includes('current_user'));
  assert.doesNotMatch(query,/not like 'pg_%'/i);
});

test('real disposable PostgreSQL rejects enum/domain residues in preflight and cleanup and rejects non-owner', async () => {
  const { Client } = await import('pg'); const { createServer } = await import('node:net');
  const dir = await mkdtemp(join(tmpdir(), 'sync-probe-pg-')); let running = false; let owner; let foreign;
  const env = h.childEnvironment(process.env);
  const command = (name, args) => { const r = spawnSync(name, args, { env, encoding:'utf8', timeout:15000 }); assert.equal(r.status,0,'owned PostgreSQL command failed'); };
  try {
    const port = await new Promise(done => {const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>done(p));});});
    command('initdb',['-D',join(dir,'data'),'-U','acceptance','-A','trust','--no-locale']);
    command('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'-w','start']);running=true;
    const options={host:'127.0.0.1',port,user:'acceptance',database:'postgres',connectionTimeoutMillis:2000};
    owner=new Client(options);await owner.connect();await owner.query('create database orbit_sync_acceptance_probe');await owner.end();
    const target={...options,database:'orbit_sync_acceptance_probe'};owner=new Client(target);await owner.connect();
    await owner.query("comment on database orbit_sync_acceptance_probe is 'orbit:sprint-0033:disposable'");
    await h.probeDatabase(owner,target);
    const checks=[];
    for(const [create,drop] of [["create type public.probe_enum as enum ('one')",'drop type public.probe_enum'],['create domain public.probe_domain as integer','drop domain public.probe_domain']]) {
      await owner.query(create);
      let rejected=false;try{await h.probeDatabase(owner,target);}catch{rejected=true;}checks.push(rejected);
      await owner.query(drop);
      let writes=0;
      const evidence=await h.executeAcceptance({prepare:async()=>({databaseHash:'a'.repeat(64),sourceHash:'b'.repeat(64)}),probe:()=>h.probeDatabase(owner,target),run:async()=>{if(++writes===1)await owner.query(create);return {passed:1,failed:0,skipped:0,pass:true};},close:async()=>{}});
      checks.push(evidence.cleanupPassed===false&&evidence.pass===false);
      await owner.query(drop);
    }
    await owner.query('create role acceptance_reader login');
    foreign=new Client({...target,user:'acceptance_reader'});await foreign.connect();
    let rejected=false;try{await h.probeDatabase(foreign,{...target,user:'acceptance_reader'});}catch{rejected=true;}checks.push(rejected);
    await h.probeDatabase(owner,target);
    assert.deepEqual(checks,[true,true,true,true,true]);
  } finally {
    try{if(foreign)await foreign.end();}finally{try{if(owner)await owner.end();}finally{try{if(running)command('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop']);}finally{await rm(dir,{recursive:true,force:true});}}}
  }
});
