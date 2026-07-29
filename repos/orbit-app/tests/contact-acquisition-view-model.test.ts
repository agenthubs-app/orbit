import assert from "node:assert/strict";
import test from "node:test";
import { ORBIT_API_ENDPOINTS } from "../src/api/endpoints";
import {
  acquisitionResultToSummary,
  buildBusinessCardContactWriteRequest,
  buildContactDraftReviewRequest,
  buildContactAcquisitionRequest,
  buildExternalContactsImportRequest,
  buildRecommendedContactConfirmRequest,
  buildReferralRecommendationsRequest,
  contactExternalCandidatesToView,
  contactExternalImportToView,
  contactReferralRecommendationsToView,
  businessCardContactWriteToView,
  recommendedContactConfirmationToView,
  contactDraftReviewFormFromSummary,
  contactMergeReviewToView,
  contactDraftQueueToView
} from "../src/view-models/contact-acquisition";
import * as contactAcquisition from "../src/view-models/contact-acquisition";

test("contact acquisition endpoints point at draft APIs", () => {
  assert.equal(ORBIT_API_ENDPOINTS.contactDrafts, "/api/contact-drafts");
  assert.equal(ORBIT_API_ENDPOINTS.contactDraftManual, "/api/contact-drafts/manual");
  assert.equal(ORBIT_API_ENDPOINTS.contactDraftReferral, "/api/contact-drafts/referral");
  assert.equal(
    ORBIT_API_ENDPOINTS.contactDraftQrScan,
    "/api/contact-drafts/qr/scan"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.contactDraftBusinessCardScan,
    "/api/contact-drafts/business-card/scan"
  );
  assert.equal(
    ORBIT_API_ENDPOINTS.contactBusinessCardConfirm,
    "/api/contacts/business-card/confirm"
  );
});

test("recommended contact confirmation helpers keep referral confirmation review-only", () => {
  assert.deepEqual(buildRecommendedContactConfirmRequest("demo recommendation/1"), {
    request: {
      body: {
        actorLabel: "Orbit iOS"
      },
      endpoint:
        "/api/contact-drafts/recommended/demo%20recommendation%2F1/confirm"
    },
    success: true
  });
  assert.deepEqual(buildRecommendedContactConfirmRequest("  "), {
    error: "这条引荐推荐缺少编号，暂时不能确认。",
    success: false
  });

  const view = recommendedContactConfirmationToView({
    confirmedBy: "Orbit iOS",
    confirmedContact: {
      displayName: "Kai Mori",
      organization: "GridLoop",
      role: "Commercial Lead"
    },
    contactWriteExecuted: false,
    createdEvidence: {
      excerpt:
        "Demo operator confirmed Kai Mori from Maya Chen's founder referral fixture."
    },
    databaseWriteExecuted: false,
    externalActionExecuted: false,
    nextAction:
      "Carry the recommender context into the next product route before any live contact write or outreach action.",
    notificationDelivered: false,
    state: "confirmed"
  });

  assert.deepEqual(view, {
    confirmedBy: "Orbit iOS",
    detail: "GridLoop · Commercial Lead",
    evidenceExcerpts: [],
    nextAction: "保留推荐人上下文，再决定是否加入联系人。",
    safetyText: "没有写入联系人，也没有发消息。",
    summary: "Kai Mori 保持在候选复核中",
    title: "引荐推荐已确认"
  });
});

