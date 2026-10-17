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
    window.proposal = { language: "ja", open: true, sent: [], closes: 0 };
    function Root() {
      const [, force] = React.useState(0);
      window.proposal.render = () => force(n => n + 1);
      return <Orbit2026Scope language={window.proposal.language}><MeetingProposalModal open={window.proposal.open} contactId="c1"
        appointmentId="meeting1" initialCandidates={[{ startsAt: "2026-10-20T01:00:00Z", endsAt: "2026-10-20T02:00:00Z" }]}
        onClose={() => { window.proposal.closes++; window.proposal.open = false; window.proposal.render(); }}
        onSent={id => window.proposal.sent.push(id)} /></Orbit2026Scope>;
    }
    createRoot(document.getElementById("root")).render(<Root />);
  `);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

for (const [language, expected, closeLabel] of [
  ["ja", ["面談の日程提案", "候補を選ぶ", "形式と場所", "送る前の確認"], "閉じる"],
  ["zh", ["提议会面时间", "选择候选时间", "形式与地点", "发送前确认"], "关闭"],
  ["en", ["Propose meeting times", "Choose times", "Format and place", "Review before sending"], "Close"],
] as const) {
  test(`${language}: proposal renders the three steps and closes without sending`, async t => {
    const page = await open(browser, code);
    t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
    await page.evaluate((language) => { const state = (window as any).proposal; state.language = language; state.render(); }, language);
    assert.equal(await page.getByRole("dialog").count(), 1);
    for (const label of expected) await page.getByRole("heading", { name: label, exact: true }).waitFor();
    const text = await page.getByRole("dialog").innerText();
    assert.ok(text.indexOf(expected[1]) < text.indexOf(expected[2]) && text.indexOf(expected[2]) < text.indexOf(expected[3]));
    await page.getByRole("dialog").getByRole("button", { name: closeLabel, exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.deepEqual(await page.evaluate(() => ({ closes: (window as any).proposal.closes, sent: (window as any).proposal.sent })), { closes: 1, sent: [] });
  });
}
