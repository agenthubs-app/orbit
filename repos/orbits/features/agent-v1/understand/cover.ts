/**
 * agent-design AG05 run-03 (AE-AMB-012): every sentence of the CURRENT message lands in some part. A
 * sentence the first layer left out (no part's quote touches it) becomes a statement part made by code —
 * its quote is the user's own words, it asks for no capability, and route takes it by AG04's statement
 * rule. Only the current message makes parts; plain chat answers the whole message and is left alone.
 */
import type { UnderstandOutput, UnderstandPart } from "./schema";

const END = /[。！？!?]/u;

/** The sentences of the message as offsets, without their closing punctuation or surrounding space. */
function sentenceSpans(message: string): [number, number][] {
  const spans: [number, number][] = [];
  const push = (start: number, end: number) => {
    let left = start;
    let right = end;
    while (left < right && /\s/u.test(message[left])) left += 1;
    while (right > left && (/\s/u.test(message[right - 1]) || END.test(message[right - 1]) || message[right - 1] === ".")) right -= 1;
    if (right > left) spans.push([left, right]);
  };
  for (const match of message.matchAll(/[^。！？!?\r\n]+[。！？!?]*/gu)) {
    const start = match.index ?? 0;
    const piece = match[0];
    // Latin sentences inside one piece: "He left. She stayed." (not "3.5" or "e.g. x").
    let from = 0;
    for (const split of piece.matchAll(/(?<=[a-z0-9)][.])\s+(?=[A-Z])/gu)) {
      push(start + from, start + (split.index ?? 0));
      from = (split.index ?? 0) + split[0].length;
    }
    push(start + from, start + piece.length);
  }
  return spans;
}

/** Words, not only punctuation or a single character ("嗯", "OK" stay with the parts the model gave). */
const sayable = (text: string) => text.replace(/[\s\p{P}\p{S}]/gu, "").length >= 2;

export function coverEverySentence(output: UnderstandOutput, message: string): { output: UnderstandOutput; added: string[] } {
  if (output.plainChat || !output.parts.length) return { added: [], output };
  const quotes = output.parts.map((part) => {
    const start = message.indexOf(part.sourceQuote);
    return [start, start + part.sourceQuote.length] as const;
  }).filter(([start]) => start >= 0);
  const missing = sentenceSpans(message).filter(([start, end]) => sayable(message.slice(start, end)) && !quotes.some(([left, right]) => left < end && right > start));
  if (!missing.length) return { added: [], output };
  const taken = new Set(output.parts.map((part) => part.localId));
  let next = output.parts.length;
  const made: UnderstandPart[] = missing.map(([start, end]) => {
    do next += 1; while (taken.has(`p${next}`));
    taken.add(`p${next}`);
    const words = message.slice(start, end);
    return { clarity: "statement", constraints: [], dataOwner: "self", dataSources: ["turn_material"], deliverable: "answer", dependsOn: [], goal: words, intentBasis: "instruction", localId: `p${next}`, objectClues: [], persistence: "this_turn", requiredCapabilities: [], sourceQuote: words };
  });
  const at = (part: UnderstandPart) => message.indexOf(part.sourceQuote);
  const parts = [...output.parts, ...made].sort((left, right) => at(left) - at(right));
  return { added: made.map((part) => part.sourceQuote), output: { ...output, parts } };
}
