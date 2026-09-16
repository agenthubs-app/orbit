#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assessRequiredChecks,
  buildInventoryPlan,
  isKnownPlatformConsoleError,
  mainScreenStatus,
  parseJourneyArgs,
  readCredentialsFile,
  redactEvidence,
  routeRenderStatus,
} from "./phoneweb-journey-support.mjs";

for (const name of ["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"]) {
  process.env[name] = "";
}

const loginLabels = {
  email: /^(Email|邮箱|メールアドレス)$/u,
  password: /^(Password|密码|パスワード)$/u,
  submit: /^(Sign in|登录|ログイン)$/u,
};
const mainTabs = [
  { id: "home", label: /^(Home|首页|ホーム)$/u, path: "/home" },
  { id: "contacts", label: /^(People|人脉|つながり)$/u, path: "/contacts" },
  { id: "ai", label: /^IORBIT$/u, path: "/ai" },
  { id: "events", label: /^(Events|活动|イベント)$/u, path: "/events" },
  { id: "profile", label: /^(Me|我的|マイページ)$/u, path: "/profile" },
];
let activeJourneyStage = "idle";
let activeJourneyEvidence = {};
let activeLoginEvidence = {};

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function safeName(value) {
  return value.replace(/[^a-z0-9_-]+/giu, "-").replace(/^-|-$/gu, "").slice(0, 80) || "route";
}

function findMatchingRecord(value, predicate) {
  if (!value || typeof value !== "object") return null;
  if (!Array.isArray(value) && predicate(value)) return value;
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    const match = findMatchingRecord(item, predicate);
    if (match) return match;
  }
  return null;
}

function firstRecordInCollection(payload, collectionNames) {
  if (!payload || typeof payload !== "object") return null;
  for (const [key, value] of Object.entries(payload)) {
    if (collectionNames.includes(key) && Array.isArray(value)) {
      const record = value.find((item) => item && typeof item === "object" && typeof item.id === "string");
      if (record) return record;
    }
    const nested = firstRecordInCollection(value, collectionNames);
    if (nested) return nested;
  }
  return null;
}

