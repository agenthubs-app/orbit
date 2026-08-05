import {
  parseEventAccessAccessibleEventsQuery,
  parseEventAccessRoleMembersQuery,
  type EventAccessDirectoryRepository,
  type EventAccessDirectoryEvent,
  type EventAccessRoleMembersPayload,
} from "./directory";

export interface EventAccessDirectoryService {
  listAccessibleEvents(
    input: unknown,
  ): Promise<readonly EventAccessDirectoryEvent[]>;
  listEventRoleMembers(input: unknown): Promise<EventAccessRoleMembersPayload>;
}

export function createEventAccessDirectoryService(
  repository: EventAccessDirectoryRepository,
): EventAccessDirectoryService {
  return Object.freeze({
    async listAccessibleEvents(input: unknown) {
      return repository.listAccessibleEvents(
        parseEventAccessAccessibleEventsQuery(input),
      );
    },
    async listEventRoleMembers(input: unknown) {
      return repository.listEventRoleMembers(
        parseEventAccessRoleMembersQuery(input),
      );
    },
  });
}
