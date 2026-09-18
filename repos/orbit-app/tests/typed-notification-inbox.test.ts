import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';
import {createRequire} from 'node:module';
const {renderToHtml}=createRequire(import.meta.url)('./helpers/render.tsx') as {renderToHtml:(element:React.ReactElement)=>string};
import {NotificationInboxList} from '../src/screens/inbox/NotificationInboxList';
import {notificationInboxData} from '../src/api/inbox-notifications';
const at='2026-09-16T02:00:00.000Z';
const rows=['reminder','suggestion','update'].map((kind,i)=>({id:'n'+i,actorId:'a',revision:1,kind,origin:'user',semanticKey:'s'+i,title:['发送报价资料','准备约谈问题','佐藤健一确认了约谈'][i],reason:'来自已保存的记录',sources:[{sourceKind:'note',sourceId:'note',sourceRevision:'1',occurredAt:at,readAt:at,excerpt:'保持原文'}],target:{kind:'source',id:'note',href:'/notes/note',status:'available'},actions:['read'],occurredAt:at,updatedAt:at,readAt:null,disposition:'open'}));
test('typed notification rows render category text and source without inferring category from destination',()=>{
 const data=notificationInboxData({enabled:true,items:rows,unreadCount:3,nextCursor:null,asOf:at},'a');assert.ok(data);
 const html=renderToHtml(React.createElement(NotificationInboxList,{data,onOpen:()=>{},onRefresh:()=>{},onMore:()=>{},onFilter:()=>{},filter:'all',busy:false,error:''}));
 for(const text of ['提醒','建议','动态','发送报价资料','保持原文'])assert.ok(html.includes(text),text);
 assert.equal(notificationInboxData({...data,items:[{...rows[0],actorId:'b'}]},'a'),null);
});
test('missing type, unavailable destination, and literal source-only reminders remain explicit',()=>{
 assert.equal(notificationInboxData({enabled:true,items:[{...rows[0],kind:'unknown'}],unreadCount:1,nextCursor:null,asOf:at},'a'),null);
 const data=notificationInboxData({enabled:true,items:[{...rows[0],target:{kind:'source',id:'note',href:null,status:'unavailable'},actions:[]}],unreadCount:0,nextCursor:null,asOf:at},'a');assert.ok(data);assert.equal(data.items[0]?.target.href,null);
});
test('a source-only reminder labels its scheduled time separately from occurrence',()=>{
 const data=notificationInboxData({enabled:true,items:[{...rows[0],scheduledFor:'2026-09-18T02:00:00.000Z'}],unreadCount:1,nextCursor:null,asOf:at},'a');assert.ok(data);
 const html=renderToHtml(React.createElement(NotificationInboxList,{data,onOpen:()=>{},onRefresh:()=>{},onMore:()=>{},onFilter:()=>{},filter:'all',busy:false,error:''}));
 assert.ok(html.includes('提醒时间'));assert.ok(html.includes('2026/9/18'));
});
