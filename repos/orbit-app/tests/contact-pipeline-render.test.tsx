import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { renderToHtml } from "./helpers/render";
import type { ContactPipelinePageContract } from "../src/api/contract/contact-pipeline-page";

const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
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
      state: { kind: "success", refreshing: false, refresh() {}, data: null, meta: { featureMode: "live", privacy: "actor-private-contact-pipeline", runtimeBoundary: "runtime" }, status: 200 },
      data: { page: { ...pipelinePage, stage } }, loadingMore: false, moreError: null, loadMore() {},
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

const pipelinePage: ContactPipelinePageContract = {
  asOf: "2026-09-26T00:00:00.000Z",
  stage: "to_contact",
  stageCounts: { to_contact: 1, in_progress: 1, nurture: 0, archived: 0 },
  items: [{ id: "contact:legacy", displayName: "Hana", organization: "Orbit", role: "Partner" }],
  hasMore: false,
  nextCursor: null,
  actions: [{ taskId: "task:legacy", contactId: "contact:legacy", contactName: "Hana", organization: "Orbit", role: "Partner", title: "复核关系", dueAt: "2026-09-26T00:00:00.000Z" }],
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
