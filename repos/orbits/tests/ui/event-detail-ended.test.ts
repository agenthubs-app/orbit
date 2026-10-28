import assert from "node:assert/strict";
import test from "node:test";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";

// Render shipped presenters without browser/network IO. CSS is irrelevant to action visibility.
const compiled = buildSync({ stdin: { contents: `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventDetailBody, PhoneDetailBody, DetailRail } from './app/(app)/app/orbit-2026/events/EventDetail';
import { journeyTranslator } from './app/(app)/app/orbit-2026/events/DiscoverTab';
import { ToastProvider } from './app/(app)/app/orbit-2026/ui';
export function render(kind, data) {
 const Component = kind === 'phone' ? PhoneDetailBody : kind === 'rail' ? DetailRail : EventDetailBody;
 return renderToStaticMarkup(<ToastProvider><Component data={data} language="zh" t={journeyTranslator('zh')} onRegister={()=>{}} /></ToastProvider>);
}`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty', '.module.css': 'empty' }, jsx: 'automatic' });
const renderedModule: { render?: (kind: string, data: unknown) => string } = {};
const compiledModule = { exports: renderedModule };
new Function('require', 'module', 'exports', compiled.outputFiles[0]!.text)(createRequire(process.cwd() + '/package.json'), compiledModule, renderedModule);
Object.assign(renderedModule, compiledModule.exports);
const data = { eventId: 'historical', title: '历史活动', emoji: '🥂', startsAt: '2026-03-22T09:00:00Z', endsAt: '2026-03-22T12:00:00Z', review: false, deadlineSoon: false, agenda: [], organizer: { name: '主办方' }, attendeeCounts: { all: 92, planFit: 0, known: 0 }, rosterLocked: true, attendees: [], knownAttendees: [], registration: { status: 'none', href: '/app/events/historical/register' }, signedOut: true };
for (const kind of ['desktop', 'phone', 'rail']) {
 test(`${kind}: ended event has no registration action or future attendance claim`, () => {
  const html = renderedModule.render!(kind, data);
  assert.doesNotMatch(html, /预计参加|登录后报名|去报名|开始报名|报名后可以看到/);
  assert.match(html, /活动已结束/);
  if (kind === 'desktop') { assert.match(html, /报名人数.*92/); assert.match(html, /参加者信息只在报名了同一活动的人之间显示/); }
 });
}
test('upcoming public event keeps registration action and expected count', () => {
 const html = renderedModule.render!('desktop', { ...data, startsAt: '2099-03-22T09:00:00Z', endsAt: '2099-03-22T12:00:00Z' });
 assert.match(html, /预计参加/); assert.match(html, /登录后报名/);
});

test('ended registered users retain their authorized roster without future preparation prompts', () => {
 const html = renderedModule.render!('desktop', { ...data, signedOut: false, rosterLocked: false, registration: { status: 'registered' }, attendees: [{ attendeeId: 'authorized', name: '已授权参加者', initial: '已', known: false, planFit: false, wanted: false }] });
 assert.match(html, /已授权参加者/);
 assert.doesNotMatch(html, /预计参加|报名后可以看到|登录后报名/);
});

import { detailTiming } from '../../app/(app)/app/orbit-2026/events/detail-timing';
test('canonical end and registration deadline boundaries do not invent an end at start time', () => {
 const timing = { endsAt: '2026-03-22T12:00:00Z', registrationClosesAt: '2026-03-22T09:00:00Z' };
 assert.deepEqual(detailTiming(timing, Date.parse('2026-03-22T08:59:59Z')), { ended: false, canRegister: true });
 assert.deepEqual(detailTiming(timing, Date.parse('2026-03-22T09:00:00Z')), { ended: false, canRegister: false });
 assert.deepEqual(detailTiming(timing, Date.parse(timing.endsAt)), { ended: true, canRegister: false });
 assert.deepEqual(detailTiming(null, Date.now()), { ended: false, canRegister: false });
});
