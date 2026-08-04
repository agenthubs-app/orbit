import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
      actorId: "actor:contact-detail-unconfigured",
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
      assert.deepEqual(
        routeModel.recoveryActions.map((action) => action.href),
        ["/app/contacts/contact_078", "/app/contacts"],
      );
      assert.doesNotMatch(
        JSON.stringify(routeModel.recoveryActions),
        /demo-contact-1|Open Kenji/,
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
    readContactGraphForContact(contactId: string, actorId?: string) {
      graphLoads += 1;
      assert.equal(contactId, "contact-route-selected");
      assert.equal(actorId, "actor:contact-route-selected");

      return graph;
    },
  };

  const routeModel = await loadAppContactDetailRoute({
    actorId: "actor:contact-route-selected",
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

test("accepted event contact opens before base projection and preserves actor-scoped encounter timeline", async () => {
  const generatedAt = "2026-08-04T06:00:00.000Z";
  const emptyGraph: LocalRemoteContactGraph = {
    connections: [],
    contacts: [],
    evidence: [],
    generatedAt,
  };
  const canonicalGraph: LocalRemoteContactGraph = {
    contacts: [{
      id: "contact:event-consent:aiko-ren",
      displayName: "蓮 高橋",
      organization: "Tokyo Mobility Lab",
      role: "事業開発責任者",
      location: "東京",
      profileSnippet: "日中のモビリティ実証を設計しています。",
      stage: "active",
      source: { id: "event:tokyo-ai-night", label: "Tokyo AI Night", type: "event_import" },
      evidenceIds: ["evidence:event-consent:aiko-ren"],
      createdAt: generatedAt,
      updatedAt: generatedAt,
    }],
    connections: [{
      id: "connection:event-consent:aiko-ren",
      accountId: "actor:aiko",
      contactId: "contact:event-consent:aiko-ren",
      stage: "active",
      valueTypes: ["strategic_fit"],
      summary: "双方在活动现场明确同意交换名片。",
      sharedTopics: ["cross-border mobility"],
      suggestedActions: ["周五一起复核试点经济模型"],
      source: { id: "event:tokyo-ai-night", label: "Tokyo AI Night", type: "event_import" },
      evidenceIds: ["evidence:event-consent:aiko-ren"],
      createdAt: generatedAt,
      updatedAt: generatedAt,
    }],
    evidence: [{
      id: "evidence:event-consent:aiko-ren",
      sourceType: "event_import",
      sourceId: "event:tokyo-ai-night",
      summary: "Aiko 与蓮在活动现场互相接受了名片申请。",
      occurredAt: generatedAt,
      confidence: 1,
      createdBy: "actor:ren",
    }],
    generatedAt,
  };
  let canonicalReads = 0;
  const provider: LiveContactsGraphProvider = {
    source: "live-record-store:contacts:test",
    sourceLabel: "Actor-scoped contact state",
    readContactGraph: () => emptyGraph,
    readContactGraphForContact: () => emptyGraph,
    readContactDetailState: async (contactId, actorId) => {
      assert.equal(actorId, "actor:aiko");
      assert.equal(contactId, "contact:event-consent:aiko-ren");
      return {
        actorId,
        contactId,
        notes: [{
          authorLabel: "You · explicit encounter",
          body: "记录：讨论了跨境移动数据试点\n下一步：周五复核单位经济模型",
          createdAt: "2026-08-04T06:10:00.000Z",
          noteId: "note:encounter:aiko-ren",
          privacy: "private",
          sourceLabel: "Explicit human encounter",
        }],
        status: "active",
        tags: ["event"],
        updatedAt: "2026-08-04T06:10:00.000Z",
      };
    },
  };

  const routeModel = await loadAppContactDetailRoute({
    actorId: "actor:aiko",
    contactId: "contact:event-consent:aiko-ren",
    eventRelationshipContactGraphReader: {
      async readAcceptedContactGraph(input) {
        canonicalReads += 1;
        assert.deepEqual(input, {
          actorId: "actor:aiko",
          contactId: "contact:event-consent:aiko-ren",
        });
        return canonicalGraph;
      },
    },
    liveContactGraphProvider: provider,
    mode: "live",
  });

  assert.equal(canonicalReads, 1);
  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState === "success") {
    assert.equal(routeModel.contact.id, "contact:event-consent:aiko-ren");
    const view = contactDetailRouteToOrbitContactsViewModel(routeModel, "zh");
    assert.match(view.connections[0]!.notes.at(-1)!.body, /跨境移动数据试点/u);
    assert.equal(view.connections[0]!.notes.at(-1)!.privacy, "private");
    assert.equal(
      view.connections[0]!.notes.at(-1)!.sourceLabel,
      "Explicit human encounter",
    );
  }
});

test("app contact detail live route renders a source-backed contact without fabricated relationship enrichment", async () => {
  const graph: LocalRemoteContactGraph = {
    contacts: [
      {
        id: "contact:business-card:standalone",
        displayName: "林 美咲",
        organization: "关西质量协作实验室",
        role: "供应链质量负责人",
        location: "Osaka",
        profileSnippet: "关注跨境供应链验证。",
        stage: "captured",
        source: {
          type: "business_card_ocr",
          id: "source:business-card-ocr",
          label: "Business card OCR",
        },
        evidenceIds: ["evidence:business-card:standalone"],
        createdAt: "2026-07-28T10:00:00.000Z",
        updatedAt: "2026-07-28T10:00:00.000Z",
        primaryEmail: "misaki.kansai@example.invalid",
        primaryPhone: "+81-6-5555-0101",
      },
    ],
    connections: [],
    evidence: [],
    generatedAt: "2026-07-28T10:00:00.000Z",
  };
  const provider: LiveContactsGraphProvider = {
    source: "live-record-store:contacts:standalone",
    sourceLabel: "Standalone source-backed contact",
    readContactGraph() {
      throw new Error("contact detail route should use the focused graph");
    },
    readContactGraphForContact(contactId, actorId) {
      assert.equal(contactId, "contact:business-card:standalone");
      assert.equal(actorId, "actor:standalone");
      return graph;
    },
  };

  const routeModel = await loadAppContactDetailRoute({
    actorId: "actor:standalone",
    contactId: "contact%3Abusiness-card%3Astandalone",
    liveContactGraphProvider: provider,
    mode: "live",
  });

  assert.equal(routeModel.routeState, "success");

  if (routeModel.routeState === "success") {
    assert.equal(routeModel.relationshipEnrichmentState, "not_recorded");
    assert.equal(routeModel.connection, null);
    assert.equal(routeModel.assessment, null);
    assert.equal(routeModel.valuePayload, null);

    const viewModel = contactDetailRouteToOrbitContactsViewModel(
      routeModel,
      "zh",
    );
    const contact = viewModel.connections[0];

    assert.equal(contact.displayName, "林 美咲");
    assert.equal(contact.company, "关西质量协作实验室");
    assert.equal(contact.email, "misaki.kansai@example.invalid");
    assert.equal(contact.phone, "+81-6-5555-0101");
    assert.equal(contact.pipelineStatus, "to_contact");
    assert.equal(contact.strength, "unscored");
    assert.equal(contact.source, "scan");
    assert.deepEqual(contact.valueTags, ["名片来源"]);
    assert.equal(viewModel.events.length, 1);
  }
});

test("contact detail recovery encodes an already encoded contact id only once", async () => {
  await withUnconfiguredLiveContacts(async () => {
    const routeModel = await loadAppContactDetailRoute({
      actorId: "actor:encoded-contact",
      contactId: "contact%3Abusiness-card%3Aencoded",
      mode: "live",
    });

    assert.equal(routeModel.routeState, "failure");
    if (routeModel.routeState === "failure") {
      assert.equal(
        routeModel.recoveryActions[0]?.href,
        "/app/contacts/contact%3Abusiness-card%3Aencoded",
      );
      assert.doesNotMatch(
        routeModel.recoveryActions[0]?.href ?? "",
        /%253A/,
      );
    }
  });
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
    readContactGraphForContact(_contactId, actorId) {
      assert.equal(actorId, "actor:contact-multilingual");
      return graph;
    },
  };

  const routeModel = await loadAppContactDetailRoute({
    actorId: "actor:contact-multilingual",
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
    readContactGraphForContact(_contactId, actorId) {
      graphLoads += 1;
      assert.equal(actorId, "actor:contact-route-missing");

      return {
        contacts: [],
        connections: [],
        evidence: [],
        generatedAt: "2026-07-02T10:00:00.000Z",
      };
    },
  };

  const routeModel = await loadAppContactDetailRoute({
    actorId: "actor:contact-route-missing",
    contactId: "missing-contact",
    liveContactGraphProvider: provider,
    mode: "live",
  } as Parameters<typeof loadAppContactDetailRoute>[0] & {
    liveContactGraphProvider: LiveContactsGraphProvider;
  });

  assert.equal(graphLoads, 1);
  assert.equal(routeModel.routeState, "empty");
  assert.deepEqual(routeModel.evidence, [
    "evidence:contact_detail_not_found",
  ]);
});

test("/app/contacts/[id] page uses the live route service instead of the legacy contacts view model", async () => {
  const pageSource = source("app/(app)/app/contacts/[id]/page.tsx");

  assert.match(pageSource, /loadAppContactDetailRoute/);
  assert.doesNotMatch(pageSource, /getOrbitContactsViewModel/);
  assert.match(pageSource, /const session = await auth\(\)/);
  assert.match(pageSource, /actorId,/);
  assert.match(pageSource, /redirect\(/);
  assert.doesNotMatch(pageSource, /searchParams|readSearchParam/);
  assert.doesNotMatch(pageSource, /action:|mode:|scenario:/);
  assert.doesNotMatch(
    source(
      "app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts",
    ),
    /prepare-follow-up|stage-local-review|buildLocalActionResult|actionResult/,
  );
  assert.doesNotMatch(pageSource, /this failed route state/);
});

test("contact detail UI exposes only source-backed relationship data and real navigation", () => {
  const detailSource = source(
    "app/(app)/app/contacts/orbit-real-card-connection.tsx",
  );
  const adapterSource = source(
    "app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter.ts",
  );

  assert.match(detailSource, /Source-backed · read only/);
  assert.match(detailSource, /No sourced interaction evidence is available/);
  assert.match(detailSource, /No sourced next step is available/);
  assert.match(detailSource, /function formatTimelineDate/);
  assert.match(detailSource, /dateTime=\{item\.time\}/);
  assert.match(adapterSource, /id: note\.evidenceIds\[0\] \?\? note\.noteId/);
  assert.match(detailSource, /href="\/app\/contacts\/pipeline"/);
  assert.doesNotMatch(detailSource, /stageDemo|timelineDemo|valueAToB|valueBToA/);
  assert.doesNotMatch(
    detailSource,
    /Stage updated|Book meeting|Add to pipeline|href="#"|event\.preventDefault\(\)/,
  );
});
