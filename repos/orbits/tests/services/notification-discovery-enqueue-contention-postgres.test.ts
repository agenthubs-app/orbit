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
// the table by another account could abort it with 40001.
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

test('other accounts writing orbit_records concurrently never abort enqueuePage with 40001', { skip: !url }, async () => {
  const base = createTransactionalPostgresClient({ connectionString: url!, max: 12 }), target = observe(base), others = observe(base);
  const workspaceId = 'qa:discovery-contention:' + randomUUID(), filler = 'qa:discovery-contention-filler:' + randomUUID();
  const otherWorkspaces = [0, 1, 2].map(() => 'qa:discovery-contention-other:' + randomUUID()), writerWorkspace = 'qa:discovery-contention-writer:' + randomUUID();
  let stop = false;const load: Promise<void>[] = [], loadErrors: string[] = [];
  const background = (work: Promise<void>) => load.push(work.catch(error => { loadErrors.push(String((error as { code?: string }).code ?? error)); }));
  try {
    const r = await enabledRepo(target.client, workspaceId), page = refs('n', 0, 50);
    await scatterJobs(base, workspaceId, filler, r, page);
    const otherRepos = [];for (const w of otherWorkspaces) otherRepos.push(await enabledRepo(others.client, w, 'b'));
    target.serializationFailures = 0;others.serializationFailures = 0; // count only the contended phase below
    // Other accounts: their own discovery rounds re-enqueue pages, and an ordinary serializable app writer
    // keeps saving records, all in the same table.
    for (const [k, o2] of otherRepos.entries()) background((async () => { for (let i = 0; !stop; i++) await o2.repo.enqueuePage(o2.actor, o2.token, o2.generation, refs('o' + k + '-', 0, 50), { at, key: 'note:o' + i }); })());
    const store = (executor: Parameters<Parameters<TransactionalPostgresClient['transaction']>[0]>[0]) => createPostgresLiveRecordStore({ client: executor });
    background((async () => { for (let i = 0; !stop; i++) await base.transaction(async executor => {
      await store(executor).listRecords({ workspaceId: writerWorkspace, collectionName: 'contacts', limit: 20 });
      await store(executor).upsertRecord({ workspaceId: writerWorkspace, collectionName: 'contacts', recordId: 'w' + (i % 40), userId: 'c', sourceType: 'manual', sourceId: 'w', evidenceIds: [], lifecycleState: 'active', payload: { i }, createdAt: at, updatedAt: at });
    }).catch(error => { if (String((error as { code?: string }).code) !== '40001') throw error; }); })());
    const outcomes: PromiseSettledResult<void>[] = [];
    for (let run = 0; run < 5; run++) outcomes.push(...await Promise.allSettled([r.repo.enqueuePage(r.actor, r.token, r.generation, page, { at, key: 'note:n49' })]));
    stop = true;
    await Promise.all(load);
    assert.deepEqual(outcomes.map(x => x.status === 'rejected' ? String((x.reason as { code?: string }).code ?? x.reason) : 'ok'), ['ok', 'ok', 'ok', 'ok', 'ok']);
    assert.equal(target.serializationFailures, 0, 'target account enqueue attempts aborted by unrelated writers');
    assert.equal(others.serializationFailures, 0, 'other accounts enqueue attempts aborted by unrelated writers');
    assert.deepEqual(loadErrors, [], 'other accounts discovery rounds failed');
    assert.equal((await r.repo.jobs(r.actor)).length, 50);
  } finally { stop = true; await Promise.allSettled(load); await cleanup(base, [workspaceId, filler, writerWorkspace, ...otherWorkspaces]); await base.close(); }
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

test('disabling discovery while a page is enqueued leaves no queued job behind', { skip: !url }, async () => {
  const base = createTransactionalPostgresClient({ connectionString: url!, max: 6 });
  const workspaces: string[] = [];
  try {
    for (let round = 0; round < 4; round++) {
      const workspaceId = 'qa:discovery-disable:' + randomUUID();workspaces.push(workspaceId);
      const r = await enabledRepo(base, workspaceId), current = await r.repo.preferences(r.actor);
      const [enqueue, disable] = await Promise.allSettled([r.repo.enqueuePage(r.actor, r.token, r.generation, refs('n', 0, 50), { at, key: 'note:n49' }), r.repo.updatePreferences(r.actor, { enabled: false, expectedRevision: current.revision })]);
      assert.equal(disable.status, 'fulfilled');
      if (enqueue.status === 'rejected') assert.ok(enqueue.reason instanceof DiscoveryConflict, String(enqueue.reason));
      assert.deepEqual((await r.repo.jobs(r.actor)).filter(j => j.state === 'queued' || j.state === 'running'), []);
    }
  } finally { await cleanup(base, workspaces); await base.close(); }
});
