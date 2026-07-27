import { NextResponse } from "next/server";

import type { ContactListItem } from "../../../../../../features/contacts/contract";
import { createContactsListSearchAndFilterService } from "../../../../../../features/contacts/service-factory";
import { createPostEventFollowupWorkflow } from "../../../../../../features/orbit-ai/workflows/post-event-followup-v1";
import type { FeatureMode } from "../../../../../../shared/config/feature-mode";
import {
  agentRequestUnauthorizedResponse,
  resolveAgentRequestContext,
} from "../../../../_shared/agent-request-context";
import {
  withOwnedEventAccess,
  type OwnedEventAccessDependencies,
} from "../../owned-event-access";

interface Context {
  params: Promise<{ id: string }>;
}

interface VerifiedContactResolution {
  contact: ContactListItem;
  candidates: readonly ContactListItem[];
  duplicateContactIds: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(
  value: unknown,
  maximumLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximumLength) : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];
}

async function verifiedContactResolution(
  mode: FeatureMode,
  contactId: string,
  fallbackName: string | undefined,
  resolvedContactId: string | undefined,
): Promise<VerifiedContactResolution | null> {
  const result = await createContactsListSearchAndFilterService(
    mode,
  ).listContacts({});
  if (!result.success || result.data.state !== "success") return null;

  const exact =
    result.data.contacts.find((contact) => contact.id === contactId) ??
    (contactId === "demo-contact-1" && fallbackName
      ? result.data.contacts.find(
          (contact) => contact.displayName === fallbackName,
        )
      : undefined);
  if (!exact) return null;

  const normalizedName = exact.displayName.trim().toLocaleLowerCase();
  const candidates = result.data.contacts.filter(
    (contact) =>
      contact.displayName.trim().toLocaleLowerCase() === normalizedName,
  );

  if (resolvedContactId) {
    const resolved = candidates.find(
      (contact) =>
        contact.id === resolvedContactId ||
        (resolvedContactId === contactId && contact.id === exact.id),
    );
    if (!resolved) {
      throw new Error(
        "The resolved contact must be one of the server-verified duplicate candidates.",
      );
    }
    return {
      contact: resolved,
      candidates,
      duplicateContactIds: [],
    };
  }

  return {
    contact: exact,
    candidates,
    duplicateContactIds: candidates
      .filter((contact) => contact.id !== exact.id)
      .map((contact) => contact.id),
  };
}

export function createPostEventFollowupPostHandler(
  dependencies: OwnedEventAccessDependencies = {},
) {
  return withOwnedEventAccess(async function createPostEventFollowup(
    request: Request,
    _context: Context,
    access,
  ): Promise<Response> {
    const agentContext = await resolveAgentRequestContext(access.mode, {
      authenticate: async () => ({ user: { id: access.actor.id } }),
    });
    if (!agentContext) return agentRequestUnauthorizedResponse();

    if (
      !(request.headers.get("content-type") ?? "").includes("application/json")
    ) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "application/json body required.",
          },
        },
        { status: 415 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as unknown;
    if (!isRecord(body)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "JSON body required.",
          },
        },
        { status: 400 },
      );
    }

    const contactId = optionalText(body.contactId, 240);
    const noteText = optionalText(body.noteText, 4_000);
    if (!contactId || !noteText) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "contactId and confirmed noteText are required.",
          },
        },
        { status: 400 },
      );
    }

    try {
      const contactResolution = await verifiedContactResolution(
        access.mode,
        contactId,
        optionalText(body.contactName, 240),
        optionalText(body.resolvedContactId, 240),
      ).catch(() => null);
      if (!contactResolution) {
        return NextResponse.json(
          {
            error: {
              code: "CONTACT_RESOLUTION_FAILED",
              message:
                "The selected contact could not be verified against the current contact list.",
            },
          },
          { status: 400 },
        );
      }

      const verifiedContact = contactResolution.contact;
      const evidenceIds = Array.from(
        new Set([
          ...strings(body.evidenceIds),
          ...verifiedContact.evidence.map((evidence) => evidence.evidenceId),
        ]),
      );
      const runtime = agentContext.runtime;
      const workflow = createPostEventFollowupWorkflow(runtime);
      let result = await workflow.run({
        eventId: access.eventId,
        eventTitle: access.event.event.title,
        contactId: verifiedContact.id,
        contactName: verifiedContact.displayName,
        organization:
          verifiedContact.organization ?? optionalText(body.organization, 240),
        connectionId: optionalText(body.connectionId, 240),
        encounterId: optionalText(body.encounterId, 240),
        noteText,
        conversationId: optionalText(body.conversationId, 240),
        duplicateContactIds: contactResolution.duplicateContactIds,
        followupDueAt: optionalText(body.followupDueAt, 80),
        reminderDueAt: optionalText(body.reminderDueAt, 80),
        evidenceIds,
        relationshipContext: verifiedContact.relationshipContext,
        lastInteractionAt: verifiedContact.lastInteractionAt,
        nextAction: verifiedContact.nextAction,
        messageDraft: optionalText(body.messageDraft, 4_000),
        noteSource:
          body.noteSource === "voice_transcript" ? "voice_transcript" : "typed",
        trigger: "manual",
      });

      if (access.mode === "mock") {
        await runtime.processOutbox({
          limit: 20,
          workerId: "mock-post-event-request-worker",
        });
        const detail = await runtime.getRun(result.run.runId);
        if (detail) {
          result = {
            ...result,
            run: detail.run,
            actions: detail.actions,
          };
        }
      }

      return NextResponse.json(
        {
          data: {
            ...result,
            contactCandidates:
              result.artifact.contactResolution === "merge_review_required"
                ? contactResolution.candidates.map((contact) => ({
                    id: contact.id,
                    displayName: contact.displayName,
                    organization: contact.organization,
                    role: contact.role,
                  }))
                : [],
          },
        },
        { status: 201 },
      );
    } catch (error) {
      return NextResponse.json(
        {
          error: {
            code: "POST_EVENT_FOLLOWUP_FAILED",
            message:
              error instanceof Error ? error.message : "Workflow failed.",
          },
        },
        { status: 400 },
      );
    }
  }, dependencies);
}
