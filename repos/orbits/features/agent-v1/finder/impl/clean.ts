// @ts-nocheck -- finder/impl/clean.ts: copied byte for byte from lab-rsi repos/orbits/lab/record-finder/rsi/archive/r10/impl/clean.ts
// (lab commit 931bae340, r10 accepted). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * cleanClue: split the clue into content words and remove pointers, kind words, request verbs, person mentions
 * (pronouns, surname + title, honorific-marked names) and time words. Surface forms are kept as typed.
 */
import type { CleanInput, CleanResult } from "../types";
import {
  SURFACE_INDEX, TITLE_EQUIV, EN_TITLES, JA_TITLES, KIND_SET, POINTER_SET, PRONOUN_SET, SOFT_KIND_SET, STOP_SET, VERB_SET, ZH_SURNAMES_1, ZH_SURNAMES_2, ZH_TITLES,
} from "./lexicon";
import { fold, foldChar, isHan, isHira, isKata, isLatin } from "./text";
import { resolveTime } from "./time";

type Cat = "pointer" | "kind" | "verb" | "person" | "time" | "stop";
interface Piece { text: string; cat?: Cat; quoted?: boolean; content?: boolean }

const ZH_SURNAME_SET = new Set([...ZH_SURNAMES_1].concat(ZH_SURNAMES_2));
/** Job / function words of the title classes (経理, 财务, 设计师 …): a function, never a name. */
const ROLE_WORDS = new Set(TITLE_EQUIV.flat().map((x) => fold(x)));
const sortLen = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length);
const ZH_TITLE_RE = sortLen(ZH_TITLES).join("|");
const JA_TITLE_RE = sortLen(JA_TITLES).join("|");

/** Multi-character function words / wrappers matched inside CJK runs (longest first). */
const CJK_STOP_MULTI = sortLen([
  "についての", "について", "に関する", "に関して", "関係の", "関係", "関連の", "関連", "ってやつ", "っていう", "という", "って", "との", "での", "への",
  "からの", "から", "まで", "より", "关于", "有关", "相关的", "相关", "那边的", "那边", "這邊", "那邊", "这边", "方面",
  "の件", "のこと", "のやつ", "の方", "の話", "的事", "的事情", "的事儿", "那件事儿", "那件事", "这件事", "这事儿", "那事儿", "事儿",
  "うちの", "俺の", "僕の", "私の", "わたしの", "自分の", "我们的", "咱们的",
  "につきましての", "につきまして", "につき", "に関しての", "に関しまして", "に関わる", "系の", "っぽい", "みたいな",
  "手头上的", "手头上", "手头的", "手头", "手上的", "手上",
  "有一条", "有条", "有一个", "有个", "有一篇", "有篇", "有一件", "有件", "有一份", "有份",
  // r04: hedges and vague wrappers (好像是叫什么X / X什么的 / X之类的 / たしかXがどうとか)
  "好像是", "好像", "似乎是", "大概是", "叫什么", "什么的", "什么", "之类的", "之类", "一类的", "啥的", "たしか", "確か", "どうとか", "とか", "なんか", "なんとか",
].map((w) => [...w].map(foldChar).join("")));
const CJK_POINTER_MULTI = sortLen([...POINTER_SET].filter((w) => [...w].some((c) => isHan(c) || isHira(c) || isKata(c))));
const CJK_KIND_MULTI = sortLen([...KIND_SET].filter((w) => [...w].some((c) => isHan(c) || isHira(c) || isKata(c))));
const CJK_VERB_MULTI = sortLen([...VERB_SET].filter((w) => [...w].some((c) => isHan(c) || isHira(c) || isKata(c)) && [...w].length >= 2));
const ORDINAL_RE = /^(第\s*[0-9０-９一二三四五六七八九十]+\s*[条條个個篇项項件位场場次]?|[0-9０-９一二三四五六七八九十]+\s*(番目|つ目|个|條|条)?の?(方|ほう)?|最后|最後|上一个|上一条)$/;
/** "(跟你)(之前)提过的 / 上回说的 / 我们聊过的": narration about earlier talk, never content. */
const NARRATIVE_RE = /^(?:(?:[跟和给对同](?:你|您|你们|我|我们|咱们))?(?:你|您|你们|我|我们|咱们|他|她)?(?:之前|以前|上次|上回|刚才|前面|那天)?(?:提过|提到过|提起过|提到|说过|说起过|讲过|聊过|谈过|参加过|参加了|参加|去过|去了|列出来|列出|列过|列|显示出来|显示|给我看|发过|发|讲|说|聊|提|记下来|记下了|记录下来|写下来|写下|存下来|记好|记下|记过|记|存下|存)的|(?:前に|この前|以前|さっき|先日|前回)?(?:お話しした|お伝えした|話した|話してた|話していた|言ってた|言っていた|言った|相談した|話に出た|出てきた|出てた|挙がった|上がった|行ってきた|行った|参加した|伺った|訪れた|見せた|見た|聞いた)|(?:上面|前面|刚才|之前|上次)(?:出现过|出现|出来|列出)的)/;
/** Common words that start with a one-character preposition (跟进 is not 跟 + 进). */
const PREP_WORDS = /^(跟进|跟踪|跟單|跟单|给予|给付|对接|对比|对账|对帐|对标|对外|和解|和谈|把关|把握|让利|向导|从业|在职|在线|在建|在途|在库|被动|与会)/;
const JA_PARTICLES = new Set(["の", "を", "に", "と", "が", "は", "で", "も", "へ", "や"]);
const JA_VERB_END = /^(.*[\p{Script=Han}ァ-ヿ])([\p{Script=Han}](?:る|う|く|す|つ|ぶ|む|ぐ|ぬ|する))$/u;

/** Hesitation fillers (呃… / えーと / あのー): never content. */
const FILLER_RE = /^(?:呃+|嗯+|额…|えーと|えっと|ええと|えーっと|えー+|うーん|あのー+|んー+)/u;
/** Vague past / recent time (前两天 / 前阵子 / こないだ): a time wording, not content. */
const VAGUE_TIME_RE = /^(?:前に(?=[\p{Script=Han}ぁ-ゖ])|刚(?=[那这這])|剛(?=[那这這])|前两天|前兩天|前几天|前幾天|前些天|前些日子|前阵子|前陣子|前一阵子|前一阵|前段时间|前段時間|这两天|這兩天|这几天|這幾天|那阵子|那陣子|最近|近来|近來|近期|こないだ|このあいだ|この間|先日|このごろ|この頃|最近)/u;
/** A status said as a modifier (已经做完的 / 做好的 / 还没做的 / 済んだ方の): a filter for the finder, not content. */
const STATUS_RE = /^(?:(?:已经|已經|已)?(?:做完|做好|完成|搞定|弄完|弄好|办完|办好|辦完|辦好|处理完|处理好|處理完|结束|完结|交了)了?(?=的)|(?:还没|還沒|还未|没有|沒有|没|沒|未)(?:做完|做|完成|办完|办|弄完|弄|搞定|处理|交)(?=的)|(?:済んだ|済み|完了した|完了済み|終わった|終わってる|片付いた|やった|未完了|まだの)(?:方|ほう)?(?=の))/u;
/** Naming the title (叫…的 / 名为… / 标题是…): a wrapper around the title. */
const CALLED_RE = /^(?:叫做|叫作|名叫|名为|名為|标题是|標題是|标题叫|题目是|題目是|内容是|內容是|写着|寫著|写的是|寫的是|写有|寫有|标着|標著|讲的是|講的是|说的是|說的是|叫)(?=[\p{Script=Han}ぁ-ゖァ-ヿA-Za-z0-9]{2,})/u;
/**
 * A negated alternative (不是X那个，是Y / Xじゃなくて、Y / not the X one, the Y): X is exactly what the user does not
 * mean, so only the alternative is the clue.
 */
/**
 * r10: a self-correction between two pieces (X，哦不，Y / X…じゃなかった、Y / X、いや違う、Y / X — sorry, Y / X, I mean Y):
 * the user took X back, so only what follows the marker is the clue. The marker must stand alone between separators.
 */
const SEP = "[，,、…—–;；。\\s]";
const CORRECTION_RE = new RegExp(`^(.+?)${SEP}+(?:哦不|噢不|喔不|啊不|呃不|不对|不對|说错了|說錯了|搞错了|搞錯了|我是说|我是說|错了|錯了|じゃなかった|じゃなくて|ではなくて|いや違う|いや、違う|違う違う|違った|間違えた|間違い|sorry|i mean|no wait|wait|scratch that|or rather|correction)${SEP}+(.+)$`, "iu");
function dropCorrected(clue: string): string {
  const m = clue.match(CORRECTION_RE);
  return m && /[\p{L}\p{N}]/u.test(m[2]) ? m[2] : clue;
}

