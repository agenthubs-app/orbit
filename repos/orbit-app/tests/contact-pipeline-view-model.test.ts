import assert from "node:assert/strict";
import test from "node:test";

import { contactsPipelineToView } from "../src/view-models/contact-pipeline";
import * as contactPipeline from "../src/view-models/contact-pipeline";

test("contactsPipelineToView maps contacts and connections into a Chinese pipeline", () => {
  const view = contactsPipelineToView({
    connectionsPayload: {
      connections: [
        {
          contactId: "contact_001",
          displayName: "Maya Chen",
          id: "connection_001",
          relationshipStage: "needs_follow_up",
          sourceLinks: [
            {
              label: "Warm referral for Maya Chen",
              type: "referral"
            }
          ],
          strengthScore: 86
        },
        {
          contactId: "contact_002",
          displayName: "佐藤 健",
          id: "connection_002",
          relationshipStage: "active",
          sourceLinks: [
            {
              label: "Direct QR scan for 佐藤 健",
              type: "qr_scan"
            }
          ],
          strengthScore: 58
        }
      ]
    },
    contactsPayload: {
      contacts: [
        {
          displayName: "Maya Chen",
          id: "contact_001",
          imageUrl: "/media/contacts/maya.jpg",
          nextAction: "Review source evidence before agent use.",
          organization: "Northstar",
          profileSnippet:
            "ZH: 正在找日本市场合作伙伴，也能介绍税务顾问。 EN: Looking for Japan partners.",
          role: "Partner",
          status: "needs_follow_up",
          value: {
            score: 91,
            valueTypes: ["strategic_fit", "referral_path"]
          }
        },
        {
          displayName: "佐藤 健",
          id: "contact_002",
          nextAction: "安排一次 30 分钟交流。",
          organization: "Kansai Community",
          relationshipContext:
            "JA: 関西の運営者。 ZH: 关西创业社群的运营者，可帮忙连接本地服务商。 EN: Kansai community operator.",
          role: "Community Lead",
          status: "active",
          value: {
            score: 62,
            valueTypes: ["community_resource"]
          }
        },
        {
          displayName: "李娜",
          id: "contact_003",
          nextAction: "确认下一次合作主题。",
          organization: "Orbit",
          role: "Customer Success",
          status: "partnered",
          value: {
            score: 72,
            valueTypes: ["business_opportunity"]
          }
        }
      ]
    },
    now: "2026-08-25T02:00:00.000Z",
    tasksPayload: {
      tasks: [
        {
          contactId: "contact_001",
          contactName: "Maya Chen",
          dueAt: "2026-08-25T08:00:00.000Z",
          organization: "Northstar",
          taskId: "task_maya_scope",
          title: "复核与 Maya Chen 的下一步"
        },
        {
          contactId: "contact_002",
          contactName: "佐藤 健",
          dueAt: "2026-08-24T08:00:00.000Z",
          organization: "Kansai Community",
          taskId: "task_sato_reply",
          title: "回复上次活动后的消息"
        },
        {
          contactId: "contact_003",
          contactName: "李娜",
          dueAt: "2026-08-26T08:00:00.000Z",
          organization: "Orbit",
          taskId: "relationship-suggestion:connection_003",
          title: "系统建议的跟进"
        },
        {
          contactId: "contact_003",
          contactName: "李娜",
          organization: "Orbit",
          taskId: "task_without_due_date",
          title: "尚未安排日期"
        }
      ]
    }
  });

  assert.equal(view.title, "关系进展");
  assert.equal(view.summary, "3 位联系人，2 项待处理。");
  assert.deepEqual(view.actionItems, [
    {
      contactId: "contact_002",
      contactName: "佐藤 健",
      detail: "Kansai Community · 社群负责人",
      dueLabel: "逾期",
      dueTone: "overdue",
      imageUrl: undefined,
      taskId: "task_sato_reply",
      title: "回复上次活动后的消息"
    },
    {
      contactId: "contact_001",
      contactName: "Maya Chen",
      detail: "Northstar · 合伙人",
      dueLabel: "今天",
      dueTone: "today",
      imageUrl: "/media/contacts/maya.jpg",
      taskId: "task_maya_scope",
      title: "确认与 Maya Chen 的下一步"
    }
  ]);
  assert.deepEqual(view.metrics, [
    { label: "联系人", value: "3" },
    { label: "待联系", value: "1" },
    { label: "推进中", value: "2" },
    { label: "可引荐", value: "1" }
  ]);
  assert.deepEqual(
    view.stages.map((stage) => ({
      count: stage.count,
      id: stage.id,
      label: stage.label
    })),
    [
      { count: 1, id: "to_contact", label: "待联系" },
      { count: 2, id: "in_progress", label: "推进中" },
      { count: 0, id: "nurture", label: "长期维护" },
      { count: 0, id: "archived", label: "已归档" }
    ]
  );
  const firstStage = view.stages[0];
  assert.ok(firstStage);
  assert.deepEqual(firstStage.contacts[0], {
    detail: "Northstar · 合伙人",
    id: "contact_001",
    imageUrl: "/media/contacts/maya.jpg",
    name: "Maya Chen",
    nextAction: "查看来源证据后再联系 Maya Chen。",
    relationship: "正在找日本市场合作伙伴，也能介绍税务顾问。",
    stageAction: {
      connectionId: "connection_001",
      label: "开始推进",
      nextRelationshipStage: "active",
      pendingLabel: "推进中",
      successMessage: "已把 Maya Chen 放入推进中。"
    },
    stageActions: [
      {
        connectionId: "connection_001",
        label: "开始推进",
        nextRelationshipStage: "active",
        pendingLabel: "推进中",
        successMessage: "已把 Maya Chen 放入推进中。"
      },
      {
        connectionId: "connection_001",
        label: "暂不推进",
        nextRelationshipStage: "archived",
        pendingLabel: "归档中",
        successMessage: "已把 Maya Chen 标记为暂不推进。"
      }
    ],
    valueLabels: ["战略契合", "引荐路径"],
    valueScoreLabel: "91分"
  });
  assert.deepEqual(view.introReadiness.candidates, [
    {
      contactId: "contact_001",
      detail: "Northstar · 合伙人",
      id: "contact_001",
      name: "Maya Chen",
      nextAction: "先确认双方需求，再写一段引荐词。",
      reason: "有明确的引荐路径，适合先整理双方需求。",
      sourceLabel: "朋友介绍",
      strengthLabel: "86分"
    }
  ]);
  assert.equal(
    view.introReadiness.apiGap,
    "本次只准备引荐草稿，真正发送前还会再确认。"
  );
});

