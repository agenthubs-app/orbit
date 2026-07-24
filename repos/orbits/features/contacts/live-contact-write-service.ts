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

function stableContactId(draftId: string): string {
  const digest = createHash("sha256").update(draftId).digest("hex").slice(0, 24);

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
  return Boolean(
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

  return {
    id: input.contactId,
    displayName: input.request.displayName.trim(),
    ...(organization ? { organization } : {}),
    ...(role ? { role } : {}),
    ...(email ? { primaryEmail: email } : {}),
    ...(phone ? { primaryPhone: phone } : {}),
    ...(profileSnippet ? { profileSnippet } : {}),
    stage: "captured",
    source: {
      id: input.request.imageDigest.trim(),
      label: `Business card confirmed by ${input.request.actorLabel.trim()}`,
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
      if (!input.confirmed) {
        return failure("BUSINESS_CARD_CONTACT_CONFIRMATION_REQUIRED");
      }

      if (!isValidInput(input)) {
        return failure("BUSINESS_CARD_CONTACT_INPUT_INVALID");
      }

      if (!provider) {
        return failure("BUSINESS_CARD_CONTACT_WRITE_UNCONFIGURED");
      }

      const contactId = stableContactId(input.draftId.trim());
      const confirmedAt = now();

      try {
        const existingConfirmation = await provider.getContact(contactId);

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

        const duplicate = findDuplicate(await provider.listContacts(), input);

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
