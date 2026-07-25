import { NextResponse } from "next/server";

import { createOrbitAgentRuntimeService } from "../../../../../../features/agent/runtime/service-factory";
import { createContactsListSearchAndFilterService } from "../../../../../../features/contacts/service-factory";
import type { ContactListItem } from "../../../../../../features/contacts/contract";
import { createPostEventFollowupWorkflow } from "../../../../../../features/orbit-ai/workflows/post-event-followup-v1";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
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

async function verifiedContactContext(
  contactId: string,
  fallbackName: string | undefined,
): Promise<ContactListItem | null> {
  const result = await createContactsListSearchAndFilterService(
    resolveFeatureMode(),
  ).listContacts({});
  if (!result.success || result.data.state !== "success") return null;

  const exact = result.data.contacts.find((contact) => contact.id === contactId);
  if (exact) return exact;

  // `demo-contact-1` is the historical detail-route alias for the Kenji list
  // fixture. Keep that compatibility at this boundary without accepting an
  // arbitrary client-provided name as authoritative contact data.
  if (contactId !== "demo-contact-1" || !fallbackName) return null;
  return (
    result.data.contacts.find(
      (contact) => contact.displayName === fallbackName,
    ) ?? null
  );
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
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
  const { id: eventId } = await context.params;
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "JSON body required." } },
      { status: 400 },
    );
  }

  const contactId = optionalText(body.contactId, 240);
  const noteText = optionalText(body.noteText, 4_000);
  if (!eventId.trim() || !contactId || !noteText) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "eventId, contactId, and confirmed noteText are required.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const submittedContactName = optionalText(body.contactName, 240);
    const verifiedContact = await verifiedContactContext(
      contactId,
      submittedContactName,
    ).catch(() => null);
    const submittedEvidenceIds = strings(body.evidenceIds);
    const evidenceIds = Array.from(
      new Set([
        ...submittedEvidenceIds,
        ...(verifiedContact?.evidence.map((evidence) => evidence.evidenceId) ??
          []),
      ]),
    );
    const runtime = createOrbitAgentRuntimeService();
    const workflow = createPostEventFollowupWorkflow(runtime);
    let result = await workflow.run({
      eventId,
      eventTitle: optionalText(body.eventTitle, 240) ?? "活动",
      contactId,
      contactName: verifiedContact?.displayName ?? submittedContactName,
      organization:
        verifiedContact?.organization ??
        optionalText(body.organization, 240),
      connectionId: optionalText(body.connectionId, 240),
      encounterId: optionalText(body.encounterId, 240),
      noteText,
      conversationId: optionalText(body.conversationId, 240),
      duplicateContactIds: strings(body.duplicateContactIds),
      followupDueAt: optionalText(body.followupDueAt, 80),
      reminderDueAt: optionalText(body.reminderDueAt, 80),
      evidenceIds,
      relationshipContext: verifiedContact?.relationshipContext,
      lastInteractionAt: verifiedContact?.lastInteractionAt,
      nextAction: verifiedContact?.nextAction,
      messageDraft: optionalText(body.messageDraft, 4_000),
      noteSource:
        body.noteSource === "voice_transcript"
          ? "voice_transcript"
          : "typed",
      trigger: "manual",
    });
    if (resolveFeatureMode() === "mock") {
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
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "POST_EVENT_FOLLOWUP_FAILED",
          message: error instanceof Error ? error.message : "Workflow failed.",
        },
      },
      { status: 400 },
    );
  }
}