test("contactsPipelineToView exposes backend-safe actions across pipeline stages", () => {
  const view = contactsPipelineToView({
    connectionsPayload: {
      connections: [
        {
          contactId: "contact_001",
          id: "connection_001",
          relationshipStage: "needs_follow_up"
        },
        {
          contactId: "contact_002",
          id: "connection_002",
          relationshipStage: "active"
        },
        {
          contactId: "contact_003",
          id: "connection_003",
          relationshipStage: "nurture"
        },
        {
          contactId: "contact_004",
          id: "connection_004",
          relationshipStage: "archived"
        }
      ]
    },
    contactsPayload: {
      contacts: [
        {
          displayName: "Maya Chen",
          id: "contact_001",
          nextAction: "确认合作范围。",
          organization: "Northstar",
          role: "Partner",
          status: "needs_follow_up"
        },
        {
          displayName: "佐藤 健",
          id: "contact_002",
          nextAction: "下周约一次咖啡。",
          organization: "Kansai Community",
          role: "Community Lead",
          status: "active"
        },
        {
          displayName: "李娜",
          id: "contact_003",
          nextAction: "保持季度更新。",
          organization: "Orbit",
          role: "Customer Success",
          status: "active"
        },
        {
          displayName: "Hana Sato",
          id: "contact_004",
          nextAction: "暂时不用跟进。",
          organization: "Orbit",
          role: "Advisor",
          status: "partnered"
        },
        {
          displayName: "Kim Park",
          id: "contact_005",
          nextAction: "复盘已完成的合作。",
          organization: "Bridge Labs",
          role: "Operator",
          status: "partnered"
        }
      ]
    },
    tasksPayload: { tasks: [] }
  });

  assert.deepEqual(
    view.stages.map((stage) => ({
      count: stage.count,
      id: stage.id,
      label: stage.label
    })),
    [
      { count: 1, id: "to_contact", label: "待联系" },
      { count: 2, id: "in_progress", label: "推进中" },
      { count: 1, id: "nurture", label: "长期维护" },
      { count: 1, id: "archived", label: "已归档" }
    ]
  );
  assert.deepEqual(view.stages[0]?.contacts[0]?.stageAction, {
    connectionId: "connection_001",
    label: "开始推进",
    nextRelationshipStage: "active",
    pendingLabel: "推进中",
    successMessage: "已把 Maya Chen 放入推进中。"
  });
  assert.deepEqual(
    view.stages[1]?.contacts[0]?.stageActions.map((action) => ({
      label: action.label,
      nextRelationshipStage: action.nextRelationshipStage
    })),
    [
      { label: "转为待联系", nextRelationshipStage: "needs_follow_up" },
      { label: "转长期维护", nextRelationshipStage: "nurture" }
    ]
  );
  assert.deepEqual(
    view.stages[2]?.contacts[0]?.stageActions.map((action) => ({
      label: action.label,
      nextRelationshipStage: action.nextRelationshipStage
    })),
    [
      { label: "开始推进", nextRelationshipStage: "active" },
      { label: "暂不推进", nextRelationshipStage: "archived" }
    ]
  );
  assert.deepEqual(view.stages[3]?.contacts[0]?.stageActions, [
    {
      connectionId: "connection_004",
      label: "恢复待联系",
      nextRelationshipStage: "needs_follow_up",
      pendingLabel: "恢复中",
      successMessage: "已把 Hana Sato 恢复到待联系。"
    }
  ]);
});