function dropNegated(clue0: string): string {
  const clue = dropCorrected(clue0);
  const zh =clue.match(/^(?:不是|并不是|並不是|并非|不要|别|別)(.+?)[，,、；;]\s*(?:而是|就是|是|要)?(.+)$/u);
  if (zh && zh[2].trim()) return zh[2];
  const zh2 = clue.match(/^(.+?)[，,、；;]\s*(?:而不是|并不是|不是)(.+)$/u);
  if (zh2 && zh2[1].trim()) return zh2[1];
  const ja = clue.match(/^(.+?)(?:じゃなくて|ではなくて|じゃなく|ではなく|でなく)[、,，\s]*(.+)$/u);
  if (ja && ja[2].trim()) return ja[2];
  const en = clue.match(/^(?:not|no,?\s+not)\s+(.+?)[,;—–]\s*(?:but\s+|rather\s+)?(.+)$/i);
  if (en && en[2].trim()) return en[2];
  const en2 = clue.match(/^(.+?)[,;—–]\s*not\s+.+$/i);
  if (en2 && en2[1].trim()) return en2[1];
  return clue;
}

/**
 * r10: a politeness formula standing as its own piece (麻烦了 / 谢谢 / お願いできる？ / よろしく): the request's courtesy,
 * never content. Matched only on a whole piece.
 */
const POLITE_PIECE_RE = /^(?:(?:麻烦|麻煩|劳驾|勞駕)(?:你|您)?(?:了|啦|啊)?|(?:谢谢|謝謝|多谢|多謝|感谢|感謝)(?:你|您|啦|了)?|辛苦(?:你|您)?了|拜托(?:你|您)?了|拜託了|(?:お願い|おねがい)(?:します|いたします|できる|できます|できますか|できない|していい|ね|な)?(?:か)?|よろしく(?:お願いします|ね|です)?|すみません|すいません|ごめん(?:ね|なさい)?)[？?！!。]*$/u;
/** r10: a forgotten name said as a question (誰だっけ / 何だっけ / 谁来着): the user means a person / record, not content. */
const FORGOT_PIECE_RE = /^(?:誰|だれ|何|なん|どなた|どれ|谁|誰来着|谁来着)(?:だ|でした|だった|さん)?(?:っけ|か|かな|来着)?[？?]*$/u;
/** r10: a Japanese conjunctive clause closing with けど / けれど (<…>たけど / <…>ないけど): narration before the content, not content. */
const JA_CONCESSIVE_RE = /^[\p{Script=Han}ァ-ヺー]{1,4}[ぁ-ゖ]*(?:た|だ|る|い|ない|ます|です)(?:けど|けれど|けれども)$/u;

// ---------------------------------------------------------------- r07: structural classes (word classes + morphology)
/**
 * Chinese demonstrative phrase: a demonstrative (那 / 这 / 哪 / 某 / 嗰) + an optional numeral (一 / 两 / 几 / 些 / N) + an
 * optional measure word + an optional 儿: 那几条 / 这一条 / 某个 / 那块儿 / 那俩. Demonstratives never carry content.
 */
const ZH_MEASURE = "条條个個项項篇件份张張笔筆则則封单單次场場位块塊批类類种種本页頁段回趟";
const ZH_DEM_RE = new RegExp(`^[那这這哪某嗰](?:[一两兩俩倆几幾0-9二三四五六七八九十]+|些)?(?:[${ZH_MEASURE}])?(?:儿|兒)?`, "u");
/** A bare numeral + record measure word at a word start (几条 / 两个 / 一条): a pointer. */
const ZH_NUM_MEASURE_RE = /^(?:[一两兩俩倆几幾])(?:[条條个個项項篇件则則笔筆])(?![\p{Script=Han}]{2})/u;
/** Chinese relational prepositions opening a clue (关于 / 涉及 / 针对 / 围绕 / 对于 …): a wrapper, never content. */
const ZH_REL_PREP_RE = /^(?:有关于|关于|關於|关乎|關乎|涉及到|涉及|牵涉到|牵涉|牽涉|针对|針對|围绕|圍繞|对于|對於|至于|至於|事关|事關|就是|就)/u;
/** The speaker's memory / opinion opening a clue (我记得 / 印象中 / 我觉得): narration, not content. */
const ZH_COGNITION_RE = /^(?:(?:我|我们|我們|咱|咱们|你|您)(?:好像|应该|應該)?(?:记得|記得|觉得|覺得|印象中|印象里|印象裡|想起来|想起來)|印象中|印象里|印象裡)/u;
/**
 * Japanese ko-so-a-do deixis (こちら / そっち / どちらか / このへん / どれか / 向こう) + の: a pointer, never content.
 */
const JA_DEIXIS_RE = /^(?:(?:こちら|そちら|あちら|どちら|こっち|そっち|あっち|どっち)(?:さん|側|がわ)?(?:か)?|(?:この|その|あの|どの)(?:へん|辺|あたり|辺り)|(?:これ|それ|あれ|どれ)か|向こうさん|向こう(?:側|がわ)?)(?:の)?/u;
/**
 * A Japanese relational noun closing a content word (手続き絡みの / 引越し周りの / 支払いまわりの): "around X", a wrapper.
 */
const JA_REL_SUFFIX_RE = /^(?:絡み|がらみ|まわり|周り|周辺|あたり|辺り|界隈)(?=$|[の\s、，。,.!?]|な)/u;
/** A plain past Japanese verb (relative clause) before a noun: narration about the record (お送りした資料 / 頼まれた資料). */
const JA_PAST_REL_RE = /^((?:[おご]?[\p{Script=Han}]{1,3}[ぁ-ゖ]{0,4}?|[ぁ-ゖ]{2,5}?)(?:した|った|んだ|いた|いだ|れた|せた|えた|けた|てた|ていた|てもらった|ていただいた|いただいた|もらった))([\p{Script=Han}ァ-ヿ].*)$/u;
/** A number with its counter / edition word stays one word (第3稿 / 3部 / 20份 / 4期). */
const COUNTER_CHARS = /[部份个個件张張枚本台条條通回次人名页頁箱套把封版稿期号號章节節巻代]/;
/** English relational words wrapping the content (concerning / related / regarding …). */
const EN_REL = new Set(["concerning", "regarding", "related", "relating", "pertaining", "involving", "re", "wrt", "about", "around", "re:"]);
/** English record-book words that name the kind when they stand before a kind word (diary item / planner note). */
const EN_BOOK = new Set(["calendar", "diary", "agenda", "planner", "schedule", "to-do", "todo", "task"]);
const EN_SUBJECT = new Set(["i", "we", "you", "he", "she", "they"]);
const EN_ORDINALS = new Set(["first", "second", "third", "fourth", "fifth"]);
/** English vague record nouns (anything / something / the bit about): a pointer, never content. */
const EN_VAGUE = new Set(["anything", "something", "everything", "whatever", "bit"]);
const EN_COUNTS = new Set(["two", "three", "four", "five", "couple"]);
/** Base-form request verbs that are also nouns (an office move, a status check, the price change). */
const EN_VERB_NOUNS = new Set(["move", "change", "update", "check", "push", "link", "show", "set", "cancel", "return", "find"]);
/** The speaker / listener as a modifier (咱们年会 / 我们部门 / 你的): self-reference, never content. */
const ZH_SELF_RE = /^(?:我们|我們|咱们|咱們|你们|你們|俺们|俺們|咱|俺|我|您|你)(?:组|組|部门|部門|团队|團隊|小组|小組|公司|家|班|科室)?(?:的)?/u;
/** Email reply / forward markers at the start of a quoted subject (Re: / Fwd: / 回复：): not content. */
const REPLY_MARK_RE = /^(?:(?:re|fw|fwd|aw|tr)\s*[:：]\s*|(?:回复|回覆|答复|答覆|转发|轉發|返信|転送)\s*[:：]\s*)+/i;

/** Emoji and other pictographic symbols are separators, never content (r04). */
const SYMBOL_RE = /^(?:[\p{Extended_Pictographic}\p{So}\uFE0F\u200D]|[\u{1F3FB}-\u{1F3FF}])+/u;
/** A Japanese verb in a casual te / chau form left at the end of a sloppy clue (消しちゃ(って) / 片付けといて). */
// r10: two or three kanji + a bare て is a noun with okurigana (子育て / 仕立て / 手当て), not a verb form
const JA_TE_VERB = /^(?:[\p{Script=Han}]{1,3}[ぁ-ゖ]*?(?:ちゃう|ちゃった|ちゃ|じゃう|じゃ|といて|どいて|ておいて|とく|ちゃって)|[\p{Script=Han}]{1,3}[ぁ-ゖ]+て|[\p{Script=Han}]て)$/u;