test("referral recommendation helpers stage review-only contact drafts", () => {
  assert.deepEqual(buildReferralRecommendationsRequest(" founder_referral "), {
    request: {
      body: {
        sourceKind: "founder_referral"
      },
      endpoint: "/api/contact-drafts/referral?sourceKind=founder_referral"
    },
    success: true
  });
  assert.deepEqual(buildReferralRecommendationsRequest(" "), {
    request: {
      body: {},
      endpoint: "/api/contact-drafts/referral"
    },
    success: true
  });

  const view = contactReferralRecommendationsToView({
    contactDrafts: [
      {
        confidence: "high",
        contactWriteExecuted: false,
        databaseWriteExecuted: false,
        displayName: "Kai Mori",
        evidence: [
          {
            excerpt:
              "Maya Chen suggested Kai Mori as a warm operator relationship after the climate systems dinner."
          }
        ],
        id: "referral-draft:demo-recommendation-1",
        organization: "GridLoop",
        recommender: {
          displayName: "Maya Chen",
          organization: "North Pier Labs",
          role: "Founder"
        },
        role: "Commercial Lead",
        source: {
          label: "Founder referral fixture",
          sourceKind: "founder_referral",
          type: "referral"
        },
        sourceKind: "founder_referral",
        status: "pending_confirmation",
        suggestedNextAction:
          "Confirm Kai as a recommended contact, then prepare a founder-led intro request."
      }
    ],
    nextAction:
      "Review recommended contacts before confirming any future outreach.",
    recommendations: [
      {
        confidence: "high",
        displayName: "Kai Mori",
        id: "demo-recommendation-1",
        introductionPath: "Ask Maya for a short opt-in before any message is sent.",
        organization: "GridLoop",
        reasonForRecommendation:
          "Kai can validate procurement follow-up for climate infrastructure customers.",
        recommender: {
          displayName: "Maya Chen",
          organization: "North Pier Labs",
          role: "Founder"
        },
        role: "Commercial Lead",
        sourceKind: "founder_referral",
        suggestedNextAction:
          "Confirm Kai as a recommended contact, then prepare a founder-led intro request."
      }
    ],
    referralSources: [
      {
        kind: "founder_referral",
        label: "Founder referral fixture",
        recommenderCount: 1
      }
    ],
    state: "success",
    summary:
      "One recommended contact is staged from deterministic referral fixtures."
  });

  assert.equal(view.title, "朋友引荐");
  assert.equal(view.summary, "1 条引荐推荐");
  assert.equal(view.emptyText, "");
  assert.equal(view.safetyText, "只生成待确认候选，不会发消息，也不会写入联系人。");
  assert.equal(view.nextAction, "先核对推荐人、来源证据和引荐路径，再决定是否确认。");
  assert.deepEqual(view.sources, [
    {
      countLabel: "1 位推荐人",
      id: "founder_referral",
      label: "创始人引荐"
    }
  ]);
  assert.deepEqual(view.recommendations, [
    {
      confidenceLabel: "高可信",
      detail: "GridLoop · Commercial Lead",
      id: "demo-recommendation-1",
      introductionPath: "先请推荐人确认可介绍，再准备一段很短的说明。",
      name: "Kai Mori",
      nextAction: "确认后仍只是候选，不会自动触达对方。",
      reason: "创始人同行推荐，适合先确认引荐路径和合作价值。",
      recommenderLine: "推荐人：Maya Chen · North Pier Labs · Founder",
      sourceKind: "founder_referral",
      sourceLabel: "创始人引荐"
    }
  ]);
  assert.equal(view.drafts[0]?.title, "Kai Mori");
  assert.equal(view.drafts[0]?.sourceLabel, "朋友引荐");
  assert.deepEqual(view.drafts[0]?.evidenceExcerpts, []);
  assert.equal(
    view.drafts[0]?.nextAction,
    "先核对来源证据，再决定是否加入联系人。"
  );
});

