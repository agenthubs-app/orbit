export async function cleanupTestSchema({
  closeClient,
  dropSchema,
  closeAdmin,
}: {
  closeClient(): Promise<void>;
  dropSchema(): Promise<unknown>;
  closeAdmin(): Promise<void>;
}) {
  const errors: unknown[] = [];
  for (const cleanup of [closeClient, dropSchema, closeAdmin]) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "PostgreSQL test schema cleanup failed.");
}
