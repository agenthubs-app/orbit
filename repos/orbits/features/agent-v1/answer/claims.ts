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

const denies = (piece: string) => ONLINE_DENIAL.some((pattern) => pattern.test(piece));
/** A clause that only introduces what the denial is about ("至于它现在的官网报价", "現在の公式価格については", "as for the list price"). */
const TOPIC_LEAD = /^\s*(?:至于|关于|对于|而|那么)|(?:については|に関しては|なら)\s*$|^\s*(?:as for|regarding|about)\b/iu;
const END_MARK = /[。！？!?.]+\s*$/u;

/**
 * AG12 run-02 (AE-WEB-004 R3): one sentence that says it cannot go online loses only that part. At a strong boundary
 * (；;) the clauses holding the denial go; otherwise the clause with the denial and what follows it in the sentence go,
 * with the topic lead-in right before it. What is left stays when it stands on its own (a few words at least), ended as
 * the sentence was; a sentence that is only the denial goes whole.
 */
function withoutDenialClauses(sentence: string): { kept: string | null; dropped: string } {
  const end = sentence.match(END_MARK)?.[0]?.trim() ?? "";
  const body = sentence.replace(END_MARK, "");
  const latin = /[A-Za-z]/u.test(body) && !/[぀-ヿ一-鿿]/u.test(body);
  const finish = (rest: string) => {
    const clean = rest.replace(/[，,、；;:：\s]+$/u, "").replace(/(です|でした|ます)が$/u, "$1").replace(/\s+(?:but|and|so)$/iu, "");
    const stop = end || (latin ? "." : "。");
    return clean.replace(/\s/gu, "").length >= 6 ? `${clean}${/[。.!?！？]$/u.test(clean) ? "" : stop}` : null;
  };
  const strong = body.split(/(?<=[；;])/u);
  if (strong.length > 1) {
    const keep = strong.filter((part) => !denies(part));
    const gone = strong.filter((part) => denies(part));
    const kept = finish(keep.join("").trim());
    return { dropped: `${gone.join("").replace(/^[\s；;]+/u, "").trim()}${end}`.trim(), kept };
  }
  const clauses = body.split(/(?<=[，,、]|が、|ため、)/u);
  const at = clauses.findIndex((clause) => denies(clause));
  if (at <= 0) return { dropped: sentence.trim(), kept: null };
  let cut = at;
  if (cut > 0 && TOPIC_LEAD.test(clauses[cut - 1].replace(/[，,、]\s*$/u, ""))) cut -= 1;
  const kept = finish(clauses.slice(0, cut).join("").trim());
  return { dropped: kept ? `${clauses.slice(cut).join("").trim()}${end}` : sentence.trim(), kept };
}

/** The text without what says the agent cannot go online (the whole sentence, or only its denial clause). */
export function withoutOnlineDenials(text: string): { text: string; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const piece of piecesOf(text)) {
    if (!denies(piece)) {
      kept.push(piece);
      continue;
    }
    const trailing = piece.match(/\n+$/u)?.[0] ?? "";
    const result = withoutDenialClauses(piece.replace(/\n+$/u, ""));
    dropped.push(result.dropped);
    if (result.kept) kept.push(`${result.kept}${trailing}`);
  }
  if (!dropped.length) return { dropped, text };
  return { dropped: dropped.filter(Boolean), text: joined(kept) };
}

/**
 * AG12 run-02 (AE-AMB-011): a strip rule that drops a sentence ending inside a quote leaves the quote's other half on
 * screen (a line holding only 「」」). Empty pairs, lines of bare quote marks and a closing mark with no opener before it
 * on its line are taken out; whole quotes stay.
 */
const CLOSERS = "」』”）)】";
const OPENERS = "「『“（(【";
export function withoutQuoteResidue(text: string): string {
  const lines = text.replace(/\s*(?:「\s*」|『\s*』|“\s*”|"\s*"|（\s*）|\(\s*\)|【\s*】)/gu, "").replace(/[：:]\s*(?=[。！？.!?])/gu, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (line.trim() && /^[\s」』”）)】「『“（(【"'。，、.,]+$/u.test(line)) continue;
    let fixed = line;
    const lead = fixed.match(/^(\s*)([」』”）)】]+)\s*/u);
    if (lead) {
      const opened = [...fixed].filter((char) => OPENERS.includes(char)).length;
      const closed = [...fixed].filter((char) => CLOSERS.includes(char)).length;
      if (closed > opened) fixed = `${lead[1]}${fixed.slice(lead[0].length)}`;
    }
    out.push(fixed);
  }
  return out.join("\n").replace(/\n{3,}/gu, "\n\n").trim();
}

/**
 * AG10 run-03 (AE-CTX-005): a zh/ja/en reply holds no stray words in another script (「 кратко? 」). A sentence with a run of
 * Cyrillic, Arabic, Thai, Hebrew, Devanagari, Hangul or a like script that neither the user wrote nor a read record or web page
 * holds (`materials`: the text the answer was made from) is not delivered. Sentences end at 。！!？ and line breaks (an ASCII
 * "?" inside the stray words does not end one); a Latin-only line splits at ". ".
 */
const STRAY_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Thai}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Hangul}\p{Script=Armenian}\p{Script=Georgian}\p{Script=Bengali}\p{Script=Tamil}\p{Script=Lao}\p{Script=Khmer}]+(?:[\s'’-]+[\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Thai}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Hangul}\p{Script=Armenian}\p{Script=Georgian}\p{Script=Bengali}\p{Script=Tamil}\p{Script=Lao}\p{Script=Khmer}]+)*/gu;

export function withoutStrayScripts(text: string, materials: string): { text: string; dropped: string[] } {
  if (!new RegExp(STRAY_SCRIPT.source, "u").test(text)) return { dropped: [], text };
  const stray = (piece: string) => [...piece.matchAll(STRAY_SCRIPT)].some((match) => !materials.includes(match[0]));
  const pieces = (text.match(/[^。！!？\n]+(?:[。！!？]+|\n+|$)|\n+/gu) ?? [text]).flatMap((piece) => (/[A-Za-z]/u.test(piece) && !/[぀-ヿ一-鿿]/u.test(piece) ? piece.split(/(?<=[.?])\s+/u) : [piece]));
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const piece of pieces) (stray(piece) ? dropped : kept).push(piece);
  return { dropped: dropped.map((piece) => piece.trim()), text: joined(kept).replace(/[ \t]+\n/gu, "\n") };
}
