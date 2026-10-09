import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { Platform } from "react-native";
import { renderToHtml } from "./helpers/render";
import type { ContactPipelinePageContract } from "../src/api/contract/contact-pipeline-page";

const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
let pipelineStateOverride: unknown = null;
let localContactsOverride: unknown = null;
// Keep the screen, stage mapping and native-web rendering real; replace only
// navigation, device/account state and HTTP reads. No business service is called.
loader._load = (name, ...args) => {
  if (name === "@expo/vector-icons") return { Ionicons: () => null };
  if (name === "expo-router") return {
    useRouter: () => ({ push() {}, back() {}, replace() {}, canGoBack: () => false }),
    usePathname: () => "/contacts/pipeline"
  };
  if (name.endsWith("/api/ApiBaseUrlProvider")) return { useOrbitApiBaseUrl: () => ({ baseUrl: "https://orbit.test" }) };
  if (name.endsWith("/hooks/useOrbitApiClient")) return { useOrbitApiClient: () => ({}) };
  if (name.endsWith("/hooks/useRelationshipInboxBadgeCount")) return { useRelationshipInboxBadgeCount: () => 0 };
  if (name.endsWith("/hooks/useContactPipelinePages")) return {
    useContactPipelinePages: (stage: string) => ({
      state: pipelineStateOverride ?? { kind: "success", refreshing: false, refresh() {}, data: null, meta: { featureMode: "live", privacy: "actor-private-contact-pipeline", runtimeBoundary: "runtime" }, status: 200 },
      data: pipelineStateOverride ? null : { page: { ...pipelinePage, stage } }, loadingMore: false, moreError: null, loadMore() {},
    })
  };
  if (name.endsWith("/hooks/useLocalContacts")) return { useLocalContacts: () => localContactsOverride ?? { available: false, rows: [], freshness: { readable: false, lastSyncedAt: null }, refresh() {} } };
  return originalLoad(name, ...args);
};
let ContactPipelineScreen: typeof import("../src/screens/contacts/ContactPipelineScreen").ContactPipelineScreen;
try {
  ({ ContactPipelineScreen } = require("../src/screens/contacts/ContactPipelineScreen"));
} finally {
  loader._load = originalLoad;
}

// The screen labels due dates against the device clock, so the action is due at
// local noon today rather than on a fixed calendar date.
const dueToday = new Date();
dueToday.setHours(12, 0, 0, 0);

const pipelinePage: ContactPipelinePageContract = {
  asOf: "2026-09-26T00:00:00.000Z",
  stage: "to_contact",
  stageCounts: { to_contact: 1, in_progress: 1, nurture: 0, archived: 0 },
  items: [{ id: "contact:legacy", displayName: "Hana", organization: "Orbit", role: "Partner" }],
  hasMore: false,
  nextCursor: null,
  actions: [{ taskId: "task:legacy", contactId: "contact:legacy", contactName: "Hana", organization: "Orbit", role: "Partner", title: "复核关系", dueAt: dueToday.toISOString() }],
};

test("relationship overview renders exact stage counts and bounded action previews", () => {
  const html = renderToHtml(<ContactPipelineScreen />);
  assert.match(html, /aria-label="待联系，1 人"/u);
  assert.match(html, /aria-label="推进中，1 人"/u);
  assert.match(html, /确认关系/u);
  assert.match(html, /aria-label="Hana，确认关系，今天"/u);
  assert.match(html, /aria-label="长期维护，0 人"/u);
  assert.match(html, /aria-label="已归档，0 人"/u);
});

test("relationship overview falls back to the account mirror with an as-of notice when offline", () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, "OS");
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  pipelineStateOverride = { kind: "offline", error: { code: "ORBIT_APP_NETWORK_ERROR", message: "private raw network failure" }, refresh() {}, refreshing: false };
  localContactsOverride = {
    available: true,
    rows: [{ id: "contact:device", card: { id: "contact:device", displayName: "Device Ada", organization: "Orbit", role: "Partner", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", updatedAt: "2026-09-26T00:00:00.000Z" }, tags: [], search: { text: "", occurredAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z", error: null }, detail: null }],
    freshness: { readable: true, lastSyncedAt: "2026-09-26T00:00:00.000Z" },
    refresh() {},
  };
  try {
    const html = renderToHtml(<ContactPipelineScreen />);
    assert.match(html, /截至/u);
    assert.match(html, /推进中，1 人/u);
    assert.match(html, /待处理事项需要联网查看/u);
    assert.doesNotMatch(html, /private raw network failure|服务器连不上/u);
  } finally {
    if (platformDescriptor) Object.defineProperty(Platform, "OS", platformDescriptor);
    pipelineStateOverride = null;
    localContactsOverride = null;
  }
});

// Found on the Simulator (0137 run-02): with a readable device mirror the native page showed
// "Offline · showing content as of …" and "待处理事项需要联网查看" while the server was reachable.
function withNativeMirror(freshness: Record<string, unknown>, run: (html: string) => void) {
  const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, "OS");
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  // The native page does not request the server page while the mirror is readable.
  pipelineStateOverride = { kind: "loading", refresh() {}, refreshing: false };
  localContactsOverride = {
    available: true,
    rows: [{ id: "contact:device", card: { id: "contact:device", displayName: "Device Ada", organization: "Orbit", role: "Partner", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", updatedAt: "2026-09-26T00:00:00.000Z" }, tags: [], search: { text: "", occurredAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z", error: null }, detail: null }],
    freshness: { readable: true, lastSyncedAt: "2026-09-26T00:00:00.000Z", ...freshness },
    refresh() {},
  };
  try {
    run(renderToHtml(<ContactPipelineScreen />));
  } finally {
    if (platformDescriptor) Object.defineProperty(Platform, "OS", platformDescriptor);
    pipelineStateOverride = null;
    localContactsOverride = null;
  }
}

test("online with a readable device mirror shows stage counts without any offline notice", () => {
  withNativeMirror({ offline: false }, html => {
    assert.match(html, /推进中，1 人/u);
    assert.doesNotMatch(html, /截至|需要联网/u);
    assert.match(html, /本机只计算关系阶段/u);
  });
});

test("a failed sync with a readable device mirror shows the as-of notice and needs-network actions", () => {
  withNativeMirror({ offline: true }, html => {
    assert.match(html, /截至/u);
    assert.match(html, /推进中，1 人/u);
    assert.match(html, /待处理事项需要联网查看/u);
  });
});
