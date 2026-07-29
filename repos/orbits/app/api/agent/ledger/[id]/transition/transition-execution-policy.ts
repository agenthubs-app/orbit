export function shouldProcessAgentLedgerOutbox(
  mode: string,
  transition: string | null,
): boolean {
  return (
    mode === "live" &&
    (transition === "confirm" || transition === "retry")
  );
}
