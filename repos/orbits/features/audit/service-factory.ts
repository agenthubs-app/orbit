// Audit service factory 管理来源一致性和 provenance 审计能力。
// 它用于验证 mock/live payload 的 evidence、source 和安全边界是否自洽。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockSourceConsistencyProvenanceAuditService } from "./mock-provenance-audit-service";
import type { SourceConsistencyProvenanceAuditService } from "./provenance-contract";

export const sourceConsistencyProvenanceAuditServiceFactory =
  createModuleServiceFactory<SourceConsistencyProvenanceAuditService>({
    capabilityId: "source-consistency-provenance-audit",
    implementations: {
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
