// Acquisition service factory 管理“联系人获取”相关的一组入口：
// 手动创建、名片 OCR、二维码、活动导入、外部联系人导入、邮件/日历信号、推荐和去重合并。
// 当前全部是 mock-first 实现，页面和 API route 通过这里统一取服务，避免直接依赖 fixture。
import {
  createModuleServiceFactory,
  type ModuleMode,
  type ServiceResolution,
} from "../../shared/services/module-mode";
import { createLiveContactAcquisitionDraftService } from "./live-service";
import { createLiveEmailCalendarSignalService } from "./live-email-calendar-service";
import { createLiveEventAttendeeImportService } from "./live-event-attendee-import-service";
import { createLiveExternalContactsImportService } from "./live-external-import-service";
import { createLiveManualContactCreationService } from "./live-manual-service";
import { createLiveDuplicateMergeService } from "./live-merge-service";
import { createLiveReferralRecommendationService } from "./live-referral-service";
import { createLiveBusinessCardReviewService } from "./live-business-card-review-service";
import { createLiveQrScanConnectService } from "./live-qr-service";
import { createLiveBusinessCardScanOcrService } from "./live-business-card-scan-service";
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
import type { MockContactAcquisitionDraftService } from "./mock-service";
import type { MockManualContactCreationService } from "./mock-manual-service";
import type { MockDuplicateMergeService } from "./mock-merge-service";
import type { MockExternalContactsImportService } from "./mock-external-import-service";
import type { MockEmailCalendarSignalService } from "./mock-email-calendar-service";
import type { MockReferralRecommendationService } from "./mock-referral-service";
import type { MockBusinessCardReviewService } from "./mock-business-card-review-service";
import type { MockQrScanConnectService } from "./mock-qr-service";
import type { MockBusinessCardScanOcrService } from "./mock-business-card-service";
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
import { createConfiguredStorageContactAcquisitionDraftProvider } from "./storage/contact-draft-live-record-provider";
import { createConfiguredStorageDuplicateMergeProvider } from "./storage/duplicate-merge-live-record-provider";
import { createConfiguredStorageEmailCalendarSignalProvider } from "./storage/email-calendar-live-record-provider";
import { createConfiguredStorageEventAttendeeImportProvider } from "./storage/event-attendee-live-record-provider";
import { createConfiguredStorageExternalContactsImportProvider } from "./storage/external-import-live-record-provider";
import { createConfiguredStorageReferralRecommendationProvider } from "./storage/referral-live-record-provider";
import { createConfiguredStorageBusinessCardReviewProvider } from "./storage/business-card-review-live-record-provider";
import { createConfiguredStorageQrScanConnectProvider } from "./storage/qr-live-record-provider";
import { createConfiguredStorageBusinessCardScanOcrProvider } from "./storage/business-card-scan-live-record-provider";

// 聚合类型用于需要一次性拿到 acquisition 全家桶的页面/view model。
// 每个字段仍然是独立 capability，未来可以逐个替换成 live 实现。
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
      live: () =>
        createLiveContactAcquisitionDraftService({
          provider: createConfiguredStorageContactAcquisitionDraftProvider(),
        }),
      mock: () => createMockContactAcquisitionDraftService(),
    },
  });

export const manualContactCreationServiceFactory =
  createModuleServiceFactory<ManualContactCreationService>({
    capabilityId: "manual-contact-creation",
    implementations: {
      live: () =>
        createLiveManualContactCreationService({
          provider: createConfiguredStorageContactAcquisitionDraftProvider(),
        }),
      mock: () => createMockManualContactCreationService(),
    },
  });

export const businessCardScanOcrServiceFactory =
  createModuleServiceFactory<BusinessCardScanOcrService>({
    capabilityId: "business-card-scan-ocr",
    implementations: {
      live: () =>
        createLiveBusinessCardScanOcrService({
          provider: createConfiguredStorageBusinessCardScanOcrProvider(),
        }),
      mock: () => createMockBusinessCardScanOcrService(),
    },
  });

export const businessCardReviewServiceFactory =
  createModuleServiceFactory<BusinessCardReviewService>({
    capabilityId: "business-card-review",
    implementations: {
      live: () =>
        createLiveBusinessCardReviewService({
          provider: createConfiguredStorageBusinessCardReviewProvider(),
        }),
      mock: () => createMockBusinessCardReviewService(),
    },
  });

export const qrScanConnectServiceFactory =
  createModuleServiceFactory<QrScanConnectService>({
    capabilityId: "qr-scan-connect",
    implementations: {
      live: () =>
        createLiveQrScanConnectService({
          provider: createConfiguredStorageQrScanConnectProvider(),
        }),
      mock: () => createMockQrScanConnectService(),
    },
  });

export const eventAttendeeImportServiceFactory =
  createModuleServiceFactory<EventAttendeeImportService>({
    capabilityId: "event-attendee-import",
    implementations: {
      live: () =>
        createLiveEventAttendeeImportService({
          provider: createConfiguredStorageEventAttendeeImportProvider(),
        }),
      mock: () => createMockEventAttendeeImportService(),
    },
  });

export const externalContactsImportServiceFactory =
  createModuleServiceFactory<ExternalContactsImportService>({
    capabilityId: "external-contacts-import",
    implementations: {
      live: () =>
        createLiveExternalContactsImportService({
          provider: createConfiguredStorageExternalContactsImportProvider(),
        }),
      mock: () => createMockExternalContactsImportService(),
    },
  });