// ---------------------------------------------------------------- r08: shape of a content noun phrase
/**
 * A content noun phrase does not open with a discourse marker or a request and does not close with a sentence-final
 * particle or a question / request clause. These are judged by shape (closed-class characters at the edges, a clause
 * that starts with a predicate character and carries a question or request mark) so unseen combinations are caught.
 */
/** Chinese sentence-final particles (closed class). */
const ZH_SFP = "吧呢吗嘛啊呀啦哦哈么呗咯喔哟嘞噢哇呐";
const ZH_SFP_TAIL_RE = new RegExp(`(?:来着|[了${ZH_SFP}])+$`, "u");
/** Discourse markers / hedges opening a Chinese phrase (closed class of adverbs and interjections). */
const ZH_DISCOURSE_LEAD_RE = /^(?:嗯+|呃+|哦+|噢|诶|欸|哎|唉|话说|对了|就是说|就是|其实是|其实|反正是|反正|大概是|大概|可能是|可能(?!性)|应该是|应该|估计是|估计(?![表值算])|也许是|也许|貌似是|貌似|好像是|好像|那个啥|那啥|啥|然后|就(?![业業医醫职職餐读讀近诊診绪緒位任寝座地算此]))+/u;
/** A request opening a Chinese phrase: (请 / 麻烦 / 帮我 …)* + an optional look-up verb in a request form (查查 / 找一下 / 找下). */
const ZH_REQUEST_LEAD_RE = /^(?:(?:请|麻烦|劳驾|给我|替我)*(?:帮忙|帮我|帮)(?:([找查看翻搜])\1|[找查看翻搜](?:一下|下|一找|出来|出|到)?)?|(?:请|麻烦|劳驾)+(?:([找查看翻搜])\2|[找查看翻搜](?:一下|下|出来|出))|([找查看翻搜])\3(?:看)?|[找查看翻搜](?:一下|下)(?=[\p{Script=Han}]{2}))/u;
/** Characters a Chinese predicate clause starts with (copula, existence, modal, request, question, look-up, memory). */
const ZH_CLAUSE_START = "在是有还能可帮请麻你您怎什啥咋哪几多谁记找查看";
/** Question marks inside a clause: question words, and the A-not-A question form (在不在 / 有没有 / 是不是). */
const ZH_QUESTION_RE = /[哪几啥谁咋]|什么|怎么|多少|([\p{Script=Han}])[不没]\1/u;
/** Is S (the rest of a Chinese word from a clause-start character) a question / request clause? */
function zhTailClause(S: string): boolean {
  if (!S || !ZH_CLAUSE_START.includes(S[0]) || [...S].length > 9) return false;
  if (/[吗么呢][？?]?$/u.test(S.replace(/[了吧啊呀啦哦]+$/u, "")) && [...S].length >= 2) return true;
  if (ZH_QUESTION_RE.test(S)) return true;
  // a request / modal clause carries a look-up or help verb (能找出来 / 可以帮我 / 麻烦查)
  // r09: the look-up verb must stand in a look-up form (找一下 / 查出来 / 看看 / at the end), not open a word (翻新 / 看板)
  // r10: and the clause must END with that look-up form (帮我找找 / 能帮我查一下吗): a request followed by more words
  // (帮我找一下X整理书架 / 帮X整理书架) carries content and is never dropped whole
  return /^(?:帮|请|麻烦|能不能|可不可以|可以|能)(?:[^找查看翻搜]{0,4})[找查看翻搜](?:一下|下|一找|出来|出|到|给我|给|[找查看翻搜])?(?:[吗么呢吧啊])?[？?]?$/u.test(S);
}
/**
 * r10: openers at which a question / request clause may be cut off from inside a longer Han word: multi-character
 * modal / request / copula + question forms, A-not-A, and question words that never sit inside ordinary words.
 * A single 请 / 能 / 可 / 有 / 在 / 是 / 几 inside a word is ambiguous (申请 / 功能 / 现在 / 茶几) and never a cut point.
 */
const ZH_MID_CLAUSE_OPEN = /^(?:还在|还有|还能|还是|在不在|在哪|在吗|是不是|是什么|是啥|是哪|是几|是多少|是谁|有没有|有吗|有啥|有什么|有多少|能不能|能否|能帮|可不可以|可以帮|可以找|可以查|帮我|帮忙|麻烦|请帮|请问|你|您|怎么|怎样|什么|多少|几号|几点|几时|几月|几天|哪|谁|啥|咋|记得|找一下|查一下|看一下|找找|查查|看看)/u;
/** 帮 opening a common compound noun / verb (帮扶 / 帮手 / 帮派): not a request. */
const ZH_BANG_WORD_RE = /^帮(?:扶|手|派|会|會|工|厨|廚|衬|襯|佣|傭|凶|腔)/u;
/** Common nouns that end in a sentence-particle character (酒吧 / 网吧 / 毛呢 / 喇嘛 / 爪哇). */
const ZH_SFP_NOUN_END_RE = /(?:[酒网網贴貼氧书書水清陶琴茶]吧|毛呢|喇嘛|爪哇|哈哈)$/u;
/** Japanese interjections / hedges opening a phrase (closed class). */
const JA_DISCOURSE_LEAD_RE = /^(?:ほら|ねえ|ねぇ|あのさ|あのね|えっと|まあ|まぁ|なんか|ちょっと|とりあえず|やっぱり|やっぱ|一応|なんだっけ|なんていうか|ていうか|てか)/u;
/** Japanese sentence endings closing a phrase (copula / question / assertion particles). */
const JA_END_TAIL_RE = /(?:なんですけど|なんだけど|なんだよね|なんだ|ですけど|だけど|けど|だっけ|でしたっけ|っけ|かな|かも|だよね|よね|だよ|だね|じゃん|でしょう|でしょ|です|だ|ね|よ|か)+[？?]?$/u;
/** A pure-hiragana piece ending in an inflection or a sentence particle is a predicate / filler, not a noun. */
const JA_HIRA_PRED_RE = /^[ぁ-ゖー]{1,8}$/u;
/**
 * r10: only unambiguous inflections / sentence endings. A bare final ん / い / な / さ / る / か … also ends many
 * hiragana nouns and given names (みかん / あおい / ひかる / まどか), so those need a longer, clearly verbal ending.
 */
const JA_HIRA_PRED_END = /(?:った|んだ|いた|いだ|した|てた|てる|でる|ている|ない|なかった|ます|ました|ません|だっけ|っけ|かな|よね|けど|じゃん|だよ|だね|でしょ|する|される|ある|いる|なる|くる|れる|せる|たい|ほしい|だ|て|ね|よ|ぞ)$/u;
/** Japanese predicate after a record head: hiragana only, or a short verb (kanji + hiragana) with no case particle. */
function jaTailClause(S: string): boolean {
  if (!S) return false;
  if (/^[ぁ-ゖー]+[？?]?$/u.test(S) && !/^(?:っ|し)/u.test(S)) return true;
  return /^[\p{Script=Han}]{1,3}[ぁ-ゖ]{2,}[？?]?$/u.test(S) && !/[をがにはで]/u.test(S.slice(1));
}
/** English auxiliaries / modals / question words that open a question or request clause after the content (…, is it still there / could you pull it up). */
const EN_CLAUSE_OPEN = new Set(["is", "are", "was", "were", "do", "does", "did", "can", "could", "would", "will", "should", "where", "what", "when", "how", "why", "which", "who"]);
/** English discourse words (fillers and hedges): never content. */
const EN_DISCOURSE = new Set(["uh", "uhh", "um", "umm", "er", "erm", "hmm", "hm", "eh", "oh", "ah", "hey", "well", "ok", "okay", "maybe", "probably", "perhaps", "kinda", "sorta", "actually", "basically", "pls", "plz", "thanks", "thx", "ya", "yeah", "lol"]);
/** Verbs of asking / instructing a person (交代的 / 吩咐的): narration about who asked, never content. */
const ZH_INSTRUCT_RE = /^(?:交代|交待|吩咐|嘱咐|囑咐|叮嘱|叮囑|布置|拜托|拜託|委托|委託|托付|託付)(?:给我|我)?(?:的|过的|過的)/u;

