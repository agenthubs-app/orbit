import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";
import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";

let browser: Browser;
let code: { js: string; css: string };
test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { MeetingProposalModal } from "./app/(app)/app/orbit-2026/calendar/MeetingProposalModal";
    import { Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    window.proposal = { sent: [], closes: 0, calls: [], tamper: false };
    let raw = null;
    const candidates = [3,4,5].map(day => { const start = new Date(Date.now() + day * 86400000); start.setUTCHours(9,0,0,0); return { startsAt: start.toISOString(), endsAt: new Date(start.getTime()+3600000).toISOString() }; });
    window.fetch = async (url, init = {}) => {
      window.proposal.calls.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
      if (url.includes("initial-proposal?") ) return Response.json({ success: true, data: { contactId: "contact-b", available: true } });
      if (url.includes("external-events")) return Response.json({ success: true, data: { provider: "google_calendar", connection: "not_connected", events: [], asOf: new Date().toISOString() } });
      if (url.includes("scope=calendar")) return Response.json({ success: true, data: { scheduleItems: [] } });
      if (url === "/api/appointments/initial-proposal" && init.method === "POST") {
        const { proposal } = JSON.parse(init.body);
        raw = { appointmentId: "initial:browser", contactId: "contact-b", confirmed: null, pendingProposalRevision: 1, details: "", detailsUpdatedAt: null, detailsUpdatedBy: null, eventId: "accepted-event", status: "awaiting_response", title: "Meeting", updatedAt: new Date().toISOString(), version: 2, visibility: "participants", proposals: [{ ...proposal, revision: 1, proposedBy: "you", createdAt: new Date().toISOString(), candidateTimes: proposal.candidateTimes.map((value, index) => ({ ...value, candidateId: "candidate:"+index })) }] };
        return Response.json({ success: true, data: { ...raw, replayed: false } }, { status: 201 });
      }
      if (url === "/api/appointments/initial%3Abrowser") return Response.json({ success: true, data: window.proposal.tamper ? { ...raw, version: 99 } : raw });
      throw Error("Unexpected test request");
    };
    function Root() {
      const [visible, setVisible] = React.useState(true);
      return <Orbit2026Scope language="ja"><MeetingProposalModal open={visible} contactId="contact-b" initialCandidates={candidates}
        onSent={id => window.proposal.sent.push(id)} onClose={() => { window.proposal.closes++; setVisible(false); }} /></Orbit2026Scope>;
    }
    createRoot(document.getElementById("root")).render(<Root />);
  `, { "^next-auth/react$": 'import { createContext } from "react"; export const SessionContext = createContext(undefined);' });
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

for (const tamper of [false, true]) test(`first proposal browser: ${tamper ? "changed readback keeps draft open" : "verified readback confirms and closes"}`, async t => {
  const page = await open(browser, code, { origin: "https://orbit.fixture.test/" });
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await page.getByRole("textbox", { name: "場所", exact: true }).fill("Browser room");
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  assert.equal(await page.evaluate(() => (window as any).proposal.calls.filter((call: any) => call.method === "POST").length), 0);
  await page.evaluate(value => { (window as any).proposal.tamper = value; }, tamper);
  await page.getByRole("button", { name: "提案を保存", exact: true }).click();
  if (tamper) {
    await page.getByRole("alert").waitFor();
    assert.equal(await page.getByRole("dialog").isVisible(), true);
  } else await page.getByRole("dialog").waitFor({ state: "detached" });
  const state = await page.evaluate(() => ({ sent: (window as any).proposal.sent, closes: (window as any).proposal.closes, calls: (window as any).proposal.calls }));
  assert.deepEqual(state.sent, tamper ? [] : ["initial:browser"]);
  assert.equal(state.closes, tamper ? 0 : 1);
  const posts = state.calls.filter((call: any) => call.method === "POST");
  assert.equal(posts.length, 1); assert.equal(posts[0].url, "/api/appointments/initial-proposal");
  assert.equal(posts[0].body.contactId, "contact-b"); assert.equal(posts[0].body.proposal.candidateTimes.length, 3);
  assert.ok(state.calls.some((call: any) => call.url === "/api/appointments/initial%3Abrowser" && call.method === "GET"));
});
