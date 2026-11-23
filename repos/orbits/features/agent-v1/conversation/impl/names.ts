// @ts-nocheck -- conversation/impl/names.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/rsi/archive/r10/impl/names.ts
// (lab commit 41c7a53d6, r10 = r09 + when to ask: confirmations, missing values, requests that ask for nothing). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * Name sounds across scripts (general rules and tables only, nothing of this world):
 *   - soundKey(): a rough key of how a Latin-letter name is pronounced (consonant classes, whether it starts with a
 *     vowel, the class of its first vowel), comparable with the key of a kana rendering (through its romaji) and of a
 *     Chinese phonetic transliteration (through the pinyin of its characters) of the same name;
 *   - TRANSLIT: the characters Chinese uses to transliterate foreign names (the standard phonetic set), with pinyin;
 *     a run made only of them, in name position, may be a foreign name written in Chinese;
 *   - tones: tone-marked pinyin (Lǐ Míng) carries tones that can tell apart names of the same toneless spelling.
 */
import { romaji } from "./concepts";
import { pinyinOf } from "./pinyin";
import { fold } from "./text";

export interface SoundKey { lead: boolean; cons: string; v1: string; v2: string }

const CLS: Record<string, string> = { k: "K", g: "K", q: "K", c: "K", s: "S", z: "S", j: "S", x: "S", t: "T", d: "T", n: "N", h: "H", f: "H", b: "B", v: "B", p: "B", m: "M", r: "R", l: "R" };

/** The sound key of a Latin spelling (English-like names, Hepburn romaji and pinyin all go through here). */
export function soundKey(w: string, opts: { wAsB?: boolean } = {}): SoundKey | null {
  let s = w.toLowerCase().replace(/[^a-z]/g, "");
  if (s.length < 2) return null;
  s = s.replace(/ck/g, "k").replace(/ch/g, "t").replace(/sh/g, "s").replace(/th/g, "s").replace(/ph/g, "f").replace(/qu/g, "k")
    .replace(/c(?=[eiy])/g, "s").replace(/([a-z])\1/g, "$1")
    // a non-rhotic r (after a vowel, before a consonant or at the end) is not heard in a Japanese or Chinese rendering
    .replace(/([aeiou])r(?![aeiou])/g, "$1").replace(/ng$/, "n");
  const vowel = (ch: string) => "aeiouy".includes(ch);
  // a leading w / y before a vowel is a vowel-like onset in a kana rendering (ウィ / イェ)
  const lead = "aeiou".includes(s[0]) || (s[0] === "y" && !vowel(s[1] ?? "")) || (/^[wy][aeiou]/.test(s));
  let cons = "";
  let v1 = "", v2 = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (vowel(ch) && !(ch === "y" && vowel(s[i + 1] ?? ""))) { const v = ch === "y" ? "i" : ch; if (!v1) v1 = v; else if (!v2 && v !== v1) v2 = v; continue; }
    if (ch === "w") { if (opts.wAsB) cons += "B"; continue; }
    if (ch === "y") continue;                                  // a glide (myu / ya)
    if (ch === "h" && i > 0 && !vowel(s[i - 1])) continue;     // part of a digraph
    const c = CLS[ch];
    if (c) cons += c;
  }
  return cons.length ? { lead, cons, v1, v2 } : null;
}

/** The first vowels a kana rendering may use for a Latin-spelled vowel (English spellings are loose). */
const VOWEL_RENDER: Record<string, string> = { a: "ae", e: "ei", i: "ia", o: "oa", u: "u", y: "ia" };

/**
 * Does a kana word (folded hiragana) sound like a Latin-spelled name? With an honorific after the word (weakly: two
 * consonants and the first vowel agree); without one only when the spelling is the same once the kana's added final
 * vowel is dropped (bobu → bob) — loanwords are katakana words too (プラン is not a Braun).
 */
