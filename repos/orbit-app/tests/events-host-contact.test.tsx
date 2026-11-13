import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import type { HostEventContact } from "../src/api/contract/host-events";
import { contactReviewLine, HostContactCard, HostContactSheet, shouldOpenHostContact, showHostContact } from "../src/screens/events/v2/HostContact";
import { journeyOverview } from "../../orbits/shared/mock/demo-world/events-journey";
import { eventsJourney as zh } from "../src/i18n/zh/eventsJourney";
import { renderedText, renderToHtml } from "./helpers/render";

// 主催者の連絡先（与 Web HostContact.tsx 同规则）：渲染断言卡片 / 弹窗真的画出了什么，规则函数单测。
const t = (key: string, values?: Record<string, string | number>) => {
  const text = (zh as Record<string, string>)[`eventsJourney.${key}`] ?? key;
  return text.replace(/\{(\w+)\}/gu, (_, name: string) => String(values?.[name] ?? ""));
};
const full: HostEventContact = { lineId: "orbit_line", note: "加好友时请备注姓名", wechatId: "orbit_wx" };
const noteOnly: HostEventContact = { lineId: null, note: "当天现场联系", wechatId: null };

test("card with contact: WeChat and LINE rows with their IDs and copy buttons, plus the note", () => {
  const html = renderToHtml(<HostContactCard contact={full} t={t} />);
  const text = renderedText(<HostContactCard contact={full} t={t} />);
  assert.match(text, /主办方联系方式/u);
  assert.match(text, /微信 orbit_wx/u);
  assert.match(text, /LINE orbit_line/u);
  assert.match(text, /加好友时请备注姓名/u);
  assert.match(html, /aria-label="复制微信"/u);
  assert.match(html, /aria-label="复制LINE"/u);
  assert.doesNotMatch(text, /暂无/u);
});

test("card without IDs: says 暂无, keeps the note, offers nothing to copy", () => {
  for (const contact of [null, noteOnly]) {
    const text = renderedText(<HostContactCard contact={contact} t={t} />);
    assert.match(text, /主办方联系方式/u);
    assert.match(text, /暂无/u);
    assert.doesNotMatch(renderToHtml(<HostContactCard contact={contact} t={t} />), /aria-label="复制/u);
  }
  assert.match(renderedText(<HostContactCard contact={noteOnly} t={t} />), /当天现场联系/u);
});

test("pending review with an ID asks to contact the organizer (pay only when there is a fee)", () => {
  assert.match(renderedText(<HostContactCard contact={full} t={t} status="pending_review" priceYen={3000} />), /请联系主办方完成付款，主办方确认后会通过审核。/u);
  assert.match(renderedText(<HostContactCard contact={full} t={t} status="pending_review" priceYen={0} />), /请联系主办方，主办方确认后会通过审核。/u);
  assert.doesNotMatch(renderedText(<HostContactCard contact={full} t={t} status="registered" priceYen={3000} />), /请联系主办方/u);
  assert.equal(contactReviewLine(noteOnly, 3000, t), null);
  assert.equal(contactReviewLine(null, 3000, t), null);
});

test("the post-apply sheet opens only when there is a WeChat or LINE ID", () => {
  assert.equal(shouldOpenHostContact(full), true);
  assert.equal(shouldOpenHostContact({ ...full, lineId: null }), true);
  assert.equal(shouldOpenHostContact(noteOnly), false);
  assert.equal(shouldOpenHostContact(null), false);
  assert.equal(shouldOpenHostContact(undefined), false);
  assert.equal(renderToHtml(<HostContactSheet visible contact={noteOnly} t={t} onClose={() => undefined} />), "");
  assert.equal(renderToHtml(<HostContactSheet visible contact={null} t={t} onClose={() => undefined} />), "");
  assert.equal(renderToHtml(<HostContactSheet visible={false} contact={full} t={t} onClose={() => undefined} />), "");
});

test("event detail shows the card only to someone who applied, when the server sent the contact", () => {
  const base = journeyOverview("many", "app");
  const withStatus = (status: typeof base.registration.status, hostContact: HostEventContact | null | undefined = full) => ({ ...base, hostContact, registration: { ...base.registration, status } });
  for (const status of ["pending_review", "registered", "waitlisted", "attended"] as const) assert.equal(showHostContact(withStatus(status)), true, status);
  for (const status of ["none", "cancelled"] as const) assert.equal(showHostContact(withStatus(status)), false, status);
  // null = the organizer left none → the card still shows (暂无); undefined = not sent (older server) → no card.
  assert.equal(showHostContact(withStatus("registered", null)), true);
  const { hostContact: _omit, ...withoutField } = withStatus("registered");
  assert.equal(showHostContact(withoutField), false);
  assert.equal(showHostContact({ ...withStatus("registered"), signedOut: true }), false);
});