test("legacy follow-up stages remain actionable under the contact label", () => {
  for (const token of ["needs_follow_up", "to_contact", "待跟进", "待联系"]) {
    const view = contactsPipelineToView({
      contactsPayload: { contacts: [{ id: "legacy", displayName: "Hana", pipelineStatus: token }] },
      connectionsPayload: { connections: [{ id: "connection:legacy", contactId: "legacy" }] },
      tasksPayload: { tasks: [] }
    });
    assert.equal(view.stages[0]?.label, "待联系");
    assert.equal(view.stages[0]?.contacts[0]?.id, "legacy", token);
    assert.equal(view.stages[0]?.contacts[0]?.stageAction?.nextRelationshipStage, "active");
    assert.equal(view.metrics[1]?.value, "1");
  }
});

test("contactsPipelineToView keeps empty pipeline and intros explicit", () => {
  const view = contactsPipelineToView({
    connectionsPayload: { connections: [] },
    contactsPayload: { contacts: [] },
    tasksPayload: { tasks: [] }
  });

  assert.equal(view.summary, "还没有可展示的关系进展。");
  assert.deepEqual(view.metrics, [
    { label: "联系人", value: "0" },
    { label: "待联系", value: "0" },
    { label: "推进中", value: "0" },
    { label: "可引荐", value: "0" }
  ]);
  assert.deepEqual(
    view.stages.map((stage) => stage.count),
    [0, 0, 0, 0]
  );
  assert.deepEqual(view.actionItems, []);
  assert.deepEqual(view.introReadiness.candidates, []);
  assert.equal(view.introReadiness.summary, "还没有适合发起引荐的候选。");
});

test("contact invitation helpers prepare editable invitations through the web API", () => {
  const buildContactInvitationPrepareRequest = (
    contactPipeline as typeof contactPipeline & {
      buildContactInvitationPrepareRequest?: (input: {
        contactId: string;
        recipientEmail: string;
        recipientName: string;
      }) => unknown;
    }
  ).buildContactInvitationPrepareRequest;

  assert.equal(typeof buildContactInvitationPrepareRequest, "function");
  assert.deepEqual(
    buildContactInvitationPrepareRequest?.({
      contactId: " contact_001 ",
      recipientEmail: " MAYA@EXAMPLE.COM ",
      recipientName: " Maya Chen "
    }),
    {
      request: {
        body: {
          contactId: "contact_001",
          recipientEmail: "maya@example.com",
          recipientName: "Maya Chen"
        },
        endpoint: "/api/contact-invitations"
      },
      success: true
    }
  );
  assert.deepEqual(
    buildContactInvitationPrepareRequest?.({
      contactId: "contact_001",
      recipientEmail: "not-an-email",
      recipientName: "Maya Chen"
    }),
    {
      error: "需要联系人、姓名和有效邮箱，才能准备邀请。",
      success: false
    }
  );
});

