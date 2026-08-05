import { NextResponse } from "next/server";

import type { AttendeePostEventAiArtifactReader } from "../../../../../../features/events/post-event-artifact/contract";
import { createConfiguredHumanEncounterService } from "../../../../../../features/encounters/runtime";
import type { HumanEncounterService } from "../../../../../../features/encounters/service";
import { ATTENDEE_POST_EVENT_AI_PROMPT_VERSION, resolveAttendeePostEventAiProviderConfiguration } from "../../../../../../features/events/post-event-artifact/provider-config";
import { createConfiguredAttendeePostEventAiArtifactReader, createConfiguredAttendeePostEventAiTaskRepository } from "../../../../../../features/events/post-event-artifact/runtime";
import type { AttendeePostEventAiTaskRepository } from "../../../../../../features/events/post-event-artifact/task-repository";
import { success } from "../../../../../../shared/api/envelope";
import {
  withRegisteredEventAccess,
  type RegisteredEventAccessDependencies,
} from "../../registered-event-access";

interface Context {
  params: Promise<{ id: string }>;
}

interface Dependencies extends RegisteredEventAccessDependencies {
  artifactReader?: AttendeePostEventAiArtifactReader | null;
  encounterService?: Pick<HumanEncounterService, "list"> | null;
  now?: () => string;
  providerConfiguration?: ReturnType<typeof resolveAttendeePostEventAiProviderConfiguration>;
  taskRepository?: AttendeePostEventAiTaskRepository | null;
}

function eventHasEnded(endsAt: string, now: string): boolean {
  const timestamp = Date.parse(endsAt);
  return Number.isFinite(timestamp) && timestamp <= Date.parse(now);
}

export function createAttendeePostEventAiArtifactPostHandler(
  dependencies: Dependencies = {},
) {
  return withRegisteredEventAccess(async function requestAttendeePostEventAiArtifact(
    _request: Request,
    _context: Context,
    access,
  ): Promise<Response> {
    const now = dependencies.now?.() ?? new Date().toISOString();
    if (!eventHasEnded(access.event.endsAt, now)) {
      return NextResponse.json(success({ artifact: null, eventId: access.eventId, failureCode: "EVENT_NOT_ENDED", status: "failed", updatedAt: null }), { status: 200 });
    }
    const provider = dependencies.providerConfiguration === undefined
      ? resolveAttendeePostEventAiProviderConfiguration()
      : dependencies.providerConfiguration;
    const repository = dependencies.taskRepository === undefined
      ? createConfiguredAttendeePostEventAiTaskRepository()
      : dependencies.taskRepository;
    const encounters = dependencies.encounterService === undefined
      ? createConfiguredHumanEncounterService()
      : dependencies.encounterService;
    if (!provider || !repository || !encounters) {
      return NextResponse.json(success({ artifact: null, eventId: access.eventId, failureCode: null, status: "unconfigured", updatedAt: null }), { status: 200 });
    }
    const source = (await encounters.list({ actorId: access.actor.id, eventId: access.eventId }))
      .filter((encounter) => encounter.talked === "yes");
    const evidenceSnapshot = source.map((encounter) => ({
      commitments: [...encounter.commitments],
      contactId: encounter.contactId,
      evidenceId: `evidence:human-encounter:${encounter.encounterId}`,
      nextStep: encounter.nextStep,
      noteText: encounter.noteText,
      observedAt: encounter.observedAt,
      talked: encounter.talked,
    }));
    if (evidenceSnapshot.length === 0) {
      return NextResponse.json(success({ artifact: null, eventId: access.eventId, failureCode: "AI_EVIDENCE_REQUIRED", status: "failed", updatedAt: null }), { status: 200 });
    }
    const requestedAt = now;
    const task = await repository.request({
      attendeeActorId: access.actor.id,
      eventId: access.eventId,
      evidenceSnapshot,
      evidenceWhitelist: evidenceSnapshot.map((evidence) => evidence.evidenceId),
      model: provider.model,
      promptVersion: ATTENDEE_POST_EVENT_AI_PROMPT_VERSION,
      provider: provider.provider,
      requestedAt,
    });
    return NextResponse.json(success({
      artifact: task.status === "ready" ? task.artifact : null,
      eventId: task.eventId,
      failureCode: task.status === "failed" ? task.error?.code ?? "AI_GENERATION_FAILED" : null,
      status: task.status,
      updatedAt: requestedAt,
    }), { status: 202 });
  }, dependencies);
}

export function createAttendeePostEventAiArtifactGetHandler(
  dependencies: Dependencies = {},
) {
  return withRegisteredEventAccess(async function getAttendeePostEventAiArtifact(
    _request: Request,
    _context: Context,
    access,
  ): Promise<Response> {
    const now = dependencies.now?.() ?? new Date().toISOString();
    if (!eventHasEnded(access.event.endsAt, now)) {
      return NextResponse.json(success({ artifact: null, eventId: access.eventId, failureCode: "EVENT_NOT_ENDED", status: "failed", updatedAt: null }), { status: 200 });
    }
    const reader = dependencies.artifactReader === undefined
      ? createConfiguredAttendeePostEventAiArtifactReader()
      : dependencies.artifactReader;
    const view = reader
      ? await reader.read({
          attendeeActorId: access.actor.id,
          eventId: access.eventId,
        })
      : {
          artifact: null,
          eventId: access.eventId,
          failureCode: null,
          status: "unconfigured" as const,
          updatedAt: null,
        };
    const provider = dependencies.providerConfiguration === undefined
      ? resolveAttendeePostEventAiProviderConfiguration()
      : dependencies.providerConfiguration;
    const honestView = !provider && (view.status === "queued" || view.status === "running")
      ? { ...view, artifact: null, failureCode: null, status: "unconfigured" as const }
      : view;
    return NextResponse.json(success(honestView), { status: 200 });
  }, dependencies);
}
