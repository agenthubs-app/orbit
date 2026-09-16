import assert from 'node:assert/strict';
import test from 'node:test';
import { createInboxRecordService, InboxRecordError } from '../../features/notifications/inbox-record-service';
import type { InboxStoredRecord, InboxRecordRepository } from '../../features/notifications/storage/inbox-record-repository';

const now = '2026-09-16T02:00:00.000Z';
function fixture() {
  const rows = new Map<string, InboxStoredRecord>(); let tail = Promise.resolve();
  const repository: InboxRecordRepository = {
    async transaction(actorId, operation) {
      const previous = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; }); await previous;
      const copy = structuredClone(rows);
      try {
        const result = await operation({ get: async id => structuredClone(copy.get(actorId + id) ?? null), save: async row => { copy.set(actorId + row.notification.id, structuredClone(row)); }, executor: undefined });
        rows.clear(); for (const [key, row] of copy) rows.set(key, row); return result;
      } finally { release(); }
    },
    async page(query) {
      return [...rows.values()].map(row => row.notification).filter(n => n.actorId === query.actorId && n.occurredAt <= query.asOf && (!query.kind || n.kind === query.kind) && (!query.before || n.occurredAt < query.before.at || (n.occurredAt === query.before.at && n.id < query.before.id))).sort((a,b)=> b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id)).slice(0,query.limit);
    },
  };
  let accessible = true, sourceRevision = '1', accepted = 0, snoozed = 0;
  const service = createInboxRecordService({ repository, now: () => now,
    sourceAccess: async (_actor, source) => !accessible ? 'unavailable' : source.sourceRevision !== sourceRevision ? 'changed' : 'available',
    effects: { accept: async () => { accepted++; return 'task:one'; }, snooze: async () => { snoozed++; } },
  });
  const input = { actorId:'a', semanticKey:'quote:sato', kind:'reminder' as const, origin:'user' as const, title:'发送报价资料', reason:'你设置了今天的提醒', object:{ id:'sato', name:'佐藤健一' }, occurredAt:now, dueAt:'2026-09-17T02:00:00.000Z', scheduledFor:now,
    sources:[{ sourceKind:'task' as const, sourceId:'task:source', sourceRevision:'1', occurredAt:now, readAt:now, excerpt:'报价资料' }], target:{ kind:'task' as const, id:'task:source', href:'/tasks/task%3Asource', status:'available' as const }, actions:['read','dismiss','handle','snooze'] as const };
  return {service,input, rows, setAccess:()=>{accessible=false;}, changeSource:()=>{sourceRevision='2';}, accepted:()=>accepted,snoozed:()=>snoozed};
}

test('read and disposition are independent, duplicates retain identity and user decisions', async () => {
  const f=fixture(); const created=await f.service.upsert(f.input);
  const read=await f.service.action('a',created.id,{ action:'read',expectedRevision:1,idempotencyKey:'r1' });
  assert.equal(read.notification.disposition,'open'); assert.equal(read.notification.readAt,now);
  const handled=await f.service.action('a',created.id,{ action:'handle',expectedRevision:2,idempotencyKey:'h1' });
  assert.equal(handled.notification.disposition,'handled');
  assert.equal((await f.service.upsert(f.input)).disposition,'handled');
  assert.equal((await f.service.list('a',{})).unreadCount,0);
  await assert.rejects(f.service.get('b',created.id), (e:unknown)=>e instanceof InboxRecordError && e.code==='NOT_FOUND');
});

test('source permission is checked before serialization and before replaying action receipts', async () => {
  const f=fixture();const record=await f.service.upsert(f.input);
  await f.service.action('a',record.id,{action:'read',expectedRevision:1,idempotencyKey:'read'});f.setAccess();
  const removed=await f.service.get('a',record.id);
  assert.equal(removed.target.status,'unavailable'); assert.equal(removed.sources[0]?.excerpt,undefined); assert.equal(removed.title.includes('报价'),false); assert.equal(removed.object,undefined);assert.equal(removed.actions.length,0);
  await assert.rejects(f.service.action('a',record.id,{action:'read',expectedRevision:1,idempotencyKey:'read'}),/unavailable/i);
  assert.equal((await f.service.list('a',{})).unreadCount,0);
});

