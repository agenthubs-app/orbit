import type { ContactDetail } from "../contacts/detail-contract";
import type { ContactDetailTagStatusService } from "../contacts/detail-contract";
import type { ContactsListSearchAndFilterService } from "../contacts/service";
import {
  createContactDetailTagStatusService,
  createContactsListSearchAndFilterService,
} from "../contacts/service-factory";
import {
  runOrbitAgentModelText,
  type GeminiOrbitAgentProviderConfig,
  type OrbitAgentModelProvider,
  type OrbitAgentProviderSource,
} from "../orbit-ai/gemini-provider";

export interface AiEmailDraftInput {
  actorId: string;
  contactId?: string | null;
  language?: "zh" | "en" | string | null;
  organization?: string | null;
  purpose?: string | null;
  recipientName?: string | null;
}

export type AiEmailDraftResult =
  | {
      success: true;
      data: {
        body: string;
        contactId: string;
        evidenceIds: readonly string[];
        model: string;
        provider: OrbitAgentModelProvider;
        source: OrbitAgentProviderSource;
        subject: string;
        safety: {
          aiProviderRequested: true;
          emailProviderRequested: false;
          externalNetworkRequested: true;
          externalSendRequested: false;
          liveDatabaseReadExecuted: true;
          liveDatabaseWriteExecuted: false;
          sendActionRequiresConfirmation: true;
        };
      };
    }
  | {
      success: false;
      error: {
        code:
          | "ACTOR_REQUIRED"
          | "CONTACT_NOT_FOUND"
          | "CONTACT_AMBIGUOUS"
          | "MODEL_API_KEY_MISSING"
          | "MODEL_REQUEST_FAILED"
          | "MODEL_OUTPUT_INVALID";
        message: string;
      };
    };

export interface AiEmailDraftServiceOptions {
  contactDetailService?: ContactDetailTagStatusService;
  contactsService?: ContactsListSearchAndFilterService;
  modelConfig?: GeminiOrbitAgentProviderConfig;
}

function normalizeIdentity(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function cleanGeneratedText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;

  const cleaned = value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, limit);

  return cleaned || null;
}

function parseDraftJson(text: string): { body: string; subject: string } | null {
  const unwrapped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed: unknown;

  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const subject = cleanGeneratedText(record.subject, 180);
  const body = cleanGeneratedText(record.body, 6_000);

  return subject && body ? { body, subject } : null;
}

function evidenceIdsFor(contact: ContactDetail): readonly string[] {
  return Array.from(
    new Set([
      ...contact.evidence.map((evidence) => evidence.evidenceId),
      ...contact.lastInteraction.evidenceIds,
      ...contact.publicProfile.evidenceIds,
    ]),
  );
}

function modelInputFor(input: {
  contact: ContactDetail;
  language: "zh" | "en";
  purpose: string;
}) {
  return JSON.stringify(
    {
      task: "Draft a review-only relationship email.",
      outputLanguage:
        input.language === "zh" ? "Simplified Chinese" : "English",
      purpose: input.purpose,
      recipient: {
        displayName: input.contact.displayName,
        role: input.contact.role,
        organization: input.contact.organization,
      },
      relationshipContext: input.contact.relationshipContext,
      latestInteraction: {
        occurredAt: input.contact.lastInteraction.occurredAt,
        summary: input.contact.lastInteraction.summary,
      },
      evidence: input.contact.evidence.map((evidence) => ({
        capturedAt: evidence.capturedAt,
        excerpt: evidence.excerpt,
        source: evidence.source.label,
      })),
      recommendedNextAction: input.contact.nextAction,
    },
    null,
    2,
  );
}

async function resolveContact(input: {
  actorId: string;
  contactId: string | null;
  contactsService: ContactsListSearchAndFilterService;
  recipientName: string | null;
}): Promise<
  | { success: true; contactId: string }
  | { success: false; code: "CONTACT_NOT_FOUND" | "CONTACT_AMBIGUOUS" }
