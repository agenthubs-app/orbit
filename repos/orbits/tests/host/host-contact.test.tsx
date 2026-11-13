// 主催者の連絡先（2026-11-14）：入力の規則（ID ≤60 / ひとこと ≤200・リンク不可）、建 / 改の契約、主催者フォームのカード、
// 参加者側のカード（あり / なし）と申込完了の弾窗（ID があるときだけ）。
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HostContactCard, HostContactModal, contactReviewLine } from "../../app/(app)/app/orbit-2026/events/HostContact";
import { journeyTranslator } from "../../app/(app)/app/orbit-2026/events/DiscoverTab";
import { HostContactCard as HostFormContactCard, HostEventFormView, changedFields, draftContact, draftFromEvent, draftHasInput, draftToInput } from "../../app/(app)/app/orbit-2026/host/HostEventForm";
import { hostTranslator } from "../../app/(app)/app/orbit-2026/host/host-model";
import { Orbit2026Scope, ToastProvider } from "../../app/(app)/app/orbit-2026/ui";
import { eventJoinResultSchema } from "../../shared/api-schema/event-join";
import { eventOverviewResponseObject } from "../../shared/api-schema/event-overview";
import { hostEventInputObject, hostEventUpdateInputObject, hostEventViewObject } from "../../shared/api-schema/host-events";
import { canSeeHostContact, hostContactHasId, normalizeHostContact } from "../../shared/compute/host-contact";
import { HOST_EVENT_IDS, hostEventView } from "../../shared/mock/demo-world/host-events";
import { JOURNEY_HOST_CONTACT, journeyOverview } from "../../shared/mock/demo-world/events-journey";

const CONTACT = { lineId: "cfonight_tokyo", note: "申込後、WeChat にお名前を送ってください。", wechatId: "cfonight-tokyo" };
const base = { endsAt: "2026-12-01T12:00:00.000Z", feeKind: "free", organizerProfileId: "prof-1", startsAt: "2026-12-01T10:00:00.000Z", title: "勉強会" };
const blank = draftFromEvent(null, [{ profileId: "prof-1" } as never]);
const filled = { ...blank, date: "2026-12-01", title: "勉強会", venueName: "渋谷" };
const jt = journeyTranslator("ja");
const zt = journeyTranslator("zh");
const wrap = (node: React.ReactNode) => renderToStaticMarkup(<Orbit2026Scope language="ja"><ToastProvider>{node}</ToastProvider></Orbit2026Scope>);

test("schema: every field optional; ID ≤60, note ≤200 and no links; unknown keys rejected", () => {
  assert.ok(hostEventInputObject.safeParse(base).success, "no contact at all");
  assert.ok(hostEventInputObject.safeParse({ ...base, contact: null }).success);
  assert.ok(hostEventInputObject.safeParse({ ...base, contact: CONTACT }).success);
  assert.ok(hostEventInputObject.safeParse({ ...base, contact: { lineId: "x" } }).success, "one field is enough");
  assert.equal(hostEventInputObject.safeParse({ ...base, contact: { wechatId: "a".repeat(61) } }).success, false);
  assert.equal(hostEventInputObject.safeParse({ ...base, contact: { note: "あ".repeat(201) } }).success, false);
  assert.ok(hostEventInputObject.safeParse({ ...base, contact: { note: "あ".repeat(200) } }).success);
  assert.equal(hostEventInputObject.safeParse({ ...base, contact: { note: "詳しくは https://example.com" } }).success, false);
  assert.equal(hostEventInputObject.safeParse({ ...base, contact: { note: "example.jp を見て" } }).success, false);
  assert.equal(hostEventInputObject.safeParse({ ...base, contact: { phone: "090" } }).success, false, "strict");
  assert.ok(hostEventUpdateInputObject.safeParse({ contact: CONTACT, expectedVersion: 2 }).success);
  assert.ok(hostEventUpdateInputObject.safeParse({ contact: null, expectedVersion: 2 }).success, "null clears");
  // Responses tolerate an old server (no field) and unreadable values.
  const view = hostEventView(HOST_EVENT_IDS.cfo18);
  assert.ok(view?.contact, "the sample CFO Night has a contact");
  const { contact: _c, ...old } = view!;
  assert.ok(hostEventViewObject.safeParse(old).success, "an old server without contact still parses");
  assert.equal(hostEventViewObject.parse({ ...old, contact: { wechatId: 3 } }).contact, null);
  assert.equal(eventJoinResultSchema.parse({ eventId: "e", startsAt: "x", status: "registered", submittedAt: "x" }).hostContact, undefined);
});

