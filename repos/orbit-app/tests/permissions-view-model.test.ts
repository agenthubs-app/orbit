import assert from "node:assert/strict";
import test from "node:test";

type PermissionsModule = {
  buildCalendarPermissionRequest?: (input?: {
    intent?: string | null;
  }) => { intent: string };
  calendarPermissionRequestToView?: (data: unknown) => unknown;
  permissionStatesToView?: (data: unknown) => unknown;
};

async function loadPermissionsModule(): Promise<PermissionsModule | null> {
  try {
    return (await import("../src/view-models/permissions")) as PermissionsModule;
  } catch {
    return null;
  }
}

test("permissionStatesToView maps staged permission states into Chinese cards", async () => {
  const permissionsModule = await loadPermissionsModule();
  assert.equal(typeof permissionsModule?.permissionStatesToView, "function");

  const view = permissionsModule?.permissionStatesToView?.({
    nextAction:
      "Use staged authorization review before any sensitive relationship workflow runs.",
    permissions: [
      {
        actionLabel: "Use contact context",
        authorizationStage: "ready",
        capability: "contacts",
        evidence: [
          {
            excerpt:
              "Imported relationship context can be read from the mock contacts store.",
            sourceLabel: "Manual contacts setup"
          }
        ],
        label: "Contacts",
        rationale:
          "Contact context is already available from sourced demo fixtures.",
        requiredFor: "Manual add, imports, merge review, and relationship search.",
        status: "authorized"
      },
      {
        actionLabel: "Review calendar request",
        authorizationStage: "staged-review",
        capability: "calendar",
        evidence: [
          {
            excerpt:
              "Event readiness can stage calendar access without leaving the mock boundary.",
            sourceLabel: "Calendar staging review"
          }
        ],
        label: "Calendar",
        rationale:
          "Calendar access is waiting for explicit staged authorization review.",
        requiredFor: "Event readiness, meeting context, and follow-up timing.",
        status: "pending"
      },
      {
        actionLabel: "Wait for camera review",
        authorizationStage: "blocked-by-dependency",
        capability: "business-card-scan",
        evidence: [
          {
            excerpt:
              "Business-card capture waits for explicit operator review before scanning.",
            sourceLabel: "Camera access deferred"
          }
        ],
        label: "Business-card scan",
        rationale:
          "Scan capability remains staged behind the camera permission review.",
        requiredFor: "Business-card OCR rehearsal.",
        status: "available_after_camera"
      }
    ],
    state: "success",
    summary:
      "Eight permission boundaries are represented by deterministic mock states."
  });

  assert.deepEqual(view, {
    canRequestCalendar: true,
    emptyText: "",
    nextAction: "先处理待复核的权限，再继续活动准备或跟进。",
    permissions: [
      {
        actionLabel: "使用联系人资料",
        evidence: ["手动联系人设置：已导入的关系资料可以用于联系人列表。"],
        id: "contacts",
        reason: "联系人资料已经可以用于关系工作。",
        requiredFor: "导入联系人、合并复核和关系搜索。",
        stageLabel: "已准备",
        statusLabel: "已可用",
        title: "联系人",
        tone: "ready"
      },
      {
        actionLabel: "复核日历请求",
        evidence: ["日历复核：活动准备可以先复核日历访问意图。"],
        id: "calendar",
        reason: "日历访问正在等你确认。",
        requiredFor: "活动准备、会议上下文和跟进时间判断。",
        stageLabel: "待复核",
        statusLabel: "待复核",
        title: "日历",
        tone: "pending"
      },
      {
        actionLabel: "先处理相机权限",
        evidence: ["相机权限：名片拍摄需要先确认相机访问。"],
        id: "business-card-scan",
        reason: "名片扫描要等相机权限确认后才能继续。",
        requiredFor: "名片 OCR 复核。",
        stageLabel: "等前置权限",
        statusLabel: "等相机权限",
        title: "名片扫描",
        tone: "blocked"
      }
    ],
    summary: "1 项可用 · 1 项待复核 · 1 项等前置权限",
    title: "权限中心"
  });
  assert.doesNotMatch(JSON.stringify(view), /mock|provider|fixture|staged|authorization/i);
});

test("permissionStatesToView keeps empty permission states useful", async () => {
  const permissionsModule = await loadPermissionsModule();
  assert.equal(typeof permissionsModule?.permissionStatesToView, "function");

  const view = permissionsModule?.permissionStatesToView?.({
    nextAction:
      "Select a relationship workflow before requesting any staged permission.",
    permissions: [],
    state: "empty",
    summary: "No permission workflow has been selected in this empty scenario."
  });

  assert.deepEqual(view, {
    canRequestCalendar: true,
    emptyText: "还没有需要处理的权限。",
    nextAction: "先从活动准备、跟进或名片录入里选择一个要继续的任务。",
    permissions: [],
    summary: "0 项权限需要处理",
    title: "权限中心"
  });
});

test("calendar permission helpers keep the request inside staged review", async () => {
  const permissionsModule = await loadPermissionsModule();
  assert.equal(typeof permissionsModule?.buildCalendarPermissionRequest, "function");
  assert.equal(typeof permissionsModule?.calendarPermissionRequestToView, "function");

  assert.deepEqual(permissionsModule?.buildCalendarPermissionRequest?.(), {
    intent: "connect-event-calendar"
  });

  const view = permissionsModule?.calendarPermissionRequestToView?.({
    nextAction:
      "Show a staged authorization review instead of opening a provider flow.",
    permission: {
      actionLabel: "Review calendar request",
      authorizationStage: "staged-review",
      capability: "calendar",
      label: "Calendar",
      requiredFor: "Event readiness, meeting context, and follow-up timing.",
      status: "pending"
    },
    request: {
      capability: "calendar",
      evidenceIds: ["evidence:calendar-request-review"],
      id: "permission-request:calendar:event-readiness",
      intent: "connect-event-calendar",
      replacesProviderFlow: true,
      reviewLabel: "Calendar event readiness review",
      status: "pending"
    },
    state: "pending"
  });

  assert.deepEqual(view, {
    detail: "活动准备、会议上下文和跟进时间判断。",
    evidenceIds: ["evidence:calendar-request-review"],
    nextAction: "留在 Orbit 里复核，不会打开系统日历或外部账号授权。",
    requestId: "permission-request:calendar:event-readiness",
    statusLabel: "待复核",
    title: "日历权限待复核"
  });
});
