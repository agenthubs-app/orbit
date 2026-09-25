import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createMemoryLiveRecordStore,type LiveRecord} from '../../shared/storage/live-record-store';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {createStorageContactGraphProvider} from '../../features/contacts/storage/contact-live-record-provider';
import {createPostgresContactScopeRecordReader} from '../../features/contacts/storage/contact-scope-postgres-reader';
import {createPostgresContactCardReader} from '../../features/contacts/storage/contact-list-postgres-reader';
import {createStorageFollowupTaskProvider} from '../../features/followups/storage/followup-live-record-provider';
import {createRelationshipLifecycleFactsReader} from '../../features/followups/storage/relationship-lifecycle-facts-reader';
import {createPostgresRelationshipScopeReader} from '../../shared/storage/relationship-read-scope';
import {createStorageConnectionEvidenceProvider} from '../../features/connections/storage/connection-live-record-provider';
import {createStorageAppBootstrapProvider} from '../../features/bootstrap/storage/bootstrap-live-record-provider';
import {createStorageDashboardAggregateProvider} from '../../features/dashboard/storage/dashboard-live-record-provider';
import {createAssociationSummaryReader} from '../../features/personal-schedule/association-summary-reader';
import {createLiveContactDetailTagStatusService} from '../../features/contacts/live-detail-service';
import {contactDetailTagStatusServiceFactory} from '../../features/contacts/service-factory';
import {createContactDetailGetHandler,createContactDetailPatchHandler} from '../../app/api/contacts/[id]/handler';

const at='2026-09-25T00:00:00.000Z';
const base={workspaceId:'w',sourceType:'manual',sourceId:'fixture',evidenceIds:['e'],lifecycleState:'active' as const,createdAt:at,updatedAt:at};
const common={source:{type:'manual',id:'fixture'},evidenceIds:['e'],createdAt:at,updatedAt:at};
const fixtures:LiveRecord[]=[];
for(const [id,userId,accountId] of [
  ['alias',null,'a'],['conflict','b','a'],['reverse','a','b'],['array','a',['a']],['number','a',123],['linked','a','a'],
] as const){
  fixtures.push({...base,collectionName:'contacts',recordId:id,userId:'b',payload:{...common,id,displayName:id,stage:'active',notes:'foreign-private'}});
  fixtures.push({...base,collectionName:'connections',recordId:'r:'+id,userId,payload:{...common,id:'r:'+id,contactId:id,accountId,stage:'active',summary:'FOREIGN_RELATIONSHIP',valueTypes:[]}});
}
fixtures.push({...base,collectionName:'contacts',recordId:'own',userId:'a',payload:{...common,id:'own',displayName:'Mine',stage:'active'}});
fixtures.push({...base,collectionName:'contacts',recordId:'contact-conflict',userId:'a',payload:{...common,id:'contact-conflict',accountId:'b',displayName:'Denied',stage:'active'}});
fixtures.push({...base,collectionName:'connections',recordId:'foreign-on-own',userId:'b',payload:{...common,id:'foreign-on-own',contactId:'own',accountId:'a',stage:'active',summary:'FOREIGN_RELATIONSHIP',valueTypes:['strategic_fit']}});
fixtures.push({...base,collectionName:'tasks',recordId:'owned-task',userId:'a',payload:{...common,id:'owned-task',accountId:'a',title:'Mine',status:'open',contactId:'linked',connectionId:'r:linked'}});

test('contact fallback rejects alias-only and conflicting relationship ownership for reads and edits',async()=>{
  const store=createMemoryLiveRecordStore(fixtures),provider=createStorageContactGraphProvider({store,workspaceId:'w'});
  const graph=await provider.readContactGraph('a');
  assert.deepEqual(graph.contacts.map(c=>c.id),['own']);assert.equal(graph.connections.length,0);
  assert.ok(!JSON.stringify(graph).includes('FOREIGN_RELATIONSHIP'));
  assert.deepEqual((await createStorageAppBootstrapProvider({store,workspaceId:'w'}).readBootstrapGraphForAccount!('a')).contacts.map(c=>c.id),['own']);
  assert.deepEqual((await createStorageDashboardAggregateProvider({store,workspaceId:'w'}).readDashboardGraphForAccount!('a')).contacts.map(c=>c.id),['own']);
  assert.deepEqual((await createStorageFollowupTaskProvider({store,workspaceId:'w'}).readFollowupGraph('a')).contacts.map(c=>c.id),['own']);
  const connectionGraph=await createStorageConnectionEvidenceProvider({store,workspaceId:'w'}).readConnectionEvidenceGraphForAccount!('a');
  assert.deepEqual(connectionGraph.contacts,[]);
  for(const id of ['alias','conflict','reverse','array','number','linked','contact-conflict']){
    assert.equal((await provider.readContactGraphForContact!(id,'a')).contacts.length,0);
    await assert.rejects(Promise.resolve().then(()=>provider.updateContactPrimaryIndustry!(id,'a','finance_investment')),/outside the actor boundary/);
  }
});

