import assert from "node:assert/strict";
import test from "node:test";

import { createAiEmailDraftService } from "../../features/chat/ai-email-draft-service";
import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

function sourceBackedLinMeiServices() {
  return {
    contactsService: {
      listContacts() {
        return {
          success: true,
          data: {
            contacts: [{ id: "contact:lin-mei", displayName: "林玫" }],
            provenance: { evidenceIds: ["evidence:lin-mei:1"] },
          },
        };
      },
    } as never,
    contactDetailService: {
      async getContactDetail() {
        return {
          success: true,
          data: {
            contact: {
              id: "contact:lin-mei",
              displayName: "林玫",
              role: "投资合伙人",
              organization: "港湾创投",
              relationshipContext: "双方已有多次有效交流。",
              evidence: [
                {
                  evidenceId: "evidence:lin-mei:1",
                  capturedAt: "2026-07-25T09:00:00.000Z",
                  excerpt: "电话复盘了三家人工智能项目。",
                  source: { label: "Calendar signal" },
                },
              ],
              lastInteraction: {
                occurredAt: "2026-07-25T09:00:00.000Z",
                summary: "电话复盘了三家人工智能项目。",
                evidenceIds: ["evidence:lin-mei:1"],
              },
              publicProfile: { evidenceIds: ["evidence:lin-mei:1"] },
              nextAction: "发送适合其基金阶段的三家公司清单。",
            },
          },
        };
      },
    } as never,
  };
}

test("AI email draft reads the signed-in contact evidence and never requests email delivery", async () => {
  const calls: string[] = [];
  let providerBody = "";
  const service = createAiEmailDraftService({
    contactsService: {
      listContacts(input: { actorId?: string | null } = {}) {
        calls.push(`list:${input.actorId}`);
        return {
          success: true,
          data: {
            contacts: [
              {
                id: "contact:lin-mei",
                displayName: "林玫",
              },
            ],
            provenance: {
              evidenceIds: ["evidence:lin-mei:1"],
            },
          },
        };
      },
    } as never,
    contactDetailService: {
      async getContactDetail(input: {
        actorId?: string | null;
        contactId: string;
      }) {
        calls.push(`detail:${input.actorId}:${input.contactId}`);
        return {
          success: true,
          data: {
            contact: {
              id: "contact:lin-mei",
              displayName: "林玫",
              role: "投资合伙人",
              organization: "港湾创投",
              relationshipContext: "双方已有多次有效交流。",
              evidence: [
                {
                  evidenceId: "evidence:lin-mei:1",
                  capturedAt: "2026-07-25T09:00:00.000Z",
                  excerpt: "电话复盘了三家人工智能项目，林玫重点询问客户续费数据。",
                  source: { label: "Calendar signal" },
                },
              ],
              lastInteraction: {
                occurredAt: "2026-07-25T09:00:00.000Z",
                summary: "电话复盘了三家人工智能项目，林玫重点询问客户续费数据。",
                evidenceIds: ["evidence:lin-mei:1"],
              },
              publicProfile: { evidenceIds: ["evidence:lin-mei:1"] },
              nextAction: "发送适合其基金阶段的三家公司清单。",
            },
          },
        };
      },
    } as never,
    modelConfig: {
      apiKey: "test-openai-key",
      model: "gpt-4.1",
      provider: "openai",
      fetchImplementation: (async (_url, init) => {
        providerBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              subject: "人工智能项目清单跟进",
              body: "林玫，您好：\n\n延续我们对三家人工智能项目的电话复盘，我整理了适合贵基金阶段的项目清单，供您复核。",
            }),
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }) as typeof fetch,
    },
  });

  const result = await service.createDraft({
    actorId: "actor:test-account",
    contactId: "contact:lin-mei",
    language: "zh",
    recipientName: "林玫",
  });

  assert.equal(result.success, true);
  if (result.success === false) return;

  assert.deepEqual(calls, [
    "list:actor:test-account",
    "detail:actor:test-account:contact:lin-mei",
  ]);
  assert.match(providerBody, /电话复盘了三家人工智能项目/);
  assert.match(providerBody, /发送适合其基金阶段的三家公司清单/);
  assert.equal(result.data.subject, "人工智能项目清单跟进");
  assert.match(result.data.body, /延续我们对三家人工智能项目的电话复盘/);
  assert.deepEqual(result.data.evidenceIds, ["evidence:lin-mei:1"]);
  assert.equal(result.data.safety.aiProviderRequested, true);
  assert.equal(result.data.safety.externalNetworkRequested, true);
  assert.equal(result.data.safety.emailProviderRequested, false);
  assert.equal(result.data.safety.externalSendRequested, false);
  assert.equal(result.data.safety.sendActionRequiresConfirmation, true);
});

test("AI email draft fails closed when the contact is outside the signed-in account", async () => {
  let providerCalled = false;
  const service = createAiEmailDraftService({
    contactsService: {
      listContacts() {
        return {
          success: true,
          data: { contacts: [], provenance: { evidenceIds: [] } },
        };
      },
    } as never,
    contactDetailService: {} as never,
    modelConfig: {
      apiKey: "test-openai-key",
      provider: "openai",
      fetchImplementation: (async () => {
        providerCalled = true;
        return new Response();
      }) as typeof fetch,
    },
  });

  const result = await service.createDraft({
    actorId: "actor:test-account",
    contactId: "contact:other-account",
    language: "zh",
  });

  assert.equal(result.success, false);
  assert.equal(result.success ? "" : result.error.code, "CONTACT_NOT_FOUND");
  assert.equal(providerCalled, false);
});

