import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {NotificationRecordCard,notificationDayGroup} from '../../app/(app)/app/inbox/typed-notifications-tab';
import {notificationInboxView,notificationDetailView} from '../../app/(app)/app/inbox/notification-inbox-view-model';
const at='2026-09-16T02:00:00Z';
const row={id:'n',actorId:'a',revision:1,kind:'reminder',origin:'user',semanticKey:'s',title:'发送报价资料',reason:'会议中答应发送',sources:[{sourceKind:'note',sourceId:'note',sourceRevision:'1',occurredAt:at,readAt:at,excerpt:'原文承诺'}],target:{kind:'source',id:'note',href:'/notes/note',status:'available'},actions:['read'],occurredAt:at,updatedAt:at,readAt:null,disposition:'open'};
test('kinds get distinct tiles and readable source-only reminders do not invent task destinations',()=>{
 const n=notificationInboxView({enabled:true,items:[row],unreadCount:1,nextCursor:null,asOf:at},'a').items[0]!;
 const render=(item:typeof n)=>renderToStaticMarkup(<NotificationRecordCard notification={item} now={at} onSelect={()=>{}}/>);
 const tiles=(['reminder','suggestion','update'] as const).map(kind=>/<span[^>]*>(\S+)<\/span>/u.exec(render({...n,kind}))![1]);assert.equal(new Set(tiles).size,3);
 const html=render(n);for(const text of ['发送报价资料','会议中答应发送','原文承诺'])assert.ok(html.includes(text));assert.doesNotMatch(html,/\/tasks\//);
 assert.throws(()=>notificationInboxView({enabled:true,items:[row],unreadCount:1,nextCursor:null,asOf:at},'other'));
});
test('b5 #6 day groups: 今日 / 昨日 / 今週 (Monday start) / それ以前 in the reader zone',()=>{
 // 2026-09-16 is a Wednesday in Tokyo.
 const now='2026-09-16T02:00:00Z',zone='Asia/Tokyo';
 assert.equal(notificationDayGroup('2026-09-15T23:00:00Z',now,zone),'today');
 assert.equal(notificationDayGroup('2026-09-15T01:00:00Z',now,zone),'yesterday');
 assert.equal(notificationDayGroup('2026-09-14T01:00:00Z',now,zone),'week');
 assert.equal(notificationDayGroup('2026-09-13T01:00:00Z',now,zone),'earlier');
});
test('D-16 mail summaries stay hidden in the list and direct detail reader',()=>{
 const mail={...row,id:'mail',sources:[{...row.sources[0],sourceKind:'mail_summary'}]};
 const mixed={...row,id:'mixed',sources:[row.sources[0],{...row.sources[0],sourceKind:'mail_summary'}]};
 assert.deepEqual(notificationInboxView({enabled:true,items:[row,mail,mixed],unreadCount:3,nextCursor:null,asOf:at},'a').items.map(item=>item.id),['n']);
 assert.throws(()=>notificationDetailView(mail,'a','mail'));
 assert.throws(()=>notificationDetailView(mixed,'a','mixed'));
});
test('a foreign actor in an unreadable raw row rejects the whole page before tolerant parsing',()=>{
 const future={...row,id:'future',actorId:'other',sources:[{...row.sources[0],sourceKind:'future_source'}]};
 assert.throws(()=>notificationInboxView({enabled:true,items:[row,future],unreadCount:2,nextCursor:null,asOf:at},'a'),/owner mismatch/i);
 const ownFuture={...future,actorId:'a'};
 assert.deepEqual(notificationInboxView({enabled:true,items:[row,ownFuture],unreadCount:2,nextCursor:null,asOf:at},'a').items.map(item=>item.id),['n']);
});
