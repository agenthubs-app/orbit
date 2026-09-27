import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';
import {createRequire} from 'node:module';
const {renderToHtml}=createRequire(import.meta.url)('./helpers/render.tsx') as {renderToHtml:(element:React.ReactElement)=>string};
import {NotificationInboxList} from '../src/screens/inbox/NotificationInboxList';
import {notificationInboxData} from '../src/api/inbox-notifications';

// Sprint 0104: an App build must keep its inbox usable when the server starts
// sending a notification type it does not know yet (0100: read_cost_alert).
const at='2026-09-27T02:00:00.000Z';
const row=(id:string,title:string,readAt:string|null=null)=>({id,actorId:'a',revision:1,kind:'reminder',origin:'user',semanticKey:'s-'+id,title,reason:'来自已保存的记录',sources:[{sourceKind:'note',sourceId:'note-'+id,sourceRevision:'1',occurredAt:at,readAt:at}],target:{kind:'source',id:'note-'+id,href:'/notes/note-'+id,status:'available'},actions:['read'],occurredAt:at,updatedAt:at,readAt,disposition:'open'});
const futureSource={...row('future','未来来源类型'),sources:[{sourceKind:'future_source_kind',sourceId:'x',sourceRevision:'1',occurredAt:at,readAt:at}]};
const futureKind={...row('kind','未来通知分类'),kind:'digest'};
const malformed={id:'broken',actorId:'a',readAt:null};

test('an unknown source kind, an unknown notification kind and a malformed item are skipped; the rest render',()=>{
 const data=notificationInboxData({enabled:true,items:[row('n1','发送报价资料'),futureSource,futureKind,malformed,row('n2','准备约谈问题',at)],unreadCount:4,nextCursor:'next',asOf:at},'a');
 assert.ok(data,'the page must not fail as a whole');
 assert.deepEqual(data.items.map(item=>item.id),['n1','n2']);
 assert.equal(data.nextCursor,'next','paging continues past skipped items');
 const html=renderToHtml(React.createElement(NotificationInboxList,{data,onOpen:()=>{},onRefresh:()=>{},onMore:()=>{},onFilter:()=>{},filter:'all',busy:false,error:''}));
 assert.ok(html.includes('发送报价资料'));assert.ok(html.includes('准备约谈问题'));
 assert.ok(!html.includes('未来来源类型'));assert.ok(!html.includes('未来通知分类'));
});

test('the unread count excludes skipped unread items so it matches what the list can clear',()=>{
 const data=notificationInboxData({enabled:true,items:[row('n1','发送报价资料'),futureSource,futureKind,malformed,row('n2','准备约谈问题',at)],unreadCount:4,nextCursor:null,asOf:at},'a');
 assert.equal(data?.unreadCount,1,'4 unread from the server minus 3 skipped unread items');
 const readSkipped=notificationInboxData({enabled:true,items:[row('n1','发送报价资料'),{...futureSource,readAt:at}],unreadCount:1,nextCursor:null,asOf:at},'a');
 assert.equal(readSkipped?.unreadCount,1,'a skipped item that was already read does not change the count');
});

test('a foreign-account item or an invalid envelope still rejects the whole response',()=>{
 assert.equal(notificationInboxData({enabled:true,items:[row('n1','发送报价资料'),{...futureSource,actorId:'b'}],unreadCount:2,nextCursor:null,asOf:at},'a'),null);
 assert.equal(notificationInboxData({enabled:true,items:'nope',unreadCount:0,nextCursor:null,asOf:at},'a'),null);
 assert.equal(notificationInboxData({items:[],unreadCount:0,nextCursor:null,asOf:at},'a'),null);
});
