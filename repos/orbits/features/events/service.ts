import type {
  EventCrudImportFailure,
  EventCrudImportInput,
  EventDetailInput,
  EventDetailResult,
  EventListResult,
  ManualEventCreationInput,
  ManualEventCreationResult,
} from "./contract";
import {
  eventCrudImportErrorContext,
  eventCrudImportErrorToAppError,
  eventCrudImportFailureContext,
  eventCrudImportFailureToAppError,
} from "./contract";

export interface EventCrudAndImportService {
  listEvents: (input?: EventCrudImportInput) => EventListResult;
  createEvent: (
    input?: ManualEventCreationInput,
  ) => ManualEventCreationResult;
  getEvent: (input: EventDetailInput) => EventDetailResult;
}

export {
  eventCrudImportErrorContext,
  eventCrudImportErrorToAppError,
  eventCrudImportFailureContext,
  eventCrudImportFailureToAppError,
};

export type {
  EventCrudImportFailure,
  EventDetailResult,
  EventListResult,
  ManualEventCreationResult,
};
