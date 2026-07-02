// Audit service factory 管理来源一致性和 provenance 审计能力。
// 它用于验证 mock/live payload 的 evidence、source 和安全边界是否自洽。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createLiveSourceConsistencyProvenanceAuditService } from "./live-provenance-audit-service";
import { createMockSourceConsistencyProvenanceAuditService } from "./mock-provenance-audit-service";
import type { SourceConsistencyProvenanceAuditService } from "./provenance-contract";
import { createConfiguredStorageSourceConsistencyProvenanceAuditProvider } from "./storage/source-consistency-provenance-audit-live-record-provider";

export const sourceConsistencyProvenanceAuditServiceFactory =
  createModuleServiceFactory<SourceConsistencyProvenanceAuditService>({
    capabilityId: "source-consistency-provenance-audit",
    implementations: {
      live: () =>
        createLiveSourceConsistencyProvenanceAuditService({
          provider: createConfiguredStorageSourceConsistencyProvenanceAuditProvider(),
        }),
      mock: () => createMockSourceConsistencyProvenanceAuditService(),
    },
  });

export function resolveSourceConsistencyProvenanceAuditService(
  mode?: ModuleMode | string,
) {
  return sourceConsistencyProvenanceAuditServiceFactory.create(mode);
}

export function createSourceConsistencyProvenanceAuditService(
  mode?: ModuleMode | string,
): SourceConsistencyProvenanceAuditService {
  const resolution = resolveSourceConsistencyProvenanceAuditService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