test("contactExternalCandidatesToView maps external contact sources and candidates", () => {
  const view = contactExternalCandidatesToView({
    candidates: [
      {
        candidateId: "external-candidate:phone-1",
        confidence: "medium",
        displayName: "Hana Sato",
        duplicateHint: null,
        organization: "Tokyo Climate Guild",
        role: "Community Lead",
        sourceKind: "phone",
        suggestedNextAction:
          "Review Hana as a community-context contact before confirming any write."
      },
      {
        candidateId: "external-candidate:google-1",
        confidence: "high",
        displayName: "Omar Rahman",
        duplicateHint: "possible-contact:omar-rahman",
        organization: "Northstar Ventures",
        role: "Platform Partner",
        sourceKind: "google_contacts",
        suggestedNextAction:
          "Confirm Omar only after checking why the workspace contact exists."
      }
    ],
    nextAction:
      "Review each source-backed candidate before staging contact drafts.",
    sources: [
      {
        candidateCount: 1,
        kind: "phone",
        label: "Phone contacts",
        permissionState: "mock-granted"
      },
      {
        candidateCount: 1,
        kind: "google_contacts",
        label: "Google Contacts",
        permissionState: "mock-linked"
      },
      {
        candidateCount: 0,
        kind: "csv",
        label: "CSV",
        permissionState: "live-not-connected"
      }
    ],
    state: "success",
    summary:
      "Two external contact candidates are available from phone and Google Contacts fixtures."
  });

  assert.equal(view.title, "外部导入");
  assert.equal(view.summary, "2 个外部候选");
  assert.equal(view.emptyText, "");
  assert.equal(view.nextAction, "先核对外部来源，再导入为待确认候选。");
  assert.deepEqual(view.sources, [
    {
      countLabel: "1 个候选",
      id: "phone",
      label: "手机通讯录",
      stateLabel: "已授权"
    },
    {
      countLabel: "1 个候选",
      id: "google_contacts",
      label: "Google Contacts",
      stateLabel: "已连接"
    },
    {
      countLabel: "0 个候选",
      id: "csv",
      label: "CSV 文件",
      stateLabel: "未连接"
    }
  ]);
  assert.deepEqual(view.candidates, [
    {
      confidenceLabel: "中可信",
      detail: "Tokyo Climate Guild · Community Lead",
      duplicateText: "无明显重复",
      id: "external-candidate:phone-1",
      name: "Hana Sato",
      nextAction: "导入后仍需逐条确认，不会直接写联系人。",
      sourceKind: "phone",
      sourceLabel: "手机通讯录"
    },
    {
      confidenceLabel: "高可信",
      detail: "Northstar Ventures · Platform Partner",
      duplicateText: "可能已存在",
      id: "external-candidate:google-1",
      name: "Omar Rahman",
      nextAction: "导入后仍需逐条确认，不会直接写联系人。",
      sourceKind: "google_contacts",
      sourceLabel: "Google Contacts"
    }
  ]);
});

test("external contacts import helpers stage review-only drafts", () => {
  assert.deepEqual(buildExternalContactsImportRequest(" google_contacts "), {
    request: {
      body: {
        sourceKind: "google_contacts"
      },
      endpoint:
        "/api/contact-drafts/external/import?sourceKind=google_contacts"
    },
    success: true
  });
  assert.deepEqual(buildExternalContactsImportRequest(" "), {
    request: {
      body: {},
      endpoint: "/api/contact-drafts/external/import"
    },
    success: true
  });

  const view = contactExternalImportToView({
    contactDrafts: [
      {
        contactWriteExecuted: false,
        displayName: "Hana Sato",
        evidence: [
          {
            excerpt:
              "Local fixture lists Hana Sato as a phone contact from the climate dinner after-party."
          }
        ],
        id: "external-draft:phone-1",
        organization: "Tokyo Climate Guild",
        role: "Community Lead",
        source: {
          sourceKind: "phone",
          type: "external_contacts"
        },
        status: "pending_confirmation",
        suggestedNextAction:
          "Review Hana as a community-context contact before confirming any write."
      }
    ],
    nextAction:
      "Confirm each candidate before any future live contact write or follow-up action.",
    state: "success",
    summary:
      "One external contact draft is staged from deterministic fixtures with source evidence attached."
  });

  assert.equal(view.title, "已生成外部候选");
  assert.equal(view.summary, "1 条待确认外部候选");
  assert.equal(
    view.safetyText,
    "只是生成待确认候选，没有读取真实通讯录，也没有写入联系人。"
  );
  assert.equal(view.nextAction, "先核对导入候选，再决定是否确认。");
  assert.equal(view.drafts[0]?.sourceLabel, "手机通讯录");
  assert.equal(
    view.drafts[0]?.nextAction,
    "先核对来源证据，再决定是否加入联系人。"
  );
});