test("normalize: trims, cuts, and an all-empty contact is null; who may see it", () => {
  assert.equal(normalizeHostContact(null), null);
  assert.equal(normalizeHostContact({ lineId: "  ", note: "", wechatId: null }), null);
  assert.deepEqual(normalizeHostContact({ lineId: " abc ", note: null, wechatId: undefined }), { lineId: "abc", note: null, wechatId: null });
  assert.equal(normalizeHostContact({ wechatId: "x".repeat(80) })?.wechatId?.length, 60);
  assert.equal(normalizeHostContact({ wechatId: 5 } as never), null, "unreadable data reads as nothing");
  assert.equal(hostContactHasId({ lineId: null, note: "メモだけ", wechatId: null }), false);
  assert.equal(hostContactHasId(CONTACT), true);
  assert.deepEqual(["none", "registered", "pending_review", "waitlisted", "rejected", "cancelled", "attended"].map((status) => canSeeHostContact(status as never)), [false, true, true, true, false, false, true]);
});

test("host form: draft ↔ contract — sent when filled, omitted when blank, replaced / cleared on edit", () => {
  assert.equal(draftToInput(filled).input?.contact, undefined, "blank contact is not sent on create");
  const withContact = { ...filled, contactNote: ` ${CONTACT.note} `, lineId: CONTACT.lineId, wechatId: ` ${CONTACT.wechatId}` };
  assert.deepEqual(draftToInput(withContact).input?.contact, CONTACT);
  assert.equal(draftToInput({ ...withContact, contactNote: "https://example.com" }).problem, "evInvalidContact");
  assert.equal(draftToInput({ ...withContact, contactNote: "あ".repeat(201) }).problem, "evInvalidContact");
  assert.equal(draftContact({ contactNote: "", lineId: "", wechatId: "" }).contact, null);
  assert.equal(draftHasInput({ ...blank, lineId: "x" }), true, "a contact alone is worth keeping in 一時保存");
  // An old 一時保存 copy has no contact fields.
  const { wechatId: _w, lineId: _l, contactNote: _n, ...oldTemp } = filled;
  assert.equal(draftToInput(oldTemp as never).problem, null);

  const event = { ...hostEventView(HOST_EVENT_IDS.cfo18)!, contact: CONTACT };
  const draft = draftFromEvent(event, []);
  assert.deepEqual([draft.wechatId, draft.lineId, draft.contactNote], [CONTACT.wechatId, CONTACT.lineId, CONTACT.note]);
  assert.deepEqual(changedFields(event, draftToInput(draft).input!), {}, "unchanged contact is not sent");
  assert.deepEqual(changedFields(event, draftToInput({ ...draft, lineId: "" }).input!), { contact: { lineId: null, note: CONTACT.note, wechatId: CONTACT.wechatId } });
  assert.deepEqual(changedFields(event, draftToInput({ ...draft, contactNote: "", lineId: "", wechatId: "" }).input!), { contact: null }, "clearing sends null");
  const fields = changedFields(event, draftToInput({ ...draft, wechatId: "new-id" }).input!);
  assert.deepEqual(Object.keys(fields), ["contact"], "a contact edit is not a time / venue change");
});

