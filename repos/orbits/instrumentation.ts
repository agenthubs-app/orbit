/**
 * Next.js server start hook. Installs request read receipts (monitoring O1)
 * in the Node.js runtime only; see shared/observability/read-receipts.ts.
 * The conditional dynamic import is the documented pattern that keeps the
 * Node-only module (and pg) out of the edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("./instrumentation-node");
    } catch (error) {
      console.warn(JSON.stringify({ event: "read_receipts_install_failed", error: error instanceof Error ? error.name : "Error" }));
    }
  }
}