test("AI email draft rejects invented attachments, retries once, and only returns a source-bounded draft", async () => {
  const providerBodies: string[] = [];
  let providerCalls = 0;
  const service = createAiEmailDraftService({
    ...sourceBackedLinMeiServices(),
    modelConfig: {
      apiKey: "test-openai-key",
      model: "gpt-4.1",
      provider: "openai",
      fetchImplementation: (async (_url, init) => {
        providerCalls += 1;
        providerBodies.push(String(init?.body ?? ""));
        const draft =
          providerCalls === 1
            ? {
                subject: "人工智能项目清单",
                body: "林玫，您好，项目清单详见附件。",
              }
            : {
                subject: "人工智能项目清单",
                body: "林玫，您好，我整理了适合贵基金阶段的项目清单，想请您复核。",
              };

        return new Response(
          JSON.stringify({ output_text: JSON.stringify(draft) }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }) as typeof fetch,
    },
  });

  const result = await service.createDraft({
    actorId: "actor:test-account",
    contactId: "contact:lin-mei",
    language: "zh",
  });

  assert.equal(result.success, true);
  assert.equal(providerCalls, 2);
  assert.match(providerBodies[1] ?? "", /attachment_not_in_record/);
  if (result.success === false) return;
  assert.doesNotMatch(result.data.body, /附件|attached/i);
  assert.match(result.data.body, /想请您复核/);
  assert.equal(result.data.safety.externalSendRequested, false);
});

test("AI email draft fails closed when a retry still claims an unsupported attachment", async () => {
  let providerCalls = 0;
  const service = createAiEmailDraftService({
    ...sourceBackedLinMeiServices(),
    modelConfig: {
      apiKey: "test-openai-key",
      model: "gpt-4.1",
      provider: "openai",
      fetchImplementation: (async () => {
        providerCalls += 1;
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              subject: "人工智能项目清单",
              body: "林玫，您好，清单仍然详见附件。",
            }),
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }) as typeof fetch,
    },
  });

  const result = await service.createDraft({
    actorId: "actor:test-account",
    contactId: "contact:lin-mei",
    language: "zh",
  });

  assert.equal(result.success, false);
  assert.equal(providerCalls, 2);
  assert.equal(
    result.success ? "" : result.error.code,
    "MODEL_OUTPUT_INVALID",
  );
});

test("AI email draft reads an actor-scoped contact from live storage before calling the model", async () => {
  const actorId = "account_orbit_generated";
  const workspaceId = "workspace:ai-email-live-contact";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-28T06:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createStorageContactGraphProvider({
    sourceLabel: "AI email live contact storage",
    store,
    workspaceId,
  });
  let providerBody = "";
  let providerCalls = 0;
  let finishReason: string | undefined = "stop";
  const service = createAiEmailDraftService({
    contactsService: createLiveContactsListSearchAndFilterService({ provider }),
    contactDetailService: createLiveContactDetailTagStatusService({ provider }),
    modelConfig: {
      apiKey: "test-deepseek-key",
      model: "deepseek-chat",
      provider: "deepseek",
      fetchImplementation: (async (_url, init) => {
        providerCalls += 1;
        providerBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: finishReason,
                message: {
                  content: JSON.stringify({
                    subject: "继续推进制造业 AI 试点",
                    body: "佐藤先生，您好：\n\n结合我们最近关于制造业 AI 业务自动化试点的交流，想和您确认下一步适合验证的业务场景。",
                  }),
                },
              },
            ],
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }) as typeof fetch,
    },
  });

  const result = await service.createDraft({
    actorId,
    contactId: "contact_001",
    language: "zh",
    purpose: "继续讨论日本中小制造业的 AI 业务自动化试点",
  });

  assert.equal(result.success, true);
  if (result.success === false) return;

  assert.equal(result.data.contactId, "contact_001");
  assert.equal(result.data.provider, "deepseek");
  assert.match(result.data.body, /制造业 AI 业务自动化试点/);
  assert.match(
    providerBody,
    new RegExp(
      defaultMockFixtures.contacts.find(
        (contact) => contact.id === "contact_001",
      )?.displayName ?? "contact_001",
    ),
  );
  assert.match(providerBody, /日本中小制造业/);
  assert.ok(result.data.evidenceIds.includes("evidence:contact:001"));
  assert.equal(result.data.safety.liveDatabaseReadExecuted, true);
  assert.equal(result.data.safety.liveDatabaseWriteExecuted, false);
  assert.equal(result.data.safety.externalSendRequested, false);

  const callsBeforeOtherActor = providerCalls;
  const otherActor = await service.createDraft({
    actorId: "account:unrelated", contactId: "contact_001", language: "zh",
  });
  assert.equal(otherActor.success, false);
  if (otherActor.success === false) assert.equal(otherActor.error.code, "CONTACT_NOT_FOUND");
  assert.equal(providerCalls, callsBeforeOtherActor, "another account must not send contact data to the model");

  for (finishReason of [undefined, "length", "content_filter"]) {
    const incomplete = await service.createDraft({ actorId, contactId: "contact_001", language: "zh" });
    assert.equal(incomplete.success, false, `must reject completion reason ${finishReason}`);
    if (incomplete.success === false) assert.equal(incomplete.error.code, "MODEL_REQUEST_FAILED");
    assert.equal("data" in incomplete, false, "an incomplete response must not expose a usable draft");
  }
});
