import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";

// Isolated mock preview only; browser API requests never reach a business store.
const origin = process.env.ORBIT_TAGS_QA_BASE_URL ?? "http://127.0.0.1:3107";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const secret = process.env.ORBIT_TAGS_QA_SECRET;
assert.ok(secret, "Pass the isolated preview's test-only AUTH_SECRET");
const output = mkdtempSync("/tmp/orbit-contact-tags-browser-");
const cookie = await encode({ secret, salt: "authjs.session-token", token: { sub: "tags-qa", email: "tags-qa@example.test", name: "Tags QA" } });
const browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TAGS_QA_CHROME ? { executablePath: process.env.ORBIT_TAGS_QA_CHROME } : {}) });
try {
  for (const [name, width] of [["desktop", 1440], ["mobile", 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addCookies([{ name: "authjs.session-token", value: cookie, url: origin }]);
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    let storedTags = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`${origin}/api/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/session") {
        await route.fulfill({ json: { user: { id: "tags-qa", name: "Tags QA", email: "tags-qa@example.test" }, expires: new Date(Date.now() + 3600000).toISOString() } });
        return;
      }
      if (path === "/api/contacts/demo-contact-1" && request.method() === "PATCH") {
        const body = request.postDataJSON();
        if (Object.hasOwn(body, "primaryIndustryId")) {
          assert.deepEqual(body, { primaryIndustryId: "finance_investment" });
          await route.fulfill({ json: { success: true, data: { contact: { id: "demo-contact-1", primaryIndustryId: body.primaryIndustryId } } } });
          return;
        }
        assert.ok(Object.keys(body).every((key) => key === "addTags" || key === "removeTags"));
        writes.push(body);
        if (writes.length === 1) { await route.abort("failed"); return; }
        storedTags = [...new Set([...storedTags.filter((tag) => !(body.removeTags ?? []).includes(tag)), ...(body.addTags ?? [])])];
        if (writes.length === 2) storedTags.push("source:event-import");
        await route.fulfill({ json: { success: true, data: { contact: { id: "demo-contact-1", tags: storedTags } } } });
        return;
      }
      assert.equal(request.method(), "GET", `unexpected write: ${request.method()} ${path}`);
      await route.fulfill({ json: { success: true, data: {} } });
    });
    await page.goto(`${origin}/app/contacts/demo-contact-1`, { waitUntil: "networkidle" });
    const edit = page.getByRole("button", { name: "编辑自定义标签", exact: true });
    await edit.click();
    const dialog = page.getByRole("dialog", { name: "自定义标签", exact: true });
    storedTags = await dialog.locator("[data-tag-value]").evaluateAll((tags) => tags.map((tag) => tag.getAttribute("data-tag-value")));
    const removed = storedTags[0];
    assert.ok(removed.includes(":"), "fixture includes a raw system tag whose translated name must not be written");
    await dialog.locator("[data-tag-value]").first().getByRole("button").click();
    await dialog.getByRole("textbox", { name: "添加标签", exact: true }).fill("CRM:Tier_A");
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "保存标签", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    await page.screenshot({ path: `${output}/${name}-retry.png`, fullPage: true });
    await dialog.getByRole("button", { name: "保存标签", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(writes.slice(0, 2), Array(2).fill({ addTags: ["CRM:Tier_A"], removeTags: [removed] }));
    await page.getByText("CRM:Tier_A", { exact: true }).filter({ visible: true }).waitFor();
    await page.getByText("活动导入", { exact: true }).filter({ visible: true }).waitFor({ timeout: 3000 });
    assert.equal(await edit.evaluate((button) => document.activeElement === button), true);
    await page.getByRole("button", { name: "编辑主要行业", exact: true }).click();
    const industry = page.getByRole("dialog", { name: "主要行业", exact: true });
    await industry.getByRole("combobox").selectOption("finance_investment");
    await industry.getByRole("button", { name: "保存行业", exact: true }).click();
    await industry.waitFor({ state: "hidden" });
    await page.getByText("CRM:Tier_A", { exact: true }).filter({ visible: true }).waitFor();
    await edit.click();
    assert.ok(await dialog.locator('[data-tag-value="CRM:Tier_A"]').isVisible());
    const beforeClear = [...storedTags];
    while (await dialog.locator("[data-tag-value]").count()) await dialog.locator("[data-tag-value]").first().getByRole("button").click();
    await dialog.getByRole("button", { name: "保存标签", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(writes[2], { removeTags: beforeClear });
    await edit.click();
    await dialog.getByText("暂无标签", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.getByText("金融与投资", { exact: true }).filter({ visible: true }).waitFor();
    await page.screenshot({ path: `${output}/${name}-cleared.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log(`${name}: raw tag delta, failed draft retry, exact custom label, independent industry edit, clear/reopen and focus passed`);
    await context.close();
  }
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
