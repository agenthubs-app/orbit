import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDiscoveryRepository, DiscoveryConflict } from '../../features/notifications/discovery/discovery-repository';
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import type { DiscoverySourceRef } from '../../features/notifications/discovery/contract';

// Sprint 0139. Production keeps every account in one shared orbit_records table, so these tests run in
// the shared public schema on purpose (no private schema). enqueuePage used to hold a relation-level
// SIREAD lock on orbit_records (a seq scan on a small table, or more than max_pred_locks_per_relation
// row locks once a re-scanned page finds its 50 jobs spread over many heap pages); then any write to
// the table by another account could abort it with 40001. claim (which scans the actor's jobs) and the
// bulk job update in updatePreferences ran serializable too and lost the same way under unrelated load.
const url = process.env.ORBIT_EVENT_DATABASE_URL;
const at = '2026-09-16T00:00:00.000Z';
const refs = (prefix: string, from: number, to: number): DiscoverySourceRef[] => Array.from({ length: to - from }, (_, i) => ({ kind: 'note', id: `${prefix}${from + i}`, revision: '1', at, key: `note:${prefix}${from + i}` }));

interface Observed { client: TransactionalPostgresClient; serializationFailures: number; relationLocks: number[]; probe: boolean }
/** Counts 40001/40P01 raised by any transaction attempt (the repository retries hide them otherwise) and,
 * while `probe` is on, records how many relation-level SIREAD locks on orbit_records the transaction holds just before commit. */
function observe(base: TransactionalPostgresClient): Observed {
  const o: Observed = { client: base, serializationFailures: 0, relationLocks: [], probe: false };
  o.client = {
    ...base,
    async transaction(operation, options) {
      try {
        return await base.transaction(async executor => {
          const result = await operation(executor);
          if (o.probe) o.relationLocks.push(Number((await executor.query<{ n: string }>(`select count(*)::text as n from pg_locks where pid=pg_backend_pid() and mode='SIReadLock' and locktype='relation' and relation='public.orbit_records'::regclass`)).rows[0].n));
          return result;
        }, options);
      } catch (error) {
        if (['40001', '40P01'].includes(String((error as { code?: string }).code))) o.serializationFailures++;
        throw error;
      }
    },
  };
  return o;
}

async function enabledRepo(client: TransactionalPostgresClient, workspaceId: string, actor = 'a', token = 'lease') {
  const repo = createDiscoveryRepository({ client, workspaceId, now: () => at, budgetWorkspaceId: workspaceId });
  const p = await repo.updatePreferences(actor, { enabled: true, expectedRevision: 0 });
  assert.equal(await repo.acquireActor(actor, token), true);
  return { repo, generation: p.generation, actor, token };
}

/** Puts each of the actor's jobs on its own heap page region, the way jobs written round by round end up
 * between other accounts' rows in production. */