/**
 * Trim discourse / request openers and sentence-final tails off one content word; "" when nothing is left.
 * r09: a Chinese sentence-final particle is trimmed only when no content follows the word (atEnd): inside the clue the
 * same character can end a name or a word (X哈的报价 / X啦寄样品), and a particle never sits before a modifier 的.
 */
function trimShape(t: string, atEnd = true): string {
  let w = t;
  for (let guard = 0; guard < 4; guard++) {
    const before = w;
    const hasKana = /[ぁ-ゖァ-ヺ]/u.test(w);
    if (!hasKana && /[\p{Script=Han}]/u.test(w)) {
      const d = w.match(ZH_DISCOURSE_LEAD_RE);
      if (d && [...w].length - [...d[0]].length >= 2) w = w.slice(d[0].length);
      const r = w.match(ZH_REQUEST_LEAD_RE);
      // r10: 帮 opening a common compound (帮扶 / 帮手 …) is the word, not a request
      if (r && r[0] && [...w].length - [...r[0]].length >= 2 && !ZH_BANG_WORD_RE.test(w)) w = w.slice(r[0].length);
      // the whole piece is a question / request clause standing after the noun (还在吗 / 帮我找找)
      if (zhTailClause(w) || (w.match(ZH_REQUEST_LEAD_RE)?.[0] ?? "") === w) return "";
      // a question / request clause after the noun (展会海报还在吗 / 海报是几号)
      // r10: inside a word only at an unambiguous clause opener (closed class, see ZH_MID_CLAUSE_OPEN) and never where the
      // character before and the opener form a known word (申 + 请): unknown vocabulary keeps the whole piece
      const cs = [...w];
      for (let k = 2; k < cs.length; k++) {
        const S = cs.slice(k).join("");
        if (!ZH_MID_CLAUSE_OPEN.test(S) || SURFACE_INDEX.has(fold(cs[k - 1] + cs[k]))) continue;
        if (zhTailClause(S)) { w = cs.slice(0, k).join(""); break; }
      }
      const f = atEnd ? w.match(ZH_SFP_TAIL_RE) : null;
      // r10: a noun ending in a particle character (酒吧 / 毛呢 / 喇嘛) keeps it
      if (f && [...w].length - [...f[0]].length >= 2 && !ZH_SFP_NOUN_END_RE.test(w)) w = w.slice(0, w.length - f[0].length);
    } else if (hasKana) {
      const d = w.match(JA_DISCOURSE_LEAD_RE);
      // r09: only at a word boundary — hiragana running on from the opener is the same word (まあや… is a name, not まあ + や…)
      if (d && /[\p{Script=Han}ァ-ヺ]/u.test(w.slice(d[0].length)) && (/^[^ぁ-ゖ]/u.test(w.slice(d[0].length)) || /^(?:あの|その|この|例の|あれ|それ|これ)/u.test(w.slice(d[0].length)))) w = w.slice(d[0].length);
      const e = w.match(JA_END_TAIL_RE);
      if (e && /[\p{Script=Han}ァ-ヺ]$/u.test(w.slice(0, w.length - e[0].length)) && [...w].length - [...e[0]].length >= 2) w = w.slice(0, w.length - e[0].length);
      // a request / polite verb standing alone (見つけてくれる / 探してほしい / 調べます)
      // r09: a two-kanji verbal noun + する in that form (確認してもらう / 説明してくれる) keeps the noun: it names the act
      if (/^[\p{Script=Han}]{1,3}[ぁ-ゖ]+[？?]?$/u.test(w) && /(?:て|で)(?:くれ|くだ|ほし|もら|おい|おく|み)|(?:ます|ません|たい|れる|られる)[？?]?$/u.test(w)) {
        const vn = w.match(/^([\p{Script=Han}]{2,3})し(?:て|ま|た)/u);
        return vn ? vn[1] : "";
      }
    }
    if (w === before) break;
  }
  if (/^[\p{Script=Han}]$/u.test(w) && (ZH_SFP + "儿兒").includes(w)) return "";
  // a negation + one verb (不在 / 没有 / 不是: the tail of an A-not-A question) is never a content noun
  if (/^[不没沒][\p{Script=Han}][吗嗎呢]?$/u.test(w)) return "";
  return w;
}

/** A pure-hiragana piece shaped like a predicate / filler (ある / だっけ / なんだけど); dropped only when other content remains. */
function isHiraPred(w: string): boolean {
  return JA_HIRA_PRED_RE.test(w) && JA_HIRA_PRED_END.test(w) && !/^[おご]/u.test(w);
}

/** Split a text into pieces: quoted segments, time spans, and the rest. */
function splitOuter(clue: string): Piece[] {
  const out: Piece[] = [];
  const quoteRe = /[「『"“‘《〈]([^」』"”’》〉]+)[」』"”’》〉]|(?<![\p{L}\p{N}])'([^']+)'(?![\p{L}\p{N}])/gu;
  let last = 0, m: RegExpExecArray | null;
  const plain = (s: string) => {
    if (!s) return;
    const t = resolveTime({ text: s, now: "2026-01-01T12:00:00Z", timeZone: "UTC" });
    let p = 0;
    for (const [a, b] of t.spans) {
      if (a > p) out.push({ text: s.slice(p, a) });
      out.push({ text: s.slice(a, b), cat: "time" });
      p = b;
    }
    if (p < s.length) out.push({ text: s.slice(p) });
  };
  while ((m = quoteRe.exec(clue))) {
    plain(clue.slice(last, m.index));
    const q = (m[1] ?? m[2]).replace(REPLY_MARK_RE, "").trim();
    if (q) out.push({ text: q, quoted: true });
    last = m.index + m[0].length;
  }
  plain(clue.slice(last));
  return out;
}

/** Common words ending in 様 / 氏 that are not a name + honorific. */
const SAMA_WORDS = new Set(["仕様", "同様", "模様", "多様", "一様", "異様", "皆様", "各様", "両様", "神様", "王様", "殿様", "奥様", "彼氏", "某氏"]);

/** Person mentions inside a CJK / mixed run: pronouns, surname + title, name + honorific. */
function personMatch(s: string, i: number): number {
  const rest = s.slice(i);
  for (const p of ["彼女ら", "彼女", "彼ら", "他们", "她们", "人家", "对方", "對方", "先方", "哥们儿", "哥们", "哥們", "哥儿们", "那家伙", "这家伙", "這傢伙", "那傢伙", "那小子", "这小子", "這小子", "这货", "那货", "あいつ", "こいつ", "そいつ", "あの人", "この人", "その人", "あの子", "この子", "その子", "あの方", "この方", "その方", "向こうさん", "他", "她", "彼"]) if (rest.startsWith(p)) {
    if (p === "彼" && /^彼(?:岸)/.test(rest)) continue;
    if (/子$/.test(p) && /^[供ど]/.test(rest.slice(p.length))) continue; // その子供 is "that child", a noun phrase
    if (p === "他" && i > 0 && /[吉其利排]/.test(s[i - 1])) continue; // r10: 吉他 / 其他 are words, not the pronoun
    return p.length;
  }
  // 2-char surname + title, 1-char surname + title (zh)
  for (const len of [2, 1]) {
    const sur = rest.slice(0, len);
    if (len === 2 ? ZH_SURNAME_SET.has(sur) : ZH_SURNAME_SET.has(sur)) {
      const mt = rest.slice(len).match(new RegExp(`^(?:${ZH_TITLE_RE})`));
      if (mt) {
        // avoid content words like 总结 / 经理人: title must not be followed by more Han that make a word with it
        const after = rest.slice(len + mt[0].length, len + mt[0].length + 1);
        if (mt[0] === "总" && /[结额数计部体量共]/.test(after)) continue;
        if (mt[0] === "董" && /^(古|骨)$/.test(sur)) continue; // 古董 (antique) is a word, not a surname + title
        return len + mt[0].length;
      }
    }
  }
  // surname + a net / Cantonese-style honorific (王sir, 张桑 = さん); 桑 starting a common word (桑拿 / 桑叶) is not one
  for (const len of [2, 1]) {
    const sur = rest.slice(0, len);
    if (!ZH_SURNAME_SET.has(sur)) continue;
    const net = rest.slice(len).match(/^(?:sir(?![a-z])|桑(?![拿叶葉树樹蚕蠶葚田园園]))/i);
    if (net) return len + net[0].length;
  }
  // 小X / 老X / 阿X with a surname
  const xl = rest.match(/^[小老阿](.)/);
  if (xl && ZH_SURNAME_SET.has(xl[1]) && !/^小[时時心说說组組学學]/.test(rest)) { const h = rest.slice(2).match(new RegExp(`^(?:${JA_TITLE_RE}|${ZH_TITLE_RE})`)); return 2 + (h ? h[0].length : 0); }
  // Han / kana name (1–4 chars) + Japanese honorific / title
  const ja = rest.match(new RegExp(`^([\\p{Script=Han}ぁ-ゖァ-ヿ]{1,4}?)(${JA_TITLE_RE})`, "u"));
  const jaNext = ja ? rest.slice(ja[0].length, ja[0].length + 1) : "";
  if (ja && /^(様|さま|氏|君|殿)$/.test(ja[2]) && ((isHan(jaNext) && jaNext !== "宛") || (ja[1].length === 1 && isHan(ja[1]) && /^(様|氏)$/.test(ja[2]) && SAMA_WORDS.has(ja[0])))) { /* compound word */ }
  else if (ja && ja[1].length >= 1 && !/^(お|ご)/.test(ja[1]) && !/^[のをにとがはでもへや]/.test(ja[1]) && !(/[ぁ-ゖ]/.test(ja[1]) && /[^ぁ-ゖ]/.test(ja[1]))) {
    // X担当 is a role (the person in charge of X) when X is ordinary vocabulary, not a name
    if (!(ja[2] === "担当" && (ja[1].length > 2 || SURFACE_INDEX.has(fold(ja[1])) || ROLE_WORDS.has(fold(ja[1]))))) return ja[0].length;
  }
  return 0;
}

