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
