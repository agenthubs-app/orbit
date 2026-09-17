import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {NotificationCategoryIcon,NotificationRecordCard} from '../../app/(app)/app/inbox/typed-notifications-tab';
import {notificationInboxView} from '../../app/(app)/app/inbox/notification-inbox-view-model';
const at='2026-09-16T02:00:00Z';
const row={id:'n',actorId:'a',revision:1,kind:'reminder',origin:'user',semanticKey:'s',title:'发送报价资料',reason:'会议中答应发送',sources:[{sourceKind:'note',sourceId:'note',sourceRevision:'1',occurredAt:at,readAt:at,excerpt:'原文承诺'}],target:{kind:'source',id:'note',href:'/notes/note',status:'available'},actions:['read'],occurredAt:at,updatedAt:at,readAt:null,disposition:'open'};
test('category icons differ and readable source-only reminders do not invent task destinations',()=>{
 const variants=['reminder','suggestion','update'].map(kind=>renderToStaticMarkup(<NotificationCategoryIcon kind={kind as any}/>));assert.equal(new Set(variants).size,3);
 const n=notificationInboxView({enabled:true,items:[row],unreadCount:1,nextCursor:null,asOf:at},'a').items[0]!;
 const html=renderToStaticMarkup(<NotificationRecordCard notification={n} onOpen={()=>{}}/>);for(const text of ['提醒','发送报价资料','会议中答应发送'])assert.ok(html.includes(text));assert.doesNotMatch(html,/\/tasks\//);
 assert.throws(()=>notificationInboxView({enabled:true,items:[row],unreadCount:1,nextCursor:null,asOf:at},'other'));
});
