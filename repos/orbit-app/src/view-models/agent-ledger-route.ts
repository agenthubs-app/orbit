export function firstAgentLedgerEntryId(
  value: string | string[] | undefined
): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first : undefined;
}
