import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import type { LiveContactsGraphProvider } from "../../features/contacts/live-service";
import type { LocalRemoteContactGraph } from "../../features/contacts/contact-graph-provider";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveContacts<T>(
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const previousDatabaseEnv = new Map<string, string | undefined>(
    liveDatabaseEnvKeys.map((key) => [key, process.env[key]]),
  );

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    for (const key of liveDatabaseEnvKeys) {
      delete process.env[key];
    }

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }

    for (const key of liveDatabaseEnvKeys) {
      const previousValue = previousDatabaseEnv.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

test("app contact detail route reaches live child services instead of failing at the page factory", async () => {
  await withUnconfiguredLiveContacts(async () => {
    const routeModel = await loadAppContactDetailRoute({
      contactId: "contact_078",
      mode: "live",
    });

    assert.equal(routeModel.routeState, "failure");

    if (routeModel.routeState === "failure") {
      const evidence = routeModel.evidence.join(" ");

      assert.doesNotMatch(evidence, /NOT_IMPLEMENTED/);
      assert.match(
        evidence,
        /CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED|CONNECTION_LIVE_STORE_UNCONFIGURED|RELATIONSHIP_VALUE_LIVE_STORE_UNCONFIGURED|live-store-unconfigured/,
      );
    }
  });
});

test("app contact detail live route uses one shared focused graph for success payloads", async () => {
  let graphLoads = 0;
  const graph: LocalRemoteContactGraph = {
    contacts: [
      {
        id: "contact-route-selected",
        displayName: "Route Selected",
        organization: "Route Org",
        role: "Founder",
        location: "Tokyo",
        profileSnippet: "Selected route profile",
        stage: "active",
        source: {
          type: "manual",
          id: "source:route-contact",
          label: "Route focused provider",
        },
        evidenceIds: ["evidence:route-contact"],
        createdAt: "2026-07-02T10:00:00.000Z",
        updatedAt: "2026-07-02T10:00:00.000Z",
      },
    ],
    connections: [
      {
        id: "connection-route-selected",
        accountId: "account-route-selected",
        contactId: "contact-route-selected",
        stage: "active",
        valueTypes: ["strategic_fit"],
        summary: "Route selected relationship context",
        relationshipStrength: 72,
        businessRelevanceScore: 84,
        sharedTopics: ["route context"],
        suggestedActions: ["review shared graph"],
        source: {
          type: "manual",
          id: "source:route-connection",
          label: "Route focused provider",
        },
        evidenceIds: ["evidence:route-connection"],
        createdAt: "2026-07-02T10:00:00.000Z",
        updatedAt: "2026-07-02T10:00:00.000Z",
      },
    ],
    evidence: [
      {
        id: "evidence:route-contact",
        sourceType: "manual",
        sourceId: "source:route-contact",
        summary: "Route contact evidence",
        occurredAt: "2026-07-02T10:00:00.000Z",
        confidence: 0.9,
        createdBy: "route-test",
      },
      {
        id: "evidence:route-connection",
        sourceType: "manual",
        sourceId: "source:route-connection",
        summary: "Route connection evidence",
        occurredAt: "2026-07-02T10:00:00.000Z",
        confidence: 0.9,
        createdBy: "route-test",
      },
    ],
    generatedAt: "2026-07-02T10:00:00.000Z",
  };
  const provider: LiveContactsGraphProvider = {
    source: "live-record-store:contacts:route-focused",
    sourceLabel: "Route focused live graph",
    readContactGraph() {
      throw new Error("contact detail route should not read the full graph");
    },
    readContactGraphForContact(contactId: string) {
      graphLoads += 1;
      assert.equal(contactId, "contact-route-selected");

      return graph;
    },
  };

  const routeModel = await loadAppContactDetailRoute({
    contactId: "contact-route-selected",
    liveContactGraphProvider: provider,
    mode: "live",
  } as Parameters<typeof loadAppContactDetailRoute>[0] & {
    liveContactGraphProvider: LiveContactsGraphProvider;
  });

  assert.equal(graphLoads, 1);
  assert.equal(routeModel.routeState, "success");

  if (routeModel.routeState === "success") {
    assert.equal(routeModel.contact.id, "contact-route-selected");
    assert.equal(routeModel.contactPayload.state, "success");
    assert.equal(routeModel.connection.id, "connection-route-selected");
    assert.equal(routeModel.connectionPayload.state, "success");
    assert.equal(routeModel.valuePayload.state, "success");
    assert.equal(
      routeModel.assessment.connectionId,
      "connection-route-selected",
    );
    assert.deepEqual(routeModel.evidenceTimeline.map((item) => item.evidenceId), [
      "evidence:route-connection",
    ]);
    assert.equal(routeModel.contact.databaseWriteExecuted, false);
    assert.equal(routeModel.connection.databaseWriteExecuted, false);
    assert.equal(routeModel.valuePayload.provenance.databaseWriteExecuted, false);
    assert.equal(routeModel.valuePayload.provenance.notificationDelivered, false);
  }
});

test("contact detail view model selects one display language from multilingual live snippets", async () => {
  const graph: LocalRemoteContactGraph = {
    contacts: [
      {
        id: "contact-multilingual",
        displayName: "佐藤 健一",
        organization: "North Star Foods",
        role: "Store Owner",
        location: "Osaka",
        profileSnippet:
          "北星フーズの店舗オーナー。 / 北星餐饮的门店经营者。 / Store Owner at North Star Foods.",
        stage: "active",
        source: {
          type: "qr_scan",
          id: "source:qr_scan:contact-multilingual",
          label: "Direct QR scan for 佐藤 健一",
        },
        evidenceIds: ["evidence:multilingual-contact"],
        createdAt: "2026-07-02T10:00:00.000Z",
        updatedAt: "2026-07-02T10:00:00.000Z",
      },
    ],
    connections: [
      {
        id: "connection-multilingual",
        accountId: "account-multilingual",
        contactId: "contact-multilingual",
        stage: "active",
        valueTypes: ["community_context", "commercial_opportunity"],
        summary:
          "関係背景は日本語。 / 关系背景是中文。 / Relationship context is English.",
        relationshipStrength: 72,
        businessRelevanceScore: 84,
        sharedTopics: ["community_context"],
        suggestedActions: [
          "日本語の次アクション。 / 中文下一步。 / English next action.",
        ],
        source: {
          type: "qr_scan",
          id: "source:qr_scan:contact-multilingual",
          label: "Direct QR scan for 佐藤 健一",
        },
        evidenceIds: ["evidence:multilingual-connection"],
        createdAt: "2026-07-02T10:00:00.000Z",
        updatedAt: "2026-07-02T10:00:00.000Z",
      },
    ],
    evidence: [
      {
        id: "evidence:multilingual-contact",
        sourceType: "qr_scan",
        sourceId: "source:qr_scan:contact-multilingual",
        summary:
          "証拠は日本語。 / 证据是中文。 / Evidence is English.",
        occurredAt: "2026-07-02T10:00:00.000Z",
        confidence: 0.9,
        createdBy: "route-test",
      },
      {
        id: "evidence:multilingual-connection",
        sourceType: "qr_scan",
        sourceId: "source:qr_scan:contact-multilingual",
        summary:
          "関係証拠は日本語。 / 关系证据是中文。 / Relationship evidence is English.",
        occurredAt: "2026-07-02T10:00:00.000Z",
        confidence: 0.9,
        createdBy: "route-test",
      },
    ],
    generatedAt: "2026-07-02T10:00:00.000Z",
  };
  const provider: LiveContactsGraphProvider = {
    source: "live-record-store:contacts:multilingual",
    sourceLabel: "Multilingual live graph",
    readContactGraph() {
      throw new Error("contact detail route should not read the full graph");
    },
    readContactGraphForContact() {
      return graph;
    },
  };

  const routeModel = await loadAppContactDetailRoute({
    contactId: "contact-multilingual",
    liveContactGraphProvider: provider,
    mode: "live",
  } as Parameters<typeof loadAppContactDetailRoute>[0] & {
    liveContactGraphProvider: LiveContactsGraphProvider;
  });

  assert.equal(routeModel.routeState, "success");

  if (routeModel.routeState === "success") {
    const zhViewModel = contactDetailRouteToOrbitContactsViewModel(
      routeModel,
      "zh",
    );
    const enViewModel = contactDetailRouteToOrbitContactsViewModel(
      routeModel,
      "en",
    );
    const zhContact = zhViewModel.connections[0];
    const enContact = enViewModel.connections[0];

    assert.match(zhContact.note, /关系背景是中文/);
    assert.match(zhContact.encounters[0]?.context.publicProfile.bio ?? "", /北星餐饮/);
    assert.equal(zhContact.encounters[0]?.context.publicProfile.intro, "");
    assert.equal(zhContact.title, "门店经营者");
    assert.match(zhContact.offering, /商业机会/);
    assert.match(zhContact.seeking, /中文下一步/);
    assert.match(zhViewModel.events[0]?.name ?? "", /QR 扫码/);
    assert.doesNotMatch(
      `${zhContact.note} ${zhContact.encounters[0]?.context.publicProfile.bio} ${zhContact.offering} ${zhContact.seeking} ${zhContact.title} ${zhViewModel.events[0]?.name}`,
      /日本語|Store Owner|English|commercial opportunity|matches|through|QR scan for/,
    );

    assert.match(enContact.note, /Relationship context is English/);
    assert.match(
      enContact.encounters[0]?.context.publicProfile.bio ?? "",
      /Store Owner at North Star Foods/,
    );
    assert.equal(enContact.encounters[0]?.context.publicProfile.intro, "");
    assert.match(enContact.seeking, /English next action/);
    assert.doesNotMatch(
      `${enContact.note} ${enContact.encounters[0]?.context.publicProfile.bio} ${enContact.seeking}`,
      /日本語|北星餐饮|中文/,
    );

    // 详情页信息完整化：这些字段以前被 adapter 置空/未映射，现在必须带进 view model
    // 供 presenter 渲染（个人资料卡、标签、下一步、最近互动、所在地）。
    assert.ok(Array.isArray(zhContact.valueTags));
    assert.ok(
      Array.isArray(zhContact.encounters[0]?.context.publicProfile.topics),
    );
    assert.ok(
      Array.isArray(
        zhContact.encounters[0]?.context.publicProfile.conversationPrompts,
      ),
    );
    assert.equal(typeof zhContact.location, "string");
    assert.equal(typeof zhContact.lastInteraction, "string");
    // nextAction 由 suggestedActions 派生，必须按当前语言单语呈现。
    assert.match(zhContact.nextAction?.text ?? "", /中文下一步/);
    assert.doesNotMatch(zhContact.nextAction?.text ?? "", /日本語|English/);
    assert.match(enContact.nextAction?.text ?? "", /English next action/);
  }
});

test("app contact detail live route returns a controlled boundary when the focused graph misses the contact", async () => {
  let graphLoads = 0;
  const provider: LiveContactsGraphProvider = {
    source: "live-record-store:contacts:route-missing",
    sourceLabel: "Route missing live graph",
    readContactGraph() {
      throw new Error("contact detail route should not fall back to full graph");
    },
    readContactGraphForContact() {
      graphLoads += 1;

      return {
        contacts: [],
        connections: [],
        evidence: [],
        generatedAt: "2026-07-02T10:00:00.000Z",
      };
    },
  };

  const routeModel = await loadAppContactDetailRoute({
    contactId: "missing-contact",
    liveContactGraphProvider: provider,
    mode: "live",
  } as Parameters<typeof loadAppContactDetailRoute>[0] & {
    liveContactGraphProvider: LiveContactsGraphProvider;
  });

  assert.equal(graphLoads, 1);
  assert.notEqual(routeModel.routeState, "success");

  if (routeModel.routeState !== "success") {
    assert.ok(routeModel.evidence.length > 0);
  }
});

test("/app/contacts/[id] page uses the live route service instead of the legacy contacts view model", async () => {
  const pageSource = source("app/(app)/app/contacts/[id]/page.tsx");

  assert.match(pageSource, /loadAppContactDetailRoute/);
  assert.doesNotMatch(pageSource, /getOrbitContactsViewModel/);

  await withUnconfiguredLiveContacts(async () => {
    const Page = (await import("../../app/(app)/app/contacts/[id]/page"))
      .default as (props: {
      params: Promise<{ id: string }>;
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: "contact_078" }),
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );

    assert.match(html, /Contact detail could not load/);
    assert.match(
      html,
      /CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED|contact_detail_live_store_unconfigured/,
    );
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
  });
});
