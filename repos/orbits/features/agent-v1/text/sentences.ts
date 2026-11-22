/**
 * Record text cut into numbered sentences (agent-design AG05; CONVENTIONS §1 `text/`). The answer step
 * cites sentence numbers, code checks them (verifyCitations), and the judgment model (AG08) gets the
 * original sentences back by number. Chinese and Japanese end at 。！？ (and full stops in a line of
 * Latin text at ". "), every language at a line break.
 */
export interface Sentence {
  id: number;
  text: string;
}

export const MAX_SENTENCES = 60;

export function splitSentences(text: string, max = MAX_SENTENCES): Sentence[] {
  const pieces: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const parts = line.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/gu) ?? [];
    for (const part of parts) {
      // Latin sentences inside one piece: "He left. She stayed." (not "3.5" or "e.g. x").
      for (const latin of part.split(/(?<=[a-z0-9)][.])\s+(?=[A-Z])/u)) if (latin.trim()) pieces.push(latin.trim());
    }
  }
  return pieces.slice(0, max).map((sentence, index) => ({ id: index + 1, text: sentence }));
}
