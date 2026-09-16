import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { renderToHtml } from "./helpers/render";

const contact = { id: "pending", displayName: "QA", role: "", organization: "", location: "", relationshipContext: "活动认识", nextAction: "Legacy generated action",
  status: "captured", lifecycleInitialization: "pending", source: { type: "event_import", label: "QA event" }, tags: [], evidence: [], notes: [],
  publicProfile: { bio: "", offering: [], seeking: [], topics: [], conversationPrompts: [] }, lastInteraction: { channel: "event_note", occurredAt: "2026-09-17T00:00:00Z", summary: "" } };
const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
// Real native-web screen/rendering; only device, navigation, and existing HTTP
// read boundaries are substituted. No network, Xcode, or new API client.
loader._load = (name, ...args) => {
  if (name === "react-native-svg") return { __esModule: true, default: "svg", Defs: "defs", LinearGradient: "linearGradient", Rect: "rect", Stop: "stop" };
  if (name === "expo-router") return {
    useRouter: () => ({ push() {}, back() {}, replace() {}, canGoBack: () => false }),
    useLocalSearchParams: () => ({ id: "pending" }), usePathname: () => "/contacts/pending"
  };
  if (name.endsWith("/api/ApiBaseUrlProvider")) return { useOrbitApiBaseUrl: () => ({ baseUrl: "https://orbit.test" }) };
  if (name.endsWith("/api/AuthSessionProvider")) return { useOrbitAuthSession: () => ({ actorId: "owner:one", signedIn: true, ready: true }) };
  if (name.endsWith("/hooks/useOrbitApiClient")) return { useOrbitApiClient: () => ({}) };
  if (name.endsWith("/hooks/useRelationshipInboxBadgeCount")) return { useRelationshipInboxBadgeCount: () => 0 };
  if (name.endsWith("/hooks/useApiResource")) return { useApiResource: (path: string) => ({
    kind: "success", refreshing: false, refresh() {}, data: path === "/api/contacts/pending"
      ? { state: "success", contact, editableStatusOptions: ["active", "needs_follow_up", "nurture", "archived"] }
      : path.includes("eligibility") ? { canInvite: false, canSend: true, contactId: "pending", conversationId: "conversation:one", qualificationVersion: "one", remoteAccount: { accountId: "other", displayName: "QA" }, status: "confirmed" }
        : { connections: [] }
  }) };
  return originalLoad(name, ...args);
};
let ContactDetailScreen: typeof import("../src/screens/contacts/ContactDetailScreen").ContactDetailScreen;
try { ({ ContactDetailScreen } = require("../src/screens/contacts/ContactDetailScreen")); }
finally { loader._load = originalLoad; }

test("pending screen shows truthful Web-only guidance, no init/edit button, and keeps confirmed communication", () => {
  const html = renderToHtml(<ContactDetailScreen />);
  assert.match(html, /待设置关系/u);
  assert.match(html, /当前 App 尚不支持此设置/u);
  assert.match(html, /Web 联系人详情/u);
  assert.doesNotMatch(html, /Legacy generated action|aria-label="编辑"|aria-label="确认我的选择"/u);
  assert.match(html, /已验证，可聊天/u);
});
