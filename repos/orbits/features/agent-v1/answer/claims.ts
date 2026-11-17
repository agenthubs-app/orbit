/**
 * agent-design AG10 opening item (AG08 交接 1): a ranking basis the turn's record contradicts. Code writes the
 * ranking-basis sentence from what the ranking actually did; a model sentence saying it ranked or picked by topic /
 * relevance / theme is not delivered unless a topic match was actually done this turn (functions record: semantic
 * and matched).
 *
 * Sentences that say no topic matching was done ("这次没有做主题匹配", "no topic matching was done") are not claims.
 */

/** Sentences (and, in Latin text, the period-separated pieces) of a text, keeping their own punctuation. */
function piecesOf(text: string): string[] {
  const pieces = text.match(/[^。！？!?\n]+(?:[。！？!?]+|\n+|$)|\n+/gu) ?? [text];
  return pieces.flatMap((piece) => (/[A-Za-z]/u.test(piece) && !/[぀-ヿ一-鿿]/u.test(piece) ? piece.split(/(?<=\.)\s+/u) : [piece]));
}

function joined(kept: readonly string[]): string {
  return kept.map((part, index) => (index > 0 && /\.$/u.test(kept[index - 1]) && /^[A-Za-z]/u.test(part) ? ` ${part}` : part)).join("").trim();
}

function without(text: string, test: (sentence: string) => boolean): { text: string; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const piece of piecesOf(text)) (test(piece) ? dropped : kept).push(piece);
  if (!dropped.length) return { dropped, text };
  return { dropped: dropped.map((item) => item.trim()).filter(Boolean), text: joined(kept) };
}

/* ── 1. topic-ranking claims ─────────────────────────────────────────── */

const TOPIC_CLAIM: RegExp[] = [
  // zh: 按主题排了序, 按照和独立出版的相关程度挑了, 根据匹配度选出, 按你笔记的主题挑了
  /(?:按照?|根据|依据|依照)[^。！？\n]{0,24}?(?:主题|话题|兴趣|相关(?:性|程度|度)?|匹配(?:度|程度)?|契合度)[^。！？\n]{0,12}?(?:排|挑|选|筛)/u,
  // ja: テーマに沿って並べました, 関連度の高い順に選びました, テーマとの関連で選んだ
  /(?:テーマ|話題|関連(?:度|性)|一致度|マッチ度)[^。！？\n]{0,16}?(?:並べ|選び|選ん|選出|順位|ランク|絞り)/u,
  // en: ranked them by topic, sorted by relevance, picked based on the topic
  /\b(?:rank(?:ed|ing)?|sort(?:ed|ing)?|order(?:ed|ing)?|pick(?:ed|ing)?|chose|chosen|select(?:ed|ing)?|prioriti[sz]ed)\b[^.!?\n]{0,40}?\b(?:by|on|according to|based on)\s+(?:the\s+|their\s+|its\s+|your\s+)?(?:topics?|themes?|relevance|how (?:well|closely)|match(?:ing)?)\b/iu,
  /\bbased on (?:the |their |your )?(?:topics?|themes?|relevance)\b[^.!?\n]{0,40}?\b(?:rank|sort|order|pick|chose|select)/iu,
];
/** A sentence that says no topic matching (or no match) was done is a statement of the gap, not a claim. */
const NO_MATCHING = /(?:没有|没|未|并未|无法|不能|没能)(?:做|进行|能)?(?:主题|话题)?匹配|没有按(?:主题|话题)|テーマとの照合をしていません|照合(?:は|を)?していません|照合できませんでした|\bno (?:topic )?match(?:ing)?\b|\bnot (?:matched|ranked) by (?:topic|theme)|\bwithout (?:topic )?matching\b|\bdid not (?:match|rank)/iu;

/** Sentences of a text that claim the result was ranked or picked by topic, relevance or theme. */
export function topicBasisClaimsIn(text: string): string[] {
  return piecesOf(text).filter((piece) => !NO_MATCHING.test(piece) && TOPIC_CLAIM.some((pattern) => pattern.test(piece))).map((piece) => piece.trim());
}

/** The text without topic-ranking claims, unless a topic match was actually done this turn (`topicMatched`). */
export function withoutTopicBasisClaims(text: string, topicMatched: boolean): { text: string; dropped: string[] } {
  if (topicMatched) return { dropped: [], text };
  return without(text, (piece) => !NO_MATCHING.test(piece) && TOPIC_CLAIM.some((pattern) => pattern.test(piece)));
}