> {
  const listResult = await input.contactsService.listContacts({
    actorId: input.actorId,
  });

  if (listResult.success === false) {
    return { success: false, code: "CONTACT_NOT_FOUND" };
  }

  if (input.contactId) {
    const match = listResult.data.contacts.find(
      (contact) =>
        normalizeIdentity(contact.id) === normalizeIdentity(input.contactId ?? ""),
    );

    return match
      ? { success: true, contactId: match.id }
      : { success: false, code: "CONTACT_NOT_FOUND" };
  }

  if (!input.recipientName) {
    return { success: false, code: "CONTACT_NOT_FOUND" };
  }

  const matches = listResult.data.contacts.filter(
    (contact) =>
      normalizeIdentity(contact.displayName) ===
      normalizeIdentity(input.recipientName ?? ""),
  );

  if (matches.length > 1) {
    return { success: false, code: "CONTACT_AMBIGUOUS" };
  }

  return matches[0]
    ? { success: true, contactId: matches[0].id }
    : { success: false, code: "CONTACT_NOT_FOUND" };
}

export function createAiEmailDraftService(
  options: AiEmailDraftServiceOptions = {},
) {
  const contactsService =
    options.contactsService ?? createContactsListSearchAndFilterService("live");
  const contactDetailService =
    options.contactDetailService ?? createContactDetailTagStatusService("live");

  return {
    async createDraft(input: AiEmailDraftInput): Promise<AiEmailDraftResult> {
      const actorId = input.actorId.trim();

      if (!actorId) {
        return {
          success: false,
          error: {
            code: "ACTOR_REQUIRED",
            message: "Sign in before generating an AI email draft.",
          },
        };
      }

      const resolved = await resolveContact({
        actorId,
        contactId: input.contactId?.trim() || null,
        contactsService,
        recipientName: input.recipientName?.trim() || null,
      });

      if (resolved.success === false) {
        return {
          success: false,
          error: {
            code: resolved.code,
            message:
              resolved.code === "CONTACT_AMBIGUOUS"
                ? "More than one contact has that name. Open a contact record before drafting."
                : "No matching contact with source-backed relationship context was found in this account.",
          },
        };
      }

      const detailResult = await contactDetailService.getContactDetail({
        actorId,
        contactId: resolved.contactId,
      });

      if (detailResult.success === false) {
        return {
          success: false,
          error: {
            code: "CONTACT_NOT_FOUND",
            message: detailResult.error.message,
          },
        };
      }

      const contact = detailResult.data.contact;
      const language = input.language === "en" ? "en" : "zh";
      const purpose =
        input.purpose?.trim() ||
        contact.nextAction ||
        (language === "zh" ? "基于最近互动进行自然跟进" : "Follow up naturally on the latest interaction");
      const modelResult = await runOrbitAgentModelText({
        config: options.modelConfig,
        systemInstruction: [
          "You draft concise, professional relationship emails using only the supplied Orbit relationship record.",
          "Do not invent meetings, commitments, dates, metrics, attachments, or shared history.",
          "Prefer the latest interaction and recommended next action when they are supported by the record.",
          "The result is a draft only: do not claim that anything was sent, booked, attached, or completed.",
          'Return strict JSON only with exactly two string fields: {"subject":"...","body":"..."}.',
        ].join(" "),
        userText: modelInputFor({ contact, language, purpose }),
      });

      if (modelResult.success === false) {
        return {
          success: false,
          error: {
            code: modelResult.error.code,
            message: modelResult.error.message,
          },
        };
      }

      const draft = parseDraftJson(modelResult.text);

      if (!draft) {
        return {
          success: false,
          error: {
            code: "MODEL_OUTPUT_INVALID",
            message: "The AI response did not contain a valid reviewable email draft.",
          },
        };
      }

      return {
        success: true,
        data: {
          ...draft,
          contactId: contact.id,
          evidenceIds: evidenceIdsFor(contact),
          model: modelResult.model,
          provider: modelResult.provider,
          source: modelResult.source,
          safety: {
            aiProviderRequested: true,
            emailProviderRequested: false,
            externalNetworkRequested: true,
            externalSendRequested: false,
            liveDatabaseReadExecuted: true,
            liveDatabaseWriteExecuted: false,
            sendActionRequiresConfirmation: true,
          },
        },
      };
    },
  };
}
