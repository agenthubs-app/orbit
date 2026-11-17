/**
 * agent-design AG10 opening items: two kinds of model sentence code does not deliver.
 *
 * 1. A ranking basis the turn's record contradicts (AG08 交接 1). Code writes the ranking-basis sentence from what
 *    the ranking actually did; a model sentence saying it ranked or picked by topic / relevance / theme is not
 *    delivered unless a topic match was actually done this turn (functions record: semantic and matched).
 * 2. Saying the agent cannot go online at all (AG09 交接, AE-WEB-004 「我无法上网」). Orbit can go online; when no lookup
 *    happened this time, code's own line says why. A sentence denying the ability itself is not delivered.
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

/* ── 2. "I cannot go online" ─────────────────────────────────────────── */

const ONLINE_DENIAL: RegExp[] = [
  // zh: 我无法上网, 我目前不能联网, 没法访问互联网, 无法浏览网页, 不具备联网功能, 没有联网能力
  /(?:无法|不能|没法|没有办法|没办法|不可以|不会)(?:直接)?(?:上网|联网|连网|访问(?:互联网|网络|网页|外部网站)|浏览(?:网页|网站|互联网)|连接(?:到)?(?:互联网|网络)|(?:在)?网上(?:搜索|查)|搜索(?:网络|互联网))/u,
  /(?:不具备|没有|不支持)(?:实时)?(?:联网|上网)(?:的)?(?:功能|能力|权限)/u,
  // ja: ネットに接続できません, インターネットにアクセスできません, ウェブを閲覧できません, ネット検索はできません
  /(?:インターネット|ネット|ウェブ|Web)(?:に|へ|を|で)?(?:接続|アクセス|閲覧|検索)(?:は|が)?(?:でき(?:ません|ない)|することはでき(?:ません|ない)|不可)/iu,
  /オンライン(?:に|で)?(?:接続|アクセス)?(?:でき(?:ません|ない))/u,
  // en: I can't go online, I cannot browse the web, I don't have internet access, I'm unable to access the internet
  /\b(?:i|we)\s+(?:can(?:not|'t|’t)|am unable to|'m unable to|’m unable to|am not able to|'m not able to|do not have the ability to|don't have the ability to)\s+(?:go online|browse(?: the (?:web|internet))?|access (?:the )?(?:internet|web)|search (?:the )?(?:web|internet|online)|look (?:things |it |this )?up online|connect to the internet)\b/iu,
  /\b(?:i|we)\s+(?:do not|don't|don’t)\s+have\s+(?:any\s+)?(?:internet|web|online)\s+access\b/iu,
  /\bno (?:internet|web) access\b/iu,
];

/** Sentences of a text that say the agent cannot go online at all. */
export function onlineDenialsIn(text: string): string[] {
  return piecesOf(text).filter((piece) => ONLINE_DENIAL.some((pattern) => pattern.test(piece))).map((piece) => piece.trim());
}

/** The text without sentences that say the agent cannot go online. */
export function withoutOnlineDenials(text: string): { text: string; dropped: string[] } {
  return without(text, (piece) => ONLINE_DENIAL.some((pattern) => pattern.test(piece)));
}
