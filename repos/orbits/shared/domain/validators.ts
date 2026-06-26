import {
  isPermissionState,
  isRelationshipStage,
  isRelationshipValueType,
  isSourceType,
} from "./source-types";

export interface ContractValidationResult {
  valid: boolean;
  errors: string[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireStringField(
  record: UnknownRecord,
  fieldName: string,
  label: string,
  errors: string[],
): void {
  if (typeof record[fieldName] !== "string" || record[fieldName] === "") {
    errors.push(`${label}.${fieldName} is required`);
  }
}

function validateSourceReference(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${label} is required`);
    return;
  }

  if (!isSourceType(value.type)) {
    errors.push(`${label}.type must be a known source type`);
  }

  if (typeof value.id !== "string" || value.id === "") {
    errors.push(`${label}.id is required`);
  }
}

function requireEvidenceIds(
  record: UnknownRecord,
  label: string,
  errors: string[],
): void {
  if (!Array.isArray(record.evidenceIds) || record.evidenceIds.length === 0) {
    errors.push(`${label}.evidenceIds must contain at least one evidence id`);
    return;
  }

  if (record.evidenceIds.some((evidenceId) => typeof evidenceId !== "string" || evidenceId === "")) {
    errors.push(`${label}.evidenceIds must only contain evidence ids`);
  }
}

function toResult(errors: string[]): ContractValidationResult {
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateRelationshipEvidenceDTO(
  value: unknown,
): ContractValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return toResult(["RelationshipEvidenceDTO is required"]);
  }

  requireStringField(value, "id", "RelationshipEvidenceDTO", errors);
  requireStringField(value, "sourceId", "RelationshipEvidenceDTO", errors);
  requireStringField(value, "summary", "RelationshipEvidenceDTO", errors);
  requireStringField(value, "occurredAt", "RelationshipEvidenceDTO", errors);
  requireStringField(value, "createdBy", "RelationshipEvidenceDTO", errors);

  if (!isSourceType(value.sourceType)) {
    errors.push("RelationshipEvidenceDTO.sourceType is required");
  }

  if (typeof value.confidence !== "number") {
    errors.push("RelationshipEvidenceDTO.confidence is required");
  } else if (value.confidence < 0 || value.confidence > 1) {
    errors.push("RelationshipEvidenceDTO.confidence must be between 0 and 1");
  }

  return toResult(errors);
}

export function validateContactDTO(value: unknown): ContractValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return toResult(["ContactDTO is required"]);
  }

  requireStringField(value, "id", "ContactDTO", errors);
  requireStringField(value, "displayName", "ContactDTO", errors);

  if (!isRelationshipStage(value.stage)) {
    errors.push("ContactDTO.stage must be a known relationship stage");
  }

  validateSourceReference(value.source, "ContactDTO.source", errors);
  requireEvidenceIds(value, "ContactDTO", errors);

  return toResult(errors);
}

export function validateConnectionDTO(value: unknown): ContractValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return toResult(["ConnectionDTO is required"]);
  }

  requireStringField(value, "id", "ConnectionDTO", errors);
  requireStringField(value, "accountId", "ConnectionDTO", errors);
  requireStringField(value, "contactId", "ConnectionDTO", errors);
  requireStringField(value, "summary", "ConnectionDTO", errors);

  if (!isRelationshipStage(value.stage)) {
    errors.push("ConnectionDTO.stage must be a known relationship stage");
  }

  if (!Array.isArray(value.valueTypes)) {
    errors.push("ConnectionDTO.valueTypes is required");
  } else if (
    value.valueTypes.some((valueType) => !isRelationshipValueType(valueType))
  ) {
    errors.push("ConnectionDTO.valueTypes must only contain known value types");
  }

  validateSourceReference(value.source, "ConnectionDTO.source", errors);
  requireEvidenceIds(value, "ConnectionDTO", errors);

  return toResult(errors);
}

export function validatePermissionStateDTO(
  value: unknown,
): ContractValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return toResult(["PermissionStateDTO is required"]);
  }

  requireStringField(value, "id", "PermissionStateDTO", errors);
  requireStringField(value, "capability", "PermissionStateDTO", errors);
  requireStringField(value, "updatedAt", "PermissionStateDTO", errors);

  if (!isPermissionState(value.state)) {
    errors.push("PermissionStateDTO.state must be a known permission state");
  }

  validateSourceReference(value.source, "PermissionStateDTO.source", errors);
  requireEvidenceIds(value, "PermissionStateDTO", errors);

  return toResult(errors);
}
