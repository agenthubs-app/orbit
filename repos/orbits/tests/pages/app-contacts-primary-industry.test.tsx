import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { contactsListSearchAndFilterServiceFactory } from "../../features/contacts/service-factory";
import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import type { LocalRemoteContactGraph } from "../../features/contacts/contact-graph-provider";
import { loadAppContactsRouteViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { contactsRouteToOrbitContactsViewModel as listView } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";
import { contactsRouteToOrbitContactsViewModel as subrouteView } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { applyOrbitContactsPresentation } from "../../app/(app)/app/orbit-contacts-presentation";
import { OrbitRealCardsDashboard } from "../../app/(app)/app/contacts/orbit-real-cards-dashboard";
import { filterConnections } from "../../app/(app)/app/contacts/orbit-real-contacts";

async function contactsRoute(t: TestContext) {
  const graph: LocalRemoteContactGraph = {
    contacts: ["classified", "unclassified"].map((id) => ({
      id, displayName: id, organization: "Example", role: "Founder", location: "Osaka",
      stage: "active", customTags: ["custom-tag"],
      ...(id === "classified" ? { primaryIndustryId: "technology_internet" as const } : {}),
      source: { type: "manual" as const, id: `source:${id}`, label: "Manual" },
      evidenceIds: [`evidence:${id}`], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z",
    })),
    connections: [],
    evidence: ["classified", "unclassified"].map((id) => ({
      id: `evidence:${id}`, sourceType: "manual", sourceId: `source:${id}`,
      summary: "Manually confirmed contact", occurredAt: "2026-09-07T00:00:00.000Z",
      confidence: 1, createdBy: "industry-test",
    })),
    generatedAt: "2026-09-07T00:00:00.000Z",
  };
  const service = createLiveContactsListSearchAndFilterService({
    provider: {
      source: "live-record-store:industry-test", sourceLabel: "Industry fixture",
      readContactGraph(actorId) {
        assert.equal(actorId, "industry-test");
        return graph;
      },
    },
  });
  const resolution = contactsListSearchAndFilterServiceFactory.create("mock");
  assert.equal(resolution.success, true);
  t.mock.method(contactsListSearchAndFilterServiceFactory, "create", () => ({ ...resolution, service }));
  const route = await loadAppContactsRouteViewModel(undefined, "industry-test");
  assert.equal(route.state, "success");
  if (route.state !== "success") throw new Error("Expected contacts fixture");
  return route;
}

// Break caught: the route discards primaryIndustryId, or an adapter substitutes location/tags.
test("live contacts keep canonical industry through route and both product adapters", async (t) => {
  const route = await contactsRoute(t);
  for (const model of [listView(route), subrouteView(route.payload)]) {
    const classified = model.connections.find((item) => item.id === "classified")!;
    const unclassified = model.connections.find((item) => item.id === "unclassified")!;
    assert.equal(classified.industry, "科技与互联网");
    assert.equal(classified.encounters[0].context.publicProfile.industry, "科技与互联网");
    assert.equal(unclassified.industry, "");
    assert.equal(unclassified.encounters[0].context.publicProfile.industry, "");
  }
});

test("industry identity localizes consistently without changing location or custom tags", async (t) => {
  const route = await contactsRoute(t);
  for (const [language, label, city] of [
    ["zh", "科技与互联网", "大阪"],
    ["en", "Technology & Internet", "Osaka"],
    ["ja", "テクノロジー・インターネット", "大阪"],
  ] as const) {
    const model = applyOrbitContactsPresentation(listView(route), language);
    const item = model.connections.find((contact) => contact.id === "classified")!;
    assert.equal(item.industry, label);
    assert.equal(item.encounters[0].context.publicProfile.industry, label);
    assert.equal(item.location, city);
    assert.deepEqual(item.encounters[0].context.publicProfile.topics, ["custom-tag"]);
  }
});

test("dashboard industry distribution shows unclassified instead of cities or tags", async (t) => {
  const route = await contactsRoute(t);
  const html = renderToStaticMarkup(createElement(OrbitRealCardsDashboard, { viewModel: listView(route) }));
  assert.match(html, /科技与互联网/);
  assert.match(html, /未分类/);
  assert.doesNotMatch(html, />Osaka<|>custom-tag<|>Relationship</);
});

test("separating industry from location preserves city search for every contact", async (t) => {
  const route = await contactsRoute(t);
  const model = listView(route);
  assert.deepEqual(filterConnections(model.connections, "Osaka").map((item) => item.id).sort(), ["classified", "unclassified"]);
  const localized = applyOrbitContactsPresentation(model, "zh");
  assert.deepEqual(filterConnections(localized.connections, "大阪").map((item) => item.id).sort(), ["classified", "unclassified"]);
});

test("industry metric excludes contacts whose industry is unclassified", async (t) => {
  const route = await contactsRoute(t);
  const html = renderToStaticMarkup(createElement(OrbitRealCardsDashboard, { viewModel: listView(route) }));
  assert.equal(html.match(/行业数<\/div><strong[^>]*>(\d+)<\/strong>/)?.[1], "1");
});

test("industry metric is not capped by the six visible distribution rows", async (t) => {
  const route = await contactsRoute(t);
  const model = listView(route);
  const labels = ["餐饮与食品", "科技与互联网", "金融与投资", "专业服务", "制造与供应链", "零售与消费", "贸易与物流"];
  model.connections = labels.map((industry, index) => ({ ...model.connections[0], id: `industry:${index}`, primaryIndustryId: undefined, encounters: [], industry }));
  const html = renderToStaticMarkup(createElement(OrbitRealCardsDashboard, { viewModel: model }));
  assert.equal(html.match(/行业数<\/div><strong[^>]*>(\d+)<\/strong>/)?.[1], "7");
});

test("localization preserves legacy encounter copy when there is no canonical industry", async (t) => {
  const route = await contactsRoute(t);
  const model = listView(route);
  const unclassified = model.connections.find((item) => item.id === "unclassified")!;
  unclassified.encounters[0].context.publicProfile.industry = "Self-reported profile context";
  const localized = applyOrbitContactsPresentation(model, "en");
  assert.equal(
    localized.connections.find((item) => item.id === "unclassified")!.encounters[0].context.publicProfile.industry,
    "Self-reported profile context",
  );
});

test("detail prefers canonical industry over legacy profile text and has an honest missing value", async () => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  assert.equal(route.routeState, "success");
  if (route.routeState !== "success") throw new Error("Expected mock detail");
  for (const [primaryIndustryId, expected] of [["technology_internet", "科技与互联网"], [undefined, ""]] as const) {
    const model = contactDetailRouteToOrbitContactsViewModel({
      ...route,
      contact: {
        ...route.contact, primaryIndustryId, primaryIndustryLabel: undefined,
        publicProfile: { ...route.contact.publicProfile, industry: "Osaka" },
      },
    });
    assert.equal(model.connections[0].industry, expected);
    assert.equal(model.connections[0].encounters[0].context.publicProfile.industry, expected);
  }
});
