import { createHash } from "node:crypto";

import type { ContactDTO } from "../../shared/domain/contracts";
import {
  BUSINESS_CARD_CONTACT_WRITE_ERROR_DEFINITIONS,
  type BusinessCardContactWriteErrorCode,
  type BusinessCardContactWriteFailure,
  type BusinessCardContactWritePayload,
  type BusinessCardContactWriteProvider,
  type BusinessCardContactWriteResult,
  type BusinessCardContactWriteService,
  type ConfirmBusinessCardContactInput,
} from "./contact-write-contract";

export interface LiveBusinessCardContactWriteServiceOptions {
  now?: () => string;
  provider?: BusinessCardContactWriteProvider | null;
}

function nonEmpty(value: string): string | null {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function normalizedComparisonValue(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
}

function normalizedEmail(value: string | undefined): string {
  return normalizedComparisonValue(value);
}

function stableContactId(actorId: string, draftId: string): string {
  const digest = createHash("sha256")
    .update(actorId)
    .update("\u0000")
    .update(draftId)
    .digest("hex")
    .slice(0, 24);

  return `contact:business-card:${digest}`;
}

function failure(
  code: BusinessCardContactWriteErrorCode,
): BusinessCardContactWriteFailure {
  return {
    success: false,
    error: {
      ...BUSINESS_CARD_CONTACT_WRITE_ERROR_DEFINITIONS[code],
      contactWriteExecuted: false,
    },
  };
}

function success(
  payload: BusinessCardContactWritePayload,
): BusinessCardContactWriteResult {
  return {
    success: true,
    data: payload,
  };
}

function isValidInput(input: ConfirmBusinessCardContactInput): boolean {
  // actorLabel 仍是必填的审计输入（写入必须可归属），只是不再进入来源标签。
  return Boolean(
    nonEmpty(input.actorId) &&
      nonEmpty(input.actorLabel) &&
      nonEmpty(input.displayName) &&
      nonEmpty(input.draftId) &&
      nonEmpty(input.imageDigest) &&
      input.evidenceIds.some((evidenceId) => Boolean(nonEmpty(evidenceId))),
  );
}

function findDuplicate(
  contacts: readonly ContactDTO[],
  input: ConfirmBusinessCardContactInput,
): ContactDTO | null {
  const email = normalizedEmail(input.email);

  if (email) {
    const emailMatch = contacts.find(
      (contact) => normalizedEmail(contact.primaryEmail) === email,
    );

    if (emailMatch) {
      return emailMatch;
    }
  }

  const displayName = normalizedComparisonValue(input.displayName);
  const organization = normalizedComparisonValue(input.organization);

  return (
    contacts.find(
      (contact) =>
        normalizedComparisonValue(contact.displayName) === displayName &&
        normalizedComparisonValue(contact.organization) === organization,
    ) ?? null
  );
}

/** 名片扫描的固定来源标签；展示层按 source.type 本地化，不拼接任何身份信息。 */
export const BUSINESS_CARD_SOURCE_LABEL = "Business card scan";

function contactFor(input: {
  contactId: string;
  confirmedAt: string;
  request: ConfirmBusinessCardContactInput;
}): ContactDTO {
  const evidenceIds = Array.from(
    new Set(
      input.request.evidenceIds
        .map((evidenceId) => evidenceId.trim())
        .filter(Boolean),
    ),
  ) as [string, ...string[]];
  const organization = nonEmpty(input.request.organization);
  const role = nonEmpty(input.request.role);
  const email = nonEmpty(input.request.email);
  const phone = nonEmpty(input.request.phone);
  const profileSnippet = nonEmpty(input.request.relationshipContext);
  const notes = nonEmpty(input.request.notes ?? "");

  return {
    id: input.contactId,
    displayName: input.request.displayName.trim(),
    ...(organization ? { organization } : {}),
    ...(role ? { role } : {}),
    ...(email ? { primaryEmail: email } : {}),
    ...(phone ? { primaryPhone: phone } : {}),
    ...(profileSnippet ? { profileSnippet } : {}),
    ...(notes ? { notes } : {}),
    stage: "captured",
    // 来源描述的是「这个联系人是怎么进来的」，不是「谁点的确认」。此前这里写的是
    // `Business card confirmed by ${actorLabel}`，而 V2 handler 传的 actorLabel 就是
    // actor UUID，于是联系人详情页的来源栏直接显示出内部 ID。确认者属于审计信息，
    // 不进用户可见的来源标签；这里固定为采集方式本身。
    source: {
      id: input.request.imageDigest.trim(),
      label: BUSINESS_CARD_SOURCE_LABEL,
      type: "business_card_ocr",
    },
    evidenceIds,
    createdAt: input.confirmedAt,
    updatedAt: input.confirmedAt,
  };
}

export function createLiveBusinessCardContactWriteService({
  now = () => new Date().toISOString(),
  provider = null,
}: LiveBusinessCardContactWriteServiceOptions = {}): BusinessCardContactWriteService {
  return {
    async confirmBusinessCardContact(
      input,
    ): Promise<BusinessCardContactWriteResult> {
      const actorId = nonEmpty(input.actorId);

      if (!actorId) {
        return failure("BUSINESS_CARD_CONTACT_ACTOR_REQUIRED");
      }

      if (!input.confirmed) {
        return failure("BUSINESS_CARD_CONTACT_CONFIRMATION_REQUIRED");
      }

      if (!isValidInput(input)) {
        return failure("BUSINESS_CARD_CONTACT_INPUT_INVALID");
      }

      if (!provider) {
        return failure("BUSINESS_CARD_CONTACT_WRITE_UNCONFIGURED");
      }

      const contactId = stableContactId(actorId, input.draftId.trim());
      const confirmedAt = now();

      try {
        const existingConfirmation = await provider.getContact(
          contactId,
          actorId,
        );

        if (existingConfirmation) {
          return success({
            state: "already_confirmed",
            contactId,
            duplicateContactId: null,
            contactWriteExecuted: false,
            evidenceIds: existingConfirmation.evidenceIds,
            confirmedAt: existingConfirmation.updatedAt,
          });
        }

        const duplicate =
          input.allowDuplicate === true
            ? null
            : findDuplicate(await provider.listContacts(actorId), input);

        if (duplicate) {
          return success({
            state: "duplicate_review",
            contactId,
            duplicateContactId: duplicate.id,
            contactWriteExecuted: false,
            evidenceIds: input.evidenceIds,
            confirmedAt,
          });
        }

        const saved = await provider.saveContact(
          contactFor({
            confirmedAt,
            contactId,
            request: input,
          }),
          actorId,
        );

        return success({
          state: "created",
          contactId: saved.id,
          duplicateContactId: null,
          contactWriteExecuted: true,
          evidenceIds: saved.evidenceIds,
          confirmedAt,
        });
      } catch {
        return failure("BUSINESS_CARD_CONTACT_WRITE_FAILED");
      }
    },
  };
}