async function authenticatedJson(page, path, init = {}) {
  return page.evaluate(async ({ path: requestPath, init: requestInit }) => {
    const response = await fetch(requestPath, {
      ...requestInit,
      credentials: "include",
      headers: { Accept: "application/json", ...(requestInit.headers ?? {}) },
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    return { ok: response.ok, payload, status: response.status };
  }, { path, init });
}

async function waitForApp(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("body").waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function login(page, baseUrl, credentials) {
  activeLoginEvidence = {};
  activeJourneyStage = "login-open";
  await page.goto(`${baseUrl}/account/login?next=${encodeURIComponent("/home")}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: loginLabels.email }).waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.getByRole("textbox", { name: loginLabels.email }).fill(credentials.email);
  await page.getByLabel(loginLabels.password).fill(credentials.password);
  activeLoginEvidence.inputsRetained = await page.getByRole("textbox", { name: loginLabels.email }).inputValue() === credentials.email
    && await page.getByLabel(loginLabels.password).inputValue() === credentials.password;
  const callbackResponse = page.waitForResponse((response) => response.url().includes("/api/auth/callback/") && response.request().method() === "POST", { timeout: 20_000 }).catch(() => null);
  activeJourneyStage = "login-submit";
  await page.getByRole("button", { name: loginLabels.submit }).click();
  activeJourneyStage = "login-redirect";
  await page.waitForFunction(() => !window.location.pathname.startsWith("/account/login"), null, { timeout: 20_000 });
  activeJourneyStage = "login-account-readback";
  let account = await authenticatedJson(page, "/api/account/me");
  for (let attempt = 0; !account.ok && attempt < 10; attempt += 1) {
    await page.waitForTimeout(250);
    account = await authenticatedJson(page, "/api/account/me");
  }
  const callback = await callbackResponse;
  activeLoginEvidence.callbackObserved = Boolean(callback);
  activeLoginEvidence.callbackStatus = callback?.status() ?? null;
  activeLoginEvidence.sessionStatus = account.status;
  if (!account.ok) throw new Error(`account/me returned HTTP ${account.status} after login.`);
  activeJourneyStage = "login-home";
  await page.goto(`${baseUrl}/home`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tablist").waitFor({ state: "visible", timeout: 20_000 });
}

async function verifyMainTabs(page, baseUrl, screenshotDir, engine, width, runtimeErrors) {
  const results = [];
  for (const tab of mainTabs) {
    const startedAt = new Date().toISOString();
    const errorCount = runtimeErrors.length;
    try {
      await page.goto(`${baseUrl}${tab.path}`, { waitUntil: "domcontentloaded" });
      await waitForApp(page);
      let selectedState = "true";
      if (tab.id === "ai") {
        await page.getByText(/^IORBIT$/u).first().waitFor({ state: "visible", timeout: 15_000 });
        await page.getByRole("textbox").last().waitFor({ state: "visible", timeout: 15_000 });
      } else {
        const selected = page.getByRole("tab", { name: tab.label });
        await selected.waitFor({ state: "visible", timeout: 15_000 });
        selectedState = await selected.getAttribute("aria-selected");
      }
      const alertCount = await page.locator('[role="alert"]:visible').count();
      const bodyText = await page.locator("body").innerText();
      const businessError = /(?:服务不可用|暂时无法加载|无法读取|unavailable|could not load|failed to load|利用できません|読み込めません)/iu.test(bodyText);
      const loading = await page.locator('[role="progressbar"]:visible, [data-testid*="loading"]:visible').count() > 0
        || /(?:Reading profile|正在读取|読み込み中)/iu.test(bodyText);
      const layout = await page.evaluate(() => ({
        bodyWidth: document.body.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      const screenshot = resolve(screenshotDir, `${engine}-${width}-${tab.id}.png`);
      await page.screenshot({ fullPage: true, path: screenshot });
      const overflow = Math.max(layout.bodyWidth, layout.documentWidth) > layout.innerWidth + 1;
      const newErrors = runtimeErrors.slice(errorCount);
      const pageErrorCount = newErrors.filter((item) => !item.knownPlatformDifference).length;
      const knownPlatformDifferenceCount = newErrors.filter((item) => item.knownPlatformDifference).length;
      results.push({
        detail: { alertCount, businessError, knownPlatformDifferenceCount, layout, loading, overflow, pageErrorCount, screenshot, selected: selectedState === "true" },
        id: `main-${engine}-${width}-${tab.id}`,
        required: true,
        startedAt,
        status: mainScreenStatus({ alertCount, businessError, loading, overflow, pageErrorCount, selected: selectedState === "true" }),
      });
    } catch (error) {
      const screenshot = resolve(screenshotDir, `${engine}-${width}-${tab.id}-failure.png`);
      await page.screenshot({ fullPage: true, path: screenshot }).catch(() => {});
      results.push({ detail: { errorHash: sha256(error instanceof Error ? error.message : String(error)), screenshot }, id: `main-${engine}-${width}-${tab.id}`, required: true, startedAt, status: "failed" });
    }
  }
  return results;
}

async function runNoteJourney(page, baseUrl) {
  activeJourneyEvidence = {};
  activeJourneyStage = "note-find-existing";
  const existingResponse = await authenticatedJson(page, "/api/notes");
  const existing = findMatchingRecord(existingResponse.payload, (item) => (
    typeof item.id === "string" && typeof item.title === "string" && item.title.startsWith("PW0003-")
  ));
  const marker = `PW0003-${Date.now().toString(36)}`;
  const title = existing?.title ?? `${marker}-note`;
  const body = existing?.body ?? `${marker}-body`;
  let failedOnce = false;
  const failFirstCreate = async (route) => {
    if (!failedOnce && route.request().method() === "POST") {
      failedOnce = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  };

  const titleField = page.getByLabel(/^(Note title|笔记标题|メモのタイトル)$/u);
  const bodyField = page.getByLabel(/^(Note body|笔记内容|メモ本文)$/u);
  let noteId = existing?.id;
  if (!noteId) {
    activeJourneyStage = "note-create-open";
    await page.goto(`${baseUrl}/notes/new`, { waitUntil: "domcontentloaded" });
    await titleField.fill(title);
    await bodyField.fill(body);
    await page.route("**/api/notes", failFirstCreate);
    await page.getByRole("button", { name: /^(Save note|保存笔记|メモを保存)$/u }).click();
    await page.getByRole("alert").waitFor({ state: "visible", timeout: 10_000 });
    if (await titleField.inputValue() !== title || await bodyField.inputValue() !== body) throw new Error("Failed note create did not retain the draft inputs.");
    await page.unroute("**/api/notes", failFirstCreate);
    activeJourneyStage = "note-create-retry";
    await page.getByRole("button", { name: /^(Save note|保存笔记|メモを保存)$/u }).click();
    await page.waitForURL(/\/notes\/[^/?#]+$/u, { timeout: 20_000 });
    noteId = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-1));
  }

  activeJourneyStage = "note-edit-open";
  await page.goto(`${baseUrl}/notes/${encodeURIComponent(noteId)}/edit`, { waitUntil: "domcontentloaded" });
  activeJourneyStage = "note-edit-wait-fields";
  await titleField.waitFor({ state: "visible", timeout: 15_000 });
  const editedTitle = `${title}-edited`;
  const editedBody = `${body}-edited`;
  let conflictRetried = false;
  let updateStatus = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await titleField.fill(editedTitle);
    await bodyField.fill(editedBody);
    activeJourneyStage = "note-edit-save";
    const updateResponse = page.waitForResponse((response) => decodeURIComponent(new URL(response.url()).pathname) === `/api/notes/${noteId}` && response.request().method() === "PATCH");
    await page.getByRole("button", { name: /^(Save changes|保存修改|変更を保存)$/u }).click();
    activeJourneyStage = "note-edit-await-response";
    const updated = await updateResponse;
    updateStatus = updated.status();
    activeJourneyEvidence.updateStatus = updateStatus;
    activeJourneyStage = "note-edit-check-response";
    if (updated.ok()) break;
    if (updateStatus !== 409 || attempt > 0) throw new Error(`Note edit returned HTTP ${updateStatus}.`);
    conflictRetried = true;
    activeJourneyStage = "note-edit-conflict-reload";
    await page.reload({ waitUntil: "domcontentloaded" });
    await titleField.waitFor({ state: "visible", timeout: 15_000 });
  }
  activeJourneyStage = "note-edit-refresh";
  await page.reload({ waitUntil: "domcontentloaded" });
  await titleField.waitFor({ state: "visible", timeout: 15_000 });
  if (await titleField.inputValue() !== editedTitle || await bodyField.inputValue() !== editedBody) throw new Error("Edited note did not survive refresh.");

  activeJourneyStage = "note-edit-readback";
  const readback = await authenticatedJson(page, `/api/notes/${encodeURIComponent(noteId)}`);
  const record = findMatchingRecord(readback.payload, (item) => item.id === noteId) ?? readback.payload;
  return {
    bodySha256: sha256(record?.body ?? editedBody),
    conflictRetried,
    creationPath: existing ? "existing-pw0003-record" : "new-note-ui-with-controlled-retry",
    failureRetainedInputs: existing ? null : failedOnce,
    noteId,
    status: readback.status,
    titleSha256: sha256(record?.title ?? editedTitle),
    version: typeof record?.version === "number" ? record.version : null,
  };
}

async function runTaskJourney(page, baseUrl) {
  const title = `PW0003-task-${Date.now().toString(36)}`;
  await page.goto(`${baseUrl}/today`, { waitUntil: "domcontentloaded" });
  const input = page.getByLabel(/^(Add task|添加待办|タスクを追加)$/u);
  await waitForApp(page);
  let payload;
  let creationPath;
  if (await input.isVisible().catch(() => false)) {
    const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/tasks") && response.request().method() === "POST");
    await input.fill(title);
    await input.press("Enter");
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`Task create returned HTTP ${response.status()}.`);
    payload = await response.json();
    creationPath = "today-ui";
  } else {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      day: "2-digit", month: "2-digit", timeZone: "Asia/Tokyo", year: "numeric",
    }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    const response = await authenticatedJson(page, "/api/tasks", {
      body: JSON.stringify({
        category: "other",
        idempotencyKey: `phoneweb-c:create-task:${Date.now()}`,
        plannedDate: `${parts.year}-${parts.month}-${parts.day}`,
        title,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw new Error(`Task API fallback returned HTTP ${response.status}.`);
    payload = response.payload;
    creationPath = "authenticated-formal-api";
  }
  const record = findMatchingRecord(payload, (item) => item.title === title && typeof item.id === "string");
  const taskId = record?.id;
  if (!taskId) throw new Error("Task create response did not confirm an id.");
  await page.goto(`${baseUrl}/tasks`, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  const checkbox = page.getByRole("checkbox", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u") });
  await checkbox.waitFor({ state: "visible", timeout: 15_000 });
  const completeResponse = page.waitForResponse((item) => item.url().endsWith(`/api/tasks/${encodeURIComponent(taskId)}`) && item.request().method() === "PATCH");
  await checkbox.click();
  const completed = await completeResponse;
  if (!completed.ok()) throw new Error(`Task completion returned HTTP ${completed.status()}.`);
  await page.goto(`${baseUrl}/tasks/${encodeURIComponent(taskId)}`, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  const readback = await authenticatedJson(page, `/api/tasks/${encodeURIComponent(taskId)}`);
  const current = findMatchingRecord(readback.payload, (item) => item.id === taskId) ?? readback.payload;
  return { creationPath, status: current?.status ?? null, taskId, titleSha256: sha256(title) };
}

async function runContactJourney(page, baseUrl) {
  activeJourneyEvidence = {};
  activeJourneyStage = "contact-find-existing";
  let list = await authenticatedJson(page, "/api/contacts");
  let contact = findMatchingRecord(list.payload, (item) => (
    typeof item.id === "string" && typeof item.displayName === "string" && item.displayName.startsWith("PW0003-")
  ));
  let creationPath = "existing-pw0003-record";
  if (!contact) {
    activeJourneyStage = "contact-create-candidate";
    const marker = `PW0003-${Date.now().toString(36)}`;
    await page.goto(`${baseUrl}/contacts/new?mode=manual`, { waitUntil: "domcontentloaded" });
    activeJourneyStage = "contact-create-wait-app";
    await waitForApp(page);
    activeJourneyStage = "contact-create-select-manual";
    activeJourneyEvidence.currentPath = new URL(page.url()).pathname;
    activeJourneyEvidence.manualTextCount = await page.getByText("手动", { exact: true }).count();
    const manualTab = page.getByText("手动", { exact: true });
    await manualTab.waitFor({ state: "visible", timeout: 15_000 });
    await manualTab.click();
    activeJourneyStage = "contact-create-fill-name";
    await page.getByPlaceholder("例如：王小雨").fill(marker);
    activeJourneyStage = "contact-create-fill-company";
    await page.getByPlaceholder("例如：Orbit").fill("Orbit PW0003");
    activeJourneyStage = "contact-create-fill-role";
    await page.getByPlaceholder("例如：市场负责人").fill("Journey contact");
    activeJourneyStage = "contact-create-submit";
    await page.getByText(/^(Generate review candidate|生成待确认候选|確認候補を生成)$/u).click();
    activeJourneyStage = "contact-confirm-candidate";
    const confirm = page.getByRole("button", { name: /^确认候选$/u });
    await confirm.waitFor({ state: "visible", timeout: 20_000 });
    await confirm.click();
    await page.getByRole("button", { name: /^打开联系人$/u }).waitFor({ state: "visible", timeout: 20_000 });
    list = await authenticatedJson(page, "/api/contacts");
    contact = findMatchingRecord(list.payload, (item) => item.displayName === marker && typeof item.id === "string");
    creationPath = "manual-ui-candidate-confirm";
  }
  if (!contact?.id) throw new Error("Contact creation did not produce a readable contact id.");

  activeJourneyStage = "contact-edit-open";
  await page.goto(`${baseUrl}/contacts/${encodeURIComponent(contact.id)}`, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  await page.getByRole("button", { name: /^(Edit details|编辑资料|プロフィールを編集)$/u }).click();
  const tag = page.getByLabel(/^(Add tag|添加标签|タグを追加)$/u);
  await tag.waitFor({ state: "visible", timeout: 15_000 });
  if (await page.getByText(/^PW0003$/u).count() === 0) {
    await tag.fill("PW0003");
    await page.getByRole("button", { name: /^(Add this tag|添加此标签|このタグを追加)$/u }).click();
  }
  activeJourneyStage = "contact-edit-save";
  await page.getByRole("button", { name: /^(Save|保存)$/u }).click();
  await page.getByRole("button", { name: /^(Edit details|编辑资料|プロフィールを編集)$/u }).waitFor({ state: "visible", timeout: 20_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApp(page);
  if (await page.getByText(/^PW0003$/u).count() === 0) throw new Error("Edited contact tag did not survive refresh.");
  return { contactId: contact.id, creationPath, tagSha256: sha256("PW0003") };
}

async function runProfileJourney(page, baseUrl) {
  activeJourneyStage = "profile-edit-open";
  await page.goto(`${baseUrl}/profile/edit`, { waitUntil: "domcontentloaded" });
  const role = page.getByLabel(/^(Role|职位|役職)$/u);
  await role.waitFor({ state: "visible", timeout: 20_000 });
  const value = "PW0003 profile";
  await role.fill(value);
  activeJourneyStage = "profile-edit-save";
  await page.getByRole("button", { name: /^(Save profile|保存资料|プロフィールを保存)$/u }).click();
  await page.waitForURL(/\/profile$/u, { timeout: 20_000 });
  activeJourneyStage = "profile-edit-refresh";
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApp(page);
  const readback = await authenticatedJson(page, "/api/profile");
  const profile = findMatchingRecord(readback.payload, (item) => item.role === value) ?? readback.payload;
  if (profile?.role !== value && !findMatchingRecord(readback.payload, (item) => item.role === value)) {
    throw new Error("Edited profile role did not survive refresh.");
  }
  return { roleSha256: sha256(value), status: readback.status };
}

async function discoverRouteSamples(page, created) {
  const endpoints = [
    ["contacts", "/api/contacts", ["contacts"]],
    ["events", "/api/events/public", ["events"]],
    ["ai", "/api/ai/conversations", ["conversations", "items"]],
    ["chat", "/api/chat/conversations", ["conversations", "items"]],
    ["inbox", "/api/chat/relationship-inbox", ["conversations", "threads", "items"]],
    ["notifications", "/api/notifications", ["notifications", "items"]],
    ["sources", "/api/relationship-signals/email-calendar", ["sources", "items"]],
    ["appointments", "/api/appointments", ["appointments", "items"]],
    ["schedule", "/api/schedule-items", ["items", "scheduleItems"]],
    ["drafts", "/api/contact-drafts", ["drafts", "items"]],
    ["profile", "/api/profile", ["profiles", "items"]],
  ];
  const records = {};
  for (const [name, path, collections] of endpoints) {
    const response = await authenticatedJson(page, path);
    if (response.ok) records[name] = firstRecordInCollection(response.payload, collections) ?? response.payload;
  }
  const activeAi = findMatchingRecord(records.ai, (item) => typeof item.activeConversationId === "string");
  return {
    aiConversationId: records.ai?.id ?? records.ai?.conversationId ?? activeAi?.activeConversationId,
    appointmentId: records.appointments?.id,
    chatConversationId: records.chat?.id,
    contactDraftBatchId: records.drafts?.batchId ?? records.drafts?.id,
    contactId: records.contacts?.id,
    eventId: records.events?.id,
    inboxConversationId: records.inbox?.id,
    inboxSourceId: records.sources?.id,
    legacyPath: "/app/home",
    noteId: created.noteId,
    notificationId: records.notifications?.id,
    organizerSlug: records.events?.organizerSlug ?? records.profile?.organizerSlug ?? records.profile?.slug,
    personalScheduleId: records.schedule?.id,
    registrationCode: records.events?.registrationCode,
    taskId: created.taskId,
  };
}

async function inspectInventory(page, baseUrl, markdown, samples, runtimeErrors, screenshotDir) {
  const plan = buildInventoryPlan(markdown, samples);
  const results = [];
  for (const item of plan) {
    if (item.status !== "ready") {
      results.push({ route: item.route, status: item.status, missing: item.missing });
      continue;
    }
    const errorCount = runtimeErrors.length;
    try {
      const response = await page.goto(`${baseUrl}${item.path}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await waitForApp(page);
      const bodyVisible = await page.locator("body").isVisible();
      const bodyText = await page.locator("body").innerText();
      const bodyLength = bodyText.trim().length;
      const businessError = /(?:服务不可用|暂时无法加载|无法读取|无权|未授权|unavailable|could not load|failed to load|forbidden|unauthorized|not found|利用できません|読み込めません|権限がありません|見つかりません)/iu.test(bodyText);
      const loading = await page.locator('[role="progressbar"]:visible, [data-testid*="loading"]:visible').count() > 0
        || /(?:Reading profile|正在读取|読み込み中)/iu.test(bodyText);
      const pathEvidence = item.route.includes("[") ? { pathHash: sha256(item.path) } : { path: item.path };
      const newErrors = runtimeErrors.slice(errorCount);
      const runtimeErrorCount = newErrors.filter((entry) => !entry.knownPlatformDifference).length;
      const finalPath = new URL(page.url()).pathname;
      const redirectedToLogin = item.path !== "/account/login" && finalPath.startsWith("/account/login");
      results.push({
        bodyVisible,
        businessError,
        finalPath: item.route.includes("[") ? undefined : finalPath,
        httpStatus: response?.status() ?? null,
        knownPlatformDifferenceCount: newErrors.filter((item) => item.knownPlatformDifference).length,
        loading,
        redirectedToLogin,
        runtimeErrorCount,
        ...pathEvidence,
        route: item.route,
        status: routeRenderStatus({ bodyLength, bodyVisible, businessError, httpStatus: response?.status() ?? null, loading, redirectedToLogin, runtimeErrorCount }),
      });
    } catch (error) {
      const screenshot = resolve(screenshotDir, `route-failure-${safeName(item.route)}.png`);
      await page.screenshot({ fullPage: true, path: screenshot }).catch(() => {});
      const pathEvidence = item.route.includes("[") ? { pathHash: sha256(item.path) } : { path: item.path };
      results.push({ route: item.route, ...pathEvidence, screenshot, status: "failed", errorHash: sha256(error instanceof Error ? error.message : String(error)) });
    }
  }
  return results;
}

async function logout(page, baseUrl) {
  await page.goto(`${baseUrl}/account`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^(Sign out|退出登录|ログアウト)$/u }).click();
  await page.waitForTimeout(500);
  const account = await authenticatedJson(page, "/api/account/me");
  if (account.status !== 401) throw new Error(`account/me returned ${account.status} after logout.`);
}

async function main() {
  const options = parseJourneyArgs(process.argv.slice(2));
  const credentials = await readCredentialsFile(resolve(options.credentialsFile));
  const evidenceDir = resolve(options.evidenceDir);
  const screenshotDir = resolve(evidenceDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });
  const inventoryMarkdown = await readFile(resolve(options.inventoryFile), "utf8");
  const evidencePath = resolve(evidenceDir, "journey-results.json");
  const evidence = {
    baseUrl: options.baseUrl,
    completedAt: null,
    results: [],
    routeInventory: [],
    startedAt: new Date().toISOString(),
  };
  const flush = async () => writeFile(evidencePath, `${JSON.stringify(redactEvidence(evidence), null, 2)}\n`, { mode: 0o600 });
  const record = async (result) => { evidence.results.push(result); await flush(); };

  const health = await fetch(`${options.baseUrl}/api/health`, { headers: { Accept: "application/json" } }).catch(() => null);
  await record({ id: "health", required: true, status: health?.ok ? "passed" : "failed", detail: { httpStatus: health?.status ?? null } });

  const playwright = await import("playwright");
  let primaryPage = null;
  let primaryContext = null;
  let primaryBrowser = null;
  const browsers = [];
  const widths = [390, ...options.widths.filter((width) => width !== 390)];

  try {
    for (const engine of options.browsers) {
      let browser;
      try {
        browser = await playwright[engine].launch({ headless: true });
        browsers.push(browser);
        await record({ id: `engine-${engine}`, required: true, status: "passed" });
      } catch (error) {
        await record({ id: `engine-${engine}`, required: true, status: "failed", detail: { errorHash: sha256(error instanceof Error ? error.message : String(error)) } });
        continue;
      }

      let engineStorageState = null;
      const engineWidths = options.scope === "all" && engine !== "webkit" ? widths : [390];
      for (const width of engineWidths) {
        const context = await browser.newContext({
          ...(engineStorageState ? { storageState: engineStorageState } : {}),
          viewport: { height: 844, width },
        });
        const page = await context.newPage();
        const runtimeErrors = [];
        page.on("console", (message) => {
          if (message.type() !== "error") return;
          const text = message.text();
          runtimeErrors.push({
            hash: sha256(text),
            kind: "console",
            knownPlatformDifference: isKnownPlatformConsoleError(engine, text),
          });
        });
        page.on("pageerror", (error) => runtimeErrors.push({ hash: sha256(error.message), kind: "pageerror", knownPlatformDifference: false }));

        if (!engineStorageState) {
          try {
            await login(page, options.baseUrl, credentials);
            engineStorageState = await context.storageState();
            await record({ id: `login-${engine}`, required: true, status: "passed", detail: activeLoginEvidence });
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.getByRole("tablist").waitFor({ state: "visible", timeout: 15_000 });
            await record({ id: `session-refresh-${engine}`, required: true, status: "passed" });
          } catch (error) {
            await record({ id: `login-${engine}`, required: true, status: "failed", detail: { ...activeLoginEvidence, errorHash: sha256(error instanceof Error ? error.message : String(error)), stage: activeJourneyStage } });
            await context.close();
            break;
          }
        }

        if (options.scope === "login") {
          await context.close();
          continue;
        }

        if (options.scope === "all") {
        for (const result of await verifyMainTabs(page, options.baseUrl, screenshotDir, engine, width, runtimeErrors)) await record(result);
        }

        if (engine === "chromium" && width === 390 && !primaryPage) {
          primaryPage = page;
          primaryContext = context;
          primaryBrowser = browser;
          let note = null;
          let task = null;
          let contact = null;
          if (options.scope !== "contact") {
            try { note = await runNoteJourney(page, options.baseUrl); await record({ id: "note-create-edit-refresh", required: true, status: "passed", detail: note }); }
            catch (error) { await record({ id: "note-create-edit-refresh", required: true, status: "failed", detail: { ...activeJourneyEvidence, errorHash: sha256(error instanceof Error ? error.message : String(error)), stage: activeJourneyStage } }); }
          }
          if (!["note-contact", "contact"].includes(options.scope)) {
            try { task = await runTaskJourney(page, options.baseUrl); await record({ id: "task-create-complete-refresh", required: true, status: "passed", detail: task }); }
            catch (error) { await record({ id: "task-create-complete-refresh", required: true, status: "failed", detail: { errorHash: sha256(error instanceof Error ? error.message : String(error)) } }); }
          }
          try { contact = await runContactJourney(page, options.baseUrl); await record({ id: "contact-create-edit-refresh", required: true, status: "passed", detail: contact }); }
          catch (error) { await record({ id: "contact-create-edit-refresh", required: true, status: "failed", detail: { ...activeJourneyEvidence, errorHash: sha256(error instanceof Error ? error.message : String(error)), stage: activeJourneyStage } }); }
          if (!["note-contact", "contact"].includes(options.scope)) {
            try { const profile = await runProfileJourney(page, options.baseUrl); await record({ id: "profile-edit-refresh", required: true, status: "passed", detail: profile }); }
            catch (error) { await record({ id: "profile-edit-refresh", required: true, status: "failed", detail: { errorHash: sha256(error instanceof Error ? error.message : String(error)), stage: activeJourneyStage } }); }
          }
          if (options.scope === "all") {
            const samples = await discoverRouteSamples(page, { noteId: note?.noteId, taskId: task?.taskId });
            evidence.routeInventory = await inspectInventory(page, options.baseUrl, inventoryMarkdown, samples, runtimeErrors, screenshotDir);
            await record({
              detail: {
                counts: evidence.routeInventory.reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }), {}),
                total: evidence.routeInventory.length,
              },
              id: "route-inventory-recorded",
              required: true,
              status: evidence.routeInventory.length === 81 ? "passed" : "failed",
            });
          }
        } else {
          await context.close();
        }
      }
    }

    if (primaryPage) {
      try { await logout(primaryPage, options.baseUrl); await record({ id: "logout", required: true, status: "passed" }); }
      catch (error) { await record({ id: "logout", required: true, status: "failed", detail: { errorHash: sha256(error instanceof Error ? error.message : String(error)) } }); }
    }
  } finally {
    if (primaryContext) await primaryContext.close().catch(() => {});
    for (const browser of browsers) await browser.close().catch(() => {});
  }

  evidence.completedAt = new Date().toISOString();
  const summary = assessRequiredChecks(evidence.results);
  evidence.summary = { counts: summary.counts, failedRequiredIds: summary.failedRequiredIds };
  await flush();
  process.stdout.write(`${JSON.stringify({ evidencePath, ...evidence.summary })}\n`);
  process.exitCode = summary.exitCode;
}

main().catch(async (error) => {
  process.stderr.write(`phoneweb journey failed before completion (${sha256(error instanceof Error ? error.message : String(error))}).\n`);
  process.exitCode = 1;
});
