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
import { mountOrbitRealCardConnection } from "./contact-relationship-initialization-mount-helper";

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

test("detail displays archived instead of partnered for an archived contact", async (t) => {
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
  // The SSR shell must not claim a canonical stage before the relationship readback.
  assert.match(html, /关系状态尚未确认/);
  assert.match(html, /nc-ps-pending_initialization/);
  assert.doesNotMatch(html, /nc-ps-archived/);
  assert.doesNotMatch(html, /nc-ps-partnered/);

  let reads = 0;
  const root = await mountOrbitRealCardConnection(t, {
    contactId: route.contact.id,
    language: "zh",
    viewModel: model,
    fetcher: (async (input, init) => {
      reads += 1;
      assert.equal(String(input), `/api/contacts/${encodeURIComponent(route.contact.id)}/relationship-initialization`);
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.credentials, "same-origin");
      assert.equal(init?.method, undefined);
      return Response.json({
        success: true,
        data: {
          state: "initialized",
          snapshot: {
            connection: {
              actorId: "owner:archived",
              contactId: route.contact.id,
              connectionId: "connection:archived",
              stage: "archived",
              activeGoal: null,
              version: 1,
              createdAt: "2026-09-17T00:00:00.000Z",
              updatedAt: "2026-09-17T00:00:00.000Z",
            },
            tasks: [],
          },
        },
      });
    }) as typeof fetch,
  });
  assert.equal(reads, 1);
  const pills = root.root.findAll((node) => node.type === "span" && String(node.props.className).startsWith("nc-status nc-ps-"));
  assert.equal(pills.length, 2);
  for (const pill of pills) {
    assert.match(pill.props.className, /nc-ps-archived/);
    assert.equal(pill.children.at(-1), "已归档");
  }
  assert.doesNotMatch(JSON.stringify(root.toJSON()), /nc-ps-partnered/);
});