export function kanaSoundsLike(kana: string, latin: string, honorific: boolean): boolean {
  const rk = romaji(kana);
  const k = soundKey(rk);
  const l = soundKey(latin);
  if (!k || !l || l.cons.length < 1) return false;
  if (k.cons !== l.cons || k.lead !== l.lead) return false;
  if (k.cons.length < 2 && !k.lead) return false;
  // the kana's first vowel may be one added to split a consonant cluster (グレース gu-re-): then its next vowel counts
  const okV = (v: string) => (VOWEL_RENDER[l.v1] ?? l.v1).includes(v);
  if (!(!l.v1 || !k.v1 || okV(k.v1) || (/[uoi]/.test(k.v1) && !!k.v2 && okV(k.v2)))) return false;
  // r06: a diphthong in the kana (a mai- / kei- rendering) needs one in the Latin spelling (i / y, a vowel then i / y, vowel-consonant-e), not a plain vowel
  if (/^(ai|ei)/.test(nucleus(rk)) && !latinDiphthong(latin)) return false;
  if (honorific) return true;
  const plain = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "").replace(/([a-z])\1/g, "$1");
  return plain(rk).replace(/([^aeiou])[uo]$/, "$1") === plain(latin);
}

/** The first vowel run of a romanised word (bao-luo → ao, mai-ku → ai). */
function nucleus(r: string): string { return /^[^aeiouv]*([aeiouv]+)/.exec(r.toLowerCase())?.[1] ?? ""; }
/** r06: does a Latin spelling have a diphthong at its first vowel (i / y, a vowel then i / y, or vowel-consonant-e)? */
function latinDiphthong(latin: string): boolean {
  const s = latin.toLowerCase().replace(/[^a-z]/g, "");
  return /^[^aeiouy]*(i|y|[aeiou][iy]|[aeiou][^aeiouy]e$|[aeiou][^aeiouy]e[^aeiouy])/.test(s);
}
/** r06: the pinyin first vowels Chinese transliteration uses for a Latin first vowel. */
const NUCLEUS_FOR: Record<string, RegExp> = { i: /^(i|ai|ei|ie)/, y: /^(i|ai|ei|ie)/, a: /^(a|e|ia|ua)/, o: /^(o|a|uo|ou)/, u: /^(u|o|a|e|iu)/, e: /^(e|i|ai|ei|ie|a)/ };

/** Characters of the standard Chinese phonetic transliteration of foreign names, with their pinyin. */
const TRANSLIT_SRC =
  "a:阿 ai:艾埃 an:安 ao:奥 ba:巴 bai:拜 ban:班 bang:邦 bao:鲍保 bei:贝 ben:本 bi:比彼 bin:宾 bo:波伯勃博 bu:布 " +
  "cha:查 da:达 dai:戴 dan:丹 de:德 deng:登 di:迪蒂 ding:丁 du:杜 dun:顿 duo:多 e:厄 en:恩 er:尔 " +
  "fa:法 fan:范 fei:菲费 fen:芬 fu:夫弗福富 gai:盖 gang:冈 ge:戈格 gu:古 ha:哈 han:汉 hao:豪 he:赫 heng:亨 hu:胡 " +
  "ji:基吉 jia:加贾 jie:杰 jin:金 ka:卡 kai:凯 kan:坎 ke:科克 ken:肯 ku:库 la:拉 lai:莱 lan:兰 lang:朗 lao:劳 le:勒 lei:雷蕾 " +
  "li:里利莉丽 lian:连 lin:林琳 long:隆 lu:卢鲁露 lun:伦 luo:罗洛 ma:马玛 mai:麦迈 man:曼 mei:梅 men:门 meng:蒙 mi:米 min:敏 " +
  "mo:莫默 mu:穆姆 na:纳娜 nai:奈 nan:南 nei:内 ni:尼妮 niu:纽 nu:努 nuo:诺 ou:欧 pa:帕 pan:潘 pei:佩 peng:彭 pi:皮 " +
  "pu:普 qi:齐奇琪 qiao:乔 qie:切 qiong:琼 sa:萨 sai:塞赛 sang:桑 sen:森 sha:沙莎 shi:施什史 si:斯丝 su:苏 suo:索 ta:塔 " +
  "tai:泰 tan:坦 tang:汤唐 te:特 teng:滕 ti:提蒂 tuo:托 wa:瓦 wan:万 wei:威维韦 wen:温文 wo:沃 wu:乌伍 xi:西希 xia:夏 " +
  "xie:谢 xin:辛 xiu:休 ya:亚雅娅 yang:扬 ye:耶叶 yi:伊依 yin:因 you:尤 yue:约 ze:泽 za:扎 zhan:詹 zi:兹 zuo:佐";