test("contact invitation helpers confirm reviewed copy without sending", () => {
  const buildContactInvitationConfirmRequest = (
    contactPipeline as typeof contactPipeline & {
      buildContactInvitationConfirmRequest?: (input: {
        body: string;
        invitationId: string;
        subject: string;
      }) => unknown;
    }
  ).buildContactInvitationConfirmRequest;
  const contactInvitationToView = (
    contactPipeline as typeof contactPipeline & {
      contactInvitationToView?: (payload: unknown) => unknown;
    }
  ).contactInvitationToView;

  assert.equal(typeof buildContactInvitationConfirmRequest, "function");
  assert.deepEqual(
    buildContactInvitationConfirmRequest?.({
      body: " 很高兴认识你，想邀请你加入 Orbit。 ",
      invitationId: " contact-invitation:demo ",
      subject: " Orbit 邀请 "
    }),
    {
      request: {
        body: {
          body: "很高兴认识你，想邀请你加入 Orbit。",
          confirmed: true,
          invitationId: "contact-invitation:demo",
          subject: "Orbit 邀请"
        },
        endpoint: "/api/contact-invitations"
      },
      success: true
    }
  );
  assert.deepEqual(
    buildContactInvitationConfirmRequest?.({
      body: "",
      invitationId: "contact-invitation:demo",
      subject: "Orbit 邀请"
    }),
    {
      error: "需要邀请 ID、主题和正文，才能确认邀请。",
      success: false
    }
  );

  assert.equal(typeof contactInvitationToView, "function");
  assert.deepEqual(
    contactInvitationToView?.({
      body: "欢迎加入 Orbit。",
      contactId: "contact_001",
      emailProviderRequested: false,
      externalSendRequested: false,
      invitationId: "contact-invitation:demo",
      messageSent: false,
      nextAction:
        "Review and edit the invitation, then confirm it separately from contact creation.",
      recipientEmail: "maya@example.com",
      recipientName: "Maya Chen",
      status: "draft",
      subject: "加入 Orbit",
      updatedAt: "2026-06-25T09:00:00.000Z"
    }),
    {
      body: "欢迎加入 Orbit。",
      boundaryText:
        "externalSendRequested=false · emailProviderRequested=false · messageSent=false",
      canConfirm: true,
      id: "contact-invitation:demo",
      nextAction: "复核主题和正文，确认后只会进入待投递。",
      recipientLine: "Maya Chen · maya@example.com",
      safetyText: "确认后也不会发送邮件，只会把邀请标记为待投递。",
      statusLabel: "草稿待确认",
      subject: "加入 Orbit",
      title: "邀请草稿"
    }
  );
  assert.deepEqual(
    contactInvitationToView?.({
      body: "欢迎加入 Orbit。",
      contactId: "contact_001",
      emailProviderRequested: false,
      externalSendRequested: false,
      invitationId: "contact-invitation:demo",
      messageSent: false,
      nextAction:
        "Configure an email delivery provider before sending this invitation.",
      recipientEmail: "maya@example.com",
      recipientName: "Maya Chen",
      status: "ready_for_delivery",
      subject: "加入 Orbit",
      updatedAt: "2026-06-25T09:10:00.000Z"
    }),
    {
      body: "欢迎加入 Orbit。",
      boundaryText:
        "externalSendRequested=false · emailProviderRequested=false · messageSent=false",
      canConfirm: false,
      id: "contact-invitation:demo",
      nextAction: "等邮件投递配置完成后，再决定是否发送。",
      recipientLine: "Maya Chen · maya@example.com",
      safetyText: "当前只是待投递记录，没有发送邮件。",
      statusLabel: "待投递",
      subject: "加入 Orbit",
      title: "邀请已确认"
    }
  );
});
