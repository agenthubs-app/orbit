import type { AiSessionReferenceContract } from "../../shared/contract/ai-sessions";
import type { ContactDetailTagStatusService } from "../contacts/detail-contract";

export class AiSessionReferenceAuthorizationError extends Error {
  constructor(readonly code: "REFERENCE_NOT_ACCESSIBLE" | "REFERENCE_SERVICE_UNAVAILABLE") {
    super(
      code === "REFERENCE_NOT_ACCESSIBLE"
        ? "The selected contact is unavailable or cannot be accessed."
        : "Contact access could not be verified. Try again later.",
    );
  }
}

export async function authorizeAiSessionContactReferences(input: {
  actorId: string;
  references: readonly AiSessionReferenceContract[];
  service: Pick<ContactDetailTagStatusService, "getContactDetail">;
}): Promise<void> {
  const ids = [...new Set(input.references
    .filter((reference) => reference.type === "contact")
    .map((reference) => reference.id))];

  for (const contactId of ids) {
    let result: Awaited<ReturnType<typeof input.service.getContactDetail>>;
    try {
      result = await input.service.getContactDetail({
        actorId: input.actorId,
        contactId,
        scenario: null,
      });
    } catch {
      throw new AiSessionReferenceAuthorizationError("REFERENCE_SERVICE_UNAVAILABLE");
    }
    if (result.success === false) {
      throw new AiSessionReferenceAuthorizationError(
        result.error.code === "CONTACT_DETAIL_NOT_FOUND"
          ? "REFERENCE_NOT_ACCESSIBLE"
          : "REFERENCE_SERVICE_UNAVAILABLE",
      );
    }
    if (result.data.contact.id !== contactId) {
      throw new AiSessionReferenceAuthorizationError("REFERENCE_NOT_ACCESSIBLE");
    }
  }
}
