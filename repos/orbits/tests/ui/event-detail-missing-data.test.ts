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
  assert.match(html, /data-detail-no-plan/); assert.match(html, /对你的评估/); assert.match(html, /设定目标后显示/); assert.match(html, /\/app\/tasks\?tab=plan/);
  assert.match(html, /data-agenda-empty/); assert.match(html, /暂未公开/);
  assert.doesNotMatch(html, /Organizer #/); assert.match(html, /主办方（未入驻 Orbit）/);
});
test('rail: no plan → one line replaces 「约0人符合计划」, no second 设定目标 button', () => {
  const html = renderedModule.render!('rail', base);
  assert.match(html, /设定目标后显示/); assert.doesNotMatch(html, /可能符合计划的人/); assert.doesNotMatch(html, /tasks\?tab=plan/);
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

test('ended card (no score to show): event summary, host next / follow, see-upcoming link — never an empty card', () => {
  const ended = { ...base, startsAt: '2026-04-25T09:30:00Z', endsAt: '2026-04-25T12:00:00Z' };
  // Signed out, no next event: says so, offers log-in-to-follow and the public events list.
  const out = renderedModule.render!('desktop', { ...ended, signedOut: true, hasPlan: undefined });
  assert.match(out, /data-detail-ended/); assert.match(out, /下一场/); assert.match(out, /还没公布/); assert.match(out, /登录后关注/); assert.match(out, /href="\/app\/events"/);
  // No repeated wording: the card does not restate the ended status, the count, or explain the button.
  const card = out.slice(out.indexOf('data-detail-ended'));
  assert.doesNotMatch(card.slice(0, card.indexOf('接下来的活动')), /主办方还没有|已经结束|报名人数|通知你/);
  // Signed in without a plan, host has a next event: links straight to it; follow button (organizerId present).
  const next = { eventId: 'evt next/5', title: '第5回 中日创业交流会', startsAt: '2099-07-19T09:30:00Z' };
  const inside = renderedModule.render!('desktop', { ...ended, organizer: { ...ended.organizer, organizerId: 'org_1', following: false, next } });
  assert.match(inside, /data-detail-ended-next="evt next\/5"/); assert.match(inside, /href="\/app\/events\/evt%20next%2F5"/); assert.match(inside, /第5回 中日创业交流会/);
  assert.doesNotMatch(inside, /还没公布/); assert.match(inside, /data-detail-ended-follow/); assert.match(inside, />关注主办方</);
  assert.match(inside, /\/app\/events\?tab=discover/);
  // Phone: the same card replaces the bottom CTA.
  assert.match(renderedModule.render!('phone', { ...ended, signedOut: true, hasPlan: undefined }), /data-detail-ended/);
  // Rail: no 「make a plan」 nudge on an ended event.
  assert.doesNotMatch(renderedModule.render!('rail', ended), /data-detail-no-plan/);
});
test('upcoming events never show the ended card', () => {
  assert.doesNotMatch(renderedModule.render!('desktop', base), /data-detail-ended/);
  assert.doesNotMatch(renderedModule.render!('phone', base), /data-detail-ended/);
});

test('locked roster: same small tiles as the registered roster — host, mosaic tiles that carry no attendee data, +N, no extra register button', () => {
  const locked = { ...base, organizer: { name: '日中创新创业协会', emoji: '🥂' }, attendeeCounts: { all: 79, planFit: 0, known: 0 }, attendees: [], rosterLocked: true };
  const html = renderedModule.render!('desktop', { ...locked, signedOut: true, hasPlan: undefined });
  assert.match(html, /data-roster-host/); assert.match(html, /日中创新创业协会/); assert.match(html, /主办/);
  // Desktop: 2 rows × 4 = host + 6 mosaic + more.
  assert.equal((html.match(/data-roster-masked/g) ?? []).length, 6);
  assert.match(html, /data-roster-more[\s\S]*\+73/);
  // The register action lives in the page header / phone bottom bar, not repeated inside the card.
  assert.doesNotMatch(html.slice(html.indexOf('data-roster-gate')), /登录后报名|报名后查看全部|去报名/);
  // Mosaic is decoration only: aria-hidden, and nothing but the host's name and counts is in the markup.
  assert.match(html, /aria-hidden="true" data-roster-masked/);
  assert.doesNotMatch(html, /参加者信息只在报名了同一活动的人之间显示/);
  // Signed in, not registered: same row.
  assert.match(renderedModule.render!('desktop', locked), /data-roster-host/);
  // Phone (2 × 2) is covered by the shipped layout: host + 2 mosaic + more.
  // Small rosters: no +N tile when every attendee already has a mosaic tile.
  const few = renderedModule.render!('desktop', { ...locked, attendeeCounts: { all: 2, planFit: 0, known: 0 } });
  assert.equal((few.match(/data-roster-masked/g) ?? []).length, 2); assert.doesNotMatch(few, /data-roster-more/);
  // Ended: the row stays, no register button.
  const ended = renderedModule.render!('desktop', { ...locked, signedOut: true, startsAt: '2026-04-25T09:30:00Z', endsAt: '2026-04-25T12:00:00Z' });
  assert.match(ended, /data-roster-host/);
});
