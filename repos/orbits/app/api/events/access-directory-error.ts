import { EventAccessDirectoryQueryError } from "../../../features/events/event-access/directory";
import { EventAccessRepositoryError } from "../../../features/events/event-access/storage/postgres-repository";
import { AppError } from "../../../shared/errors/app-error";

export function eventAccessDirectoryErrorToAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof EventAccessDirectoryQueryError) {
    return new AppError("VALIDATION_ERROR", "Request is invalid.", {
      cause: error,
    });
  }
  if (error instanceof EventAccessRepositoryError) {
    switch (error.code) {
      case "EVENT_ACCESS_NOT_READY":
      case "EVENT_ACCESS_REPOSITORY_FAILED":
        return new AppError(
          "SERVICE_UNAVAILABLE",
          "Event access is temporarily unavailable.",
          { cause: error },
        );
      case "EVENT_ACCESS_NOT_FOUND":
        return new AppError("NOT_FOUND", "Event was not found.", {
          cause: error,
        });
      case "EVENT_ACCESS_FORBIDDEN":
        return new AppError("FORBIDDEN", "Event role access is denied.", {
          cause: error,
        });
      case "EVENT_ACCESS_CONFLICT":
        return new AppError(
          "CONFLICT",
          "Event role access changed. Refresh and try again.",
          { cause: error },
        );
    }
  }
  return new AppError("INTERNAL_ERROR", "An unexpected error occurred.", {
    cause: error,
  });
}