test("contactDraftQueueToView maps saved draft queue into Chinese review cards", () => {
  const view = contactDraftQueueToView({
    drafts: [
      {
        confirmation: {
          required: true,
          state: "pending"
        },
        displayName: "林小雨",
        evidence: [
          {
            excerpt: "在东京活动认识，希望交流企业 AI 落地。"
          }
        ],
        id: "manual-draft:live:queue-1",
        organization: "Orbit",
        role: "AI 导入负责人",
        source: {
          label: "manual note after Tokyo AI salon",
          type: "manual"
        },
        status: "pending_confirmation",
        suggestedNextAction: "下周约 30 分钟交流。"
      }
    ],
    nextAction:
      "Review each draft's source evidence before confirming it for contact creation.",
    state: "success",
    summary:
      "One source-backed contact draft is staged for operator confirmation."
  });

  assert.equal(view.title, "待确认候选");
  assert.equal(view.summary, "1 条待确认候选");
  assert.equal(view.emptyText, "");
  assert.equal(view.nextAction, "先核对待确认候选，再决定是否确认。");
  assert.deepEqual(view.drafts, [
    {
      canConfirm: true,
      confirmLabel: "确认候选",
      confirmationText: "确认后会生成候选，不会直接写联系人。",
      detail: "Orbit · AI 导入负责人",
      draftId: "manual-draft:live:queue-1",
      evidenceExcerpts: ["在东京活动认识，希望交流企业 AI 落地。"],
      nextAction: "下周约 30 分钟交流。",
      sourceLabel: "手动记录",
      stateLabel: "待确认",
      title: "林小雨",
      writeState: "还没有创建联系人"
    }
  ]);
});

test("contactDraftQueueToView keeps empty saved draft queues useful", () => {
  const view = contactDraftQueueToView({
    drafts: [],
    nextAction: "Wait for a sourced acquisition event before staging a contact draft.",
    state: "empty"
  });

  assert.deepEqual(view.drafts, []);
  assert.equal(view.summary, "暂无待确认候选");
  assert.equal(view.emptyText, "保存过的候选会出现在这里。");
  assert.equal(view.nextAction, "先从名片、QR 或手动记录生成一个候选。");
});

test("contactMergeReviewToView maps duplicate suggestions into Chinese review cards", () => {
  const view = contactMergeReviewToView({
    duplicateCandidates: [
      {
        candidateId: "duplicate-candidate:omar-rahman",
        confidence: "high",
        existingContactId: "contact:omar-r",
        existingContactName: "Omar R.",
        existingOrganization: "Northstar Ventures",
        existingRole: "Venture Partner",
        importedContactName: "Omar Rahman",
        importedDraftId: "external-draft:google_contacts-1",
        importedOrganization: "Northstar Ventures",
        importedRole: "Platform Partner",
        relationshipContext:
          "Venture ecosystem contact with a workspace import trail."
      }
    ],
    mergeSuggestions: [
      {
        candidateId: "duplicate-candidate:omar-rahman",
        confidence: "high",
        decision: "merge_into_existing",
        fieldDecisions: [
          {
            field: "displayName",
            selectedFrom: "imported_draft",
            value: "Omar Rahman"
          },
          {
            field: "relationshipContext",
            selectedFrom: "combined",
            value: "Venture ecosystem contact with import trail."
          }
        ],
        id: "demo-merge-1",
        reviewQuestion:
          "Confirm that the imported Google Contacts draft belongs to existing contact Omar R.",
        summary:
          "Merge imported Omar Rahman into the existing Omar R. contact while preserving both source evidence trails."
      }
    ],
    nextAction:
      "Review each suggestion before confirming any future live contact merge.",
    state: "success",
    summary:
      "Two imported contact drafts have deterministic duplicate merge suggestions ready for explicit review."
  });

  assert.deepEqual(view, {
    emptyText: "",
    nextAction: "先核对可能重复的人，再决定是否合并。",
    suggestions: [
      {
        confidenceLabel: "高可信",
        decisionLabel: "建议合并到现有人脉",
        existingLabel: "现有人脉：Omar R. · Northstar Ventures · Venture Partner",
        fieldDecisions: [
          "姓名：Omar Rahman",
          "关系背景：Venture ecosystem contact with import trail."
        ],
        guardrail: "这里只做预览，不会直接合并或写入联系人。",
        id: "demo-merge-1",
        importedLabel:
          "导入候选：Omar Rahman · Northstar Ventures · Platform Partner",
        reviewQuestion: "确认这两个记录是否是同一个人。",
        title: "Omar Rahman 可能已在人脉里"
      }
    ],
    summary: "1 条可能重复",
    title: "重复检查"
  });
});

