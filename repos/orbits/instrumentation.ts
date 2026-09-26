/**
 * Next.js server start hook. Installs request read receipts (monitoring O1)
 * in the Node.js runtime only; see shared/observability/read-receipts.ts.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { installConfiguredReadReceipts } = await import("./shared/observability/read-receipts-configured");
    installConfiguredReadReceipts();
  } catch (error) {
    console.warn(JSON.stringify({ event: "read_receipts_install_failed", error: error instanceof Error ? error.name : "Error" }));
  }
}