export const emailCalendarSignalServiceFactory =
  createModuleServiceFactory<EmailCalendarSignalService>({
    capabilityId: "email-calendar-signal",
    implementations: {
      live: () =>
        createLiveEmailCalendarSignalService({
          provider: createConfiguredStorageEmailCalendarSignalProvider(),
        }),
      mock: () => createMockEmailCalendarSignalService(),
    },
  });

export const referralRecommendationServiceFactory =
  createModuleServiceFactory<ReferralRecommendationService>({
    capabilityId: "referral-recommendation",
    implementations: {
      live: () =>
        createLiveReferralRecommendationService({
          provider: createConfiguredStorageReferralRecommendationProvider(),
        }),
      mock: () => createMockReferralRecommendationService(),
    },
  });

export const duplicateMergeServiceFactory =
  createModuleServiceFactory<DuplicateDetectionMergeService>({
    capabilityId: "duplicate-detection-merge",
    implementations: {
      live: () =>
        createLiveDuplicateMergeService({
          provider: createConfiguredStorageDuplicateMergeProvider(),
        }),
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
  mode: "mock",
): MockContactAcquisitionDraftService;
export function createContactAcquisitionDraftService(
  mode?: ModuleMode | string,
): ContactAcquisitionDraftService;
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
  mode: "mock",
): MockManualContactCreationService;
export function createManualContactCreationService(
  mode?: ModuleMode | string,
): ManualContactCreationService;
export function createManualContactCreationService(
  mode?: ModuleMode | string,
): ManualContactCreationService | MockManualContactCreationService {
  return createRequiredService(resolveManualContactCreationService(mode));
}

export function resolveBusinessCardScanOcrService(
  mode?: ModuleMode | string,
) {
  return businessCardScanOcrServiceFactory.create(mode);
}

export function createBusinessCardScanOcrService(
  mode: "mock",
): MockBusinessCardScanOcrService;
export function createBusinessCardScanOcrService(
  mode?: ModuleMode | string,
): BusinessCardScanOcrService;
export function createBusinessCardScanOcrService(
  mode?: ModuleMode | string,
): BusinessCardScanOcrService | MockBusinessCardScanOcrService {
  return createRequiredService(resolveBusinessCardScanOcrService(mode));
}

export function resolveBusinessCardReviewService(
  mode?: ModuleMode | string,
) {
  return businessCardReviewServiceFactory.create(mode);
}

export function createBusinessCardReviewService(
  mode: "mock",
): MockBusinessCardReviewService;
export function createBusinessCardReviewService(
  mode?: ModuleMode | string,
): BusinessCardReviewService;
export function createBusinessCardReviewService(
  mode?: ModuleMode | string,
): BusinessCardReviewService | MockBusinessCardReviewService {
  return createRequiredService(resolveBusinessCardReviewService(mode));
}

export function resolveQrScanConnectService(mode?: ModuleMode | string) {
  return qrScanConnectServiceFactory.create(mode);
}

export function createQrScanConnectService(
  mode: "mock",
): MockQrScanConnectService;
export function createQrScanConnectService(
  mode?: ModuleMode | string,
): QrScanConnectService;
export function createQrScanConnectService(
  mode?: ModuleMode | string,
): QrScanConnectService | MockQrScanConnectService {
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
  mode: "mock",
): MockExternalContactsImportService;
export function createExternalContactsImportService(
  mode?: ModuleMode | string,
): ExternalContactsImportService;
export function createExternalContactsImportService(
  mode?: ModuleMode | string,
): ExternalContactsImportService | MockExternalContactsImportService {
  return createRequiredService(resolveExternalContactsImportService(mode));
}

export function resolveEmailCalendarSignalService(
  mode?: ModuleMode | string,
) {
  return emailCalendarSignalServiceFactory.create(mode);
}

export function createEmailCalendarSignalService(
  mode: "mock",
): MockEmailCalendarSignalService;
export function createEmailCalendarSignalService(
  mode?: ModuleMode | string,
): EmailCalendarSignalService;
export function createEmailCalendarSignalService(
  mode?: ModuleMode | string,
): EmailCalendarSignalService | MockEmailCalendarSignalService {
  return createRequiredService(resolveEmailCalendarSignalService(mode));
}

export function resolveReferralRecommendationService(
  mode?: ModuleMode | string,
) {
  return referralRecommendationServiceFactory.create(mode);
}

export function createReferralRecommendationService(
  mode: "mock",
): MockReferralRecommendationService;
export function createReferralRecommendationService(
  mode?: ModuleMode | string,
): ReferralRecommendationService;
export function createReferralRecommendationService(
  mode?: ModuleMode | string,
): ReferralRecommendationService | MockReferralRecommendationService {
  return createRequiredService(resolveReferralRecommendationService(mode));
}

export function resolveDuplicateMergeService(mode?: ModuleMode | string) {
  return duplicateMergeServiceFactory.create(mode);
}

export function createDuplicateMergeService(
  mode: "mock",
): MockDuplicateMergeService;
export function createDuplicateMergeService(
  mode?: ModuleMode | string,
): DuplicateDetectionMergeService;
export function createDuplicateMergeService(
  mode?: ModuleMode | string,
): DuplicateDetectionMergeService | MockDuplicateMergeService {
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