test("host form: the 連絡先 card sits after the description and before the questions; new, edit and read-only", () => {
  const html = renderToStaticMarkup(<HostEventFormView mode="create" draft={{ ...blank, lineId: "cfonight_tokyo" }} profiles={[]} language="ja" />);
  const at = (marker: string) => html.indexOf(marker);
  assert.ok(at("data-host-evcontact") > at("2000字まで") && at("data-host-evcontact") < at("data-host-evquestions"), "description → contact → questions");
  assert.match(html, /主催者の連絡先（任意）/);
  assert.match(html, /申込んだ人だけに表示されます/);
  assert.match(html, /aria-label="WeChat ID"/);
  assert.match(html, /aria-label="LINE ID"[^>]*>|value="cfonight_tokyo"/);
  assert.match(html, /maxLength="60"/);
  assert.match(html, /0 \/ 200/);
  const edit = renderToStaticMarkup(<HostEventFormView mode="edit" event={hostEventView(HOST_EVENT_IDS.cfo18)} draft={{ ...blank, wechatId: "abc" }} profiles={[]} language="zh" />);
  assert.match(edit, /主办方联系方式（选填）/);
  assert.match(edit, /只有报名的人能看到/);
  const readOnly = renderToStaticMarkup(<HostFormContactCard draft={{ contactNote: "", lineId: "", wechatId: "" }} t={hostTranslator("ja")} disabled />);
  assert.match(readOnly, /<fieldset[^>]*disabled/);
  assert.match(readOnly, /<textarea[^>]*disabled/);
  const bad = renderToStaticMarkup(<HostFormContactCard draft={{ contactNote: "www.example.com", lineId: "", wechatId: "" }} t={hostTranslator("ja")} />);
  assert.match(bad, /role="alert"/);
});

test("attendee card: IDs with copy buttons and the note; 「まだありません」 without an ID", () => {
  const html = wrap(<HostContactCard contact={CONTACT} t={jt} status="registered" />);
  assert.match(html, /data-host-contact="set"/);
  assert.match(html, /主催者の連絡先/);
  assert.match(html, /cfonight-tokyo/);
  assert.match(html, /cfonight_tokyo/);
  assert.equal((html.match(/aria-label="(WeChat|LINE) をコピー"/g) ?? []).length, 2);
  assert.match(html, /data-host-contact-note/);
  assert.doesNotMatch(html, /data-host-contact-review/, "confirmed: no review line");
  const none = wrap(<HostContactCard contact={null} t={zt} status="registered" />);
  assert.match(none, /data-host-contact="none"/);
  assert.match(none, /暂无/);
  assert.doesNotMatch(none, /aria-label="复制/);
  const noteOnly = wrap(<HostContactCard contact={{ lineId: null, note: "当日受付でお支払いください", wechatId: null }} t={jt} />);
  assert.match(noteOnly, /まだありません/);
  assert.match(noteOnly, /当日受付でお支払いください/);
  assert.match(wrap(<HostContactCard contact={null} t={journeyTranslator("en")} />), /Not provided/);
});

test("attendee card in review: one line about contacting the organizer, only with a contact", () => {
  assert.equal(contactReviewLine(CONTACT, 5000, zt), "请联系主办方完成付款，主办方确认后会通过审核。");
  assert.equal(contactReviewLine(CONTACT, null, zt), "请联系主办方，主办方确认后会通过审核。");
  assert.equal(contactReviewLine(null, 5000, zt), null);
  assert.equal(contactReviewLine({ lineId: null, note: "メモ", wechatId: null }, 5000, zt), null);
  assert.match(wrap(<HostContactCard contact={CONTACT} t={jt} status="pending_review" priceYen={5000} />), /data-host-contact-review[^>]*>主催者に連絡して参加費をお支払いください/);
  assert.doesNotMatch(wrap(<HostContactCard contact={null} t={jt} status="pending_review" priceYen={5000} />), /data-host-contact-review/);
});

test("registration done: the dialog opens only when the organizer left an ID", () => {
  const open = wrap(<HostContactModal open contact={CONTACT} t={jt} onClose={() => undefined} />);
  assert.match(open, /data-host-contact-modal/);
  assert.match(open, /role="dialog"/);
  assert.equal((open.match(/をコピー"/g) ?? []).length, 2);
  assert.equal(wrap(<HostContactModal open contact={null} t={jt} onClose={() => undefined} />), wrap(null));
  assert.equal(wrap(<HostContactModal open contact={{ lineId: null, note: "メモだけ", wechatId: null }} t={jt} onClose={() => undefined} />), wrap(null));
  assert.equal(wrap(<HostContactModal open={false} contact={CONTACT} t={jt} onClose={() => undefined} />), wrap(null));
});

test("sample world: CFO Night has a contact; the overview fixture itself never carries it (the service decides)", () => {
  assert.ok(hostContactHasId(JOURNEY_HOST_CONTACT));
  assert.equal(journeyOverview("many", "web").hostContact, undefined);
  assert.ok(eventOverviewResponseObject.safeParse({ ...journeyOverview("many", "web"), hostContact: JOURNEY_HOST_CONTACT }).success);
});
