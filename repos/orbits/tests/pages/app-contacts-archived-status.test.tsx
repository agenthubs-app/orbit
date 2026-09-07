import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { contactsRouteToOrbitContactsViewModel as listView } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";
import { contactsRouteToOrbitContactsViewModel as subrouteView } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter";
import type { AppContactListItemViewModel, AppContactsPayloadViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { filterConnections, OrbitRealCardsList } from "../../app/(app)/app/contacts/orbit-real-contacts";
import { OrbitRealCardsPipelineView } from "../../app/(app)/app/contacts/orbit-real-cards-pipeline-view";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";

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

test("archive is searchable without matching partnered stage aliases", () => {
  const model = subrouteView(payload([contact("archived", "Archived"), contact("active", "Active")]));
  assert.deepEqual(filterConnections(model.connections, "已归档").map((item) => item.id), ["archived"]);
  assert.deepEqual(filterConnections(model.connections, "已合作").map((item) => item.id), []);
  assert.deepEqual(filterConnections(model.connections, "", "archived").map((item) => item.id), ["archived"]);
  assert.deepEqual(filterConnections(model.connections, "", "partnered").map((item) => item.id), []);
});

test("list and pipeline render the archive group without dropping its contact or count", () => {
  const model = subrouteView(payload([contact("archived", "Archived"), contact("active", "Active")]));
  for (const Component of [OrbitRealCardsList, OrbitRealCardsPipelineView]) {
    const html = renderToStaticMarkup(createElement(Component, { viewModel: model }));
    assert.match(html, /已归档/);
    assert.match(html, /href="\/app\/contacts\/archived"/);
    assert.match(html, /href="\/app\/contacts\/active"/);
    assert.doesNotMatch(html, /undefined/);
  }
  const counts = model.pipelineStatuses.map((stage) => ({
    stage: stage.value,
    count: filterConnections(model.connections, "", stage.value).length,
  }));
  assert.deepEqual(counts.filter((item) => item.count > 0), [
    { stage: "in_progress", count: 1 }, { stage: "archived", count: 1 },
  ]);
  const pipeline = renderToStaticMarkup(createElement(OrbitRealCardsPipelineView, { viewModel: model }));
  assert.match(pipeline, /已归档<\/span><span class="nc-ccount">1<\/span>/);
});

test("detail displays archived instead of partnered for an archived contact", async () => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  assert.equal(route.routeState, "success");
  if (route.routeState !== "success") throw new Error("Expected mock contact detail");
  const model = contactDetailRouteToOrbitContactsViewModel({
    ...route, contact: { ...route.contact, status: "archived" },
  });
  assert.equal(model.connections[0].pipelineStatus, "archived");
  const html = renderToStaticMarkup(createElement(OrbitRealCardConnection, {
    contactId: route.contact.id, viewModel: model,
  }));
  assert.match(html, /已归档/);
  assert.doesNotMatch(html, /nc-ps-partnered/);
  assert.match(html, /nc-ps-archived" style="[^"]*background:/);
  assert.match(html, /class="nc-dot" style="background:currentColor"/);
});
