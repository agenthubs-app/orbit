/**
 * 共享 domain contract 测试。
 *
 * 验证 source type、关系阶段、价值类型、权限状态和 DTO 基础结构。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PERMISSION_STATE_VALUES,
  RELATIONSHIP_STAGE_VALUES,
  RELATIONSHIP_VALUE_TYPES,
  SOURCE_TYPES,
  isPermissionState,
  isRelationshipStage,
  isRelationshipValueType,
  isSourceType,
} from "../../shared/domain/source-types";
import {
  validateConnectionDTO,
  validateContactDTO,
  validatePermissionStateDTO,
  validateRelationshipEvidenceDTO,
} from "../../shared/domain/validators";

const projectRoot = join(
  fileURLToPath(import.meta.url),
  "../../..",
);

const requiredContractExports = [
  "AccountDTO",
  "UserProfileDTO",
  "ContactDTO",
  "ConnectionDTO",
  "RelationshipEvidenceDTO",
  "EventDTO",
  "TaskDTO",
  "ConversationDTO",
  "MessageDTO",
  "DashboardDTO",
  "AgentActionDTO",
  "PermissionStateDTO",
  "NotificationDTO",
];

const validEvidence = {
  id: "evidence_intro_1",
  sourceType: "event_import",
  sourceId: "event_tokyo_2026/attendee_42",
  summary: "Met during the post-panel founder roundtable.",
  occurredAt: "2026-06-24T10:30:00.000Z",
  confidence: 0.86,
  createdBy: "user_ari",
};

const validSource = {
  type: "event_import",
  id: "event_tokyo_2026/attendee_42",
  label: "Tokyo Founder Demo Night attendee roster",
};

test("contracts.ts exports the shared domain DTO skeletons", () => {
  const source = readFileSync(
    join(projectRoot, "shared/domain/contracts.ts"),
    "utf8",
  );

  for (const dtoName of requiredContractExports) {
    assert.match(source, new RegExp(`export interface ${dtoName}\\b`));
  }
});

test("developer domain route documents the shared contract boundary", () => {
  const source = readFileSync(
    join(projectRoot, "app/dev/foundation/domain/page.tsx"),
    "utf8",
  );

  assert.match(source, /Shared domain contract/i);
  assert.match(source, /source\/provenance boundaries/i);
  assert.match(source, /next integration step/i);
  assert.match(source, /Current mode/i);
  assert.match(source, /Provider status/i);
  assert.match(source, /RelationshipEvidenceDTO/);
  assert.match(source, /ContactDTO/);
  assert.match(source, /ConnectionDTO/);
});

test("relationship evidence requires source provenance fields", () => {
  assert.deepEqual(validateRelationshipEvidenceDTO(validEvidence), {
    valid: true,
    errors: [],
  });

  for (const fieldName of [
    "sourceType",
    "sourceId",
    "summary",
    "occurredAt",
    "confidence",
    "createdBy",
  ]) {
    const invalidEvidence = { ...validEvidence };
    delete invalidEvidence[fieldName as keyof typeof invalidEvidence];

    assert.match(
      validateRelationshipEvidenceDTO(invalidEvidence).errors.join("\n"),
      new RegExp(`RelationshipEvidenceDTO\\.${fieldName} is required`),
    );
  }
});

test("contact records require source and evidence references", () => {
  const contact = {
    id: "contact_mina",
    displayName: "Mina Tanaka",
    organization: "Northstar Labs",
    role: "Founder",
    stage: "captured",
    source: validSource,
    evidenceIds: [validEvidence.id],
    createdAt: "2026-06-24T10:35:00.000Z",
    updatedAt: "2026-06-24T10:35:00.000Z",
  };

  assert.deepEqual(validateContactDTO(contact), {
    valid: true,
    errors: [],
  });

  const { source: _source, ...withoutSource } = contact;
  assert.match(
    validateContactDTO(withoutSource).errors.join("\n"),
    /ContactDTO\.source is required/,
  );

  assert.match(
    validateContactDTO({ ...contact, evidenceIds: [] }).errors.join("\n"),
    /ContactDTO\.evidenceIds must contain at least one evidence id/,
  );
});

test("connection records require source and evidence references", () => {
  const connection = {
    id: "connection_mina_ari",
    contactId: "contact_mina",
    accountId: "account_orbit",
    stage: "active",
    valueTypes: ["strategic_fit", "referral_path"],
    summary: "Potential partner for founder community introductions.",
    source: validSource,
    evidenceIds: [validEvidence.id],
    createdAt: "2026-06-24T10:40:00.000Z",
    updatedAt: "2026-06-24T10:40:00.000Z",
  };

  assert.deepEqual(validateConnectionDTO(connection), {
    valid: true,
    errors: [],
  });

  const { source: _source, ...withoutSource } = connection;
  assert.match(
    validateConnectionDTO(withoutSource).errors.join("\n"),
    /ConnectionDTO\.source is required/,
  );

  assert.match(
    validateConnectionDTO({ ...connection, evidenceIds: [] }).errors.join("\n"),
    /ConnectionDTO\.evidenceIds must contain at least one evidence id/,
  );
});

test("source, stage, value type, and permission state enum values are stable", () => {
  assert.deepEqual(SOURCE_TYPES, [
    "manual",
    "business_card_ocr",
    "qr_scan",
    "event_import",
    "external_contacts",
    "email_signal",
    "calendar_signal",
    "referral",
    "chat_summary",
    "agent_action",
    "system",
  ]);
  assert.deepEqual(RELATIONSHIP_STAGE_VALUES, [
    "captured",
    "reviewing",
    "active",
    "needs_follow_up",
    "nurture",
    "archived",
  ]);
  assert.deepEqual(RELATIONSHIP_VALUE_TYPES, [
    "strategic_fit",
    "commercial_opportunity",
    "knowledge_exchange",
    "referral_path",
    "community_context",
  ]);
  assert.deepEqual(PERMISSION_STATE_VALUES, [
    "not_requested",
    "requested",
    "granted",
    "denied",
    "revoked",
  ]);

  assert.equal(isSourceType("email_signal"), true);
  assert.equal(isRelationshipStage("needs_follow_up"), true);
  assert.equal(isRelationshipValueType("referral_path"), true);
  assert.equal(isPermissionState("granted"), true);
  assert.equal(isSourceType("unknown"), false);
  assert.equal(isRelationshipStage("unknown"), false);
  assert.equal(isRelationshipValueType("unknown"), false);
  assert.equal(isPermissionState("unknown"), false);
});

test("permission state DTOs only accept declared permission states", () => {
  assert.deepEqual(
    validatePermissionStateDTO({
      id: "permission_calendar",
      capability: "calendar_signals",
      state: "granted",
      updatedAt: "2026-06-24T10:45:00.000Z",
      source: {
        type: "manual",
        id: "settings/profile",
      },
      evidenceIds: [validEvidence.id],
    }),
    {
      valid: true,
      errors: [],
    },
  );

  assert.match(
    validatePermissionStateDTO({
      id: "permission_calendar",
      capability: "calendar_signals",
      state: "unknown",
      updatedAt: "2026-06-24T10:45:00.000Z",
      source: {
        type: "manual",
        id: "settings/profile",
      },
      evidenceIds: [validEvidence.id],
    }).errors.join("\n"),
    /PermissionStateDTO\.state must be a known permission state/,
  );
});