/**
 * A surname + a job title (≥ 2 chars) inside a longer Han run (某某化工李课长那份 …): a person when what follows is a
 * pointer, 的 / の, punctuation or the end, and at least two characters of content come before it.
 */
function midRunPerson(s: string, i: number, buf: string): number {
  if ([...buf].length < 2 || !isHan(buf[buf.length - 1])) return 0;
  const rest = s.slice(i);
  for (const len of [2, 1]) {
    if (!ZH_SURNAME_SET.has(rest.slice(0, len))) continue;
    const mt = rest.slice(len).match(new RegExp(`^(?:${ZH_TITLE_RE}|${JA_TITLE_RE})`));
    if (!mt || [...mt[0]].length < 2 || /^(先生|老师|女士|小姐|さん|さま|くん|ちゃん)$/.test(mt[0])) continue;
    const after = rest.slice(len + mt[0].length);
    if (!after || /^[\s，、。,.!?的之のを]/.test(after) || CJK_POINTER_MULTI.some((p) => fold(after).startsWith(p))) return len + mt[0].length;
  }
  return 0;
}

function classifyWord(w: string): Cat | undefined {
  const f = fold(w);
  if (!f) return "stop";
  if (PRONOUN_SET.has(f)) return "person";
  if (POINTER_SET.has(f) || ORDINAL_RE.test(w.trim())) return "pointer";
  if (KIND_SET.has(f)) return "kind";
  if (VERB_SET.has(f)) return "verb";
  if (STOP_SET.has(f)) return "stop";
  return undefined;
}

