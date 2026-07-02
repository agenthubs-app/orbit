import {
  createContactAcquisitionServices,
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
import {
  resolveModuleMode,
  type ModuleMode,
} from "../../../../../../shared/services/module-mode";

export type AppContactsNewSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppContactsNewRouteScenario = "empty" | "pending" | "failure";
export type AppContactsNewRouteState = AppContactsNewRouteScenario;

type ServiceResult = {
  success: boolean;
  data?: unknown;
  error?: {
    code?: string;
    message?: string;
  };
  evidenceIds?: readonly string[];
};

export interface AppContactsNewRouteStateViewModel {
  errorCode?: string;
  evidenceIds: readonly string[];
  routeState: Exclude<AppContactsNewRouteState, "success">;
  scenario: AppContactsNewRouteScenario;
}

// New Contact 页面是一组 acquisition 能力的工作台：
// 手动录入、名片、QR、活动参会者、外部导入、邮箱/日历信号、推荐和合并都在这里汇总。
export function createAppContactsNewRouteServices(mode?: ModuleMode | string) {
  const resolvedMode = resolveModuleMode(mode);

  if (resolvedMode !== "mock") {
    const services = createContactAcquisitionServices(resolvedMode);

    return {
      businessCards: services.businessCardScanService,
      contactDrafts: services.draftService,
      duplicateMerges: services.mergeService,
      emailCalendarSignals: services.emailCalendarSignalService,
      eventAttendees: services.eventAttendeeImportService,
      externalContacts: services.externalImportService,
      manualContacts: services.manualService,
      permissions: createPermissionStateService(mode),
      qrConnections: services.qrService,
      referrals: services.referralService,
    };
  }

  return {
    businessCards: createBusinessCardScanOcrService("mock"),
    contactDrafts: createContactAcquisitionDraftService("mock"),
    duplicateMerges: createDuplicateMergeService("mock"),
    emailCalendarSignals: createEmailCalendarSignalService("mock"),
    eventAttendees: createEventAttendeeImportService("mock"),
    externalContacts: createExternalContactsImportService("mock"),
    manualContacts: createManualContactCreationService("mock"),
    permissions: createPermissionStateService("mock"),
    qrConnections: createQrScanConnectService("mock"),
    referrals: createReferralRecommendationService("mock"),
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

function readRequestedMode(
  searchParams?: AppContactsNewSearchParams,
): ModuleMode | string | undefined {
  return readSearchParam(searchParams, "mode") ?? undefined;
}

function readEventId(
  searchParams: AppContactsNewSearchParams | undefined,
  mode: ModuleMode,
): string {
  return (
    readSearchParam(searchParams, "eventId") ??
    (mode === "mock" ? "demo-event-1" : "event_01")
  );
}

function manualInputReadyState(): ServiceResult {
  return {
    data: {
      mode: "manual-input-required",
    },
    evidenceIds: [],
    success: true,
  };
}

function resultEvidenceIds(result: ServiceResult): readonly string[] {
  if (Array.isArray(result.evidenceIds)) {
    return result.evidenceIds;
  }

  if (result.error?.code) {
    return [`evidence:${result.error.code.toLowerCase()}`];
  }

  return [];
}

function isFailureResult(result: ServiceResult): boolean {
  return result.success === false;
}

function routeStateFromResults(
  results: readonly ServiceResult[],
): AppContactsNewRouteStateViewModel | null {
  const failure = results.find(isFailureResult);

  if (!failure) {
    return null;
  }

  return {
    errorCode: failure.error?.code,
    evidenceIds: resultEvidenceIds(failure),
    routeState: "failure",
    scenario: "failure",
  };
}

function draftIdForConfirmation(result: ServiceResult): string | null {
  if (result.success !== true || typeof result.data !== "object" || result.data === null) {
    return null;
  }

  const draft = "draft" in result.data ? result.data.draft : null;

  if (typeof draft !== "object" || draft === null) {
    return null;
  }

  const id = "id" in draft ? draft.id : null;

  return typeof id === "string" ? id : null;
}

export async function loadAppContactsNewRouteViewModel(
  searchParams?: AppContactsNewSearchParams,
) {
  const requestedMode = readRequestedMode(searchParams);
  const resolvedMode = resolveModuleMode(requestedMode);
  const services = createAppContactsNewRouteServices(requestedMode);
  const requestedScenario = readRouteScenario(searchParams);
  const eventId = readEventId(searchParams, resolvedMode);

  if (requestedScenario) {
    // 场景模式用于锁定 empty/pending/failure 等状态，方便页面和截图测试覆盖边界。
    const [
      draftState,
      manualState,
      cardState,
      qrState,
      eventState,
      externalState,
      signalState,
      referralState,
      mergeState,
    ] = await Promise.all([
      services.contactDrafts.listContactDrafts({
        scenario: requestedScenario,
      }),
      services.manualContacts.createManualContactDraft({
        scenario: requestedScenario,
      }),
      services.businessCards.scanBusinessCard({
        scenario: requestedScenario,
      }),
      services.qrConnections.scanQrCode({
        scenario: requestedScenario,
      }),
      services.eventAttendees.importEventAttendees({
        eventId,
        scenario: requestedScenario,
      }),
      services.externalContacts.importExternalContacts({
        scenario: requestedScenario,
      }),
      services.emailCalendarSignals.listEmailCalendarSignals({
        scenario: requestedScenario,
      }),
      services.referrals.createReferralContactDrafts({
        scenario: requestedScenario,
      }),
      services.duplicateMerges.listMergeSuggestions({
        scenario: requestedScenario,
      }),
    ]);

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
  const manualStateRequest =
    resolvedMode === "mock"
      ? services.manualContacts.createManualContactDraft()
      : manualInputReadyState();
  const [
    draftQueue,
    manualState,
    cardState,
    qrState,
    eventState,
    externalState,
    signalState,
    referralState,
    mergeState,
    permissionState,
  ] = await Promise.all([
    services.contactDrafts.listContactDrafts(),
    manualStateRequest,
    services.businessCards.scanBusinessCard(),
    services.qrConnections.scanQrCode(),
    services.eventAttendees.importEventAttendees({
      eventId,
    }),
    services.externalContacts.importExternalContacts(),
    services.emailCalendarSignals.listEmailCalendarSignals(),
    services.referrals.createReferralContactDrafts(),
    services.duplicateMerges.listMergeSuggestions(),
    services.permissions.listPermissionStates(),
  ]);
  const routeState = routeStateFromResults([
    draftQueue,
    manualState,
    cardState,
    qrState,
    eventState,
    externalState,
    signalState,
    referralState,
    mergeState,
    permissionState,
  ]);

  if (routeState) {
    return {
      routeState,
      state: "route-state" as const,
    };
  }

  const actionRequested =
    readSearchParam(searchParams, "action") === "confirm-manual-draft";
  const manualDraftId = draftIdForConfirmation(manualState);
  // action=confirm-manual-draft 是页面内演示确认流程的开关；没有该参数时不触发确认动作。
  const manualConfirmation =
    actionRequested && manualDraftId
      ? await services.manualContacts.confirmManualContactDraft({
          actorLabel: "Orbit operator",
          draftId: manualDraftId,
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
