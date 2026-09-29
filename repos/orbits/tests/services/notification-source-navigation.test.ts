import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationWebSourceHref,verifiedSourceNote} from '../../app/(app)/app/inbox/notification-source-view-model';
import type {InboxNotificationDTO} from '../../shared/contract/inbox-notifications';
const n={revision:1,kind:'reminder',origin:'automation',semanticKey:'s',title:'Title',reason:'Reason',actions:[],occurredAt:'2026-09-16T00:00:00Z',updatedAt:'2026-09-16T00:00:00Z',readAt:null,disposition:'open',id:'inbox:one',actorId:'a',target:{status:'available',href:'/notes/n',kind:'source',id:'n'},sources:[{sourceKind:'note',sourceId:'n',sourceRevision:'2',objectId:'discovery',occurredAt:'2026-09-16T00:00:00Z',readAt:'2026-09-16T00:00:00Z'}]} as InboxNotificationDTO;
test('discovery sources use an authenticated Web destination; native routes are not blindly prefixed',()=>{assert.equal(notificationWebSourceHref(n),'/app/inbox/sources/inbox%3Aone');assert.equal(notificationWebSourceHref({...n,target:{...n.target,status:'unavailable'}}),null);assert.equal(notificationWebSourceHref({...n,sources:[],target:{kind:'task',id:'t',href:'/tasks/t',status:'available'}}),'/app/tasks/t');});
test('full original note must match owner, identity and the evidence revision',()=>{const note={id:'n',accountId:'a',ownerUserId:'a',title:'原文',body:'完整笔记',version:2};assert.deepEqual(verifiedSourceNote({note},n),note);for(const patch of [{ownerUserId:'b'},{id:'other'},{version:3},{body:null}])assert.throws(()=>verifiedSourceNote({note:{...note,...patch}},n));});
// W0033: Next hands the source page the still-encoded path segment; the page decodes it once and requests the detail once-encoded.
import {notificationIdFromRouteParam,notificationDetailPath} from '../../app/(app)/app/inbox/notification-source-view-model';
const prefix='/app/inbox/sources/',detailPrefix='/api/inbox/notifications/';
test('W0033 source link → route param → decoded id → detail path round-trips every id and stays one segment under the detail API',()=>{
 for(const id of ['inbox:abc','a/b','a b','中文:编号','100%','a%41b','a+b','a?b#c']){
  const href=notificationWebSourceHref({...n,id})!;assert.ok(href.startsWith(prefix),id);
  const segment=href.slice(prefix.length),decoded=notificationIdFromRouteParam(segment);
  assert.equal(decoded,id,`decoded once: ${id}`);
  const path=notificationDetailPath(decoded!);
  assert.equal(path,detailPrefix+encodeURIComponent(id),`encoded once: ${id}`);
  assert.ok(!path.includes('%25')||id.includes('%'),`no double encoding: ${id}`);
  const pathname=new URL(path,'http://x').pathname;
  assert.ok(pathname.startsWith(detailPrefix),`stays under detail API: ${id}`);
  assert.equal(pathname.slice(detailPrefix.length).split('/').length,1,`exactly one segment: ${id}`);
  assert.equal(new URL(path,'http://x').search+new URL(path,'http://x').hash,'',`no query or hash leak: ${id}`);
 }
});
test('W0033 malformed encoding is kept as-is (API answers 404); dot segments and empty ids are rejected before any request',()=>{
 assert.equal(notificationIdFromRouteParam('%E0%A4%A'),'%E0%A4%A');
 assert.equal(new URL(notificationDetailPath('%E0%A4%A'),'http://x').pathname,detailPrefix+'%25E0%25A4%25A');
 for(const raw of ['.','..','%2E%2E','%2e','','%2E'])assert.equal(notificationIdFromRouteParam(raw),null,JSON.stringify(raw));
 assert.equal(notificationIdFromRouteParam('%252E%252E'),'%2E%2E','decodes exactly once, never repeatedly');
});
