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

// Sprint 0122 (Codex 104-B): the server's unreadCount is a global total over
// active, available notifications. Whether a skipped item contributed to it
// cannot be read from readAt alone (dismissed, scheduled or unavailable rows do
// not), and the client only sees one page. The App keeps the server total as is,
// the same on every page, including types this build cannot show.
test('the unread count stays the server total: a skipped dismissed, scheduled or unavailable row is never subtracted',()=>{
 const future='2099-01-01T00:00:00.000Z';
 for(const [label,skipped] of [
  ['dismissed',{...futureKind,disposition:'dismissed'}],
  ['scheduled',{...futureKind,scheduledFor:future}],
  ['unavailable',{...futureSource,target:{...futureSource.target,status:'unavailable'}}],
 ] as const){
  const data=notificationInboxData({enabled:true,items:[row('n1','发送报价资料'),skipped],unreadCount:1,nextCursor:null,asOf:at},'a');
  assert.deepEqual(data?.items.map(item=>item.id),['n1'],label+': the known unread item is kept');
  assert.equal(data?.unreadCount,1,label+': one known unread item, server total 1');
 }
});
test('every page of one inbox reports the same global unread total, whatever it skips',()=>{
 const first=notificationInboxData({enabled:true,items:[row('n1','发送报价资料'),futureKind],unreadCount:3,nextCursor:'p2',asOf:at},'a');
 const second=notificationInboxData({enabled:true,items:[futureSource,malformed,row('n2','准备约谈问题')],unreadCount:3,nextCursor:null,asOf:at},'a');
 assert.equal(first?.unreadCount,3);assert.equal(second?.unreadCount,3);
 assert.deepEqual(second?.items.map(item=>item.id),['n2']);
});

test('a foreign-account item or an invalid envelope still rejects the whole response',()=>{
 assert.equal(notificationInboxData({enabled:true,items:[row('n1','发送报价资料'),{...futureSource,actorId:'b'}],unreadCount:2,nextCursor:null,asOf:at},'a'),null);
 assert.equal(notificationInboxData({enabled:true,items:'nope',unreadCount:0,nextCursor:null,asOf:at},'a'),null);
 assert.equal(notificationInboxData({items:[],unreadCount:0,nextCursor:null,asOf:at},'a'),null);
});

// Sprint 0129: business-card exchange notifications (source kind
// event_contact_request) render and open the live page's person sheet or the
// new contact; a build that predates the kind skips them as above.
test('an exchange notification renders and carries the live-page or contact link',()=>{
 const exchange=(id:string,title:string,href:string,transition:string)=>({...row(id,title),kind:'update',origin:'business',sources:[{sourceKind:'event_contact_request',sourceId:'event-contact-request:1',sourceRevision:'1:'+transition,objectId:'event_1',occurredAt:at,readAt:at}],target:{kind:'event',id:'event_1',href,status:'available'},actions:['read','dismiss','handle']});
 const data=notificationInboxData({enabled:true,items:[
  exchange('x1','Avery Lin 想和你交换名片','/events/event_1/live?participant=p_avery','created'),
  exchange('x2','佐藤 葵 接受了你的名片交换','/contacts/contact%3Aevent-consent%3A1?eventId=event_1','accepted'),
 ],unreadCount:2,nextCursor:null,asOf:at},'a');
 assert.deepEqual(data?.items.map(item=>[item.id,item.target.href]),[['x1','/events/event_1/live?participant=p_avery'],['x2','/contacts/contact%3Aevent-consent%3A1?eventId=event_1']]);
 const html=renderToHtml(React.createElement(NotificationInboxList,{data:data!,onOpen:()=>{},onRefresh:()=>{},onMore:()=>{},onFilter:()=>{},filter:'all',busy:false,error:''}));
 assert.ok(html.includes('Avery Lin 想和你交换名片'));assert.ok(html.includes('佐藤 葵 接受了你的名片交换'));
});