test("contactMergeReviewToView keeps empty duplicate reviews useful", () => {
  const view = contactMergeReviewToView({
    duplicateCandidates: [],
    mergeSuggestions: [],
    nextAction:
      "Import more source-backed contact drafts before reviewing duplicate merges.",
    state: "empty"
  });

  assert.deepEqual(view.suggestions, []);
  assert.equal(view.summary, "暂无重复候选");
  assert.equal(view.emptyText, "有可能重复的导入候选会出现在这里。");
  assert.equal(view.nextAction, "先生成或导入候选，再做重复检查。");
});

test("buildContactMergeApplyRequest prepares a review-only merge apply call", () => {
  const buildContactMergeApplyRequest = (
    contactAcquisition as typeof contactAcquisition & {
      buildContactMergeApplyRequest?: (suggestionId: string) => unknown;
    }
  ).buildContactMergeApplyRequest;

  assert.equal(typeof buildContactMergeApplyRequest, "function");

  assert.deepEqual(buildContactMergeApplyRequest?.("demo merge/1"), {
    request: {
      body: {
        actorLabel: "Orbit iOS"
      },
      endpoint: "/api/contact-drafts/merge-suggestions/demo%20merge%2F1/apply"
    },
    success: true
  });

  assert.deepEqual(buildContactMergeApplyRequest?.("   "), {
    error: "这条重复建议缺少编号，暂时不能确认。",
    success: false
  });
});

test("contactMergeApplyToView maps confirmed merge previews without claiming a write", () => {
  const contactMergeApplyToView = (
    contactAcquisition as typeof contactAcquisition & {
      contactMergeApplyToView?: (payload: unknown) => {
        confirmedBy: string;
        detail: string;
        fieldDecisions: string[];
        nextAction: string;
        safetyText: string;
        summary: string;
        title: string;
      };
    }
  ).contactMergeApplyToView;

  assert.equal(typeof contactMergeApplyToView, "function");

  const view = contactMergeApplyToView?.({
    confirmedBy: "Orbit iOS",
    contactWriteExecuted: false,
    databaseWriteExecuted: false,
    destructiveMergeExecuted: false,
    fieldDecisions: [
      {
        field: "displayName",
        selectedFrom: "imported_draft",
        value: "Omar Rahman"
      },
      {
        field: "relationshipContext",
        selectedFrom: "combined",
        value: "关西投资人介绍线索，来自活动导入和已有联系人记录。"
      }
    ],
    mergeWriteExecuted: false,
    mergedContactPreview: {
      displayName: "Omar Rahman",
      email: "omar@example.com",
      organization: "Northstar Ventures",
      relationshipContext:
        "关西投资人介绍线索，来自活动导入和已有联系人记录。",
      role: "Platform Partner"
    },
    nextAction:
      "Keep this live merge preview under review until a future audited merge writer is implemented.",
    state: "confirmed"
  });

  assert.equal(view?.title, "合并预览已确认");
  assert.equal(view?.summary, "Omar Rahman 保持在复核中");
  assert.equal(view?.detail, "Northstar Ventures · Platform Partner");
  assert.equal(view?.confirmedBy, "Orbit iOS");
  assert.deepEqual(view?.fieldDecisions, [
    "姓名：Omar Rahman",
    "关系背景：关西投资人介绍线索，来自活动导入和已有联系人记录。"
  ]);
  assert.equal(
    view?.nextAction,
    "先保留这次确认记录，等正式合并写入前再复核一次。"
  );
  assert.equal(
    view?.safetyText,
    "没有写入联系人，也没有执行破坏性合并。"
  );
});