/** Scan a CJK-or-mixed run into pieces. */
function scanRun(run: string): Piece[] {
  const out: Piece[] = [];
  let buf = "";
  const flush = () => { if (buf) out.push({ text: buf }); buf = ""; };
  const chars = [...run];
  const hasKana = /[ぁ-ゖァ-ヺ]/.test(run);
  const s = chars.join("");
  let i = 0;
  // compare on folded characters (タスク = たすく, 那條 = 那条) but return the raw length consumed
  const fchars = [...s].map((ch) => foldChar(ch));
  const matchAt = (w: string, at: number): number => {
    let acc = "", j = at;
    while (j < s.length && acc.length < w.length) { acc += fchars[j]; j++; if (!w.startsWith(acc)) return 0; }
    return acc === w ? j - at : 0;
  };
  const startsAny = (list: string[], at: number): string | undefined => {
    if (!fchars[at]) return undefined; // a word never starts on a mark that folds to nothing (the long vowel ー)
    for (const w of list) {
      const n = matchAt(w, at);
      if (!n) continue;
      // a function word does not start inside a katakana word (データシートの ≠ と + の)
      // a function / pointer / kind word does not start inside a katakana word (データシートの ≠ と + の, アイデアの ≠ あの)
      if (at > 0 && isKata(s[at]) && isKata(s[at - 1]) && (list === CJK_STOP_MULTI || [...w].every(isHira))) continue;
      // 的事 does not swallow the head of 事项 (的 + 事项); 有条 / 有个 are not the start of 有条件 / 有个性
      if (list === CJK_STOP_MULTI && /^(的事|的事儿?)$/.test(w) && /^[项項务務]/.test(s.slice(at + n))) continue;
      if (list === CJK_STOP_MULTI && /^有/.test(w) && /^[件理不性]/.test(s.slice(at + n))) continue;
      return s.slice(at, at + n);
    }
    return undefined;
  };
  while (i < s.length) {
    const c = s[i];
    const sym = s.slice(i).match(SYMBOL_RE);
    if (sym) { flush(); i += sym[0].length; continue; }
    // whitespace / punctuation
    if (/[\s，、。,.!?！？：:；;（）()【】\[\]《》〈〉・…~〜～\-—_/#＃]/.test(c) && !(c === "." && /No$/i.test(s.slice(Math.max(0, i - 2), i))) && !(c === "-" && isLatin(s[i - 1] ?? "") && isLatin(s[i + 1] ?? ""))) {
      flush(); i++; continue;
    }
    // ordinals 第二条 / 2番目 / 二つ目
    const ord = s.slice(i).match(/^((?:倒数|倒數)?第\s*[0-9０-９一二三四五六七八九十]+\s*(?:[条條个個篇项項件位场場次]|(?![\p{Script=Han}]))|[0-9０-９一二三四五六七八九十]+\s*(?:番目|つ目)(?:の(?:方|ほう))?)/u);
    if (ord && !buf.match(/[0-9]$/)) { flush(); out.push({ text: ord[0], cat: "pointer" }); i += ord[0].length; continue; }
    // Latin name + Japanese honorific (Latin given name + さん)
    if (buf && /^[A-Za-z][A-Za-z\-]*$/.test(buf.split(/\s/).pop() ?? "")) {
      const hon = s.slice(i).match(/^(さん|様|さま|氏|くん|ちゃん|先生)/);
      if (hon) { const nm = buf; buf = ""; out.push({ text: nm + hon[0], cat: "person" }); i += hon[0].length; continue; }
    }
    // r10: a Latin name + a Chinese title glued to it (<Latin surname>总 / <Latin surname>经理) is a person
    if (buf && /^[A-Z][a-z]+$/.test(buf) && !hasKana) {
      // only forms of address, not occupations (Python工程师 is a job, not a person)
      const zt = s.slice(i).match(/^(?:总监|總監|总|總|经理|經理|老师|老師|先生|女士|小姐|老板|老闆|主任|部长|部長|课长|課長|哥|姐|董)/u);
      const zAfter = zt ? s.slice(i + zt[0].length) : "";
      if (zt && !(zt[0] === "总" && /^[结額额数數计計部体體量共]/.test(zAfter)) && (!zAfter || /^[\s，、。,.!?的那这這]/.test(zAfter) || CJK_POINTER_MULTI.some((p) => fold(zAfter).startsWith(p)))) {
        out.push({ text: buf + zt[0], cat: "person" }); buf = ""; i += zt[0].length; continue;
      }
    }
    // a known katakana word + honorific is a role, not a name (アシスタントさん): keep the word, drop the honorific
    const kw = s.slice(i).match(/^([ァ-ヺー]{3,})(さん|様|さま)/);
    if (kw && !buf && SURFACE_INDEX.has(fold(kw[1]))) { out.push({ text: kw[1] }); out.push({ text: kw[2], cat: "stop" }); i += kw[0].length; continue; }
    // a bare job title followed by a person particle (部長に出した / 課長から) is a person (a role), at a word start
    if (!buf && hasKana) {
      const bt = s.slice(i).match(new RegExp(`^(?:${JA_TITLE_RE})(?=に|から|へ|と(?!う)|宛)`));
      if (bt && [...bt[0]].length >= 2 && !/^(?:さま|サマ|くん|ちゃん|担当)$/.test(bt[0])) { out.push({ text: bt[0], cat: "person" }); i += bt[0].length; continue; }
    }
    // person mentions (only at a word start)
    const pl = personMatch(s, i) || midRunPerson(s, i, buf);
    if (pl && (!buf || !isHan(buf[buf.length - 1]) || /^(他|她|彼)/.test(s.slice(i)) || midRunPerson(s, i, buf))) {
      flush(); out.push({ text: s.slice(i, i + pl), cat: "person" }); i += pl;
      // 宛 / 宛て / あて after a person: "addressed to", a function word
      const ate = s.slice(i).match(/^(宛て|宛|あて)/);
      if (ate) { out.push({ text: ate[0], cat: "stop" }); i += ate[0].length; }
      // a pronoun + a group word (她们组 / 他那边公司): the person's side, not content
      const grp = s.slice(i).match(/^(?:那边|那邊|这边|這邊)?(?:组|組|部门|部門|团队|團隊|小组|小組|公司|家|那边|那邊)(?=[\p{Script=Han}ぁ-ゖァ-ヿA-Za-z0-9]|的|$)/u);
      if (grp && /^(?:他|她|它|ta|人家|对方|對方)/.test(out[out.length - 1].text)) { out.push({ text: grp[0], cat: "stop" }); i += grp[0].length; }
      const ins = s.slice(i).match(ZH_INSTRUCT_RE);
      if (ins && !hasKana) { out.push({ text: ins[0], cat: "stop" }); i += ins[0].length; }
      continue;
    }
    if (buf && /^[A-Z][a-z]+$/.test(buf) && /^(?:说|說|讲|講|提到|提过|提過|问|問|发来|發來|回复|回覆)/.test(s.slice(i))) { out.push({ text: buf, cat: "person" }); buf = ""; }
    const nar = s.slice(i).match(NARRATIVE_RE);
    // narration may follow the content when it opens with the speaker (<content>我记下来的)
    if (nar && (!buf || /^[跟和给对同]/.test(nar[0]) || /^(?:我|我们|咱们|你|您)/.test(nar[0]))) { flush(); out.push({ text: nar[0], cat: "stop" }); i += nar[0].length; continue; }
    if (!buf) {
      const rest = s.slice(i);
      const dx = rest.match(JA_DEIXIS_RE);
      if (dx && !(isKata(s[i - 1] ?? ""))) { out.push({ text: dx[0], cat: "pointer" }); i += dx[0].length; continue; }
      if (!hasKana) {
        const cg = rest.match(ZH_COGNITION_RE);
        if (cg) { out.push({ text: cg[0], cat: "stop" }); i += cg[0].length; continue; }
        const sf = rest.match(ZH_SELF_RE);
        if (sf && !NARRATIVE_RE.test(rest) && rest.length > sf[0].length && !/^[方司院校国國]/.test(rest.slice(sf[0].length))) { out.push({ text: sf[0], cat: "stop" }); i += sf[0].length; continue; }
        const rp = rest.match(ZH_REL_PREP_RE);
        if (rp && rest.length > rp[0].length && !/^就(?:业|業|医|醫|诊|診|职|職|餐|读|讀|近|绪|緒|位|任|寝|座|地|算|此)/.test(rest)) { out.push({ text: rp[0], cat: "stop" }); i += rp[0].length; continue; }
        const nm = rest.match(ZH_NUM_MEASURE_RE);
        if (nm) { out.push({ text: nm[0], cat: "pointer" }); i += nm[0].length; continue; }
      }
      if (!hasKana) {
        // r10: "noted in <place>" (记在<place>上的 / 写在<place>里的): where the record is kept, i.e. the kind, never content
        const kept = rest.match(/^(?:记|記|写|寫|存|抄)在[\p{Script=Han}]{1,5}?(?:上|里|裡|中)(?:面|头|頭)?(?:的)/u);
        if (kept) { out.push({ text: kept[0], cat: "kind" }); i += kept[0].length; continue; }
        // r10: a one-character given name + 哥 / 姐 (<one character>哥 / <one character>姐) before a pointer / 的 / the end: a colloquial way to call a person
        const gx = rest.match(/^[\p{Script=Han}](?:哥|姐)(?=$|[\s，、。,.!?的]|[那这這])/u);
        if (gx && !/^[大小帅帥空表堂八老]/.test(rest)) { out.push({ text: gx[0], cat: "person" }); i += gx[0].length; continue; }
      }
      const fill = rest.match(FILLER_RE);
      if (fill) { out.push({ text: fill[0], cat: "stop" }); i += fill[0].length; continue; }
      const vt = rest.match(VAGUE_TIME_RE);
      if (vt) { out.push({ text: vt[0], cat: "time" }); i += vt[0].length; continue; }
      const stt = rest.match(STATUS_RE);
      if (stt) { out.push({ text: stt[0], cat: "stop" }); i += stt[0].length; continue; }
      const called = rest.match(CALLED_RE);
      if (called) { out.push({ text: called[0], cat: "stop" }); i += called[0].length; continue; }
    }
    if (buf && hasKana) {
      const rs = s.slice(i).match(JA_REL_SUFFIX_RE);
      if (rs) { flush(); out.push({ text: rs[0], cat: "stop" }); i += rs[0].length; continue; }
    }
    const st = startsAny(CJK_STOP_MULTI, i);
    if (st) { flush(); out.push({ text: st, cat: "stop" }); i += st.length; continue; }
    const pt = startsAny(CJK_POINTER_MULTI, i);
    if (pt && pt.length >= 2) { flush(); out.push({ text: pt, cat: "pointer" }); i += pt.length; continue; }
    const kd = startsAny(CJK_KIND_MULTI, i);
    if (kd && (kd.length >= 2 || !buf)) {
      // a kind word glued to the END of content (测试报告待办) or standing alone; not at the start of a longer word (任务分配表)
      const after = s.slice(i + kd.length);
      const inside = after.match(/^(?:里面|裡面|里头|裡頭|里|裡|当中|當中|之中|上)(?=$|[\s，、。,.!?的]|那|这|這|嗰|[记記写寫存录錄抄][的下着著过過])/);
      const jotted = after.match(/^(?:っ|し)(?:といた|ておいた|ておく|とく|てある|てた|とった|た)/);
      if (inside || jotted) { flush(); const len = kd.length + (inside ?? jotted)![0].length; out.push({ text: s.slice(i, i + len), cat: "kind" }); i += len; continue; }
      const endsHere = !after || /^[\s，、。,.!?の的了吧を、]/.test(after) || SYMBOL_RE.test(after) || startsAny(CJK_POINTER_MULTI, i + kd.length) || startsAny(CJK_STOP_MULTI, i + kd.length) || /^[a-zA-Z0-9]/.test(after) || startsAny(CJK_KIND_MULTI, i + kd.length) || /^事项|^事項/.test(after) || startsAny(CJK_VERB_MULTI, i + kd.length) || (hasKana ? jaTailClause(after) : zhTailClause(after));
      if (endsHere) {
        flush();
        let len = kd.length;
        const tail = s.slice(i + len).match(/^(事项|事項)/);
        if (tail) len += tail[0].length;
        out.push({ text: s.slice(i, i + len), cat: "kind" }); i += len; continue;
      }
    }
    const vb = startsAny(CJK_VERB_MULTI, i);
    if (vb) {
      const after = s.slice(i + vb.length);
      const before = buf;
      // a verb is a request word only when it stands apart (start / after a particle) and is not the head of a compound (削除キー)
      if ((!after || /^[\s，、。,.!?吧了的をにでて]/.test(after) || !!startsAny(CJK_VERB_MULTI, i + vb.length)) && (!before || /[をにでへ、 ]$/.test(before) || isHira(before[before.length - 1]))) {
        flush(); out.push({ text: vb, cat: "verb" }); i += vb.length; continue;
      }
    }
    // single-char pointers / particles
    if (c === "的" || c === "之" || c === "嘅") { flush(); out.push({ text: c, cat: "stop" }); i++; continue; }
    if (JA_PARTICLES.has(c)) {
      const prev = buf[buf.length - 1] ?? s[i - 1] ?? "";
      // okurigana is not a particle (見積もり / 見積り)
      const okuri = /^[もや]$/.test(c) && s[i + 1] === "り" && isHan(prev);
      // も / と / や opening an inflected hiragana verb (もらった / とった / やった) start a word, not a particle
      const hiraRun = s.slice(i).match(/^[ぁ-ゖ]+/)?.[0] ?? "";
      const verbStart = /^[もとや]$/.test(c) && [...hiraRun].length >= 3 && /(?:った|んだ|いた|えた|って|んで|いて|える|らう|ない)$/.test(hiraRun);
      if (verbStart && !buf) { buf += c; i++; continue; }
      // after a hiragana-ending word (打ち合わせ) の is still a particle when a kind word / pointer / the end follows
      const nextIsFunction = c === "の" && (i + 1 >= s.length || !!startsAny(CJK_KIND_MULTI, i + 1) || !!startsAny(CJK_POINTER_MULTI, i + 1) || /^[\s、，。]/.test(s.slice(i + 1)));
      if (!okuri && (c === "を" || !buf || !isHira(prev) || nextIsFunction)) { flush(); out.push({ text: c, cat: "stop" }); i++; continue; }
    }
    if (/[给跟和与把被让向对从在]/.test(c) && !buf && !hasKana && !PREP_WORDS.test(s.slice(i))) { out.push({ text: c, cat: "stop" }); i++; continue; }
    if (c === "件" && buf && (i + 1 >= s.length || /[\s，、。,.!?]/.test(s[i + 1]))) { flush(); out.push({ text: c, cat: "pointer" }); i++; continue; }
    if (/[那这這哪某嗰]/.test(c) && !hasKana) {
      const dm = s.slice(i).match(ZH_DEM_RE)!;
      if (!buf || dm[0].length >= 2) { flush(); out.push({ text: dm[0], cat: "pointer" }); i += dm[0].length; continue; }
    }
    // script boundary between Latin/digits and CJK
    if (buf) {
      const p = buf[buf.length - 1];
      const latinP = isLatin(p) || /[0-9.]/.test(p), latinC = isLatin(c) || /[0-9]/.test(c);
      const cjkP = isHan(p) || isHira(p) || isKata(p), cjkC = isHan(c) || isHira(c) || isKata(c);
      // a number keeps its counter (3部 / 20份 / ２０枚): it is one content word
      const counter = (/[0-9]/.test(p) && COUNTER_CHARS.test(c)) || (p === "第" && /[0-9]/.test(c));
      if (((latinP && cjkC) || (cjkP && latinC)) && !counter) flush();
    }
    buf += c; i++;
  }
  flush();
  return out;
}

/** A long CJK compound that is exactly a sequence of known vocabulary words (新商品 + 价格: known words on both sides) is split there. */
function segmentKnown(w: string): string[] {
  const cs = [...w];
  if (cs.length < 5 || !cs.every((c) => isHan(c) || isKata(c) || c === "ー")) return [w];
  const best: (string[] | undefined)[] = Array(cs.length + 1).fill(undefined);
  best[0] = [];
  for (let i = 0; i < cs.length; i++) {
    if (!best[i]) continue;
    for (let j = i + 2; j <= cs.length; j++) {
      const part = cs.slice(i, j).join("");
      if (!SURFACE_INDEX.has(fold(part))) continue;
      const cand = [...best[i]!, part];
      if (!best[j] || cand.length < best[j]!.length) best[j] = cand;
    }
  }
  const r = best[cs.length];
  return r && r.length >= 2 ? r : [w];
}

/** Further split a content piece: Japanese verb glued to a noun (予算表送る), 给X发Y. */
function refine(w: string, prevStop: string | undefined): string[] {
  const seg = segmentKnown(w);
  if (seg.length > 1) return seg;
  // "<organisation>管 / 负责<function>的那位": the marker joins an organisation and a known role word
  const role = w.match(/^([\p{Script=Han}ァ-ヿA-Za-z]{2,})(?:负责|負責|分管|主管|管)([\p{Script=Han}]{2,})$/u);
  if (role && (SURFACE_INDEX.has(fold(role[2])) || ROLE_WORDS.has(fold(role[2])))) return [role[1], role[2]];
  const lead = w.match(/^(?:负责|負責|分管)([\p{Script=Han}]{2,})$/u);
  if (lead && (SURFACE_INDEX.has(fold(lead[1])) || ROLE_WORDS.has(fold(lead[1])))) return [lead[1]];
  // a plain past verb modifying a noun (お送りした資料): narration about the record, not its content
  const past = w.match(JA_PAST_REL_RE);
  if (past && [...past[2]].length >= 2) return ["\u0000" + past[1], past[2]];
  // a Japanese verb in dictionary form modifying a noun (送る見積書 → 送る + 見積書)
  const vn = w.match(/^([\p{Script=Han}]{1,2}(?:する|した|る|う|く|す|つ|ぶ|む|ぐ|ぬ))([\p{Script=Han}ァ-ヿ].*)$/u);
  if (vn && [...vn[2]].length >= 2) return [vn[1], vn[2]];
  // a two-kanji suru verb after a noun (3部用意する → 3部 + 用意する)
  const sv = w.match(/^(.+?)([\p{Script=Han}]{2}(?:する|した|して))$/u);
  if (sv && [...sv[1]].length >= 2) return [sv[1], sv[2]];
  const m = w.match(JA_VERB_END);
  if (m && [...m[1]].length >= 2) return [m[1], m[2]];
  if (prevStop && /^[给跟向找问]$/.test(prevStop)) {
    const g = w.match(/^(.{2,4}?)(发送|发|寄|送|打|要|问|催)(.+)$/u);
    if (g) return [g[1], g[2] + g[3]];
  }
  // leading request words stuck to content (还没交的 → 交 is content; 提醒 stays)
  return [w];
}

export function cleanPieces(clue: string): Piece[] {
  const pieces: Piece[] = [];
  let afterTime = false;
  for (const p0 of splitOuter(dropNegated(clue))) {
    let p = p0;
    if (afterTime && !p.cat && !p.quoted) {
      const tail = p.text.match(/^(?:之前|以前|之后|之後|以后|以後|前に|までに|まで|前|后|後(?!ろ)|内|以内|之内)/);
      if (tail) { pieces.push({ text: tail[0], cat: "stop" }); p = { text: p.text.slice(tail[0].length) }; }
    }
    afterTime = p.cat === "time";
    if (!p.text) continue;
    if (p.cat || p.quoted) { pieces.push(p); continue; }
    // English-ish words separated by spaces are classified word by word; CJK runs are scanned
    for (const tok of p.text.split(/(\s+)/)) {
      if (!tok || /^\s+$/.test(tok)) continue;
      if (/^[a-zA-Z0-9À-ɏ'’.\-:]+$/.test(tok)) {
        let t = tok.replace(/['’]s$/i, "").replace(/^['’"]|['’"]$/g, "").replace(/[.,!?;:]+$/, "");
        if (/^no\.\d+/i.test(t) || /^\d+:\d+$/.test(t)) { pieces.push({ text: t }); continue; }
        const cat = classifyWord(t);
        if (!t) continue;
        // r10: ordinals counted from the end (second-to-last / next-to-last / penultimate) are pointers
        if (/^(?:(?:second|third|2nd|3rd|next)-?(?:to|from)-?(?:the-?)?(?:last|end|bottom)|penultimate)$/i.test(t)) { pieces.push({ text: t, cat: "pointer" }); continue; }
        if (/^(recently|lately)$/i.test(t)) { pieces.push({ text: t, cat: "time" }); continue; }
        if (/^(called|named|titled|finished|unfinished)$/i.test(t)) { pieces.push({ text: t, cat: "stop" }); continue; }
        if (/^(mr|mrs|ms|dr)\.?$/i.test(t)) { pieces.push({ text: t, cat: "person" }); continue; }
        // r10: a forgotten name (what's-his-name / so-and-so) is a person, not content
        if (/^(?:what['’]?s[-]?(?:his|her|their)[-]?names?|whatshisname|whatshername|so-and-so)$/i.test(t)) { pieces.push({ text: t, cat: "person" }); continue; }
        pieces.push({ text: t, cat });
      } else pieces.push(...scanRun(tok));
    }
  }
  // a capitalised Latin word followed by a CJK speech verb (<Name> 说… / <Name> 提到的) is a person; the verb is narration
  for (let i = 0; i < pieces.length - 1; i++) {
    const nx = pieces[i + 1];
    if (!pieces[i].cat && /^[A-Z][a-z]+$/.test(pieces[i].text) && !nx.cat && /^(?:说|說|讲|講|提到|提过|提過|问|問)/.test(nx.text)) {
      pieces[i] = { ...pieces[i], cat: "person" };
      const v = nx.text.match(/^(?:说的|說的|讲的|講的|提到的|提过的|提過的|说|說|讲|講|提到|提过|提過|问|問)/)![0];
      const restTxt = nx.text.slice(v.length);
      pieces.splice(i + 1, 1, { text: v, cat: "stop" }, ...(restTxt ? [{ text: restTxt }] : []));
    }
  }
  // English honorific + name (Mr. Lin) → person
  for (let i = 0; i < pieces.length - 1; i++) {
    if (pieces[i].cat === "person" && /^(mr|mrs|ms|dr)\.?$/i.test(pieces[i].text) && !pieces[i + 1].cat) {
      pieces[i] = { text: `${pieces[i].text} ${pieces[i + 1].text}`, cat: "person" };
      pieces.splice(i + 1, 1);
    }
  }
  // r07 English structure: relational wrappers (concerning / related to), the speaker's narration after a subject pronoun
  // (the memo I wrote / the task I need to …), record-book words before a kind word (diary item), and an ordinal
  // that modifies a content noun with no kind word after it (the third version) is content, not a pointer.
  const pv0 = (i: number): Piece | undefined => pieces[i - 1];
  const isLatinWord = (p: Piece) => /^[A-Za-z][A-Za-z\-]*:?$/.test(p.text);
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.quoted || !isLatinWord(p)) continue;
    const lw = p.text.toLowerCase();
    if (EN_REL.has(lw) && (!p.cat || p.cat === "stop")) { p.cat = "stop"; continue; }
    if (EN_DISCOURSE.has(lw) && !p.cat) { p.cat = "stop"; continue; }
    // r08: a question / request clause after the content (…, is it still there): every Latin word from its opener on is not content
    if (EN_CLAUSE_OPEN.has(lw) && pieces.slice(0, i).some((q) => !q.cat && !q.quoted && isLatinWord(q)) && pieces[i - 1] && /^(?:kind|pointer)$/.test(pieces[i - 1].cat ?? classifyWord(pieces[i - 1].text) ?? "")) {
      for (let j = i; j < pieces.length && !pieces[j].quoted && isLatinWord(pieces[j]); j++) if (pieces[j].cat !== "person") { pieces[j].cat = "stop"; pieces[j].content = false; }
      break;
    }
    // "like" as a hedge before a pointer (like the … one)
    if (lw === "like" && !p.cat && pieces[i + 1] && pieces[i + 1].cat === "pointer") { p.cat = "stop"; continue; }
    if (EN_VAGUE.has(lw) && !p.cat && (!pieces[i - 1] || pieces[i - 1].cat === "pointer") && (!pieces[i + 1] || pieces[i + 1].cat === "stop")) { p.cat = "pointer"; continue; }
    const nx = pieces[i + 1];
    if (EN_BOOK.has(lw) && nx && nx.cat === "kind" && !nx.quoted) { p.cat = "kind"; continue; }
    // r10: "action item(s)" is one kind word; "the whole / entire X" — the determiner adds no content
    if (lw === "action" && !p.cat && nx && /^items?$/i.test(nx.text)) { p.cat = "kind"; nx.cat = "kind"; continue; }
    if ((p.text === "whole" || p.text === "entire") && !p.cat && pv0(i) && pv0(i)!.cat === "pointer" && nx && !nx.cat) { p.cat = "stop"; continue; }
    if (EN_SUBJECT.has(lw) && nx && !nx.quoted && isLatinWord(nx) && (!nx.cat || nx.cat === "verb" || nx.cat === "stop")) {
      // the verb of the narration and its auxiliaries (need to / have to / want to)
      if (p.cat !== "person") p.cat = "stop";
      let j = i + 1;
      while (j < pieces.length && isLatinWord(pieces[j]) && !pieces[j].quoted && (!pieces[j].cat || pieces[j].cat === "verb" || pieces[j].cat === "stop")) {
        const w2 = pieces[j].text.toLowerCase();
        pieces[j].cat = "stop";
        j++;
        if (!/^(need|needs|needed|have|has|had|want|wanted|got|gotta|must|should|will|would|am|was|is|to)$/.test(w2)) break;
        if (w2 === "to") break;
      }
      i = j - 1;
      continue;
    }
    const pv = pieces[i - 1];
    if (EN_VERB_NOUNS.has(lw) && p.cat === "verb" && pv && !pv.cat && isLatinWord(pv) && (!nx || nx.cat === "kind" || nx.cat === "pointer")) { p.cat = undefined; p.content = true; continue; }
    // a request verb inside a noun phrase (content word on both sides: the trade show poster) is a noun
    if (EN_VERB_NOUNS.has(lw) && p.cat === "verb" && pv && !pv.cat && !pv.quoted && isLatinWord(pv) && nx && !nx.cat && !nx.quoted && isLatinWord(nx)) { p.cat = undefined; p.content = true; continue; }
    if (EN_COUNTS.has(lw) && !p.cat && ((pv && pv.cat === "pointer") || (nx && nx.cat === "kind"))) { p.cat = "pointer"; continue; }
    if (EN_ORDINALS.has(lw) && p.cat === "pointer" && nx && !nx.cat && !nx.quoted && isLatinWord(nx) && !pieces.slice(i + 1).some((q) => q.cat === "kind")) { p.cat = undefined; p.content = true; }
  }
  // classify the remaining CJK pieces that are whole kind / pointer / verb / stop words
  for (const p of pieces) {
    if (p.cat || p.quoted || p.content) continue;
    const c = classifyWord(p.text);
    if (c) p.cat = c;
    else if (SOFT_KIND_SET.has(fold(p.text))) p.cat = undefined; // ambiguous: keep as content
  }
  // a Chinese soft kind word closing the clue after a pointer / 的 (跟客户吃饭的那个安排, 关于招聘的那个记录) names the record
  // kind when other content comes before it
  const lastIdx = pieces.map((p, i) => (p.cat === "stop" && /^[的之]$/.test(p.text)) || p.cat === "pointer" || !p.cat ? i : -1).filter((i) => i >= 0).pop();
  if (lastIdx !== undefined) {
    const last = pieces[lastIdx];
    const prev = pieces[lastIdx - 1];
    if (!last.cat && !last.quoted && /^[\p{Script=Han}]+$/u.test(last.text) && SOFT_KIND_SET.has(fold(last.text)) && prev && (prev.cat === "pointer" || (prev.cat === "stop" && /^[的之]$/.test(prev.text))) &&
      pieces.slice(0, lastIdx - 1).some((p) => !p.cat && p.text.trim())) last.cat = "kind";
  }
  return pieces;
}

export function cleanClue(input: CleanInput): CleanResult {
  const pieces = cleanPieces(input.clue);
  const removed: CleanResult["removed"] = { pointer: [], kind: [], verb: [], person: [], time: [] };
  const content: string[] = [];
  let prevStop: string | undefined;
  const softDropped: string[] = [];
  // r09: is there content after piece i (a later word that is not a stop / kind / pointer / person / time piece)?
  const contentAfter = (i: number) => pieces.slice(i + 1).some((q) => q.content || q.quoted || (!q.cat && /[\p{L}\p{N}]/u.test(q.text)));
  for (let pi = 0; pi < pieces.length; pi++) {
    const p = pieces[pi];
    if (p.cat && p.cat !== "stop") { removed[p.cat].push(p.text); prevStop = undefined; continue; }
    if (p.cat === "stop") { prevStop = p.text; continue; }
    if (p.content) { content.push(p.text); prevStop = undefined; continue; }
    const words = refine(p.text, prevStop);
    const later = contentAfter(pi);
    // r09: a hiragana word followed by a case / linking particle (ゆうなへの / ひかるの) is used as a noun (often a name), never a predicate
    const nextLinks = /^(?:への|との|からの|の|へ|に|と|が|から|より|宛)/u.test(pieces[pi + 1]?.text ?? "");
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      const last = wi === words.length - 1;
      // r10: whole-piece courtesy formulas, forgotten-name questions and concessive clauses are never content
      if (!p.quoted && (POLITE_PIECE_RE.test(w.trim()) || FORGOT_PIECE_RE.test(w.trim()) || JA_CONCESSIVE_RE.test(w.trim()))) continue;
      const t = p.quoted ? w.trim() : trimShape(w.trim(), last && !later);
      if (!t || t.startsWith("\u0000")) continue; // marked narration
      const c = classifyWord(t);
      if (c && c !== "stop") { removed[c].push(t); continue; }
      if (c === "stop") continue;
      if (/^[ぁ-ゖ]{1,2}$/.test(t)) continue; // stray kana (て / た / やる)
      if (isHiraPred(t) && !(last && nextLinks)) { softDropped.push(t); continue; }
      content.push(t);
    }
    prevStop = undefined;
  }
  if (!content.length) content.push(...softDropped);
  // a casual te / chau verb form closing a sloppy clue is the request, not content (消しちゃって / 片付けといて)
  if (content.length >= 2 && JA_TE_VERB.test(content[content.length - 1])) removed.verb.push(content.pop()!);
  return { contentWords: content, removed };
}
