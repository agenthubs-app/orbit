export interface PublicFaqSearchEntry {
  question: string;
  answer: string;
  searchKeywords: readonly string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function filterPublicFaq<T extends PublicFaqSearchEntry>(
  entries: readonly T[],
  query: string,
): T[] {
  const term = normalize(query);
  if (!term) return [...entries];

  return entries.filter((entry) =>
    [entry.question, entry.answer, ...entry.searchKeywords]
      .some((value) => normalize(value).includes(term))
  );
}
