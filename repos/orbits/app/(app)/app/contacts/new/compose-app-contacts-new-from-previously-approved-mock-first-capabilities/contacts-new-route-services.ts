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
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppContactsNewSearchParams | undefined,
): AppContactsNewRouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

export function loadAppContactsNewRouteViewModel(
  searchParams?: AppContactsNewSearchParams,
) {
  const services = createAppContactsNewRouteServices();
  const requestedScenario = readRouteScenario(searchParams);

  if (requestedScenario) {
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
  const manualConfirmation =
    actionRequested && manualDraft
      ? services.manualContacts.confirmManualContactDraft({
          actorLabel: "Orbit operator",
          draftId: manualDraft.id,
        })
      : null;

  return {
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