const TRANSLIT = new Map<string, string>();
for (const g of TRANSLIT_SRC.trim().split(/\s+/)) { const [syl, cs] = g.split(":"); for (const ch of cs) if (!TRANSLIT.has(ch)) TRANSLIT.set(ch, syl); }
export const isTranslitChar = (ch: string) => TRANSLIT.has(ch);

/** The pinyin of a run of transliteration characters run together (null when a character is not one). */
export function translitPinyin(run: string): string | null {
  const out: string[] = [];
  for (const ch of run) { const p = TRANSLIT.get(ch) ?? pinyinOf(ch)?.[0]; if (!p || !TRANSLIT.has(ch)) return null; out.push(p); }
  return out.join("");
}

/** Does a Chinese transliteration (its pinyin run together) sound like a Latin-spelled name? Consonants only. */
export function translitSoundsLike(py: string, latin: string): boolean {
  const l = soundKey(latin);
  if (!l || l.cons.length < 1) return false;
  for (const wAsB of [false, true]) {
    const k = soundKey(py, { wAsB });
    // r06: the first vowel must be one Chinese uses for that Latin vowel (a bao- rendering needs a Latin a / o / u, never an i)
    if (k && k.cons === l.cons && k.lead === l.lead && (k.cons.length >= 2 || k.lead) && (!l.v1 || (NUCLEUS_FOR[l.v1] ?? /./).test(nucleus(py)))) return true;
  }
  return false;
}

// ---------------------------------------------------------------- tone-marked pinyin

const TONE_MARKS: Record<string, [string, number]> = {};
for (const [base, marks] of [["a", "āáǎà"], ["e", "ēéěè"], ["i", "īíǐì"], ["o", "ōóǒò"], ["u", "ūúǔù"], ["ü", "ǖǘǚǜ"]] as [string, string][]) {
  [...marks].forEach((m, k) => { TONE_MARKS[m] = [base === "ü" ? "v" : base, k + 1]; });
}

