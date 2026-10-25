import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkIntegration,
  integrationAction,
  integrationStatus,
  listIntegrations,
  revokeIntegration,
} from "../../app/(app)/app/orbit-2026/account/integrations-api";

const root = join(fileURLToPath(import.meta.url), "../../..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

test("integration states distinguish preparing, connected and action required", () => {
  assert.equal(integrationStatus(undefined), "preparing");
  assert.equal(integrationStatus({ status: "unavailable", healthStatus: "unavailable" }), "preparing");
  assert.equal(integrationStatus({ status: "pending", healthStatus: "action_required" }), "disconnected");
  assert.equal(integrationAction("google_calendar", "disconnected"), "connect");
  assert.equal(integrationStatus({ status: "active", healthStatus: "healthy" }), "connected");
  assert.equal(integrationStatus({ status: "active", healthStatus: "action_required" }), "action_required");
  assert.equal(integrationStatus({ status: "expired", healthStatus: "not_checked" }), "action_required");
  assert.equal(integrationAction("gmail", "connected"), "manage");
  assert.equal(integrationAction("gmail", "preparing"), "none");
});

test("integration list uses the existing API and rejects malformed responses", async () => {
  const calls: string[] = [];
  const fetcher = async (url: string) => {
    calls.push(url);
    return { ok: true, json: async () => ({ data: [{ provider: "gmail", status: "active", healthStatus: "healthy" }] }) } as Response;
  };
  const records = await listIntegrations(fetcher);
  assert.deepEqual(calls, ["/api/integrations"]);
  assert.equal(records[0]?.provider, "gmail");
  await assert.rejects(() => listIntegrations(async () => ({ ok: true, json: async () => ({ data: {} }) }) as Response));
});

test("health and confirmed disconnect use existing provider routes", async () => {
  const calls: { url: string; method?: string }[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method });
    return { ok: true } as Response;
  };
  await checkIntegration("gmail", fetcher);
  await revokeIntegration("gmail", fetcher);
  assert.deepEqual(calls, [
    { url: "/api/integrations/gmail/health", method: "POST" },
    { url: "/api/integrations/gmail", method: "DELETE" },
  ]);
  await assert.rejects(() => revokeIntegration("gmail", async () => ({ ok: false, status: 503 }) as Response));
});

test("secondary routes and memory controls are wired without a Google Contacts action", () => {
  for (const page of ["integrations", "iorbit", "appearance"]) {
    const route = source(`app/(app)/app/settings/${page}/page.tsx`);
    assert.match(route, /AccountLayout/);
    assert.match(route, new RegExp(`active="${page}"`));
  }
  const integrations = source("app/(app)/app/orbit-2026/account/IntegrationsSettings.tsx");
  assert.match(integrations, /contactsName/);
  assert.doesNotMatch(integrations, /google_contacts.*authorize/);
  const iorbit = source("app/(app)/app/orbit-2026/account/IorbitSettings.tsx");
  assert.match(iorbit, /\/api\/agent\/memory/);
  assert.match(iorbit, /writeSemanticPreference/);
  assert.match(iorbit, /profileBioWithinLimit/);
  assert.match(iorbit, /language === "ja"/);
  assert.match(iorbit, /draftJapaneseUnavailable/);
  const appearance = source("app/(app)/app/orbit-2026/account/AppearanceSettings.tsx");
  assert.match(appearance, /setOrbitThemePreference/);
  assert.match(appearance, /setLanguage/);
});