async function scatterJobs(client: TransactionalPostgresClient, workspaceId: string, fillerWorkspace: string, r: Awaited<ReturnType<typeof enabledRepo>>, page: DiscoverySourceRef[]) {
  for (const [i, ref] of page.entries()) {
    await client.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,lifecycle_state,payload,created_at,updated_at)
      select $1,'qaDiscoveryFiller','filler-'||$2||'-'||g,'filler','manual','filler-'||g,'{}','active',jsonb_build_object('pad',repeat('x',300)),$3::timestamptz,$3::timestamptz from generate_series(1,30) g`, [fillerWorkspace, i, at]);
    await r.repo.enqueuePage(r.actor, r.token, r.generation, [ref], { at, key: ref.key });
  }
  const spread = await client.query<{ pages: string }>(`select count(distinct (ctid::text::point)[0])::text as pages from orbit_records where workspace_id=$1 and collection_name='notificationDiscoveryJobs'`, [workspaceId]);
  assert.ok(Number(spread.rows[0].pages) > 32, `jobs should span more heap pages than max_pred_locks_per_relation, got ${spread.rows[0].pages}`);
}

const cleanup = (client: TransactionalPostgresClient, workspaces: string[]) => client.query('delete from orbit_records where workspace_id = any($1::text[])', [workspaces]);

test('enqueuePage on the shared orbit_records table holds no table-wide predicate lock', { skip: !url }, async () => {
  const base = createTransactionalPostgresClient({ connectionString: url!, max: 4 }), o = observe(base);
  const workspaceId = 'qa:discovery-contention:' + randomUUID(), filler = 'qa:discovery-contention-filler:' + randomUUID();
  try {
    const r = await enabledRepo(o.client, workspaceId), page = refs('n', 0, 50);
    await scatterJobs(base, workspaceId, filler, r, page);
    o.probe = true;
    await r.repo.enqueuePage(r.actor, r.token, r.generation, page, { at, key: 'note:n49' }); // re-scan: all 50 jobs already exist
    await r.repo.enqueuePage(r.actor, r.token, r.generation, refs('fresh', 0, 50), { at, key: 'note:fresh49' }); // new page
    o.probe = false;
    assert.deepEqual(o.relationLocks, [0, 0]);
    assert.equal((await r.repo.jobs(r.actor)).length, 100);
  } finally { await cleanup(base, [workspaceId, filler]); await base.close(); }
});

test('claim and a bulk updatePreferences on the shared orbit_records table hold no table-wide predicate lock', { skip: !url }, async () => {
  const base = createTransactionalPostgresClient({ connectionString: url!, max: 4 }), o = observe(base);
  const workspaceId = 'qa:discovery-contention:' + randomUUID(), filler = 'qa:discovery-contention-filler:' + randomUUID();
  try {
    const r = await enabledRepo(o.client, workspaceId);
    await scatterJobs(base, workspaceId, filler, r, refs('n', 0, 50));
    o.probe = true;
    assert.equal((await r.repo.claim(r.actor, r.token, 20)).length, 20);
    const current = await r.repo.preferences(r.actor);
    await r.repo.updatePreferences(r.actor, { messageAnalysisEnabled: true, expectedRevision: current.revision }); // re-queues all 50 jobs
    o.probe = false;
    assert.deepEqual(o.relationLocks, [0, 0]);
    const jobs = await r.repo.jobs(r.actor), generation = (await r.repo.preferences(r.actor)).generation;
    assert.deepEqual([...new Set(jobs.map(j => `${j.state}:${j.generation}`))], [`queued:${generation}`]);
  } finally { await cleanup(base, [workspaceId, filler]); await base.close(); }
});

/** Other accounts keep running discovery (enqueue + claim rounds, preference toggles that re-queue their jobs)
 * and ordinary serializable app writes in the same table. Each discovery operation has its own counter. */
async function unrelatedLoad(base: TransactionalPostgresClient, otherWorkspaces: string[], writerWorkspace: string) {
  const ops = { enqueuePage: observe(base), claim: observe(base), updatePreferences: observe(base) };
  const repo = (client: TransactionalPostgresClient, workspaceId: string) => createDiscoveryRepository({ client, workspaceId, now: () => at, budgetWorkspaceId: workspaceId });
  const rounds = [];for (const w of otherWorkspaces.slice(0, -1)) rounds.push({ w, ...await enabledRepo(base, w, 'b') });
  const toggler = otherWorkspaces.at(-1)!, t = await enabledRepo(base, toggler, 'b');
  await t.repo.enqueuePage('b', t.token, t.generation, refs('t', 0, 50), { at, key: 'note:t49' });
  let stop = false;const load: Promise<void>[] = [], errors: string[] = [];
  const background = (work: Promise<void>) => load.push(work.catch(error => { errors.push(String((error as { code?: string }).code ?? error)); }));
  for (const [k, o] of rounds.entries()) background((async () => { for (let i = 0; !stop; i++) {
    await repo(ops.enqueuePage.client, o.w).enqueuePage('b', o.token, o.generation, refs(`o${k}-${i}-`, 0, 50), { at, key: 'note:o' + i });
    await repo(ops.claim.client, o.w).claim('b', o.token, 20);
  } })());
  background((async () => { while (!stop) await toggleMessageAnalysis(repo(ops.updatePreferences.client, toggler), 'b'); })());
  const store = (executor: Parameters<Parameters<TransactionalPostgresClient['transaction']>[0]>[0]) => createPostgresLiveRecordStore({ client: executor });
  for (const w of [0, 1]) background((async () => { for (let i = 0; !stop; i++) await base.transaction(async executor => {
    await store(executor).listRecords({ workspaceId: writerWorkspace, collectionName: 'contacts', limit: 20 });
    await store(executor).upsertRecord({ workspaceId: writerWorkspace, collectionName: 'contacts', recordId: `w${w}-${i % 40}`, userId: 'c', sourceType: 'manual', sourceId: 'w', evidenceIds: [], lifecycleState: 'active', payload: { i }, createdAt: at, updatedAt: at });
  }).catch(error => { if (String((error as { code?: string }).code) !== '40001') throw error; }); })()); // the app writers' own conflicts are not under test
  return { async stop() { stop = true; await Promise.all(load); return { errors, failures: Object.fromEntries(Object.entries(ops).map(([k, o]) => [k, o.serializationFailures])) }; } };
}

type Contended = Awaited<ReturnType<typeof enabledRepo>> & { plain: ReturnType<typeof createDiscoveryRepository> };
async function contended(name: string, operation: (r: Contended, run: number) => Promise<unknown>) {
  const base = createTransactionalPostgresClient({ connectionString: url!, max: 14 }), target = observe(base);
  const workspaceId = 'qa:discovery-contention:' + randomUUID(), filler = 'qa:discovery-contention-filler:' + randomUUID();
  const otherWorkspaces = [0, 1, 2, 3].map(() => 'qa:discovery-contention-other:' + randomUUID()), writerWorkspace = 'qa:discovery-contention-writer:' + randomUUID();
  let load: Awaited<ReturnType<typeof unrelatedLoad>> | undefined;
  try {
    const r = await enabledRepo(target.client, workspaceId);
    await scatterJobs(base, workspaceId, filler, r, refs('n', 0, 50));
    load = await unrelatedLoad(base, otherWorkspaces, writerWorkspace);
    target.serializationFailures = 0; // count only the contended phase below
    const plain = createDiscoveryRepository({ client: base, workspaceId, now: () => at, budgetWorkspaceId: workspaceId }), outcomes: string[] = [];
    for (let run = 0; run < 5; run++) outcomes.push(await operation({ ...r, plain }, run).then(() => 'ok', error => String((error as { code?: string }).code ?? error)));
    const other = await load.stop();load = undefined;
    assert.deepEqual({ outcomes, target: target.serializationFailures, others: other.failures, errors: other.errors },
      { outcomes: ['ok', 'ok', 'ok', 'ok', 'ok'], target: 0, others: { enqueuePage: 0, claim: 0, updatePreferences: 0 }, errors: [] },
      `${name}: 40001/40P01 attempts by operation (target = this account's ${name}; others = unrelated accounts' discovery)`);
  } finally { await load?.stop(); await cleanup(base, [workspaceId, filler, writerWorkspace, ...otherWorkspaces]); await base.close(); }
}

test('other accounts writing orbit_records concurrently never abort enqueuePage with 40001', { skip: !url }, async () => {
  await contended('enqueuePage', r => r.repo.enqueuePage(r.actor, r.token, r.generation, refs('n', 0, 50), { at, key: 'note:n49' }));
});

const toggleMessageAnalysis = async (repo: ReturnType<typeof createDiscoveryRepository>, actor: string) => {
  const current = await repo.preferences(actor); // re-queues every queued/running job under a new generation and clears the lease
  await repo.updatePreferences(actor, { messageAnalysisEnabled: !current.messageAnalysisEnabled, expectedRevision: current.revision });
};

test('other accounts writing orbit_records concurrently never abort claim with 40001', { skip: !url }, async () => {
  await contended('claim', async (r, run) => {
    // A fresh page through an unobserved client gives claim new work while the earlier jobs stay leased.
    await r.plain.enqueuePage(r.actor, r.token, r.generation, refs(`c${run}-`, 0, 20), { at, key: `note:c${run}` });
    assert.equal((await r.repo.claim(r.actor, r.token, 20)).length, 20);
  });
});

test('other accounts writing orbit_records concurrently never abort a bulk updatePreferences with 40001', { skip: !url }, async () => {
  await contended('updatePreferences', r => toggleMessageAnalysis(r.repo, r.actor));
});

test('one job is handed out once when the same lease claims concurrently', { skip: !url }, async () => {
  const base = createTransactionalPostgresClient({ connectionString: url!, max: 6 }), workspaceId = 'qa:discovery-claim:' + randomUUID();
  try {
    const r = await enabledRepo(base, workspaceId);
    await r.repo.enqueuePage(r.actor, r.token, r.generation, refs('n', 0, 30), { at, key: 'note:n29' });
    const batches = await Promise.all([1, 2, 3].map(() => r.repo.claim(r.actor, r.token, 20)));
    const ids = batches.flat().map(j => j.id);
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30);
    assert.deepEqual(batches.map(b => b.length).sort((a, b) => a - b), [0, 10, 20]);
    assert.ok((await r.repo.jobs(r.actor)).every(j => j.state === 'running' && j.attempts === 1));
  } finally { await cleanup(base, [workspaceId]); await base.close(); }
});

test('updatePreferences racing enqueue and claim leaves every live job on the current generation', { skip: !url }, async () => {
  const base = createTransactionalPostgresClient({ connectionString: url!, max: 8 }), workspaces: string[] = [];
  try {
    for (let round = 0; round < 4; round++) {
      const workspaceId = 'qa:discovery-race:' + randomUUID();workspaces.push(workspaceId);
      const r = await enabledRepo(base, workspaceId);
      await r.repo.enqueuePage(r.actor, r.token, r.generation, refs('n', 0, 30), { at, key: 'note:n29' });
      const current = await r.repo.preferences(r.actor);
      const [enqueue, claim, toggle] = await Promise.allSettled([r.repo.enqueuePage(r.actor, r.token, r.generation, refs('n', 20, 60), { at, key: 'note:n59' }), r.repo.claim(r.actor, r.token, 20), r.repo.updatePreferences(r.actor, { messageAnalysisEnabled: true, expectedRevision: current.revision })]);
      assert.equal(toggle.status, 'fulfilled');assert.equal(claim.status, 'fulfilled');
      if (enqueue.status === 'rejected') assert.ok(enqueue.reason instanceof DiscoveryConflict, String(enqueue.reason));
      const prefs = await r.repo.preferences(r.actor), jobs = await r.repo.jobs(r.actor);
      assert.equal(prefs.generation, current.generation + 1);
      assert.equal(new Set(jobs.map(j => j.id)).size, jobs.length);
      assert.equal(jobs.length, enqueue.status === 'fulfilled' ? 60 : 30);
      assert.deepEqual(jobs.filter(j => (j.state === 'queued' || j.state === 'running') && j.generation !== prefs.generation).map(j => j.id), []);
      // The toggle released every lease it found, so nothing stays running from before it, and the cursor kept a page boundary.
      assert.ok(jobs.every(j => j.state !== 'running' || j.generation === prefs.generation));
      assert.ok(['note:n29', 'note:n59'].includes(String((await r.repo.state(r.actor)).cursor?.key)));
    }
  } finally { await cleanup(base, workspaces); await base.close(); }
});

test('concurrent enqueues equal sequential ones: no duplicates, no misses, claimed jobs and other accounts untouched', { skip: !url }, async () => {
  const base = createTransactionalPostgresClient({ connectionString: url!, max: 8 }), o = observe(base);
  const sequential = 'qa:discovery-seq:' + randomUUID(), concurrent = 'qa:discovery-conc:' + randomUUID(), other = 'qa:discovery-other:' + randomUUID();
  const normalize = (jobs: Awaited<ReturnType<ReturnType<typeof createDiscoveryRepository>['jobs']>>) => jobs.map(j => ({ id: j.id, key: j.source.key, state: j.state, generation: j.generation, attempts: j.attempts })).sort((a, b) => a.id.localeCompare(b.id));
  try {
    const s = await enabledRepo(o.client, sequential), c = await enabledRepo(o.client, concurrent), x = await enabledRepo(o.client, other);
    await x.repo.enqueuePage(x.actor, x.token, x.generation, refs('n', 0, 10), { at, key: 'note:n9' });
    const otherBefore = JSON.stringify(normalize(await x.repo.jobs(x.actor)));
    const p1 = refs('n', 0, 30), p2 = refs('n', 20, 50); // overlapping pages
    await s.repo.enqueuePage(s.actor, s.token, s.generation, p1, { at, key: 'note:n29' });
    await s.repo.enqueuePage(s.actor, s.token, s.generation, p2, { at, key: 'note:n49' });
    await Promise.all([c.repo.enqueuePage(c.actor, c.token, c.generation, p1, { at, key: 'note:n29' }), c.repo.enqueuePage(c.actor, c.token, c.generation, p2, { at, key: 'note:n49' }), c.repo.enqueuePage(c.actor, c.token, c.generation, p2, { at, key: 'note:n49' })]);
    const seqJobs = normalize(await s.repo.jobs(s.actor)), concJobs = normalize(await c.repo.jobs(c.actor));
    assert.equal(seqJobs.length, 50);
    assert.deepEqual(concJobs, seqJobs);
    assert.deepEqual(new Set(concJobs.map(j => j.key)), new Set(refs('n', 0, 50).map(r => r.key)));
    const rows = await base.query<{ n: string; ids: string }>(`select count(*)::text as n,count(distinct record_id)::text as ids from orbit_records where workspace_id=$1 and collection_name='notificationDiscoveryJobs'`, [concurrent]);
    assert.deepEqual(rows.rows[0], { n: '50', ids: '50' });
    // A job a worker already claimed is not reset by a concurrent re-scan of the same sources.
    const claimed = await c.repo.claim(c.actor, c.token, 5);
    await Promise.all([1, 2, 3].map(() => c.repo.enqueuePage(c.actor, c.token, c.generation, refs('n', 0, 50), { at, key: 'note:n49' })));
    const after = await c.repo.jobs(c.actor);
    assert.equal(after.length, 50);
    for (const job of claimed) assert.deepEqual({ state: after.find(j => j.id === job.id)?.state, attempts: after.find(j => j.id === job.id)?.attempts }, { state: 'running', attempts: 1 });
    assert.equal(JSON.stringify(normalize(await x.repo.jobs(x.actor))), otherBefore);
  } finally { await cleanup(base, [sequential, concurrent, other]); await base.close(); }
});

test('disabling discovery while a page is enqueued and claimed leaves no queued job behind', { skip: !url }, async () => {
  const base = createTransactionalPostgresClient({ connectionString: url!, max: 6 });
  const workspaces: string[] = [];
  try {
    for (let round = 0; round < 4; round++) {
      const workspaceId = 'qa:discovery-disable:' + randomUUID();workspaces.push(workspaceId);
      const r = await enabledRepo(base, workspaceId), current = await r.repo.preferences(r.actor);
      await r.repo.enqueuePage(r.actor, r.token, r.generation, refs('pre', 0, 20), { at, key: 'note:pre19' });
      const [enqueue, claim, disable] = await Promise.allSettled([r.repo.enqueuePage(r.actor, r.token, r.generation, refs('n', 0, 50), { at, key: 'note:n49' }), r.repo.claim(r.actor, r.token, 20), r.repo.updatePreferences(r.actor, { enabled: false, expectedRevision: current.revision })]);
      assert.equal(disable.status, 'fulfilled');assert.equal(claim.status, 'fulfilled');
      if (enqueue.status === 'rejected') assert.ok(enqueue.reason instanceof DiscoveryConflict, String(enqueue.reason));
      assert.deepEqual((await r.repo.jobs(r.actor)).filter(j => j.state === 'queued' || j.state === 'running'), []);
    }
  } finally { await cleanup(base, workspaces); await base.close(); }
});
