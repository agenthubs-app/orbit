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
 return renderToStaticMarkup(<ToastProvider><Component data={data} language="zh" t={journeyTranslator('zh')} onRegister={()=>{}} railShown={kind === 'body-railed'} /></ToastProvider>);
}`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty', '.module.css': 'empty' }, jsx: 'automatic' });
const renderedModule: { render?: (kind: string, data: unknown) => string } = {};
const compiledModule = { exports: renderedModule };
new Function('require', 'module', 'exports', compiled.outputFiles[0]!.text)(createRequire(process.cwd() + '/package.json'), compiledModule, renderedModule);
Object.assign(renderedModule, compiledModule.exports);

const base = { eventId: 'imported', title: '中日創業交流会', emoji: '🥂', startsAt: '2099-04-25T09:30:00Z', endsAt: '2099-04-25T12:00:00Z', review: false, deadlineSoon: false, agenda: [], organizer: { name: 'Organizer #1N54UV4', unnamed: true, averageAttendance: 30, myAttendance: 0 }, attendeeCounts: { all: 79, planFit: 0, known: 0 }, rosterLocked: true, attendees: [], knownAttendees: [], registration: { status: 'none', href: '/app/events/imported/register' }, signedOut: false, assessment: null, hasPlan: false };

test('desktop (no rail): no plan → the 和你有关 card holds a 设定目标 guide (no score at all); empty agenda line; no organizer hash', () => {
  const html = renderedModule.render!('desktop', base);
  assert.match(html, /data-detail-relevance-guide/); assert.match(html, /和你有关/); assert.match(html, /设定目标后显示/); assert.match(html, />设定目标</); assert.match(html, /\/app\/tasks\?tab=plan/);
  assert.doesNotMatch(html, /与目标的契合|对你的评估|\/ 100|推荐参加/);
  // 2026-11-21 单页：没有议程 → 整块不出（不再是灰字空卡）；主办方没有公开名字 → 主催区块整块不出（与 App 一致）。
  assert.doesNotMatch(html, /data-detail-agenda|主办方还没有公布议程/);
  assert.doesNotMatch(html, /Organizer #/); assert.doesNotMatch(html, /data-detail-host=/);
});
test('rail: no plan → the 和你有关 card in the rail holds the guide (the only 设定目标 button: the body no longer has a slot right of the cover)', () => {
  const html = renderedModule.render!('rail', base);
  assert.match(html, /设定目标后显示/); assert.equal((html.match(/tasks\?tab=plan/g) ?? []).length, 1);
  const body = renderedModule.render!('body-railed', base);
  assert.doesNotMatch(body, /data-detail-relevance-guide|tasks\?tab=plan|data-detail-host=/);
});
test('phone: no plan → a 设定目标 guide under the cover (no score), generic organizer', () => {
  const html = renderedModule.render!('phone', base);
  assert.match(html, /data-detail-relevance-guide/); assert.doesNotMatch(html, /对你的评估|推荐参加/); assert.match(html, />设定目标</); assert.doesNotMatch(html, /Organizer #/); assert.match(html, /主办方（未入驻 Orbit）/);
});
test('with a plan (or an older payload without hasPlan) nothing new appears; a named organizer keeps its name', () => {
  for (const data of [{ ...base, hasPlan: true }, { ...base, hasPlan: undefined }]) {
    assert.doesNotMatch(renderedModule.render!('desktop', data), /data-detail-no-plan|data-detail-relevance-guide/);
    // 2026-11-21：右栏不再有「会えそうな人」；名单锁着只在主栏参加者里说。
    assert.doesNotMatch(renderedModule.render!('rail', data), /可能符合计划的人|data-detail-relevance-guide/);
  }
  const named = renderedModule.render!('desktop', { ...base, agenda: [{ at: '19:00', title: '受付' }], organizer: { name: 'CFO Night 実行委員会' } });
  assert.match(named, /CFO Night 実行委員会/); assert.doesNotMatch(named, /data-agenda-empty/); assert.doesNotMatch(named, /未入驻/);
});
test('signed out: the 和你有关 guide with a 登录后查看 button that returns here, no score', () => {
  const html = renderedModule.render!('desktop', { ...base, signedOut: true, hasPlan: undefined });
  assert.match(html, /data-detail-relevance-guide/); assert.match(html, /登录后显示/); assert.match(html, />登录</); assert.doesNotMatch(html, /\/ 100|推荐参加/); assert.match(html, /next=%2Fapp%2Fevents%2Fimported/);
  assert.match(renderedModule.render!('phone', { ...base, signedOut: true, hasPlan: undefined }), /data-detail-relevance-guide/);
});

import { canonicalPublicOrganizerLabel, isCanonicalPublicOrganizerLabel } from '../../features/events/core/public-organizer-identity';
test('isCanonicalPublicOrganizerLabel recognises the fallback label and nothing else', () => {
  assert.equal(isCanonicalPublicOrganizerLabel(canonicalPublicOrganizerLabel('actor_123')), true);
  assert.equal(isCanonicalPublicOrganizerLabel(canonicalPublicOrganizerLabel(null)), true);
  assert.equal(isCanonicalPublicOrganizerLabel(''), true);
  assert.equal(isCanonicalPublicOrganizerLabel('CFO Night 実行委員会'), false);
  assert.equal(isCanonicalPublicOrganizerLabel('Organizer Taro'), false);
});

test('ended + no plan: no 和你有关 at all (field table: 终了 → 不出), an empty roster is one line without 「notify me」', () => {
  const ended = { ...base, startsAt: '2026-04-25T09:30:00Z', endsAt: '2026-04-25T12:00:00Z', attendeeCounts: { all: 0, planFit: 0, known: 0 }, rosterLocked: false };
  const html = renderedModule.render!('desktop', ended);
  assert.doesNotMatch(html, /data-detail-relevance/); assert.match(html, /活动已结束/);
  assert.match(html, /data-detail-people-none=""[^>]*>没有参加者记录/); assert.doesNotMatch(html, /公开后提醒我/);
  assert.doesNotMatch(renderedModule.render!('phone', ended), /data-detail-relevance/);
  assert.doesNotMatch(renderedModule.render!('rail', { ...ended, hasPlan: true, assessment: { score: 19, verdict: 'skip', display: { goalFit: 0, people: 0, timeCost: 65 }, basis: '' }, assessmentPeopleUnknown: true }), /data-detail-relevance/);
});

test('ended: the host card ends with a 下一场 row — next event or 还没公布; follow stays on the host row', () => {
  const ended = { ...base, organizer: { name: '日中创新创业协会', averageAttendance: 30 }, startsAt: '2026-04-25T09:30:00Z', endsAt: '2026-04-25T12:00:00Z' };
  // Signed out, no next event: says so; follow is a log-in link that comes back here (2026-11-21: the 「接下来的活动」 link is gone, prototype A4b).
  const out = renderedModule.render!('desktop', { ...ended, signedOut: true, hasPlan: undefined });
  assert.match(out, /data-detail-ended/); assert.match(out, /下一场/); assert.match(out, /还没公布/);
  // 关注 sits once, on the host row (signed out: a log-in link that comes back here).
  assert.match(out, /href="\/app\/account\/login\?next=%2Fapp%2Fevents%2Fimported"[^>]*>关注</); assert.doesNotMatch(out, /登录后关注|data-detail-ended-follow/);
  // No repeated wording: the card does not restate the ended status, the count, or explain the button.
  const card = out.slice(out.indexOf('data-detail-ended'));
  assert.doesNotMatch(card.slice(0, card.indexOf('接下来的活动')), /主办方还没有|已经结束|报名人数|通知你/);
  // Signed in without a plan, host has a next event: links straight to it; follow button (organizerId present).
  const next = { eventId: 'evt next/5', title: '第5回 中日创业交流会', startsAt: '2099-07-19T09:30:00Z' };
  const inside = renderedModule.render!('desktop', { ...ended, organizer: { ...ended.organizer, organizerId: 'org_1', following: false, next } });
  assert.match(inside, /data-detail-ended-next="evt next\/5"/); assert.match(inside, /href="\/app\/events\/evt%20next%2F5"/); assert.match(inside, /第5回 中日创业交流会/);
  assert.doesNotMatch(inside, /还没公布/); assert.match(inside, /data-detail-follow=""[^>]*>关注</); assert.doesNotMatch(inside, /data-detail-ended-follow/);
  // The next row sits inside the host card, after the stats line; ended → no 和你有关.
  assert.ok(out.indexOf('data-detail-ended') > out.indexOf('平均30人参加')); assert.doesNotMatch(out, /data-detail-relevance/);
  // Rail: no 「make a plan」 nudge on an ended event.
  assert.doesNotMatch(renderedModule.render!('rail', ended), /data-detail-no-plan/);
});
test('upcoming events never show the ended card', () => {
  assert.doesNotMatch(renderedModule.render!('desktop', base), /data-detail-ended/);
  assert.doesNotMatch(renderedModule.render!('phone', base), /data-detail-ended/);
});

test('locked roster: mosaic avatar stack (no attendee data) + count + one sentence, no extra register button', () => {
  const locked = { ...base, organizer: { name: '日中创新创业协会', emoji: '🥂' }, attendeeCounts: { all: 79, planFit: 0, known: 0 }, attendees: [], rosterLocked: true };
  const html = renderedModule.render!('desktop', { ...locked, signedOut: true, hasPlan: undefined });
  // 2026-11-21（A1）：5 个马赛克头像 + 「预计参加 79人」+ 一句；未登录不提熟人。
  assert.equal((html.match(/data-roster-masked/g) ?? []).length, 5);
  assert.match(html, /预计参加<b>79<\/b>人/); assert.doesNotMatch(html, /熟人/);
  assert.match(html, /data-roster-gate=""[\s\S]*报名后可以看到名字和一句话介绍/);
  // The register action lives in the page header / rail / phone bottom bar, not repeated inside the card.
  assert.doesNotMatch(html.slice(html.indexOf('data-detail-people')), /登录后报名|去报名|<button/);
  // Mosaic is decoration only: aria-hidden and no names.
  assert.match(html, /aria-hidden="true"><div[^>]*data-roster-masked/);
  // Small rosters: as many mosaic avatars as people (≤ 5).
  const few = renderedModule.render!('desktop', { ...locked, attendeeCounts: { all: 2, planFit: 0, known: 0 } });
  assert.equal((few.match(/data-roster-masked/g) ?? []).length, 2);
  // Ended: registrations, not a future-attendance claim; the gate sentence says who can see the roster.
  const ended = renderedModule.render!('desktop', { ...locked, signedOut: true, startsAt: '2026-04-25T09:30:00Z', endsAt: '2026-04-25T12:00:00Z' });
  assert.match(ended, /报名<b>79<\/b>人/); assert.match(ended, /仅报名过这场活动的用户可查看参加者信息/);
});

import { inviteCodeSize } from '../../app/(app)/app/orbit-2026/events/PublicEvents';
test('invite code size: new XXXX-XXXX codes stay large; imported long codes step down so they stay on one line', () => {
  assert.equal(inviteCodeSize('K7P2-QX9M'), 'normal');
  assert.equal(inviteCodeSize('SMALL-STAGING'), 'long');
  assert.equal(inviteCodeSize('ORBIT-VERIFY-TODAY'), 'xlong');
});

test('with a plan: 和你有关 lists facts only (no ring / verdict / criteria); no rows → no rows, no guide', () => {
  const relevance = { group: 'people', people: [{ typeKey: 'cfo', label: 'CFO', emoji: '💼', count: 3, source: 'registrants' }], known: { count: 1, names: ['山田 健太'] }, topic: null, warnings: [{ kind: 'budget', feeYen: 8000, limitYen: 5000 }] };
  const assessment = { score: 74, verdict: 'recommend', display: { goalFit: 80, people: 70, timeCost: 60 }, basis: 'x', relevance };
  for (const kind of ['desktop', 'phone']) {
    const html = renderedModule.render!(kind, { ...base, hasPlan: true, assessment });
    assert.match(html, /data-detail-relevance[\s\S]*data-relevance-row="people"/); assert.match(html, /想见的人 · CFO 3位/); assert.match(html, /来自报名名单/);
    assert.match(html, /认识的人有1位参加/); assert.match(html, /山田 健太/); assert.match(html, /超出预算 ¥5,000/); assert.match(html, /费用 ¥8,000/);
    assert.doesNotMatch(html, /推荐参加|与目标的契合|\/ 100|data-why-box|>74</);
    const empty = renderedModule.render!(kind, { ...base, hasPlan: true, assessment: { ...assessment, relevance: { group: 'other', people: [], known: null, topic: null, warnings: [] } } });
    assert.doesNotMatch(empty, /data-detail-relevance|data-relevance-row|data-detail-relevance-guide/);
  }
});
