import test from 'node:test';import assert from 'node:assert/strict';
import {discoveryPrefilter} from '../../features/notifications/discovery/qualification-policy';
import type {DiscoveryEvidence} from '../../features/notifications/discovery/contract';
const at='2026-09-16T00:00:00.000Z';const contact:DiscoveryEvidence={key:'contact:c',source:{sourceKind:'contact',sourceId:'c',sourceRevision:at,occurredAt:at,readAt:at},actorId:'a',authorId:'a',text:'佐藤，采购负责人，日本市场',objects:[{id:'c',name:'佐藤'}],links:[],status:'active',href:'/contacts/c'};
const goal={...contact,key:'goal:g',source:{...contact.source,sourceKind:'goal' as const},text:'寻找日本采购渠道'};
test('tens of thousands of unrelated contact facts are rejected before a model call',()=>{let eligible=0;for(let i=0;i<30000;i++)if(discoveryPrefilter({...contact,key:'contact:'+i,text:'普通联系人'},[goal]))eligible++;assert.equal(eligible,0);assert.equal(discoveryPrefilter(contact,[goal]),true);assert.equal(discoveryPrefilter(contact,[]),false);assert.equal(discoveryPrefilter(goal,[]),false);});