test('simultaneous actions serialize revisions and same key cannot mean a different action', async () => {
  const f=fixture(), n=await f.service.upsert(f.input);
  const results=await Promise.allSettled(['dismiss','handle'].map(action=>f.service.action('a',n.id,{action:action as 'dismiss'|'handle',expectedRevision:1,idempotencyKey:action})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  await assert.rejects(f.service.action('a',n.id,{action:'read',expectedRevision:1,idempotencyKey:'dismiss'}),/conflict/i);
});

test('accept and snooze are durable idempotent actions with source and revision checks', async () => {
  const f=fixture();const n=await f.service.upsert({...f.input,kind:'suggestion',origin:'automation',actions:['read','accept','dismiss'],expiresAt:'2026-09-18T00:00:00.000Z'});
  const request={action:'accept' as const,expectedRevision:1,idempotencyKey:'accept'};
  assert.equal((await f.service.action('a',n.id,request)).createdTaskId,'task:one');
  assert.equal((await f.service.action('a',n.id,request)).createdTaskId,'task:one');assert.equal(f.accepted(),1);
  const reminder=await f.service.upsert({...f.input,semanticKey:'other'});
  const snooze={action:'snooze' as const,expectedRevision:1,idempotencyKey:'later',scheduledFor:'2026-09-16T04:00:00.000Z'};
  await f.service.action('a',reminder.id,snooze);await f.service.action('a',reminder.id,snooze);assert.equal(f.snoozed(),1);
  f.changeSource();await assert.rejects(f.service.action('a',reminder.id,{...snooze,idempotencyKey:'new',expectedRevision:2}),/changed|conflict/i);
});

test('stable actor-bound cursor and explicit read snapshot do not consume newly arriving items', async () => {
  const f=fixture(); const first=await f.service.upsert({...f.input,semanticKey:'1'});await f.service.upsert({...f.input,semanticKey:'2'});
  const page=await f.service.list('a',{limit:1});assert.ok(page.nextCursor);
  const next=await f.service.list('a',{limit:1,cursor:page.nextCursor});assert.notEqual(page.items[0]?.id,next.items[0]?.id);
  await assert.rejects(f.service.list('b',{cursor:page.nextCursor}),/cursor/i);
  await f.service.readBatch('a',{items:[{id:first.id,expectedRevision:1}],idempotencyKey:'batch'});
  assert.equal((await f.service.list('a',{})).unreadCount,1);
});

test('an expired suggestion is history while an old unresolved reminder remains visible', async () => {
  const f=fixture();await f.service.upsert({...f.input,semanticKey:'expired',kind:'suggestion',expiresAt:'2026-09-15T00:00:00Z'});
  const old=await f.service.upsert({...f.input,semanticKey:'old',occurredAt:'2026-01-01T00:00:00Z'});
  const list=await f.service.list('a',{});assert.deepEqual(list.items.map(n=>n.id),[old.id]);assert.equal(list.unreadCount,1);
  assert.equal((await f.service.list('a',{history:true})).items.length,2);
});

test('category and history filters never change the global unread badge', async () => {
  const f=fixture();await f.service.upsert(f.input);
  await f.service.upsert({...f.input,semanticKey:'update',kind:'update'});
  await f.service.upsert({...f.input,semanticKey:'old-update',kind:'update',occurredAt:'2026-01-01T00:00:00Z'});
  const filtered=await f.service.list('a',{kind:'reminder'});
  assert.equal(filtered.items.length,1);assert.equal(filtered.unreadCount,2);
  assert.equal((await f.service.list('a',{history:true})).unreadCount,2);
});
test('snooze validates the instant across offsets, not the calendar spelling',async()=>{
 const f=fixture(),n=await f.service.upsert(f.input);
 const result=await f.service.action('a',n.id,{action:'snooze',expectedRevision:1,idempotencyKey:'offset',scheduledFor:'2026-09-15T23:00:00-05:00'});
 assert.equal(Date.parse(result.notification.scheduledFor!),Date.parse('2026-09-16T04:00:00Z'));
});
test('wording corrections preserve reading, disposition and the original semantic identity',async()=>{
 const f=fixture(),n=await f.service.upsert(f.input);await f.service.action('a',n.id,{action:'read',expectedRevision:1,idempotencyKey:'read'});
 const updated=await f.service.upsert({...f.input,reason:'修正为清晰的来源说明'});assert.equal(updated.id,n.id);assert.equal(updated.reason,'修正为清晰的来源说明');assert.equal(updated.readAt,now);assert.equal(updated.disposition,'open');
});
test('a future scheduled reminder waits before appearing in the active inbox or unread badge',async()=>{const f=fixture();await f.service.upsert({...f.input,scheduledFor:'2026-09-17T00:00:00.000Z'});const active=await f.service.list('a',{});assert.equal(active.items.length,0);assert.equal(active.unreadCount,0);assert.equal((await f.service.list('a',{history:true})).items.length,1);});
