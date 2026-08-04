import {
  parseEventAccessGetQuery,
  parseEventAccessGrantCommand,
  parseEventAccessRevokeCommand,
  type EventAccessAssignmentView,
  type EventAccessRepository,
} from "./repository";

export interface EventAccessService {
  get(input: unknown): Promise<EventAccessAssignmentView>;
  grant(input: unknown): Promise<EventAccessAssignmentView>;
  revoke(input: unknown): Promise<EventAccessAssignmentView>;
}

export function createEventAccessService(
  repository: EventAccessRepository,
): EventAccessService {
  return Object.freeze({
    async get(input: unknown) {
      return repository.get(parseEventAccessGetQuery(input));
    },
    async grant(input: unknown) {
      return repository.grant(parseEventAccessGrantCommand(input));
    },
    async revoke(input: unknown) {
      return repository.revoke(parseEventAccessRevokeCommand(input));
    },
  });
}
