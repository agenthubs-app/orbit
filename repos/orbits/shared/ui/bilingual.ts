export function bilingualText(chinese: string, english: string): string {
  return `${chinese} / ${english}`;
}

export function bilingualPair(input: {
  chinese: string;
  english: string;
}): string {
  return bilingualText(input.chinese, input.english);
}
