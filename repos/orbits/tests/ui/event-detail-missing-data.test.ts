import assert from "node:assert/strict";
import test from "node:test";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";

// 2026-11-12：线上一场「没有计划的用户看已结束的导入活动」把详情页看塌了——评分卡位置空洞、议程空卡、主办方显示哈希串。
// 这里渲染三种 presenter，确认每个缺位都换成了引导 / 空状态，而不是不渲染。
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

const base = { eventId: 'imported', title: '中日創業交流会', emoji: '🥂', startsAt: '2099-04-25T09:30:00Z', endsAt: '2099-04-25T12:00:00Z', review: false, deadlineSoon: false, agenda: [], organizer: { name: 'Organizer #1N54UV4', unnamed: true, averageAttendance: 30, myAttendance: 0 }, attendeeCounts: { all: 79, planFit: 0, known: 0 }, rosterLocked: true, attendees: [], knownAttendees: [], registration: { status: 'none', href: '/app/events/imported/register' }, signedOut: false, assessment: null, hasPlan: false };

test('desktop: no plan → the score slot holds a make-a-plan guide, the empty agenda says so, the organizer hash is not shown', () => {
  const html = renderedModule.render!('desktop', base);
  assert.match(html, /data-detail-no-plan/); assert.match(html, /还没有计划/); assert.match(html, /设定目标/); assert.match(html, /\/app\/tasks\?tab=plan/);
  assert.match(html, /data-agenda-empty/); assert.match(html, /主办方没有公开议程/);
  assert.doesNotMatch(html, /Organizer #/); assert.match(html, /主办方（未入驻 Orbit）/);
});
test('rail: no plan → the guide replaces 「约0人符合计划」', () => {
  const html = renderedModule.render!('rail', base);
  assert.match(html, /有了计划，该见的人会列在这里/); assert.doesNotMatch(html, /可能符合计划的人/);
});
test('phone: no plan → guide under the cover, empty agenda tab, generic organizer', () => {
  const html = renderedModule.render!('phone', base);
  assert.match(html, /data-detail-no-plan/); assert.doesNotMatch(html, /Organizer #/); assert.match(html, /主办方（未入驻 Orbit）/);
});
test('with a plan (or an older payload without hasPlan) nothing new appears; a named organizer keeps its name', () => {
  for (const data of [{ ...base, hasPlan: true }, { ...base, hasPlan: undefined }]) {
    assert.doesNotMatch(renderedModule.render!('desktop', data), /data-detail-no-plan/);
    assert.match(renderedModule.render!('rail', data), /可能符合计划的人 约0人/);
  }
  const named = renderedModule.render!('desktop', { ...base, agenda: [{ at: '19:00', title: '受付' }], organizer: { name: 'CFO Night 実行委員会' } });
  assert.match(named, /CFO Night 実行委員会/); assert.doesNotMatch(named, /data-agenda-empty/); assert.doesNotMatch(named, /未入驻/);
});
test('signed out: no guide (the login card owns that slot)', () => {
  assert.doesNotMatch(renderedModule.render!('desktop', { ...base, signedOut: true, hasPlan: undefined }), /data-detail-no-plan/);
});

import { canonicalPublicOrganizerLabel, isCanonicalPublicOrganizerLabel } from '../../features/events/core/public-organizer-identity';
test('isCanonicalPublicOrganizerLabel recognises the fallback label and nothing else', () => {
  assert.equal(isCanonicalPublicOrganizerLabel(canonicalPublicOrganizerLabel('actor_123')), true);
  assert.equal(isCanonicalPublicOrganizerLabel(canonicalPublicOrganizerLabel(null)), true);
  assert.equal(isCanonicalPublicOrganizerLabel(''), true);
  assert.equal(isCanonicalPublicOrganizerLabel('CFO Night 実行委員会'), false);
  assert.equal(isCanonicalPublicOrganizerLabel('Organizer Taro'), false);
});

test('ended + no plan: the score slot says the event ended (no plan nudge), an empty roster has no 「notify me」', () => {
  const ended = { ...base, startsAt: '2026-04-25T09:30:00Z', endsAt: '2026-04-25T12:00:00Z', attendeeCounts: { all: 0, planFit: 0, known: 0 }, rosterLocked: false };
  const html = renderedModule.render!('desktop', ended);
  assert.doesNotMatch(html, /data-detail-no-plan/); assert.match(html, /活动已结束/);
  assert.match(html, /data-past-no-roster/); assert.doesNotMatch(html, /公开后提醒我/);
  assert.doesNotMatch(renderedModule.render!('phone', ended), /data-detail-no-plan/);
  assert.match(renderedModule.render!('rail', { ...ended, hasPlan: true, assessment: { score: 19, verdict: 'skip', display: { goalFit: 0, people: 0, timeCost: 65 }, basis: '' }, assessmentPeopleUnknown: true }), /没有参加者记录/);
});
