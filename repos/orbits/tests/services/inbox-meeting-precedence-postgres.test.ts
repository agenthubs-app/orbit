import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createTransactionalPostgresClient} from '../../shared/storage/transactional-postgres';
import {resolveLiveDatabaseConnectionConfig} from '../../shared/storage/live-database-config';
import {createPostgresLiveRecordStore} from '../../shared/storage/postgres-live-record-store';
import {createInboxRuntime} from '../../features/notifications/inbox-record-service-factory';
import {createEventOperationsPostgresClient} from '../../features/events/event-operations/storage/postgres-client';
import {createPostgresAppointmentRepository} from '../../features/appointments/postgres-repository';
import {createAppointmentService} from '../../features/appointments/service';
import {createReminderPlanService} from '../../features/notifications/reminder-plan-service';
import {createReminderPlanRepository} from '../../features/notifications/reminder-plan-repository';
import {Pool} from 'pg';
import {ORBIT_RECORDS_SCHEMA_SQL} from '../../shared/storage/migrations';
import {runAppointmentMigrations} from '../../features/appointments/storage/migrations';
const config=resolveLiveDatabaseConnectionConfig();
test('a later explicit schedule reminder invalidates the automatic meeting reminder',{skip:!config},async()=>{
 assert.ok(config);const workspaceId='workspace:qa:precedence:'+randomUUID(),at='2026-09-16T02:00:00.000Z';
 // Private schema with the tables this test needs: it no longer depends on the target database
 // already carrying appointment migrations (0137 full-suite profile).
 const schema='inbox_precedence_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:config.connectionString,max:1});
 await admin.query(`create schema ${schema}`);
 const isolated=new URL(config.connectionString);isolated.searchParams.set('options',`-c search_path=${schema}`);
 const client=createTransactionalPostgresClient({connectionString:isolated.toString()}),eventClient=createEventOperationsPostgresClient({connectionString:isolated.toString()});
 const store=createPostgresLiveRecordStore({client}),runtime=createInboxRuntime({client,workspaceId,now:()=>at});
 try{
 await client.query(ORBIT_RECORDS_SCHEMA_SQL);await runAppointmentMigrations(eventClient);
 const service=createAppointmentService({repository:createPostgresAppointmentRepository({client:eventClient,workspaceId}),now:()=>at,authorityVerifier:{resolveAcceptedBilateralContact:async()=>({authorityRequestId:'r',counterpartyActorId:'b',relationshipPairId:'p',contactIdsByActor:{a:'ca',b:'cb'}})}});
 const a=(await service.createDraft({actorId:'a',authorityReference:'r',idempotencyKey:'create'})).appointment;
 const n=await runtime.service.upsert({actorId:'a',semanticKey:'meeting:'+a.appointmentId,kind:'reminder',origin:'automation',title:'约谈将开始',reason:'已确认时间',scheduledFor:at,occurredAt:at,sources:[{sourceKind:'appointment',sourceId:a.appointmentId,sourceRevision:String(a.version),occurredAt:at,readAt:at}],target:{kind:'appointment',id:a.appointmentId,href:'/schedule/meetings/m',status:'available'},actions:['read','dismiss']});
 assert.equal((await runtime.service.get('a',n.id)).target.status,'available');
 await store.upsertRecord({workspaceId,collectionName:'personal_schedule_items',recordId:'arbitrary-personal-id',userId:'a',sourceType:'manual',sourceId:a.appointmentId,evidenceIds:[],lifecycleState:'active',createdAt:at,updatedAt:at,occurredAt:at,payload:{id:'arbitrary-personal-id',meetingId:a.appointmentId,state:'upcoming',updatedAt:at}});
 await createReminderPlanService({repository:createReminderPlanRepository({store,workspaceId}),now:()=>at}).create({actorId:'a',targetType:'schedule_item',targetId:'arbitrary-personal-id',fireAt:'2026-09-16T03:00:00Z',timeZone:'Asia/Tokyo',channels:['in_app'],title:'用户选择',body:'按用户时间',deepLink:'/schedule/personal/arbitrary-personal-id',createdBy:'user',idempotencyKey:'explicit'});
 assert.equal((await runtime.service.get('a',n.id)).target.status,'unavailable');assert.equal((await runtime.service.list('a',{})).unreadCount,0);
 }finally{await client.close();await eventClient.close();await admin.query(`drop schema if exists ${schema} cascade`);await admin.end();}
});