test("acquisitionResultToSummary maps business card fields for mobile review", () => {
  const summary = acquisitionResultToSummary({
    reviewDraft: {
      confirmation: {
        required: true,
        state: "pending"
      },
      contactWriteExecuted: false,
      displayName: "Hana Sato",
      email: "hana.sato@akirobotics.example",
      evidence: [
        {
          excerpt: "Hana Sato\nAki Robotics\nHead of Robotics Partnerships"
        }
      ],
      extractedFields: {
        displayName: {
          confidence: "high",
          evidenceId: "evidence:card-fields",
          field: "displayName",
          label: "Name",
          reviewedValue: "",
          reviewState: "needs_review",
          value: "Hana Sato"
        },
        email: {
          confidence: "medium",
          evidenceId: "evidence:card-fields",
          field: "email",
          label: "Email",
          reviewedValue: "",
          reviewState: "needs_review",
          value: "hana.sato@akirobotics.example"
        },
        organization: {
          confidence: "high",
          evidenceId: "evidence:card-fields",
          field: "organization",
          label: "Organization",
          reviewedValue: "",
          reviewState: "needs_review",
          value: "Aki Robotics"
        },
        phone: {
          confidence: "medium",
          evidenceId: "evidence:card-fields",
          field: "phone",
          label: "Phone",
          reviewedValue: "",
          reviewState: "needs_review",
          value: "+81-3-5555-0198"
        },
        role: {
          confidence: "high",
          evidenceId: "evidence:card-fields",
          field: "role",
          label: "Role",
          reviewedValue: "",
          reviewState: "needs_review",
          value: "Head of Robotics Partnerships"
        }
      },
      id: "demo-business-card-draft",
      organization: "Aki Robotics",
      phone: "+81-3-5555-0198",
      role: "Head of Robotics Partnerships",
      source: {
        label: "Mock business card review fixture",
        type: "business_card_ocr"
      },
      status: "pending_review",
      suggestedNextAction:
        "Review the extracted fields, then confirm the business card candidate."
    },
    nextAction: "Review the extracted fields before confirming the contact candidate.",
    state: "success"
  });

  assert.equal(summary.reviewLabel, "保存复核字段");
  assert.deepEqual(summary.reviewFields, [
    {
      confidenceLabel: "高可信",
      field: "displayName",
      label: "姓名",
      stateLabel: "待复核",
      value: "Hana Sato"
    },
    {
      confidenceLabel: "高可信",
      field: "organization",
      label: "公司",
      stateLabel: "待复核",
      value: "Aki Robotics"
    },
    {
      confidenceLabel: "高可信",
      field: "role",
      label: "职位",
      stateLabel: "待复核",
      value: "Head of Robotics Partnerships"
    },
    {
      confidenceLabel: "中可信",
      field: "email",
      label: "邮箱",
      stateLabel: "待复核",
      value: "hana.sato@akirobotics.example"
    },
    {
      confidenceLabel: "中可信",
      field: "phone",
      label: "电话",
      stateLabel: "待复核",
      value: "+81-3-5555-0198"
    }
  ]);
  assert.deepEqual(contactDraftReviewFormFromSummary(summary), {
    displayName: "Hana Sato",
    email: "hana.sato@akirobotics.example",
    organization: "Aki Robotics",
    phone: "+81-3-5555-0198",
    role: "Head of Robotics Partnerships"
  });
});

test("buildContactDraftReviewRequest builds the web PATCH review payload", () => {
  assert.deepEqual(
    buildContactDraftReviewRequest("demo-business-card-draft", {
      displayName: " Hana Sato ",
      email: " hana.sato@akirobotics.example ",
      organization: " Aki Robotics ",
      phone: " +81-3-5555-0198 ",
      role: " Head of Robotics Partnerships "
    }),
    {
      request: {
        body: {
          reviewedFields: {
            displayName: "Hana Sato",
            email: "hana.sato@akirobotics.example",
            organization: "Aki Robotics",
            phone: "+81-3-5555-0198",
            role: "Head of Robotics Partnerships"
          },
          reviewerLabel: "iOS"
        },
        endpoint: "/api/contact-drafts/demo-business-card-draft"
      },
      success: true
    }
  );

  assert.deepEqual(
    buildContactDraftReviewRequest("demo-business-card-draft", {
      displayName: " ",
      email: "",
      organization: "",
      phone: "",
      role: ""
    }),
    {
      error: "先保留至少一个名片字段。",
      success: false
    }
  );
});

