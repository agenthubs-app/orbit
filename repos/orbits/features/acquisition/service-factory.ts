import {
  createModuleServiceFactory,
  type ModuleMode,
  type ServiceResolution,
} from "../../shared/services/module-mode";
import { createMockBusinessCardReviewService } from "./mock-business-card-review-service";
import { createMockBusinessCardScanOcrService } from "./mock-business-card-service";
import { createMockEmailCalendarSignalService } from "./mock-email-calendar-service";
import { createMockEventAttendeeImportService } from "./mock-event-attendee-import-service";
import { createMockExternalContactsImportService } from "./mock-external-import-service";
import { createMockManualContactCreationService } from "./mock-manual-service";
import { createMockDuplicateMergeService } from "./mock-merge-service";
import { createMockQrScanConnectService } from "./mock-qr-service";
import { createMockReferralRecommendationService } from "./mock-referral-service";
import { createMockContactAcquisitionDraftService } from "./mock-service";
import type { BusinessCardReviewService } from "./business-card-review-contract";
import type { BusinessCardScanOcrService } from "./business-card-contract";
import type { EmailCalendarSignalService } from "./email-calendar-contract";
import type { EventAttendeeImportService } from "./event-attendee-contract";
import type { ExternalContactsImportService } from "./external-import-contract";
import type { ManualContactCreationService } from "./manual-contract";
import type { DuplicateDetectionMergeService } from "./merge-contract";
import type { QrScanConnectService } from "./qr-contract";
import type { ReferralRecommendationService } from "./referral-contract";
import type { ContactAcquisitionDraftService } from "./service";

export interface ContactAcquisitionServices {
  draftService: ContactAcquisitionDraftService;
  manualService: ManualContactCreationService;
  businessCardScanService: BusinessCardScanOcrService;
  businessCardReviewService: BusinessCardReviewService;
  qrService: QrScanConnectService;
  eventAttendeeImportService: EventAttendeeImportService;
  externalImportService: ExternalContactsImportService;
  emailCalendarSignalService: EmailCalendarSignalService;
  referralService: ReferralRecommendationService;
  mergeService: DuplicateDetectionMergeService;
}

export const contactAcquisitionDraftServiceFactory =
  createModuleServiceFactory<ContactAcquisitionDraftService>({
    capabilityId: "contact-acquisition-draft",
    implementations: {
      mock: () => createMockContactAcquisitionDraftService(),
    },
  });

export const manualContactCreationServiceFactory =
  createModuleServiceFactory<ManualContactCreationService>({
    capabilityId: "manual-contact-creation",
    implementations: {
      mock: () => createMockManualContactCreationService(),
    },
  });

export const businessCardScanOcrServiceFactory =
  createModuleServiceFactory<BusinessCardScanOcrService>({
    capabilityId: "business-card-scan-ocr",
    implementations: {
      mock: () => createMockBusinessCardScanOcrService(),
    },
  });

export const businessCardReviewServiceFactory =
  createModuleServiceFactory<BusinessCardReviewService>({
    capabilityId: "business-card-review",
    implementations: {
      mock: () => createMockBusinessCardReviewService(),
    },
  });

export const qrScanConnectServiceFactory =
  createModuleServiceFactory<QrScanConnectService>({
    capabilityId: "qr-scan-connect",
    implementations: {
      mock: () => createMockQrScanConnectService(),
    },
  });

export const eventAttendeeImportServiceFactory =
  createModuleServiceFactory<EventAttendeeImportService>({
    capabilityId: "event-attendee-import",
    implementations: {
      mock: () => createMockEventAttendeeImportService(),
    },
  });

export const externalContactsImportServiceFactory =
  createModuleServiceFactory<ExternalContactsImportService>({
    capabilityId: "external-contacts-import",
    implementations: {
      mock: () => createMockExternalContactsImportService(),
    },
  });

export const emailCalendarSignalServiceFactory =
  createModuleServiceFactory<EmailCalendarSignalService>({
    capabilityId: "email-calendar-signal",
    implementations: {
      mock: () => createMockEmailCalendarSignalService(),
    },
  });

export const referralRecommendationServiceFactory =
  createModuleServiceFactory<ReferralRecommendationService>({
    capabilityId: "referral-recommendation",
    implementations: {
      mock: () => createMockReferralRecommendationService(),
    },
  });

