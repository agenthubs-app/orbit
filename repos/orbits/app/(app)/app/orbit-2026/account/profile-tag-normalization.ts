export function normalizeProfileTagValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.map(value => value.normalize("NFKC").replace(/\s+/gu, " ").trim()).filter(value => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
