import { canAccessEventCapability } from "./capability-policy";
import type { EventAccessCapability } from "./contract";
import type { EventAccessService } from "./service";

export const EVENT_CAPABILITY_DENIED = "EVENT_CAPABILITY_DENIED" as const;

export class EventCapabilityDeniedError extends Error {
  constructor(readonly code = EVENT_CAPABILITY_DENIED) {
    super("Event access is denied.");
    this.name = "EventCapabilityDeniedError";
  }
}

export interface RequireEventCapabilityInput {
  readonly actorId: string;
  readonly capability: EventAccessCapability;
  readonly eventId: string;
  readonly service: Pick<EventAccessService, "get">;
}

export async function requireEventCapability({
  actorId,
  capability,
  eventId,
  service,
}: RequireEventCapabilityInput): Promise<void> {
  const access = await service.get({
    eventId,
    subjectActorId: actorId,
  });
  if (
    !canAccessEventCapability({
      capability,
      owner: access.owner,
      role: access.role,
      state: access.state,
    })
  ) {
    throw new EventCapabilityDeniedError();
  }
}