export const duplicateMergeServiceFactory =
  createModuleServiceFactory<DuplicateDetectionMergeService>({
    capabilityId: "duplicate-detection-merge",
    implementations: {
      mock: () => createMockDuplicateMergeService(),
    },
  });

function createRequiredService<TService>(
  resolution: ServiceResolution<TService>,
): TService {
  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveContactAcquisitionDraftService(
  mode?: ModuleMode | string,
) {
  return contactAcquisitionDraftServiceFactory.create(mode);
}

export function createContactAcquisitionDraftService(
  mode?: ModuleMode | string,
): ContactAcquisitionDraftService {
  return createRequiredService(resolveContactAcquisitionDraftService(mode));
}

export function resolveManualContactCreationService(
  mode?: ModuleMode | string,
) {
  return manualContactCreationServiceFactory.create(mode);
}

export function createManualContactCreationService(
  mode?: ModuleMode | string,
): ManualContactCreationService {
  return createRequiredService(resolveManualContactCreationService(mode));
}

export function resolveBusinessCardScanOcrService(
  mode?: ModuleMode | string,
) {
  return businessCardScanOcrServiceFactory.create(mode);
}

export function createBusinessCardScanOcrService(
  mode?: ModuleMode | string,
): BusinessCardScanOcrService {
  return createRequiredService(resolveBusinessCardScanOcrService(mode));
}

export function resolveBusinessCardReviewService(
  mode?: ModuleMode | string,
) {
  return businessCardReviewServiceFactory.create(mode);
}

export function createBusinessCardReviewService(
  mode?: ModuleMode | string,
): BusinessCardReviewService {
  return createRequiredService(resolveBusinessCardReviewService(mode));
}

export function resolveQrScanConnectService(mode?: ModuleMode | string) {
  return qrScanConnectServiceFactory.create(mode);
}

export function createQrScanConnectService(
  mode?: ModuleMode | string,
): QrScanConnectService {
  return createRequiredService(resolveQrScanConnectService(mode));
}

export function resolveEventAttendeeImportService(
  mode?: ModuleMode | string,
) {
  return eventAttendeeImportServiceFactory.create(mode);
}

export function createEventAttendeeImportService(
  mode?: ModuleMode | string,
): EventAttendeeImportService {
  return createRequiredService(resolveEventAttendeeImportService(mode));
}

export function resolveExternalContactsImportService(
  mode?: ModuleMode | string,
) {
  return externalContactsImportServiceFactory.create(mode);
}

export function createExternalContactsImportService(
  mode?: ModuleMode | string,
): ExternalContactsImportService {
  return createRequiredService(resolveExternalContactsImportService(mode));
}

export function resolveEmailCalendarSignalService(
  mode?: ModuleMode | string,
) {
  return emailCalendarSignalServiceFactory.create(mode);
}

export function createEmailCalendarSignalService(
  mode?: ModuleMode | string,
): EmailCalendarSignalService {
  return createRequiredService(resolveEmailCalendarSignalService(mode));
}

export function resolveReferralRecommendationService(
  mode?: ModuleMode | string,
) {
  return referralRecommendationServiceFactory.create(mode);
}

export function createReferralRecommendationService(
  mode?: ModuleMode | string,
): ReferralRecommendationService {
  return createRequiredService(resolveReferralRecommendationService(mode));
}

export function resolveDuplicateMergeService(mode?: ModuleMode | string) {
  return duplicateMergeServiceFactory.create(mode);
}

export function createDuplicateMergeService(
  mode?: ModuleMode | string,
): DuplicateDetectionMergeService {
  return createRequiredService(resolveDuplicateMergeService(mode));
}

export function createContactAcquisitionServices(
  mode?: ModuleMode | string,
): ContactAcquisitionServices {
  return {
    draftService: createContactAcquisitionDraftService(mode),
    manualService: createManualContactCreationService(mode),
    businessCardScanService: createBusinessCardScanOcrService(mode),
    businessCardReviewService: createBusinessCardReviewService(mode),
    qrService: createQrScanConnectService(mode),
    eventAttendeeImportService: createEventAttendeeImportService(mode),
    externalImportService: createExternalContactsImportService(mode),
    emailCalendarSignalService: createEmailCalendarSignalService(mode),
    referralService: createReferralRecommendationService(mode),
    mergeService: createDuplicateMergeService(mode),
  };
}