test('contact HTTP detail and patch reject a foreign contact even with an owned relationship',async t=>{
  const store=createMemoryLiveRecordStore(fixtures);
  const service=createLiveContactDetailTagStatusService({provider:createStorageContactGraphProvider({store,workspaceId:'w'})});
  const resolution=contactDetailTagStatusServiceFactory.create('mock');
  t.mock.method(contactDetailTagStatusServiceFactory,'create',()=>({...resolution,service}));
  const before=await store.listRecords({workspaceId:'w',limit:'unbounded'});
  for(const id of ['linked','contact-conflict']){
    const context={params:Promise.resolve({id})};
    const response=await createContactDetailGetHandler(async()=>({id:'a'}))(new Request(`https://orbit.test/api/contacts/${id}`),context);
    assert.equal(response.status,404);
    assert.ok(!(await response.text()).includes('foreign-private'));
    const update=await createContactDetailPatchHandler(async()=>({id:'a'}))(new Request(`https://orbit.test/api/contacts/${id}`,{
      method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({note:'must not save',addTags:['denied'],primaryIndustryId:'finance_investment'}),
    }),context);
    assert.equal(update.status,404);
  }
  assert.deepEqual(await store.listRecords({workspaceId:'w',limit:'unbounded'}),before);
});

test('SQL contact cards, counts and focused scope enforce the same strict relationship ownership', {skip:!process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL},async()=>{
  const url=new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.search,'');
  const schema='contact_owner_'+randomUUID().replaceAll('-',''),pool=new Pool({connectionString:url.toString(),max:1,options:`-c search_path=${schema}`});
  try{
    await pool.query(`create schema ${schema}`);await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store=createPostgresLiveRecordStore({client:pool});for(const row of fixtures)await store.upsertRecord(row);
    const scope=createPostgresContactScopeRecordReader({client:pool,workspaceId:'w'});
    const provider=createStorageContactGraphProvider({store,workspaceId:'w',contactScopeRecordReader:scope});
    const cards=createPostgresContactCardReader({client:pool,workspaceId:'w',cursorSecret:'local-test-secret-'.repeat(3)});
    assert.deepEqual((await scope('a')).contactIds,['own']);assert.deepEqual((await scope('a')).connectionIds,[]);
    assert.deepEqual((await cards.page({},'a')).items.map(c=>c.id),['own']);
    assert.equal((await cards.summary({},'a')).total,1);
    assert.deepEqual((await cards.page({},'a')).items[0]!.valueTypes,[]);
    assert.deepEqual((await provider.readContactGraph('a')).contacts.map(c=>c.id),['own']);
    assert.deepEqual((await createStorageAppBootstrapProvider({store,sqlClient:pool,workspaceId:'w'}).readBootstrapGraphForAccount!('a')).contacts.map(c=>c.id),['own']);
    const dashboard=createStorageDashboardAggregateProvider({store,sqlClient:pool,workspaceId:'w'});
    assert.deepEqual((await dashboard.readDashboardGraphForAccount!('a')).contacts.map(c=>c.id),['own']);
    const summary=await dashboard.readDashboardSummaryForAccount!('a');
    assert.equal(summary.success,true);
    if(summary.success) assert.equal(summary.data.metrics.find(metric=>metric.id==='relationship-assets')?.value,1);
    assert.ok(!JSON.stringify(summary).includes('Denied'),'summary must not expose a conflicting contact title');
    assert.deepEqual((await createAssociationSummaryReader({client:pool,workspaceId:'w'})({actorId:'a',kind:'contact',limit:20})).candidates,[{id:'own',title:'Mine'}]);
    for(const purpose of ['followups','legacy-notifications'] as const){
      const scoped=await createPostgresRelationshipScopeReader({client:pool,workspaceId:'w',purpose})('a');
      assert.deepEqual(scoped.contacts.map(row=>row.recordId),['own']);
    }
    const facts=await createRelationshipLifecycleFactsReader({client:pool,workspaceId:'w'}).readRelationshipLifecycleFacts('a');
    assert.deepEqual(facts.contacts,[],'task and relationship references cannot bypass private contact ownership');
    for(const id of ['alias','conflict','reverse','array','number','linked','contact-conflict']){
      assert.equal((await provider.readContactGraphForContact!(id,'a')).contacts.length,0);
      await assert.rejects(Promise.resolve().then(()=>provider.updateContactPrimaryIndustry!(id,'a','finance_investment')),/outside the actor boundary/);
    }
  }finally{await pool.query(`drop schema if exists ${schema} cascade`);await pool.end();}
});
