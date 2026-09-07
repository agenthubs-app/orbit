import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";
import mobileServices from "../../features/mobile/contacts-dashboard-service.ts";
import dashboardServices from "../../features/dashboard/service-factory.ts";
const { createConfiguredMobileContactsDashboardService } = mobileServices;
const { createOpportunityReminderAnalyticsService } = dashboardServices;

const origin = process.env.ORBIT_ANALYSIS_QA_BASE_URL ?? "http://127.0.0.1:3107";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const secret = process.env.ORBIT_ANALYSIS_QA_SECRET;
assert.ok(secret, "Pass the isolated preview's test-only AUTH_SECRET");
const output = mkdtempSync("/tmp/orbit-contacts-analysis-browser-");
const initial = await createConfiguredMobileContactsDashboardService("mock").getDashboard({ actorId: "analysis-qa" });
assert.equal(initial.success, true);
const recomputed = await createOpportunityReminderAnalyticsService("mock").recomputeOpportunityReminderAnalytics();
assert.equal(recomputed.success, true);
const cookie = await encode({ secret, salt: "authjs.session-token", token: { sub: "analysis-qa", email: "analysis-qa@example.test", name: "Analysis QA" } });
const browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_ANALYSIS_QA_CHROME ? { executablePath: process.env.ORBIT_ANALYSIS_QA_CHROME } : {}) });
try {
  for (const [name, width] of [["desktop", 1440], ["mobile", 390]]) {
    const data = structuredClone(initial.data);
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addCookies([{ name: "authjs.session-token", value: cookie, url: origin }]);
    const page = await context.newPage(); const errors = []; const writes = []; let failRefresh = false;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`${origin}/api/**`, async (route) => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      if (path === "/api/auth/session") return route.fulfill({ json: { user: { id: "analysis-qa", name: "Analysis QA", email: "analysis-qa@example.test" }, expires: new Date(Date.now() + 3600000).toISOString() } });
      if (path === "/api/mobile/contacts-dashboard") return route.fulfill({ status: failRefresh ? 503 : 200, json: failRefresh ? { success: false } : { success: true, data } });
      if (path === "/api/profile" && request.method() === "PUT") {
        const body = request.postDataJSON(); writes.push({ path, body });
        assert.deepEqual(Object.keys(body), ["relationshipGoal"]);
        if (writes.length === 1) return route.abort("failed");
        data.profile.profile.relationshipGoal = body.relationshipGoal;
        return route.fulfill({ json: { success: true, data: data.profile } });
      }
      if (path === "/api/dashboard/opportunities/recompute" && request.method() === "POST") {
        writes.push({ path }); return route.fulfill({ json: recomputed });
      }
      assert.equal(request.method(), "GET", `unexpected write: ${request.method()} ${path}`);
      await route.fulfill({ json: { success: true, data: {} } });
    });
    await page.goto(`${origin}/app/contacts/dashboard`, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "概览", exact: true }).waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${output}/${name}-overview.png`, fullPage: true });
    await page.getByRole("button", { name: "编辑目标", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "编辑关系目标", exact: true });
    await dialog.getByRole("textbox", { name: "关系目标", exact: true }).fill("CRM:认识东京制造业伙伴");
    await dialog.getByRole("button", { name: "保存目标", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(await dialog.getByRole("textbox").inputValue(), "CRM:认识东京制造业伙伴");
    await dialog.getByRole("button", { name: "保存目标", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText("CRM:认识东京制造业伙伴", { exact: true }).waitFor();
    assert.deepEqual(writes[0], writes[1]);
    await page.getByRole("tab", { name: "结构", exact: true }).click();
    for (const dimension of ["industry", "location", "role", "relationship"]) {
      await page.locator(`[data-analysis-dimension="${dimension}"]`).click();
      const buckets = page.locator("button[data-analysis-bucket]");
      if (await buckets.count()) {
        await buckets.last().click();
        assert.equal(await buckets.last().getAttribute("aria-pressed"), "true");
        assert.ok((await page.locator("[data-analysis-detail]").getAttribute("href")).startsWith(`/app/contacts/analysis/${dimension}/`));
      }
    }
    await page.screenshot({ path: `${output}/${name}-structure.png`, fullPage: true });
    await page.getByRole("tab", { name: "机会", exact: true }).click();
    await page.getByRole("button", { name: "重算机会", exact: true }).click();
    await page.getByRole("button", { name: "重算机会", exact: true }).waitFor();
    await page.screenshot({ path: `${output}/${name}-opportunities.png`, fullPage: true });
    failRefresh = true;
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await page.locator('[data-orbit-real-page="contacts-analysis"]').getByRole("alert").waitFor();
    assert.ok(await page.locator("[data-analysis-opportunities]").isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto(`${origin}/app/contacts/graph`, { waitUntil: "networkidle" });
    assert.equal(await page.getByRole("tab", { name: "结构", exact: true }).getAttribute("aria-selected"), "true");
    await page.locator("[data-analysis-detail]").click();
    // Existing mock service explicitly has no group-detail fixtures; this verifies the product recovery boundary.
    await page.locator('[data-orbit-real-page="contacts-analysis"]').getByRole("alert").waitFor();
    await page.screenshot({ path: `${output}/${name}-detail-recovery.png`, fullPage: true });
    await page.getByRole("link", { name: "返回人脉结构", exact: true }).click();
    await page.getByRole("tab", { name: "结构", exact: true }).waitFor();
    if (name === "mobile") {
      await page.goto(`${origin}/app/contacts/all-actions`, { waitUntil: "networkidle" });
      const navigation = page.getByRole("navigation", { name: "人脉分区", exact: true });
      assert.equal(await navigation.locator('a[href="/app/contacts/dashboard"]').count(), 1);
      assert.equal(await navigation.locator('a[href="/app/contacts/graph"]').count(), 0);
    }
    assert.deepEqual(errors, []);
    console.log(`${name}: product tabs, four dimensions, goal retry, recompute, refresh retention and legacy/detail navigation passed`);
    await context.close();
  }
  const anonymous = await browser.newContext();
  const page = await anonymous.newPage();
  await page.goto(`${origin}/app/contacts/analysis/industry/technology_internet`, { waitUntil: "networkidle" });
  assert.ok(page.url().includes("/app/account/login"));
  for (const target of ["/app/contacts/graph?lang=en", "/app/contacts/dashboard?tab=opportunities&lang=ja"]) {
    await page.goto(`${origin}${target}`, { waitUntil: "networkidle" });
    assert.equal(new URL(page.url()).pathname, "/app/account/login");
    assert.equal(new URL(page.url()).searchParams.get("next"), target);
  }
  await anonymous.close();
  console.log(`Screenshots: ${output}`);
} finally { await browser.close(); }
