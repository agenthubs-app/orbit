import { actorKey, buildAccountContactFixtures } from "../shared/mock/account-contact-fixtures";

import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import { createConfiguredStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";
import { resolveCanonicalAccountOwnerId } from "../features/account/canonical-account-owner";
import { createConfiguredStorageAccountSessionProvider } from "../features/account/storage/account-live-record-provider";
import { loadLocalEnv } from "./load-local-env";

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;

  return value?.trim() || null;
}

async function main(): Promise<void> {
  loadLocalEnv();

  const email = argumentValue("--email");
  if (!email) {
    throw new Error("Usage: --email <test-account-email>");
  }

  const authProvider = createConfiguredStorageAuthUserProvider();
  const accountProvider = createConfiguredStorageAccountSessionProvider();
  const configuredStore = createConfiguredPostgresLiveRecordStore();
  if (!authProvider || !accountProvider || !configuredStore) {
    throw new Error("The configured live store is unavailable.");
  }

  const authUser = await authProvider.getUserByEmail(email);
  if (!authUser) {
    throw new Error(`No account exists for ${email}.`);
  }
  const accountId = resolveCanonicalAccountOwnerId({
    authUserId: authUser.id,
    graph: await accountProvider.readAccountSessionGraph({ userId: authUser.id }),
  });

  const key = actorKey(accountId);
  const records = buildAccountContactFixtures(accountId);
  for (const { sourceIndex: index, fixture, contact, connection, evidenceRecords } of records) {
    const suffix = String(index + 1).padStart(2, "0");
    const contactId = contact.id;
    const connectionId = connection.id;
    const legacyContactId = `test-contact-${key}-${suffix}`;
    const legacyConnectionId = `test-connection-${key}-${suffix}`;
    const { source, evidenceIds, createdAt } = contact;
    const latestTimestamp = contact.updatedAt;

    for (const evidence of evidenceRecords) {
      await configuredStore.store.upsertRecord({
        workspaceId: configuredStore.workspaceId,
        collectionName: "evidence",
        recordId: evidence.id,
        userId: accountId,
        sourceType: evidence.sourceType,
        sourceId: evidence.sourceId,
        sourceLabel: fixture.sourceLabel,
        evidenceIds: [evidence.id],
        occurredAt: evidence.occurredAt,
        createdAt: evidence.occurredAt,
        updatedAt: evidence.occurredAt,
        lifecycleState: "active",
        searchText: `${fixture.displayName} ${evidence.summary}`,
        payload: evidence as unknown as Record<string, unknown>,
      });
    }
    await configuredStore.store.upsertRecord({
      workspaceId: configuredStore.workspaceId,
      collectionName: "contacts",
      recordId: contactId,
      userId: accountId,
      sourceType: fixture.sourceType,
      sourceId: source.id,
      sourceLabel: fixture.sourceLabel,
      provider: "orbit-account-contact-fixtures",
      providerRecordId: contactId,
      targetType: "contact",
      targetId: contactId,
      evidenceIds,
      occurredAt: createdAt,
      createdAt,
      updatedAt: latestTimestamp,
      lifecycleState: "active",
      searchText: [
        fixture.displayName,
        fixture.organization,
        fixture.role,
        fixture.location,
        fixture.industry,
        fixture.profileBio,
        fixture.selfIntroduction,
        fixture.summary,
        ...fixture.offering,
        ...fixture.seeking,
        ...fixture.sharedTopics,
      ].join(" "),
      payload: contact as unknown as Record<string, unknown>,
    });
    await configuredStore.store.upsertRecord({
      workspaceId: configuredStore.workspaceId,
      collectionName: "connections",
      recordId: connectionId,
      userId: accountId,
      sourceType: fixture.sourceType,
      sourceId: source.id,
      sourceLabel: fixture.sourceLabel,
      provider: "orbit-account-contact-fixtures",
      providerRecordId: connectionId,
      targetType: "connection",
      targetId: connectionId,
      evidenceIds,
      occurredAt: createdAt,
      createdAt,
      updatedAt: latestTimestamp,
      lifecycleState: "active",
      searchText: `${fixture.displayName} ${fixture.summary} ${fixture.sharedTopics.join(" ")}`,
      payload: connection as unknown as Record<string, unknown>,
    });

    const migratedAt = new Date().toISOString();
    for (const [collectionName, recordId] of [
      ["contacts", legacyContactId],
      ["connections", legacyConnectionId],
      ["evidence", `test-evidence-${key}-${suffix}`],
      ...fixture.interactionHistory.map((_, interactionIndex) => [
        "evidence",
        `test-evidence-${key}-${suffix}-${interactionIndex + 1}`,
      ]),
    ] as const) {
      const legacyRecord = await configuredStore.store.getRecord({
        workspaceId: configuredStore.workspaceId,
        collectionName,
        recordId,
      });
      const isOwnedFixture =
        legacyRecord?.userId === accountId &&
        (collectionName === "evidence"
          ? legacyRecord.payload.createdBy === accountId
          : legacyRecord.provider === "orbit-account-contact-fixtures");

      if (legacyRecord && isOwnedFixture) {
        await configuredStore.store.deleteRecord({
          workspaceId: configuredStore.workspaceId,
          collectionName,
          recordId,
          deletedAt: migratedAt,
        });
      }
    }
  }

  // Keep the introduction fixture created during account QA aligned with the
  // localized contact records. Only the exact known seeded draft is migrated;
  // user-authored introduction notes are never rewritten.
  const introductionRecords = await configuredStore.store.listRecords({
    workspaceId: configuredStore.workspaceId,
    collectionName: "contact_introductions",
  });
  const localizedIntroduction =
    "林玫熟悉日本早期投资，佐藤健司正在推进机器人视觉项目。建议双方先交流产品路线、试点需求与融资节奏，再确认是否安排后续合作讨论。";
  for (const record of introductionRecords) {
    if (
      record.userId !== accountId ||
      record.payload.contactAId !== `test-contact-${key}-01` ||
      record.payload.contactBId !== `test-contact-${key}-02` ||
      record.payload.blurb !==
        "Mei 熟悉日本早期投资，Kenji 正在推进机器人视觉项目，建议双方先交流产品路线与融资节奏。"
    ) {
      continue;
    }

    const updatedAt = new Date().toISOString();
    await configuredStore.store.upsertRecord({
      ...record,
      updatedAt,
      searchText: `林玫 佐藤健司 ${localizedIntroduction}`,
      payload: {
        ...record.payload,
        contactAId: `orbit-contact-${key}-01`,
        contactBId: `orbit-contact-${key}-02`,
        labelA: "林玫",
        labelB: "佐藤健司",
        blurb: localizedIntroduction,
        updatedAt,
      },
    });
  }

  console.log(
    JSON.stringify({
      accountId,
      authUserId: authUser.id,
      contactsUpserted: records.length,
      interactionEvidenceUpserted: records.reduce(
        (count, record) => count + record.evidenceRecords.length,
        0,
      ),
      fixtureSet: `account-network-${key}`,
      legacyFixtureRecordsArchived: records.length * 6,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Contact fixture seeding failed.");
  process.exitCode = 1;
});
