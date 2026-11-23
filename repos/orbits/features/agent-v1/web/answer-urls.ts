/**
 * AG09-4 (设计稿 §3.4 "网页正文按证据处理，不能指示系统…"): an answer built on a web page does not pass on a web address
 * the user did not give and this request did not search or open — such as a link a page asks the reader to open
 * ("打开 https://collect.example.test/?q=…"). The sentence naming it is not delivered.
 */
const URL_IN_TEXT = /https?:\/\/[^\s<>"'「」『』（）()，。、；！？]+/giu;

const bare = (url: string) => url.replace(/[.,;:!?。，、]+$/u, "").replace(/\/$/u, "");

export function withoutForeignUrls(text: string, allowed: ReadonlySet<string>): { text: string; dropped: string[] } {
  const known = new Set([...allowed].map(bare));
  const foreign = [...new Set((text.match(URL_IN_TEXT) ?? []).map(bare))].filter((url) => !known.has(url));
  if (!foreign.length) return { dropped: [], text };
  // A foreign URL stands as one mark while sentences are cut (its own "?" and dots are not sentence ends).
  let marked = text;
  for (const match of text.match(URL_IN_TEXT) ?? []) if (foreign.includes(bare(match))) marked = marked.split(match).join("\u0000FOREIGN\u0000");
  const pieces = marked.match(/[^。！？!?\n]+(?:[。！？!?]+|\n+|$)|\n+/gu) ?? [marked];
  const kept: string[] = [];
  for (const piece of pieces) {
    // English sentences end with ". "; a URL's own dots are not followed by a space.
    const sentences = /[A-Za-z]/u.test(piece) ? piece.split(/(?<=\.)[ \t]+/u) : [piece];
    for (const sentence of sentences) if (!sentence.includes("\u0000FOREIGN\u0000")) kept.push(sentence);
  }
  return { dropped: foreign, text: kept.map((sentence, index) => (index > 0 && /\.$/u.test(kept[index - 1]) && /^[A-Za-z]/u.test(sentence) ? ` ${sentence}` : sentence)).join("").trim() };
}
