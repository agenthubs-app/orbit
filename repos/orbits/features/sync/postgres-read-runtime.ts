import type {
  EventOperationsPostgresClient,
  EventOperationsSqlExecutor,
  EventOperationsSqlResult,
} from "../events/event-operations/storage/postgres-client";
import { acquireExclusiveSyncReadBarrier } from "./write-gate";

export function createPostgresSyncReadRuntime(client: Pick<EventOperationsPostgresClient, "transaction">) {
  return {
    // Trusted SQL must read page, watermark and current permissions together in this query.
    // All source writers must participate in the same gate before this protects a product read.
    readPageSnapshot<TRow = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<EventOperationsSqlResult<TRow>> {
      return client.transaction(async (executor) => {
        await executor.query("set transaction read only");
        await acquireExclusiveSyncReadBarrier(executor);
        return executor.query<TRow>(text, values);
      }, { isolation: "read committed" });
    },

    // This supplies a consistent read-only connection, not an implemented lease authorizer.
    readLeaseSnapshot<TValue>(read: (executor: EventOperationsSqlExecutor) => Promise<TValue>): Promise<TValue> {
      return client.transaction(async (executor) => {
        await executor.query("set transaction read only");
        return read(executor);
      }, { isolation: "repeatable read" });
    },
  };
}
