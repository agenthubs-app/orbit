import {
  createBusinessCardScanOcrService,
  createContactAcquisitionDraftService,
  createDuplicateMergeService,
  createEmailCalendarSignalService,
  createEventAttendeeImportService,
  createExternalContactsImportService,
  createManualContactCreationService,
  createQrScanConnectService,
  createReferralRecommendationService,
} from "../../../../../../features/acquisition/service-factory";
import { createPermissionStateService } from "../../../../../../features/permissions/service-factory";

export type AppContactsNewSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppContactsNewRouteScenario = "empty" | "pending" | "failure";

// New Contact 页面是一组 acquisition 能力的工作台：
// 手动录入、名片、QR、活动参会者、外部导入、邮箱/日历信号、推荐和合并都在这里汇总。
export function createAppContactsNewRouteServices() {
  return {
    businessCards: createBusinessCardScanOcrService(),
    contactDrafts: createContactAcquisitionDraftService(),
    duplicateMerges: createDuplicateMergeService(),
    emailCalendarSignals: createEmailCalendarSignalService(),
    eventAttendees: createEventAttendeeImportService(),
    externalContacts: createExternalContactsImportService(),
    manualContacts: createManualContactCreationService(),
    permissions: createPermissionStateService(),
    qrConnections: createQrScanConnectService(),
    referrals: createReferralRecommendationService(),
  };
}

function readSearchParam(
  searchParams: AppContactsNewSearchParams | undefined,
  key: string,
): string | null {
  // Next searchParams 可能把重复 key 表达成数组；页面级读取只取第一个值。
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppContactsNewSearchParams | undefined,
): AppContactsNewRouteScenario | null {
  // 只允许页面显式支持的场景进入 route-state 分支。
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

export function loadAppContactsNewRouteViewModel(
  searchParams?: AppContactsNewSearchParams,
) {
  // view model 层同步调用各 mock service，把页面首屏需要的状态一次性装配好。
  const services = createAppContactsNewRouteServices();
  const requestedScenario = readRouteScenario(searchParams);

  if (requestedScenario) {
    // 场景模式用于锁定 empty/pending/failure 等状态，方便页面和截图测试覆盖边界。
    const draftState = services.contactDrafts.listContactDrafts({
      scenario: requestedScenario,
    });
    const manualState = services.manualContacts.createManualContactDraft({
      scenario: requestedScenario,
    });
    const cardState = services.businessCards.scanBusinessCard({
      scenario: requestedScenario,
    });
    const qrState = services.qrConnections.scanQrCode({
      scenario: requestedScenario,
    });
    const eventState = services.eventAttendees.importEventAttendees({
      eventId: "demo-event-1",
      scenario: requestedScenario,
    });
    const externalState = services.externalContacts.importExternalContacts({
      scenario: requestedScenario,
    });
    const signalState = services.emailCalendarSignals.listEmailCalendarSignals({
      scenario: requestedScenario,
    });
    const referralState = services.referrals.createReferralContactDrafts({
      scenario: requestedScenario,
    });
    const mergeState = services.duplicateMerges.listMergeSuggestions({
      scenario: requestedScenario,
    });

    return {
      routeState: {
        cardState,
        draftState,
        eventState,
        externalState,
        manualState,
        mergeState,
        qrState,
        referralState,
        scenario: requestedScenario,
        signalState,
      },
      state: "route-state" as const,
    };
  }

  // 默认成功路径会同时准备所有 acquisition 卡片的数据。
  const draftQueue = services.contactDrafts.listContactDrafts();
  const manualState = services.manualContacts.createManualContactDraft();
  const cardState = services.businessCards.scanBusinessCard();
  const qrState = services.qrConnections.scanQrCode();
  const eventState = services.eventAttendees.importEventAttendees({
    eventId: "demo-event-1",
  });
  const externalState = services.externalContacts.importExternalContacts();
  const signalState = services.emailCalendarSignals.listEmailCalendarSignals();
  const referralState = services.referrals.createReferralContactDrafts();
  const mergeState = services.duplicateMerges.listMergeSuggestions();
  const permissionState = services.permissions.listPermissionStates();
  const actionRequested =
    readSearchParam(searchParams, "action") === "confirm-manual-draft";
  const manualDraft =
    manualState.success === true ? manualState.data.draft : null;
  // action=confirm-manual-draft 是页面内演示确认流程的开关；没有该参数时不触发确认动作。
  const manualConfirmation =
    actionRequested && manualDraft
      ? services.manualContacts.confirmManualContactDraft({
          actorLabel: "Orbit operator",
          draftId: manualDraft.id,
        })
      : null;

  return {
    // workspace 中保留每个 acquisition 子模块的原始 service result，让 UI 能分别展示状态。
    state: "success" as const,
    workspace: {
      actionRequested,
      cardState,
      draftQueue,
      eventState,
      externalState,
      manualConfirmation,
      manualState,
      mergeState,
      permissionState,
      qrState,
      referralState,
      signalState,
    },
  };
}
