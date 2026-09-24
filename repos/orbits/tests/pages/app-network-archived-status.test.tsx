import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { contactsRouteToOrbitContactsViewModel as listView } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";
import { contactsRouteToOrbitContactsViewModel as subrouteView } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter";
import type { AppContactListItemViewModel, AppContactsPayloadViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { NetworkAll } from "../../app/(app)/app/contacts/network-0918/network-all";
import { NetworkDetailModal } from "../../app/(app)/app/contacts/network-0918/network-detail-modal";
import { NetworkPipeline } from "../../app/(app)/app/contacts/network-0918/network-pipeline";
import { stageCounts, stageOf, toPerson } from "../../app/(app)/app/contacts/network-0918/network-model";

// Behaviour carried over from the retired orbit-real-contacts / pipeline-view /
// card-connection tests: archive is its own stage, never displayed as a
// partnership, and never derived from translated labels.

function contact(status: AppContactListItemViewModel["status"], statusLabel: string): AppContactListItemViewModel {
  return {
    databaseQueryExecuted: false, detailHref: `/app/contacts/${status}`,
    displayName: `Person ${status}`, evidenceIds: [], externalServicesContacted: false,
    id: status, location: "", needsAttention: false, nextAction: "", organization: "",
    profileSnippet: "", relationshipContextCopy: "", relationshipValueLabels: [],
    relationshipValueSummary: "", role: "", searchIndexReadExecuted: false,
    sourceLabel: "Manual", sourceType: "manual", status, statusLabel, tags: [], valueRationale: "",
  };
}

function payload(contacts: AppContactListItemViewModel[]): AppContactsPayloadViewModel {
  return {
    appliedFilters: { query: "", sourceFilters: [], statusFilters: [], tagFilters: [], valueFilters: [] },
    availableFilters: { sources: [], statuses: [], values: [] }, contacts,
    ledger: { knownPeople: contacts.length, needsAttention: 0, sourceFilters: 0, valueTags: 0 },
    listEvidenceIds: [], listSummary: "", reviewActionRequested: false,
  };
}

const pendingAnalysis: ContactsAnalysisView = { state: "pending" };

// Break caught: deriving state from translated labels or treating archive as partnership.
for (const [status, label, expected] of [
  ["archived", "已归档", "archived"],
  ["archived", "Archived", "archived"],
  ["needs_follow_up", "待联系", "to_contact"],
  ["active", "Archived is only display text", "in_progress"],
] as const) {
  test(`list uses raw ${status} regardless of label ${label}`, () => {
    const model = listView({ state: "success", payload: payload([contact(status, label)]) });
    assert.equal(model.connections[0].pipelineStatus, expected);
  });
}

test("subroute adapter retains archived contacts in their own available group", () => {
  const model = subrouteView(payload([contact("archived", "Archived")]));
  assert.equal(model.connections[0].pipelineStatus, "archived");
  assert.deepEqual(model.pipelineStatuses.find((stage) => stage.value === "archived"), {
    value: "archived", label: "已归档",
  });
});

test("archive maps to its own network stage and never to the advancing stage", () => {
  assert.equal(stageOf({ pipelineStatus: "archived", relationshipStatus: "archived" }), "archived");
  assert.equal(stageOf({ pipelineStatus: "archived" }), "archived");
  const model = subrouteView(payload([contact("archived", "Archived"), contact("active", "Active")]));
  const people = model.connections.map(toPerson);
  assert.deepEqual(people.filter((p) => p.stage === "archived").map((p) => p.id), ["archived"]);
  assert.deepEqual(people.filter((p) => p.stage === "advance").map((p) => p.id), ["active"]);
  assert.deepEqual(stageCounts(people), { explore: 0, keep: 0, advance: 1, archived: 1 });
});

test("all and pipeline screens render the archive group without dropping its contact or count", () => {
  const model = subrouteView(payload([contact("archived", "Archived"), contact("active", "Active")]));
  const all = renderToStaticMarkup(createElement(NetworkAll, { viewModel: model }));
  assert.match(all, /已归档/);
  assert.match(all, /href="\/app\/contacts\/archived"/);
  assert.match(all, /href="\/app\/contacts\/active"/);
  assert.doesNotMatch(all, /undefined/);

  const pipeline = renderToStaticMarkup(createElement(NetworkPipeline, { viewModel: model, analysis: pendingAnalysis }));
  assert.match(pipeline, /href="\/app\/contacts\/archived"/);
  assert.match(pipeline, /href="\/app\/contacts\/active"/);
  assert.doesNotMatch(pipeline, /undefined/);
  // 已归档 column and stat both carry the real count of 1.
  assert.match(pipeline, /nw-pstat-n">1<\/strong><span class="nw-pstat-label">已归档/);
  assert.match(pipeline, /nw-pstat-n">1<\/strong><span class="nw-pstat-label">正在推进/);
});

test("detail displays archived instead of an advancing stage for an archived contact", async () => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  assert.equal(route.routeState, "success");
  if (route.routeState !== "success") throw new Error("Expected mock contact detail");
  const model = contactDetailRouteToOrbitContactsViewModel({
    ...route, contact: { ...route.contact, status: "archived" },
  });
  assert.equal(model.connections[0].pipelineStatus, "archived");
  const html = renderToStaticMarkup(createElement(NetworkDetailModal, {
    contact: model.connections[0], closeHref: "/app/contacts", onFollow: () => {},
  }));
  assert.match(html, /class="nw-detail-stage"[^>]*>已归档</);
  assert.match(html, /关系阶段<\/span><strong class="nw-ov-v">已归档</);
  assert.doesNotMatch(html, /nw-ov-v">正在推进</);
  assert.doesNotMatch(html, /已合作|已建立合作/);
});
