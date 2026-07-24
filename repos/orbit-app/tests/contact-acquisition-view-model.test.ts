import assert from "node:assert/strict";
import test from "node:test";
import { ORBIT_API_ENDPOINTS } from "../src/api/endpoints";
import {
  acquisitionResultToSummary,
  buildContactAcquisitionRequest
} from "../src/view-models/contact-acquisition";

test("contact acquisition endpoints point at draft APIs", () => {
  assert.equal(ORBIT_API_ENDPOINTS.contactDraftManual, "/api/contact-drafts/manual");
  assert.equal(
    ORBIT_API_ENDPOINTS.contactDraftQrScan,
    "/api/contact-drafts/qr/scan"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.contactDraftBusinessCardScan,
    "/api/contact-drafts/business-card/scan"
  );
});

test("buildContactAcquisitionRequest validates source-specific input", () => {
  assert.deepEqual(
    buildContactAcquisitionRequest("manual", {
      displayName: "",
      followUpHint: "",
      imageName: "",
      imageText: "",
      note: "",
      organization: "",
      qrText: "",
      role: "",
      scanLabel: "",
      tagsText: ""
    }),
    {
      error: "先写联系人姓名。",
      success: false
    }
  );

  assert.deepEqual(
    buildContactAcquisitionRequest("manual", {
      displayName: " 测试联系人 ",
      followUpHint: "约 30 分钟交流",
      imageName: "",
      imageText: "",
      note: " 在东京活动认识，希望交流企业 AI 落地。 ",
      organization: " Orbit ",
      qrText: "",
      role: " AI 导入负责人 ",
      scanLabel: "",
      tagsText: "AI, 东京"
    }),
    {
      request: {
        body: {
          displayName: "测试联系人",
          followUpHint: "约 30 分钟交流",
          note: "在东京活动认识，希望交流企业 AI 落地。",
          organization: "Orbit",
          role: "AI 导入负责人",
          tags: ["AI", "东京"]
        },
        endpoint: "/api/contact-drafts/manual"
      },
      success: true
    }
  );

  assert.equal(
    buildContactAcquisitionRequest("qr", {
      displayName: "",
      followUpHint: "",
      imageName: "",
      imageText: "",
      note: "",
      organization: "",
      qrText: "",
      role: "",
      scanLabel: "",
      tagsText: ""
    }).success,
    false
  );

  assert.equal(
    buildContactAcquisitionRequest("businessCard", {
      displayName: "",
      followUpHint: "",
      imageName: "",
      imageText: "",
      note: "",
      organization: "",
      qrText: "",
      role: "",
      scanLabel: "",
      tagsText: ""
    }).success,
    false
  );
});

test("buildContactAcquisitionRequest sends business card image payloads", () => {
  assert.deepEqual(
    buildContactAcquisitionRequest("businessCard", {
      displayName: "",
      followUpHint: "",
      imageBase64: "base64-card-image",
      imageMimeType: "image/jpeg",
      imageName: "kansai-card.jpg",
      imageSizeBytes: 1536,
      imageText: "",
      note: "",
      organization: "",
      qrText: "",
      role: "",
      scanLabel: "",
      tagsText: ""
    } as Parameters<typeof buildContactAcquisitionRequest>[1]),
    {
      request: {
        body: {
          imageBase64: "base64-card-image",
          imageName: "kansai-card.jpg",
          imageSizeBytes: 1536,
          mimeType: "image/jpeg"
        },
        endpoint: "/api/contact-drafts/business-card/scan"
      },
      success: true
    }
  );
});

test("acquisitionResultToSummary maps a pending manual draft without implementation copy", () => {
  const summary = acquisitionResultToSummary({
    draft: {
      contactWriteExecuted: false,
      displayName: "测试联系人",
      evidence: [
        {
          excerpt:
            "在东京活动认识，希望交流企业 AI 落地。 / Met at an event in Tokyo."
        }
      ],
      id: "manual-draft:live:1",
      organization: "Orbit",
      relationshipContext:
        "Manual note: 在东京活动认识，希望交流企业 AI 落地。 / Met at an event in Tokyo.",
      role: "AI 导入负责人",
      source: {
        label: "Live manual contact note"
      },
      status: "pending_confirmation",
      suggestedNextAction: "Review the manual note evidence before confirming this contact candidate.",
      confirmation: {
        required: true,
        state: "pending",
        question: "Confirm adding 测试联系人 from the manual note?"
      }
    },
    nextAction: "Review the manual note evidence before confirming this contact candidate.",
    state: "success",
    summary:
      "One live manual contact draft was staged in the shared contact draft queue without creating a contact."
  });

  assert.deepEqual(summary, {
    canConfirm: true,
    confirmLabel: "确认候选",
    confirmationText: "确认后会生成候选，不会直接写联系人。",
    detail: "Orbit · AI 导入负责人",
    draftId: "manual-draft:live:1",
    evidenceExcerpts: ["在东京活动认识，希望交流企业 AI 落地。"],
    nextAction: "先核对来源证据，再决定是否加入联系人。",
    sourceLabel: "手动记录",
    stateLabel: "待确认",
    title: "测试联系人",
    writeState: "还没有创建联系人"
  });
});

test("acquisitionResultToSummary maps confirmed drafts as candidates, not written contacts", () => {
  const summary = acquisitionResultToSummary({
    confirmedDraft: {
      displayName: "测试联系人",
      evidence: [
        {
          excerpt: "移动端用户 confirmed 测试联系人 from manual source evidence."
        }
      ],
      id: "manual-draft:live:1",
      organization: "Orbit",
      relationshipContext: "在东京活动认识，希望交流企业 AI 落地。",
      role: "AI 导入负责人",
      source: {
        label: "Live manual contact note"
      },
      status: "confirmed"
    },
    contactCandidate: {
      candidateId: "contact-candidate:manual-draft:live:1",
      contactWriteExecuted: false,
      displayName: "测试联系人",
      organization: "Orbit",
      readyForContactWrite: true,
      role: "AI 导入负责人"
    },
    nextAction:
      "Hand this source-backed candidate to the contact record service only after preserving manual note evidence.",
    state: "confirmed"
  });

  assert.deepEqual(summary, {
    canConfirm: false,
    confirmLabel: "已确认候选",
    confirmationText: "已确认，下一步再写入联系人。",
    detail: "Orbit · AI 导入负责人",
    draftId: "manual-draft:live:1",
    evidenceExcerpts: [],
    nextAction: "先保留来源证据，再决定是否写入联系人。",
    sourceLabel: "手动记录",
    stateLabel: "已确认",
    title: "测试联系人",
    writeState: "候选已确认"
  });
});
