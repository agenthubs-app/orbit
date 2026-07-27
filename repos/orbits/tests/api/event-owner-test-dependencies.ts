import { createMockEventCrudAndImportService } from "../../features/events/event-crud-and-import/mock-service";
import type { OwnedEventAccessDependencies } from "../../app/api/events/[id]/owned-event-access";

export const eventOwnerTestDependencies = {
  createEventService: () => createMockEventCrudAndImportService(),
  resolveActor: async () => ({
    email: "operator@example.test",
    id: "actor:test-operator",
    name: "Test Operator",
  }),
} satisfies OwnedEventAccessDependencies;
