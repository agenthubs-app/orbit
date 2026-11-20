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
  return pieces.flatMap((piece) => (/[A-Za-z]/u.test(piece) && !/[぀-ヿ一-鿿]/u.test(piece) ? piece.split(/(?<=\.)[ \t]+/u) : [piece]));
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

/* ── AG20b (TRIAGE R4): limits Orbit does not have ─────────────────────── */

/**
 * A model sentence saying Orbit cannot see or change the user's records, that the user has to do it in another app, or
 * that the material was cut off ("这一步我没有访问你的日程数据", "删除需要你在日历应用里手动操作", "この場では予定の変更は反映されません",
 * "笔记里的具体数字在这段对话里被截断了"). Orbit reads and changes these records (with a card); code's own lines say what
 * was and was not done this time, so such a sentence is not delivered.
 */
const ABILITY_DENIAL: RegExp[] = [
  /(?:没有|无法|不能|没法|没办法|不可以)(?:直接)?(?:访问|查看|读取|看到|获取|调取|打开|修改|删除|更改|编辑|操作|改动|同步)(?:到)?(?:你|您)?的?(?:日程|日历|行程|记录|待办|笔记|备忘|数据|资料|联系人|活动)/u,
  /(?:这一步|这里|这边|这段对话|对话里|此处|当前)[^。！？\n]{0,12}(?:没有|无法|不能|没法)(?:访问|查看|读取|修改|删除|反映|保存|同步|执行)/u,
  /(?:需要|得|要|请)(?:你|您)?(?:自己|手动)?(?:在|到|去)[^。！？\n]{0,16}(?:应用|App|app|日历|设置|客户端)[^。！？\n]{0,12}(?:手动|自己)?(?:操作|删除|修改|更改|处理|设置)/u,
  /(?:被|已经?)截断|截断了/u,
  /この場では[^。！？\n]{0,30}(?:でき(?:ません|ない)|されません)/u,
  /(?:記録|予定|スケジュール|カレンダー|メモ|ToDo|タスク|データ)[をにへがは]?[^。！？\n]{0,8}(?:参照|アクセス|閲覧|変更|削除|編集|反映)(?:は|が|すること(?:は|が)?)?(?:でき(?:ません|ない)|されません)/u,
  /(?:アプリ|カレンダー)[^。！？\n]{0,12}(?:で|から)[^。！？\n]{0,12}(?:手動で|ご自身で)/u,
  /途中で切れて|切り捨てられ/u,
  /\b(?:i|we)\s+(?:can(?:not|'t|’t)|am unable to|'m unable to|’m unable to|do(?:n't|n’t| not) have (?:access to|the ability to))\s+(?:access|see|view|read|open|change|modify|edit|delete|update)?\s*(?:your\s+)?(?:schedule|calendar|records?|to-?dos?|notes?|data|contacts?|events?)\b/iu,
  /\byou(?:'ll|’ll| will)? (?:need|have) to (?:do|delete|change|update|remove|edit) (?:it|this|that)\b[^.!?\n]{0,40}\b(?:manually|yourself|in your (?:calendar|app))/iu,
  /\b(?:was|were|got|is|are) (?:cut off|truncated)\b/iu,
];

export function withoutAbilityDenials(text: string): { text: string; dropped: string[] } {
  return without(text, (piece) => ABILITY_DENIAL.some((pattern) => pattern.test(piece)));
}

/* ── 2. "I cannot go online" ─────────────────────────────────────────── */

const ONLINE_DENIAL: RegExp[] = [
  // zh: 我无法上网, 我目前不能联网, 没法访问互联网, 无法浏览网页, 不具备联网功能, 没有联网能力
  /(?:无法|不能|没法|没有办法|没办法|不可以|不会)(?:直接)?(?:替你|帮你|为你|给你)?(?:直接)?(?:上网|联网|连网|访问(?:互联网|网络|网页|外部网站)|浏览(?:网页|网站|互联网)|连接(?:到)?(?:互联网|网络)|(?:在)?网上(?:搜索|查)|搜索(?:网络|互联网))/u,
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
 * AG12 run-03 (AE-WEB-004): words left at the start of what remains that only led on from the denial ("只能据笔记 C 说明：",
 * "所以", "但", "ただ", "メモによると、", "but going by note C,") — dropped; the sourced content after them stays.
 */
const DANGLING_LEAD = /^(?:(?:只能|只好|仅能|就)?(?:据|根据|按照?|依据|从)[^：:，,。]{0,20}?(?:说明|来看|来说|回答|看)?[：:，,]\s*|(?:所以|因此|因而|但是?|不过|只是|而且|ただし?|でも|しかし|そのため|なので|ですので)[，,、\s]*|(?:[^、。]{0,12}(?:によると|によれば|では|から見ると))[、，,]\s*|(?:but|so|however|instead|and)\b[,\s]*|(?:only\s+)?(?:from|based on|going by|according to)\s+[^,:]{0,40}[,:]\s*)/iu;

function withoutDanglingLead(text: string): string {
  let out = text.trim();
  for (let index = 0; index < 3; index += 1) {
    const next = out.replace(DANGLING_LEAD, "");
    if (next === out) break;
    out = next.trim();
  }
  return out.replace(/^[a-z]/u, (letter) => letter.toUpperCase());
}

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
  if (at < 0) return { dropped: sentence.trim(), kept: null };
  if (at === 0) {
    // The denial leads the sentence: what follows it stays, without the words that only led on from it.
    const kept = finish(withoutDanglingLead(clauses.slice(1).join("")));
    return { dropped: kept ? clauses[0].trim() : sentence.trim(), kept };
  }
  let cut = at;
  if (cut > 0 && TOPIC_LEAD.test(clauses[cut - 1].replace(/[，,、]\s*$/u, ""))) cut -= 1;
  const kept = finish(clauses.slice(0, cut).join("").trim());
  return { dropped: kept ? `${clauses.slice(cut).join("").trim()}${end}` : sentence.trim(), kept };
}

/** The text without what says the agent cannot go online (the whole sentence, or only its denial clause). */
export function withoutOnlineDenials(text: string): { text: string; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  let lastWasDenial = false;
  for (const piece of piecesOf(text)) {
    if (!denies(piece)) {
      // A sentence right after a dropped denial that only led on from it ("所以…"): its connective goes.
      kept.push(lastWasDenial ? piece.replace(/^\s*(?:所以|因此|因而|だから|そのため|so,?|therefore,?)[，,、\s]*/iu, "") : piece);
      lastWasDenial = false;
      continue;
    }
    lastWasDenial = true;
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

/* ── 4. status words a read record does not support (AG13 opening 2, AE-FN-008) ───────────────── */

export type StatusKind = "open" | "done" | "cancelled";

/** A sentence saying something is still to do, done, or cancelled (zh / ja / en). */
const STATUS_CLAIM: Record<StatusKind, RegExp[]> = {
  open: [
    /(?:还|仍|仍然|尚|依然)(?:是|在|属于)?(?:待办|待处理|未完成|没完成|没做|未做|未处理|没处理|没办|没发|未发|悬而未决)/u,
    /(?:还|仍|尚)(?:没有|没|未)(?:做|完成|办|处理|弄|落实|发出?|跟进)/u,
    /(?:尚未|仍未|还未)(?:完成|处理|落实|办理|发出?)/u,
    /(?:是|属于|算)(?:一?(?:件|条|项))?(?:未完成|待办|待处理)(?:的)?(?:事|事项|任务)/u,
    /まだ(?:済んで|終わって|完了して|対応して|送って|やって)いない|(?:未完了|未対応|未処理|対応待ち|やり残し)(?:です|のまま|になって)/u,
    /\b(?:is|are|remains?|still)\s+(?:still\s+)?(?:open|pending|outstanding|to[- ]do|unfinished|not (?:yet )?(?:done|completed|finished|sent))\b/iu,
    /\bstill (?:needs to be|has to be|to be) (?:done|sent|completed)\b/iu,
    /\bhas(?:n't| not) (?:yet )?been (?:done|completed|finished|sent)\b/iu,
  ],
  done: [
    /(?:已经|已|早已)(?:完成|做完|办完|办好|处理完|落实)/u,
    /(?:做完了|办完了|完成了|搞定了|处理好了)/u,
    /(?:完了しました|完了済み|完了しています|済みです|済ませました|終わりました|終わっています)/u,
    /\b(?:is|are|was|were|has been|have been)\s+(?:already\s+)?(?:done|completed|finished|taken care of)\b/iu,
    /\balready (?:done|completed|finished)\b/iu,
  ],
  cancelled: [
    /(?:取消了|被取消|已取消|作废了|不做了|撤销了)/u,
    /(?:キャンセルされ|キャンセルしました|キャンセル済み|中止になり|中止されました|取り消され)/u,
    /\b(?:is|are|was|were|has been|have been)\s+(?:cancell?ed|called off|dropped)\b/iu,
  ],
};

/** What a read record must hold for a claim of that kind: its status field, or words of that kind in its own text. */
const STATUS_SUPPORT: Record<StatusKind, RegExp> = {
  open: /Status: (?:open|pending)|overdue|待办|待处理|未完成|没完成|还没|尚未|未処理|未対応|未完了|まだ|\bopen\b|\bpending\b|\bnot (?:yet )?(?:done|sent|completed)\b|\bstill\b|\bto[- ]do\b/iu,
  done: /Status: (?:completed|done)|\(completed |已完成|完成了|做完|办完|完了|済み|\bdone\b|\bcompleted\b|\bfinished\b/iu,
  cancelled: /Status: (?:cancell?ed|archived)|取消|作废|キャンセル|中止|\bcancell?ed\b|\bcalled off\b/iu,
};

/** The status kinds a sentence claims. */
export function statusClaimsIn(sentence: string): StatusKind[] {
  return (Object.keys(STATUS_CLAIM) as StatusKind[]).filter((kind) => STATUS_CLAIM[kind].some((pattern) => pattern.test(sentence)));
}

/**
 * A sentence of the answer that says something is still to do, done or cancelled is delivered only when a record read this
 * turn supports that status (its status field, or its own words of that kind). `sources` are the read records' lines.
 */
export function withoutUnsupportedStatus(text: string, sources: readonly string[]): { text: string; dropped: string[] } {
  const supported = (kind: StatusKind) => sources.some((line) => STATUS_SUPPORT[kind].test(line));
  return without(text, (piece) => statusClaimsIn(piece).some((kind) => !supported(kind)));
}

/**
 * AG13 rerun of AG09 (AE-SCL-016): the fetched page says "effective October 1, 2026" and the answer wrote "(dated Oct 1,
 * 2026)". A date the sources give as the day something takes effect is said as that ("effective …", "…起生效"), never as
 * the date of the page.
 */
const EN_DATE = String.raw`(?:[A-Z][a-z]{2,8}\.?\s+\d{1,2},\s*\d{4}|\d{4}-\d{2}-\d{2})`;
const SOURCE_EFFECTIVE_EN = new RegExp(String.raw`\b(?:effective|valid|applies|applicable|starting|in effect)\s+(?:from\s+|as of\s+|on\s+)?(${EN_DATE})`, "giu");
const SOURCE_EFFECTIVE_CJK = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(?:起|から|より)\s*(?:生效|适用|適用|有效|実施)?/gu;
const ANSWER_DATED_EN = new RegExp(String.raw`\b(dated|as of|updated(?:\s+on)?|last updated(?:\s+on)?|published(?:\s+on)?)\s+(${EN_DATE})`, "giu");
const ANSWER_DATED_ZH = /(?:更新于|日期为|发布于|截至)\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/gu;

const dayOf = (text: string): string | null => {
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/u.test(text) ? `${text}T00:00:00Z` : `${text.replace(/\./gu, "")} 00:00 UTC`);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
};
const cjkDay = (year: string, month: string, day: string) => `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

export function withEffectiveDates(text: string, sources: readonly string[]): { text: string; changed: string[] } {
  const effective = new Set<string>();
  for (const line of sources) {
    for (const match of line.matchAll(SOURCE_EFFECTIVE_EN)) { const day = dayOf(match[1]); if (day) effective.add(day); }
    for (const match of line.matchAll(SOURCE_EFFECTIVE_CJK)) effective.add(cjkDay(match[1], match[2], match[3]));
  }
  if (!effective.size) return { changed: [], text };
  const changed: string[] = [];
  let out = text.replace(ANSWER_DATED_EN, (whole, _verb: string, date: string) => {
    const day = dayOf(date);
    if (!day || !effective.has(day)) return whole;
    changed.push(whole);
    return `effective ${date}`;
  });
  out = out.replace(ANSWER_DATED_ZH, (whole, year: string, month: string, day: string) => {
    if (!effective.has(cjkDay(year, month, day))) return whole;
    changed.push(whole);
    return `${year}年${Number(month)}月${Number(day)}日起生效`;
  });
  return { changed, text: out };
}
