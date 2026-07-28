import assert from "node:assert/strict";
import test from "node:test";

import { createAiEmailDraftService } from "../../features/chat/ai-email-draft-service";

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
