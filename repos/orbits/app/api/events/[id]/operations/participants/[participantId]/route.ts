import { NextResponse } from "next/server";

import { createEventParticipantDetailService } from "../../../../../../../features/events/event-operations/participant-detail";
import { createConfiguredEventOperationsRepository } from "../../../../../../../features/events/event-operations/repository";
import { createConfiguredEventOperationsService } from "../../../../../../../features/events/event-operations/runtime";
import { failure, success } from "../../../../../../../shared/api/envelope";
import { AppError } from "../../../../../../../shared/errors/app-error";
import { withRegisteredEventAccess } from "../../../registered-event-access";

export const dynamic = "force-dynamic";

export const GET = withRegisteredEventAccess<{
  id: string;
  participantId: string;
}>(
  async function getEventParticipantDetail(_request, context, access) {
    const { participantId } = await context.params;
    const repository = createConfiguredEventOperationsRepository();
    const operationsService = createConfiguredEventOperationsService();
    if (!repository || !operationsService) {
      return NextResponse.json(
        failure(
          new AppError(
            "SERVICE_UNAVAILABLE",
            "Event participant details require the configured live event store.",
          ),
        ),
        { status: 503 },
      );
    }
    const detail = await createEventParticipantDetailService({
      operationsService,
      repository,
    }).get({
      eventId: access.eventId,
      targetParticipantId: participantId.trim(),
      viewerActorId: access.actor.id,
    });
    if (!detail) {
      return NextResponse.json(
        failure(
          new AppError(
            "NOT_FOUND",
            "The participant is not part of this event directory.",
          ),
        ),
        { status: 404 },
      );
    }
    return NextResponse.json(success(detail), { status: 200 });
  },
);