test("business card contact write helper builds the explicit web confirmation request", () => {
  const summary = acquisitionResultToSummary({
    capture: {
      imageDigest: "sha256:business-card-hana"
    },
    draft: {
      displayName: "Hana Sato",
      email: "hana.sato@akirobotics.example",
      evidence: [
        {
          evidenceId: "evidence:business-card-capture-hana",
          excerpt: "Hana Sato\nAki Robotics\nHead of Robotics Partnerships"
        }
      ],
      id: "demo-business-card-draft",
      organization: "Aki Robotics",
      phone: "+81-3-5555-0198",
      relationshipContext:
        "Business card captured after a robotics investor salon conversation.",
      role: "Head of Robotics Partnerships",
      source: {
        label: "Business card scan",
        type: "business_card_ocr"
      },
      status: "pending_confirmation"
    },
    state: "success"
  });

  assert.equal(summary.contactWriteLabel, "写入联系人");
  assert.deepEqual(
    buildBusinessCardContactWriteRequest(summary, {
      displayName: " Hana Sato ",
      email: " hana.sato@akirobotics.example ",
      organization: " Aki Robotics ",
      phone: " +81-3-5555-0198 ",
      role: " Head of Robotics Partnerships "
    }),
    {
      request: {
        body: {
          actorLabel: "Orbit iOS",
          confirmed: true,
          displayName: "Hana Sato",
          draftId: "demo-business-card-draft",
          email: "hana.sato@akirobotics.example",
          evidenceIds: ["evidence:business-card-capture-hana"],
          imageDigest: "sha256:business-card-hana",
          organization: "Aki Robotics",
          phone: "+81-3-5555-0198",
          relationshipContext:
            "Business card captured after a robotics investor salon conversation.",
          role: "Head of Robotics Partnerships"
        },
        endpoint: "/api/contacts/business-card/confirm"
      },
      success: true
    }
  );
});

test("confirmed manual candidates disclose that no contact writer is available", () => {
  const summary = acquisitionResultToSummary({
    confirmedDraft: {
      confirmation: {
        required: false,
        state: "confirmed"
      },
      displayName: "功能审计联系人",
      id: "manual-audit-draft",
      source: {
        label: "Manual contact creation",
        type: "manual"
      },
      status: "confirmed"
    },
    contactCandidate: {
      contactWriteExecuted: false,
      readyForContactWrite: true
    },
    state: "confirmed"
  });

  assert.equal(summary.contactWrite, undefined);
  assert.equal(
    summary.confirmationText,
    "候选已确认；当前流程仍不会写入联系人。"
  );
  assert.equal(summary.writeState, "候选已确认");
});

