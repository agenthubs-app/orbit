import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {createRequire} from 'node:module';
const {renderToHtml}=createRequire(import.meta.url)('./helpers/render.tsx') as {renderToHtml:(element:React.ReactElement)=>string};
import {DiscoverySettingsContent} from '../src/screens/settings/DiscoverySettingsContent';
import {notificationDiscoveryStatusSchema} from '../src/api/schema/notification-discovery';
const at='2026-09-16T00:00:00.000Z';
const data={preferences:{actorId:'a',enabled:true,messageAnalysisEnabled:false,timeZone:'Asia/Tokyo',language:'zh' as const,revision:1,generation:1,enabledSince:at,messageEnabledSince:at,updatedAt:at},lastRoundAt:at,lastError:'budget_unreconciled',counts:{queued:2},sources:{email:'unavailable' as const,calendar:'unavailable' as const}};
test('AI discovery and message analysis are separate choices, and a stopped worker is visible',()=>{assert.equal(notificationDiscoveryStatusSchema.safeParse(data).success,true);const html=renderToHtml(React.createElement(DiscoverySettingsContent,{data,busy:false,error:'',onChange:()=>{},onRefresh:()=>{}}));for(const text of ['自主发现','分析联系人消息','发现暂不可用','2'])assert.ok(html.includes(text),text);assert.ok(!html.includes('budget_unreconciled'));});
