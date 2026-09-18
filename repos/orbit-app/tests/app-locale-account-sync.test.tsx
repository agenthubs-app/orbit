import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

let browser: Browser;
let script: string;

const fixture = `
import React, { useSyncExternalStore } from "react";
let revision = 0;
const listeners = new Set();
const foregroundListeners = new Set();
const state = window.fixture = {
  actorId: "actor:one",
  baseUrl: "https://orbit.example",
  cookieHeader: "session=one",
  locales: [{ languageCode: "en", languageTag: "en-US" }],
  ready: true,
  requests: [],
  signedIn: true,
  update(patch) { Object.assign(state, patch); revision += 1; listeners.forEach(listener => listener()); },
  release(index, result) { state.requests[index].resolve(result); },
  foreground() { foregroundListeners.forEach(listener => listener("active")); }
};
export function useFixture() {
  useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision);
  return state;
}
export function useOrbitApiBaseUrl() { useFixture(); return { baseUrl: state.baseUrl, ready: state.ready }; }
export function useOrbitAuthSession() { useFixture(); return { accountId: state.signedIn ? state.actorId : null, actorId: state.signedIn ? state.actorId : null, cookieHeader: state.cookieHeader, ready: state.ready, signedIn: state.signedIn, user: state.signedIn ? { id: state.actorId } : null }; }
export function useOrbitApiClient() { useFixture(); return state.client; }
export function getLocales() { return state.locales; }
export const Platform = { OS: "web" };
export const AppState = { addEventListener(_name, listener) { foregroundListeners.add(listener); return { remove() { foregroundListeners.delete(listener); } }; } };
state.client = {
  get(path, options) { return new Promise(resolve => state.requests.push({ kind: "get", path, options, resolve })); },
  put(path, options) { return new Promise(resolve => state.requests.push({ kind: "put", path, options, resolve })); }
};
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React, { useState } from "react"; import { createRoot } from "react-dom/client"; import { OrbitLocaleProvider, useOrbitLocale } from "./src/i18n/OrbitLocaleProvider"; import { useFixture } from "fixture";
function Probe() { const locale = useOrbitLocale(); const fixture = useFixture(); const [draft, setDraft] = useState("unfinished draft"); fixture.locale = locale; return <><output>{JSON.stringify({ language: locale.language, source: locale.source, syncState: locale.syncState, error: locale.error, preference: locale.preference })}</output><input aria-label="draft" value={draft} onChange={event => setDraft(event.target.value)} /><button onClick={() => void locale.setLanguage("ja")}>ja</button><button onClick={() => void locale.setLanguage("en")}>en</button><button onClick={() => void locale.setLanguage("system")}>system</button><button onClick={() => void locale.retryLanguageSave()}>retry</button></>; }
createRoot(document.getElementById("root")).render(<OrbitLocaleProvider><Probe /></OrbitLocaleProvider>);`,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    format: "iife",
    jsx: "automatic",
    plugins: [{
      name: "locale-provider-fixture",
      setup(plugin) {
        plugin.onResolve({ filter: /^fixture$|^expo-localization$|^react-native$|\/(ApiBaseUrlProvider|AuthSessionProvider|useOrbitApiClient)$/ }, () => ({ path: "fixture", namespace: "locale" }));
        plugin.onLoad({ filter: /.*/, namespace: "locale" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
    write: false,
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => browser?.close());

async function open(t: { after(fn: () => Promise<void>): void }): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultTimeout(1_800);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  return page;
}

async function locale(page: Page) {
  return JSON.parse((await page.locator("output").textContent())!);
}

test("system follows the device, manual account preference wins, and business drafts survive", async t => {
  const page = await open(t);
  await page.evaluate(() => (window as any).fixture.release(0, {
    success: true,
    status: 200,
    data: { mode: "system", language: null, updatedAt: null },
  }));
  await page.waitForFunction(() => (window as any).fixture.locale?.syncState === "idle");
  assert.deepEqual(await locale(page), {
    language: "en",
    source: "device",
    syncState: "idle",
    error: null,
    preference: { mode: "system", language: null, updatedAt: null },
  });
  await page.getByLabel("draft").fill("林悦 / Hoshino unchanged");
  await page.getByRole("button", { name: "ja" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  assert.equal((await locale(page)).language, "ja");
  assert.equal((await locale(page)).source, "session-unsynced");
  const request = await page.evaluate(() => (window as any).fixture.requests[1].options.body);
  assert.deepEqual(request, {
    mode: "manual",
    language: "ja",
    expectedUpdatedAt: null,
    mutationId: request.mutationId,
  });
  await page.evaluate(() => {
    const body = (window as any).fixture.requests[1].options.body;
    (window as any).fixture.release(1, {
      success: true,
      status: 200,
      data: { mode: "manual", language: "ja", mutationId: body.mutationId, updatedAt: "2026-09-15T05:00:00.000Z" },
    });
  });
  await page.waitForFunction(() => (window as any).fixture.locale?.source === "account");
  assert.equal(await page.getByLabel("draft").inputValue(), "林悦 / Hoshino unchanged");
  await page.evaluate(() => {
    (window as any).fixture.locales = [{ languageCode: "zh", languageTag: "zh-Hans" }];
    (window as any).fixture.foreground();
  });
  await page.waitForFunction(() => (window as any).fixture.requests.length === 3);
  assert.equal((await locale(page)).language, "ja", "device changes cannot replace a manual account preference");
});

test("a late old-account GET cannot publish after an account switch", async t => {
  const page = await open(t);
  await page.evaluate(() => (window as any).fixture.update({ actorId: "actor:two", cookieHeader: "session=two" }));
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  await page.evaluate(() => (window as any).fixture.release(0, {
    success: true,
    status: 200,
    data: { mode: "manual", language: "ja", updatedAt: "2026-09-15T05:00:00.000Z" },
  }));
  await page.evaluate(() => (window as any).fixture.release(1, {
    success: true,
    status: 200,
    data: { mode: "manual", language: "en", updatedAt: "2026-09-15T05:01:00.000Z" },
  }));
  await page.waitForFunction(() => (window as any).fixture.locale?.source === "account");
  assert.equal((await locale(page)).language, "en");
});

test("device B reads device A's saved account preference from the server", async t => {
  const deviceA = await open(t);
  await deviceA.evaluate(() => (window as any).fixture.release(0, {
    success: true,
    status: 200,
    data: { mode: "system", language: null, updatedAt: null },
  }));
  await deviceA.waitForFunction(() => (window as any).fixture.locale?.syncState === "idle");
  await deviceA.getByRole("button", { name: "ja" }).click();
  await deviceA.waitForFunction(() => (window as any).fixture.requests.length === 2);
  const saved = await deviceA.evaluate(() => {
    const body = (window as any).fixture.requests[1].options.body;
    const preference = {
      mode: "manual",
      language: "ja",
      mutationId: body.mutationId,
      updatedAt: "2026-09-15T05:05:00.000Z",
    };
    (window as any).fixture.release(1, { success: true, status: 200, data: preference });
    return preference;
  });
  await deviceA.waitForFunction(() => (window as any).fixture.locale?.source === "account");

  const serverPreference = {
    mode: saved.mode,
    language: saved.language,
    updatedAt: saved.updatedAt,
  };
  const deviceB = await open(t);
  await deviceB.evaluate(preference => {
    (window as any).fixture.locales = [{ languageCode: "en", languageTag: "en-US" }];
    (window as any).fixture.release(0, { success: true, status: 200, data: preference });
  }, serverPreference);
  await deviceB.waitForFunction(() => (window as any).fixture.locale?.source === "account");
  assert.deepEqual(await locale(deviceB), {
    language: "ja",
    source: "account",
    syncState: "idle",
    error: null,
    preference: serverPreference,
  });
});

test("an unknown save result keeps the selection and retries the exact mutation", async t => {
  const page = await open(t);
  await page.evaluate(() => (window as any).fixture.release(0, {
    success: true,
    status: 200,
    data: { mode: "system", language: null, updatedAt: null },
  }));
  await page.waitForFunction(() => (window as any).fixture.locale?.syncState === "idle");
  await page.getByRole("button", { name: "ja" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  const first = await page.evaluate(() => (window as any).fixture.requests[1].options.body);
  await page.evaluate(() => (window as any).fixture.release(1, {
    success: false,
    status: 503,
    error: { code: "SERVICE_UNAVAILABLE", message: "unavailable" },
  }));
  await page.waitForFunction(() => (window as any).fixture.locale?.syncState === "error");
  assert.equal((await locale(page)).language, "ja");
  await page.getByRole("button", { name: "retry" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 3);
  const retry = await page.evaluate(() => (window as any).fixture.requests[2].options.body);
  assert.deepEqual(retry, first);
});

test("a second rapid choice accepts only its own receipt and preserves the draft", async t => {
  const page = await open(t);
  await page.evaluate(() => (window as any).fixture.release(0, {
    success: true,
    status: 200,
    data: { mode: "system", language: null, updatedAt: null },
  }));
  await page.waitForFunction(() => (window as any).fixture.locale?.syncState === "idle");
  await page.getByLabel("draft").fill("keep this while switching");
  await page.getByRole("button", { name: "ja" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  await page.getByRole("button", { name: "en" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 3);
  await page.evaluate(() => {
    const stale = (window as any).fixture.requests[1].options.body;
    const current = (window as any).fixture.requests[2].options.body;
    (window as any).fixture.release(1, {
      success: true,
      status: 200,
      data: { mode: "manual", language: "ja", mutationId: stale.mutationId, updatedAt: "2026-09-15T05:10:00.000Z" },
    });
    (window as any).fixture.release(2, {
      success: true,
      status: 200,
      data: { mode: "manual", language: "en", mutationId: current.mutationId, updatedAt: "2026-09-15T05:10:00.001Z" },
    });
  });
  await page.waitForFunction(() => (window as any).fixture.locale?.source === "account");
  assert.equal((await locale(page)).language, "en");
  assert.equal(await page.getByLabel("draft").inputValue(), "keep this while switching");
});

test("the first choice after an account switch can be confirmed in the new scope", async t => {
  const page = await open(t);
  await page.evaluate(() => (window as any).fixture.update({ actorId: "actor:two", cookieHeader: "session=two" }));
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  await page.evaluate(() => (window as any).fixture.release(1, {
    success: true,
    status: 200,
    data: { mode: "system", language: null, updatedAt: null },
  }));
  await page.waitForFunction(() => (window as any).fixture.locale?.syncState === "idle");
  await page.getByRole("button", { name: "ja" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 3);
  await page.evaluate(() => {
    const body = (window as any).fixture.requests[2].options.body;
    (window as any).fixture.release(2, {
      success: true,
      status: 200,
      data: { mode: "manual", language: "ja", mutationId: body.mutationId, updatedAt: "2026-09-15T05:11:00.000Z" },
    });
  });
  await page.waitForFunction(() => (window as any).fixture.locale?.source === "account");
  assert.equal((await locale(page)).language, "ja");
});

test("a version conflict refreshes server truth and retries the latest choice", async t => {
  const page = await open(t);
  await page.evaluate(() => (window as any).fixture.release(0, {
    success: true,
    status: 200,
    data: { mode: "system", language: null, updatedAt: null },
  }));
  await page.waitForFunction(() => (window as any).fixture.locale?.syncState === "idle");
  await page.getByRole("button", { name: "ja" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  await page.evaluate(() => (window as any).fixture.release(1, {
    success: false,
    status: 409,
    error: { code: "CONFLICT", message: "conflict" },
  }));
  await page.waitForFunction(() => (window as any).fixture.requests.length === 3);
  await page.evaluate(() => (window as any).fixture.release(2, {
    success: true,
    status: 200,
    data: { mode: "manual", language: "en", updatedAt: "2026-09-15T05:20:00.000Z" },
  }));
  await page.waitForFunction(() => (window as any).fixture.requests.length === 4);
  const retry = await page.evaluate(() => (window as any).fixture.requests[3].options.body);
  assert.equal(retry.mode, "manual");
  assert.equal(retry.language, "ja");
  assert.equal(retry.expectedUpdatedAt, "2026-09-15T05:20:00.000Z");
  await page.evaluate(() => {
    const body = (window as any).fixture.requests[3].options.body;
    (window as any).fixture.release(3, {
      success: true,
      status: 200,
      data: { mode: "manual", language: "ja", mutationId: body.mutationId, updatedAt: "2026-09-15T05:20:00.001Z" },
    });
  });
  await page.waitForFunction(() => (window as any).fixture.locale?.source === "account");
  assert.equal((await locale(page)).language, "ja");
});