test("business card contact write result maps created and duplicate states", () => {
  assert.deepEqual(
    businessCardContactWriteToView({
      confirmedAt: "2026-07-24T14:00:00.000Z",
      contactId: "contact:business-card:hana",
      contactWriteExecuted: true,
      duplicateContactId: null,
      evidenceIds: ["evidence:business-card-capture-hana"],
      state: "created"
    }),
    {
      contactId: "contact:business-card:hana",
      detail: "contact:business-card:hana",
      nextAction: "可以去人脉页继续补充关系。",
      openContactLabel: "打开联系人",
      statusLabel: "写入完成",
      title: "联系人已收录"
    }
  );
  assert.deepEqual(
    businessCardContactWriteToView({
      contactId: "contact:business-card:hana",
      duplicateContactId: "contact:existing-hana",
      state: "duplicate_review"
    }),
    {
      contactId: null,
      detail: "contact:existing-hana",
      nextAction: "发现可能重复的人脉，先处理重复项。",
      openContactLabel: "",
      statusLabel: "需要复核",
      title: "暂未写入"
    }
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
        question: "Confirm adding 测试联系人 from the manual note?",
        writeTargets: ["contact"]
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
    confirmationText: "确认后会写入联系人，并保留来源证据。",
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

test("acquisitionResultToSummary discloses pending QR relationship writes", () => {
  const summary = acquisitionResultToSummary({
    draft: {
      contactWriteExecuted: false,
      connectionWriteExecuted: false,
      displayName: "QR 测试联系人",
      email: "qr@example.invalid",
      evidence: [
        {
          excerpt: "由操作者提交的 Orbit QR 字段生成。"
        }
      ],
      id: "qr-draft:live:mobile-1",
      organization: "Orbit",
      relationshipContext: "在东京活动现场扫码认识。",
      role: "合作伙伴",
      source: {
        label: "Tokyo QR",
        type: "qr_scan"
      },
      status: "pending_confirmation",
      confirmation: {
        required: true,
        state: "pending",
        writeTargets: ["contact", "connection"]
      }
    },
    state: "success"
  });

  assert.equal(summary.canConfirm, true);
  assert.equal(
    summary.confirmationText,
    "确认后会写入联系人和关系记录，并保留来源证据。"
  );
  assert.equal(summary.sourceLabel, "QR 扫码");
  assert.equal(summary.writeState, "还没有创建联系人");
});

test("acquisitionResultToSummary exposes a confirmed QR contact write", () => {
  const summary = acquisitionResultToSummary({
    confirmedDraft: {
      contactId: "contact:qr:mobile-1",
      contactWriteExecuted: true,
      connectionId: "connection:qr:mobile-1",
      connectionWriteExecuted: true,
      displayName: "QR 测试联系人",
      id: "qr-draft:live:mobile-1",
      organization: "Orbit",
      role: "合作伙伴",
      source: {
        label: "Tokyo QR",
        type: "qr_scan"
      },
      status: "confirmed",
      confirmation: {
        required: true,
        state: "confirmed",
        writeTargets: ["contact", "connection"]
      }
    },
    contactCandidate: {
      contactId: "contact:qr:mobile-1",
      contactWriteExecuted: true,
      readyForContactWrite: false
    },
    connectionCandidate: {
      connectionId: "connection:qr:mobile-1",
      connectionWriteExecuted: true,
      readyForConnectionWrite: false
    },
    state: "confirmed"
  });

  assert.equal(summary.canConfirm, false);
  assert.equal(summary.contactId, "contact:qr:mobile-1");
  assert.equal(summary.confirmationText, "候选已确认，联系人已写入。");
  assert.equal(summary.writeState, "联系人已写入");
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
      confirmationText: "候选已确认；当前流程仍不会写入联系人。",
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

test("acquisitionResultToSummary exposes a confirmed manual contact write", () => {
  const summary = acquisitionResultToSummary({
    confirmedDraft: {
      contactId: "contact:manual:mobile-1",
      contactWriteExecuted: true,
      displayName: "测试联系人",
      id: "manual-draft:live:1",
      organization: "Orbit",
      role: "AI 导入负责人",
      source: {
        label: "Live manual contact note"
      },
      status: "confirmed"
    },
    contactCandidate: {
      candidateId: "contact-candidate:manual-draft:live:1",
      contactId: "contact:manual:mobile-1",
      contactWriteExecuted: true,
      displayName: "测试联系人",
      duplicateLookupExecuted: true,
      organization: "Orbit",
      readyForContactWrite: false,
      role: "AI 导入负责人"
    },
    nextAction:
      "Open the saved actor-owned contact to continue the relationship workflow.",
    state: "confirmed"
  });

  assert.deepEqual(summary, {
    canConfirm: false,
    contactId: "contact:manual:mobile-1",
    confirmLabel: "已确认候选",
    confirmationText: "候选已确认，联系人已写入。",
    detail: "Orbit · AI 导入负责人",
    draftId: "manual-draft:live:1",
    evidenceExcerpts: [],
    nextAction: "打开已保存的联系人，继续补充关系。",
    sourceLabel: "手动记录",
    stateLabel: "已确认",
    title: "测试联系人",
    writeState: "联系人已写入"
  });
});
