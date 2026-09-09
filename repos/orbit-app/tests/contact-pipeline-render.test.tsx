import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { renderToHtml } from "./helpers/render";

const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
// Keep the screen, stage mapping and native-web rendering real; replace only
// navigation, device/account state and HTTP reads. No business service is called.
loader._load = (name, ...args) => {
  if (name === "expo-router") return {
    useRouter: () => ({ push() {}, back() {}, replace() {}, canGoBack: () => false }),
    usePathname: () => "/contacts/pipeline"
  };
  if (name.endsWith("/api/ApiBaseUrlProvider")) return { useOrbitApiBaseUrl: () => ({ baseUrl: "https://orbit.test" }) };
  if (name.endsWith("/hooks/useOrbitApiClient")) return { useOrbitApiClient: () => ({}) };
  if (name.endsWith("/hooks/useRelationshipInboxBadgeCount")) return { useRelationshipInboxBadgeCount: () => 0 };
  if (name.endsWith("/hooks/useApiResource")) return {
    useApiResource: (path: string) => ({
      kind: "success", refreshing: false, refresh() {},
      data: path === "/api/contacts"
        ? { contacts: [{ id: "legacy", displayName: "Hana", pipelineStatus: "待跟进" }] }
        : path === "/api/connections"
          ? { connections: [{ id: "connection:legacy", contactId: "legacy", relationshipStage: "needs_follow_up" }] }
          : { tasks: [] }
    })
  };
  return originalLoad(name, ...args);
};
let ContactPipelineScreen: typeof import("../src/screens/contacts/ContactPipelineScreen").ContactPipelineScreen;
try {
  ({ ContactPipelineScreen } = require("../src/screens/contacts/ContactPipelineScreen"));
} finally {
  loader._load = originalLoad;
}

test("relationship overview renders legacy contacts in the contact-stage distribution", () => {
  const html = renderToHtml(<ContactPipelineScreen />);
  assert.match(html, /aria-label="待联系，1 人"/u);
  assert.doesNotMatch(html, /待跟进/u);
  assert.match(html, /aria-label="长期维护，0 人"/u);
  assert.match(html, /aria-label="已归档，0 人"/u);
});
