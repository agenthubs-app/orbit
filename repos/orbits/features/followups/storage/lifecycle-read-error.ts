const diagnosticCodes = new Set([
  "ACTOR_REQUIRED", "STORAGE_UNAVAILABLE", "RELATIONSHIP_TASK_STORAGE_UNAVAILABLE",
  "READ_CURSOR_SECRET_MISSING", "LIFECYCLE_SORT_RUNTIME_UNVERIFIED", "LIFECYCLE_PAGE_INVALID",
  "LIFECYCLE_CURSOR_INVALID", "RELATIONSHIP_TASK_CURSOR_INVALID", "RELATIONSHIP_TASK_PAGE_INPUT_INVALID",
]);
const databaseCodes = new Set([
  "08000", "08001", "08006", "40001", "40P01", "42501", "42601", "42703", "42883", "42P01",
  "53200", "53300", "53400", "57014", "57P01", "57P02", "57P03", "XX000",
]);

/** Only closed diagnostic codes leave this boundary; never log errors, rows or identities. */
export function logLifecycleReadFailure(check: "relationship_task_page" | "lifecycle_pages", error: unknown): void {
  try {
    let code = "LIFECYCLE_READ_FAILED";
    if (error instanceof Error) {
      if (diagnosticCodes.has(error.message)) code = error.message;
      else if (error.name === "ZodError") code = "LIFECYCLE_PAGE_INVALID";
      else if (error.name === "ReadBudgetExceededError") code = "READ_BUDGET_EXCEEDED";
      else if ("code" in error && typeof error.code === "string" && databaseCodes.has(error.code)) code = error.code;
    }
    console.warn(JSON.stringify({ event: "lifecycle_read_failed", check, code }));
  } catch {
    // A failed diagnostic sink must not change the recoverable read response.
  }
}