/** The tone of each tone-marked syllable of a raw Latin word sequence (0 = unmarked), or null when nothing is marked. */
export function tonesOf(raw: string): number[] | null {
  const words = raw.normalize("NFC").split(/[\s\-·']+/).filter(Boolean);
  let any = false;
  const out: number[] = [];
  for (const w of words) {
    // a word may hold two syllables (Jìngyí): every tone mark is one syllable's tone, in order
    const marks = [...w].map((ch) => TONE_MARKS[ch]?.[1] ?? 0).filter((n) => n > 0);
    if (marks.length) { any = true; out.push(...marks); } else out.push(0);
  }
  return any ? out : null;
}

// ---------------------------------------------------------------- kanji spellings of kana given names

/** Readings (名乗り) of kanji often used in Japanese given names — a general table, for a kana name written in kanji. */
const NANORI_SRC =
  "由:ゆ,よし 香:か,かおり 里:り,さと 美:み 咲:さき,さ 子:こ 恵:え,けい 愛:あい,まな 優:ゆう,ゆ 裕:ゆう,ひろ 雪:ゆき 幸:さち,ゆき,こう " +
  "真:ま,しん 麻:ま,あさ 奈:な 菜:な 那:な 紀:き,のり 希:き,のぞみ 樹:き,じゅ,いつき 貴:たか,き 隆:たか,りゅう 孝:たか,こう 高:たか " +
  "太:た,ふと 大:だい,ひろ,た 翔:かける,と 健:けん,たけ 拓:たく,ひろ 也:や,なり 哉:や 一:いち,かず,はじめ 郎:ろう 朗:ろう,あき " +
  "浩:ひろ,こう 博:ひろ 弘:ひろ 誠:せい 学:まなぶ,がく 明:あき,あきら,めい 彩:あや,さ 綾:あや 絵:え 枝:え 江:え " +
  "衣:い,え 依:い,より 唯:ゆい,ゆ 結:ゆい,ゆ,ゆう 夢:ゆめ,む 弓:ゆみ 友:とも,ゆう 知:とも,ち 智:とも,ち,さとし 千:ち,せん 沙:さ 紗:さ " +
  "早:さ,さき 佐:さ 花:はな,か 華:か,はな 加:か 佳:か,よし 果:か 夏:なつ,か 秋:あき 春:はる 陽:はる,よう,ひ 晴:はる,せい 遥:はるか,はる " +
  "悠:ゆう,はる 翼:つばさ 実:み,みのる 未:み 海:み,うみ,かい 光:ひかり,みつ,こう 輝:ひかる,き,てる 乃:の 野:の 音:ね,おと 理:り,おさむ " +
  "莉:り 梨:り 璃:り 瑠:る 留:る 鈴:すず,りん 涼:りょう,すず 亮:りょう,あきら 良:りょう,よし 蓮:れん 怜:れい 玲:れい 礼:れい,あや 麗:れい " +
  "直:なお 尚:なお,ひさ 七:なな 菜:な 穂:ほ 帆:ほ 保:ほ,やす 歩:あゆみ,あゆ,ほ 鮎:あゆ 亜:あ 安:あ,やす 杏:あん,あんず 杜:もり 森:もり " +
  "雅:まさ,みやび 正:まさ,ただし 昌:まさ 勝:かつ,まさる 和:かず,わ 数:かず 康:やす,こう 泰:やす,たい 靖:やす,せい 信:のぶ,しん " +
  "伸:のぶ,しん 宏:ひろ 寛:ひろ,かん 洋:よう 葉:よう,は 蓉:よう 容:よう 恭:きょう,やす 京:きょう,みやこ 響:ひびき,きょう " +
  "颯:そう,はやて 蒼:そう,あおい 葵:あおい,き 碧:あおい,へき 凛:りん 琴:こと 詩:し,うた 歌:か,うた 桜:さくら,お 萌:もえ,め 芽:め " +
  "瞳:ひとみ 舞:まい,ま 麻:ま 茉:ま 万:ま,まん 円:まどか 心:こころ,しん,み 純:じゅん,すみ 澄:すみ 寿:ひさ,じゅ 久:ひさ,く 秀:ひで,しゅう " +
  "英:ひで,えい 栄:さかえ,えい 則:のり 典:のり 範:のり 法:のり 宣:のぶ 敏:とし 俊:とし,しゅん 利:とし,り 年:とし 達:たつ 竜:りゅう,たつ " +
  "龍:りゅう,たつ 辰:たつ 人:と,ひと 斗:と 登:と,のぼる 都:と,みやこ 豊:ゆたか,とよ 稔:みのる 守:まもる 勇:いさむ,ゆう 剛:ごう,たけし " +
  "武:たけし,たけ 猛:たけし 毅:つよし,き 強:つよし 清:きよし,きよ 潔:きよし 聖:せい,さとし 聡:さとし,そう 悟:さとる,ご 修:おさむ,しゅう " +
  "治:おさむ,じ 茂:しげる,しげ 繁:しげる 進:すすむ 晃:あきら,こう 章:あきら 彰:あきら 昭:あきら 輔:すけ 介:すけ 助:すけ " +
  "之:ゆき,の 行:ゆき 志:し,ゆき 司:つかさ,じ 恋:れん,こ 瑞:みず,ずい 水:みず 泉:いずみ 雫:しずく 静:しず 栞:しおり 織:おり 沙:さ";
const NANORI = new Map<string, string[]>();
for (const g of NANORI_SRC.trim().split(/\s+/)) { const [ch0, rs] = g.split(":"); const ch = ch0 && fold(ch0); if (ch && rs && !NANORI.has(ch)) NANORI.set(ch, rs.split(",")); }
export const hasNanori = (ch: string) => NANORI.has(ch);

/** Can a kanji run be read as this kana name (some combination of the readings of its characters)? */
export function kanjiReadsAs(run: string, kana: string): boolean {
  const cs = [...run];
  if (!cs.length || !cs.every((c) => NANORI.has(c))) return false;
  const go = (k: number, rest: string): boolean => {
    if (k === cs.length) return rest === "";
    for (const r of NANORI.get(cs[k])!) if (rest.startsWith(r) && go(k + 1, rest.slice(r.length))) return true;
    return false;
  };
  return go(0, kana);
}
