// @ts-nocheck -- finder/impl/person.ts: copied byte for byte from lab-rsi repos/orbits/lab/record-finder/rsi/archive/r10/impl/person.ts
// (lab commit 931bae340, r10 accepted). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * resolvePerson and the name forms of a contact (also used by the finders to recognise a person in a clue or in a
 * record's text). Order of evidence: pronoun → per-account alias table → saved aliases → full name / reading →
 * initials → surname + title (job title narrows, D4) → 小/老/阿 → given name → katakana sound of a Latin name →
 * one-character-off names (proposed only, why "near"). A company named next to the person filters first (D6).
 */
import type { Account, Contact, PersonCandidate, PersonInput, World } from "../types";
import { EN_NICKNAMES, EN_TITLES, JA_TITLES, TITLE_EQUIV, ZH_EN_NAMES, ZH_SURNAMES_2, ZH_TITLES } from "./lexicon";
import { fold, isHan, isKana, kanjiReadsAs, latinFold, loanKey, latinSoundKey, looseSoundKey, pinyinOf, romajiKey, soundKey, toRomaji, wadeGiles } from "./text";
import plan from "./plan.json";

export interface NameForms {
  full: string;               // folded, no spaces
  family?: string;            // folded
  given?: string;             // folded
  readFull: string[];         // romaji / kana / Latin readings, folded, no spaces (both orders)
  readFamily: string[];
  readGiven: string[];
  latinTokens: string[];      // folded Latin name tokens (given name, family name)
  initials: string[];         // WHR, ZW, TH …
  aliases: string[];          // folded
  aliasGiven: string[];       // given part of a Chinese-form alias
  aliasFamily: string[];      // surname of a Chinese-form alias (a Latin-named contact saved with a Chinese-form alias → its surname)
  japanese: boolean;          // name has a kana reading (Japanese-style name)
  altFull: string[];          // Wade-Giles spellings of a Chinese name (both orders), tried after pinyin
  altFamily: string[];
}

const cache = new WeakMap<Contact, NameForms>();
const nospace = (s: string) => s.replace(/[\s　·・.\-'’‘`]/g, "");

export function nameForms(c: Contact): NameForms {
  const hit = cache.get(c);
  if (hit) return hit;
  const raw = c.name.trim();
  const parts = raw.split(/[\s　]+/).filter(Boolean);
  const hanName = [...raw].some(isHan);
  const latinName = /^[A-Za-zÀ-ɏ'’.\- ]+$/.test(raw);
  let family: string | undefined, given: string | undefined;
  if (latinName) { family = parts.length > 1 ? parts[parts.length - 1] : undefined; given = parts[0]; }
  else if (parts.length >= 2) { family = parts[0]; given = parts.slice(1).join(""); }
  else if (hanName) {
    const two = ZH_SURNAMES_2.find((s) => raw.startsWith(s));
    family = two ?? raw.slice(0, 1);
    given = raw.slice(family.length) || undefined;
  }
  const readFull: string[] = [], readFamily: string[] = [], readGiven: string[] = [];
  const reading = c.reading?.trim();
  const isKanaReading = !!reading && [...reading.replace(/\s/g, "")].every((ch) => isKana(ch));
  if (reading) {
    const rp = reading.split(/[\s　]+/).filter(Boolean);
    const forms = isKanaReading ? [rp, rp.map(toRomaji)] : [rp.map((x) => latinFold(nospace(x)))];
    for (const f of forms) {
      readFull.push(fold(f.join("")), fold([...f].reverse().join("")));
      if (f.length >= 2) { readFamily.push(fold(f[0])); readGiven.push(fold(f.slice(1).join(""))); }
    }
  }
  // computed pinyin for Chinese names (D5: adds to the saved reading)
  const initials: string[] = [];
  const altFull: string[] = [], altFamily: string[] = [];
  if (hanName && !isKanaReading && family) {
    const pf = pinyinOf(family), pg = given ? pinyinOf(given) : [];
    // the surname reads even when a rare given-name character does not
    if (pf.every(Boolean)) readFamily.push(fold(pf.join("")));
    if (pf.every(Boolean) && pg.every(Boolean)) {
      const f = pf.join(""), g = pg.join("");
      readFull.push(fold(f + g), fold(g + f));
      if (g) readGiven.push(fold(g));
      initials.push((pf.map((x) => x![0]).join("") + pg.map((x) => x![0]).join("")).toLowerCase());
      const wf = pf.map((x) => wadeGiles(x!)).join(""), wg = pg.map((x) => wadeGiles(x!)).join("");
      altFull.push(wf + wg, wg + wf);
    }
    if (pf.every(Boolean)) altFamily.push(pf.map((x) => wadeGiles(x!)).join(""));
  }
  if (isKanaReading && reading) {
    const rp = reading.split(/[\s　]+/).filter(Boolean).map(toRomaji);
    initials.push(rp.map((x) => x[0]).join(""), [...rp].reverse().map((x) => x[0]).join(""));
  }
  if (latinName && parts.length >= 2) initials.push(parts.map((p) => latinFold(p)[0]).join(""));
  const latinTokens = latinName ? parts.map((p) => fold(nospace(p))) : [];
  const nf: NameForms = {
    full: fold(nospace(raw)),
    family: family ? fold(nospace(family)) : undefined,
    given: given ? fold(nospace(given)) : undefined,
    readFull: [...new Set(readFull.filter(Boolean))],
    readFamily: [...new Set(readFamily.filter(Boolean))],
    readGiven: [...new Set(readGiven.filter(Boolean))],
    latinTokens,
    initials: [...new Set(initials.filter((x) => x.length >= 2))],
    aliases: (c.aliases ?? []).map((a) => fold(nospace(a))),
    aliasGiven: (c.aliases ?? []).map((a) => nospace(a)).filter((a) => [...a].length >= 3 && [...a].every(isHan))
      .map((a) => { const two = ZH_SURNAMES_2.find((s) => a.startsWith(s)); return fold(a.slice((two ?? a[0]).length)); }),
    aliasFamily: (c.aliases ?? []).map((a) => nospace(a)).filter((a) => [...a].length >= 2 && [...a].length <= 4 && [...a].every(isHan))
      .map((a) => fold(ZH_SURNAMES_2.find((s) => a.startsWith(s)) ?? a[0])),
    japanese: isKanaReading,
    altFull: [...new Set(altFull)].filter((x) => !readFull.includes(x)),
    altFamily: [...new Set(altFamily)].filter((x) => !readFamily.includes(x)),
  };
  cache.set(c, nf);
  return nf;
}

/** Folded strings that, found in a text, refer to this contact (for record text and clue cleaning). */
export function mentionForms(c: Contact, world: World, strong = true): string[] {
  const nf = nameForms(c);
  const out = new Set<string>([nf.full, ...nf.aliases]);
  const sp = fold(c.name);
  out.add(sp);
  for (const a of world.aliases) if (a.contactId === c.id) out.add(fold(nospace(a.said)));
  if (nf.latinTokens.length) for (const t of nf.latinTokens) if (t.length >= 3) out.add(t);
  if (nf.family && !nf.latinTokens.length) {
    for (const t of [...JA_TITLES, ...ZH_TITLES.filter((x) => x.length >= 1)]) if (t.length >= 1 && !/^(工|姐|哥)$/.test(t)) out.add(nf.family + fold(t));
  }
  if (!strong) {
    if (nf.given && nf.given.length >= 2) out.add(nf.given);
    for (const r of nf.readFull) if (r.length >= 4) out.add(r);
    if (nf.family && nf.family.length >= 2 && nf.japanese) out.add(nf.family);
  }
  return [...out].filter((x) => x.length >= 2);
}

// ---------------------------------------------------------------- resolvePerson
const PRONOUN_RE = /^(他们|她们|他|她|ta|人家|对方|對方|该客户|該客戶|此客户|这位客户|這位客戶|那位客户|那位客戶|该联系人|那位先生|那位女士|向こうさん|向こう様|先方さん|先方様|あちらさん|あちら様|那位|这位|這位|那人|那个人|那個人|这个人|这人|這人|此人|该人|該人|彼女ら|彼ら|彼女|彼|あの方|この方|その方|あの人|この人|その人|あちら|先方|あいつ|こいつ|そいつ|あの子|この子|その子|あの子ら|あの人たち|あの方たち|him|her|he|she|his|hers|them|they|that person|guy|dude|fellow|chap|lady|gentleman|man|woman|(?:这|那|這)?(?:位)?(?:哥们儿|哥们|哥們|哥儿们|兄弟|老兄|老哥|家伙|小子|姐们|姐们儿|大哥|大姐))$/i;
const GENERIC_PERSON = /(那边的人|那边那位|那边|那位|那个人|的人|这位|那个|の人|の方|の担当者|の担当|担当者|担当さん|担当|の方々)$/u;
const BARE_GENERIC = /^(人|人们|人們|的人|方|担当|担当者|担当さん|人たち|那位|这位|那个人|guy|person|people|folks|team)?$/iu;
const EN_GENERIC = /\b(guy|guys|person|people|folks|team|contact|rep|one)\b/gi;

function titleNarrow(cands: Contact[], title: string): Contact[] {
  const t = fold(title);
  const cls = TITLE_EQUIV.find((g) => g.some((x) => fold(x) === t)) ?? [title];
  const words = cls.map((x) => fold(x));
  const hit = cands.filter((c) => { const jt = fold(c.title ?? ""); return words.some((w) => w.length >= 2 || [...w].some(isHan) ? jt.includes(w) : jt === w); });
  return hit;
}

const ZH_TITLE_LIST = [...ZH_TITLES].sort((a, b) => b.length - a.length);
const JA_TITLE_LIST = [...JA_TITLES].sort((a, b) => b.length - a.length);
/** Job-title words written in Han / kana (弁護士, 工場長, 取締役 …) that may follow a surname. */
const JOB_TITLE_LIST = [...new Set(TITLE_EQUIV.flat().filter((t) => [...t].length >= 2 && [...t].every((c) => isHan(c) || isKana(c) || c === "ー")))].sort((a, b) => b.length - a.length);
/** Short address words only read after a surname inside a person mention (王董 = chairman 王; 张叔). */
const PERSON_ONLY_TITLES = ["董", "叔", "伯", "婶", "嫂", "助理", "顾问", "顧問", "主席", "记者", "編集", "编辑", "秘書", "監督", "リーダー", "桑", "sir", "君"];
/** Address words that say nothing about the job (they never narrow by job title); 桑 is the Chinese net spelling of さん. */
const PURE_HONORIFIC = new Set(["さん", "様", "さま", "サマ", "君", "くん", "ちゃん", "氏", "殿", "先生", "老师", "女士", "小姐", "姐", "哥", "工", "董", "叔", "伯", "婶", "嫂", "大哥", "大姐", "阿姨", "师傅", "師傅", "先輩", "桑", "sir"].map(fold));

/** Split "X + title" → [X, title] (title may be empty). */
function splitTitle(m: string): [string, string] {
  const en = m.match(/^(mr|mrs|ms|miss|dr|prof)(?:\.\s*|\s+)(.+)$/i);
  if (en) return [en[2].trim(), en[1]];
  const san = m.match(/^(.+?)[-\s]?(san|sama|sensei)$/i);
  if (san && /[a-z]/i.test(san[1])) return [san[1], san[2]];
  const fm = [...m].map((c) => fold(c)).join("");
  for (const t of [...JOB_TITLE_LIST, ...JA_TITLE_LIST, ...ZH_TITLE_LIST, ...PERSON_ONLY_TITLES].sort((a, b) => b.length - a.length)) {
    const ft = fold(t);
    if (fm.length > ft.length && fm.endsWith(ft)) {
      // a Latin title word only splits off a non-Latin base (王sir), never the end of a Latin name
      if (/^[a-z]+$/.test(ft) && /[a-z]$/.test(fm.slice(0, fm.length - ft.length))) continue;
      // X大律师 / X大老板: an intensifying 大 between surname and title is not part of the name
      let base = m.slice(0, m.length - t.length);
      if (/.大$/u.test(base) && [...base].length <= 3) base = base.slice(0, -1);
      return [base, t];
    }
  }
  return [m, ""];
}

/** Contacts whose job title is the said role (through the title equivalence classes, or literally contained). */
function roleMatch(scope: Contact[], role: string): Contact[] {
  const r = role.trim();
  if (!r) return [];
  const viaClass = titleNarrow(scope, r);
  if (viaClass.length) return viaClass;
  const rf = fold(r.replace(/\s+/g, ""));
  if (rf.length < 2) return [];
  return scope.filter((c) => fold((c.title ?? "").replace(/\s+/g, "")).includes(rf));
}

function accountContacts(world: World, account: Account): Contact[] {
  return world.contacts.filter((c) => c.account === account && !c.deletedAt);
}

const NICK = new Map<string, Set<string>>();
for (const g of EN_NICKNAMES) for (const w of g) { const s = NICK.get(w) ?? new Set<string>(); for (const x of g) s.add(x); NICK.set(w, s); }
/** Every spelling / nickname that names the same English given name (a name in two groups joins both). */
function nickSet(w: string): Set<string> { return NICK.get(w) ?? new Set([w]); }
const ZH_EN = new Map(ZH_EN_NAMES.map(([zh, en]) => [fold(zh), en] as const));

/** Characters Chinese uses to spell foreign names by sound (general phonetic vocabulary, not anybody's name). */
const TRANSLIT = new Set([..."阿埃艾爱安昂奥澳巴拜班邦保鲍贝本比彼毕宾波伯博布查达戴丹道德登迪蒂丁东杜多厄恩尔法范菲斐费芬丰弗福伏盖甘冈戈格贡古哈海汉豪赫亨洪胡华怀霍基吉加嘉贾杰金卡凯坎康柯科克肯库奎昆拉莱赖兰朗劳勒雷蕾里理丽利莉连列琳伦罗洛路鲁卢露吕玛迈麦曼梅蒙米密缪摩莫姆穆纳娜奈南内妮尼纽诺欧帕潘佩彭皮珀普奇乔琴丘萨塞赛桑瑟森沙莎尚舍史斯松苏索塔泰坦汤唐特廷图托瓦旺威韦维温沃乌伍西希锡谢辛休雅亚扬耶伊因尤约詹泽扎朱兹佐娅丝黛琪茜薇芙卫大" + "什通门顿默茨琼汀敦夫哥根瓜圭夸涅努派恰切钦屈热茹瑞若绍施舒提魏翁席薛卓楚"]);
const foldCharHan = (ch: string) => fold(ch);
/** First sound class of a Latin word or a pinyin string (r = l, c / k / q / ch = k, j / zh / soft g = j, x = s, w / v = b, vowels = V). */
function headSound(s: string, pinyin: boolean): string {
  const x = latinFold(s).replace(/[^a-z]/g, "");
  if (!x) return "";
  if (/^[aeiouy]/.test(x)) return pinyin && x[0] === "y" ? "V" : "V";
  if (/^(ch|zh)/.test(x)) return pinyin ? (x[0] === "c" ? "k" : "j") : "k";
  if (/^[lr]/.test(x)) return "r";
  if (/^[ckq]/.test(x)) return pinyin && x[0] === "q" ? "j" : "k";
  if (/^g[eiy]/.test(x) && !pinyin) return "j";
  if (/^[jz]/.test(x)) return "j";
  if (/^x/.test(x)) return "s";
  if (/^[wv]/.test(x)) return "w";
  if (/^[bp]/.test(x)) return "b";
  if (/^[td]/.test(x)) return "t";
  if (/^h/.test(x)) return "V";
  return x[0];
}
/** Consonant skeleton that keeps l / r (merged) and w / v (as p), for names rendered syllable by syllable (玛丽 ≈ Mary). */
function liquidKey(s: string, pinyin: boolean): string {
  let x = latinFold(s).toLowerCase().replace(/[^a-z]/g, "");
  if (pinyin) x = x.replace(/zh/g, "j").replace(/ch/g, "k").replace(/sh/g, "s").replace(/q/g, "j").replace(/x/g, "s").replace(/ng/g, "n");
  else x = x.replace(/th/g, "s").replace(/ph/g, "f").replace(/sh/g, "s").replace(/ch/g, "k").replace(/ck/g, "k").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/q/g, "k").replace(/x/g, "ks").replace(/g(?=[eiy])/g, "j");
  x = x.replace(/l/g, "r").replace(/[wv]/g, "p").replace(/[yh]/g, "").replace(/g/g, "k").replace(/d/g, "t").replace(/b/g, "p").replace(/z/g, "s");
  return x.replace(/[aeiou]+/g, "").replace(/(.)\1+/g, "$1");
}
function isSubseq(a: string, b: string): boolean { let j = 0; for (const ch of b) if (ch === a[j]) j++; return j === a.length; }

function byRecency(a: Contact, b: Contact) { return (b.lastInteractionAt ?? "").localeCompare(a.lastInteractionAt ?? ""); }

export function resolvePerson(input: PersonInput, world: World): PersonCandidate[] {
  const pool = accountContacts(world, input.account);
  const out = (cs: Contact[], why: PersonCandidate["why"]) => [...new Set(cs)].sort(byRecency).map((c) => ({ contactId: c.id, why }));
  let m = input.mention.normalize("NFKC").trim().replace(/^(the|that|this)\s+/i, "").replace(/['’]s$/i, "");
  if (!m) return [];
  // pronouns
  if (PRONOUN_RE.test(m)) {
    const inSentence = (input.sentencePeople ?? []).filter((id) => pool.some((c) => c.id === id));
    if (inSentence.length) return inSentence.map((id) => ({ contactId: id, why: "pronoun" as const }));
    const sess = (input.sessionPeople ?? []).filter((id) => pool.some((c) => c.id === id));
    if (sess.length) return [{ contactId: sess[sess.length - 1], why: "pronoun" }];
    return [];
  }
  // company qualifier: X的Y / XのY / X那个Y / X那位 / the X guy
  let company = "", person = m;
  const enGeneric = m.replace(EN_GENERIC, "").trim();
  if (/^[A-Za-z0-9 &.\-]+$/.test(m) && enGeneric !== m && enGeneric) { company = enGeneric; person = ""; }
  else {
    const sp = m.match(/^(.+?)(?:的|の|那个|那個|那位|这位|那边的|那边|那邊)(.*)$/u);
    if (sp && sp[1] && !/^(他|她|彼)/.test(sp[1])) {
      let rest = sp[2].replace(GENERIC_PERSON, "").replace(EN_GENERIC, "").trim();
      if (BARE_GENERIC.test(rest)) rest = "";
      company = sp[1].trim(); person = rest;
    } else {
      const g = m.replace(GENERIC_PERSON, "").trim();
      if (g !== m && g) { company = g; person = ""; }
    }
  }
  let scope = pool;
  let role = "";
  if (company) {
    const companyHit = (q: string) => { const qf = fold(q.replace(/\s+/g, "")); return pool.some((c) => [c.company, c.industry].filter(Boolean).some((x) => fold(x!.replace(/\s+/g, "")).includes(qf))); };
    // <company>做产品的 / <company>管财务的: company + what the person does there
    const dr = company.match(/^(.+?)(?:做|搞|管|负责|干|跑)(.+)$/u);
    if (dr && !companyHit(company) && companyHit(dr[1])) { company = dr[1]; role = dr[2]; }
    const cf = fold(company.replace(/\s+/g, ""));
    const cfSp = fold(company);
    const byCompany = pool.filter((c) => {
      const fields = [c.company, c.industry].filter(Boolean).map((x) => fold(x!.replace(/\s+/g, "")));
      if (fields.some((f) => f.includes(cf) || (cf.length >= 3 && cf.includes(f)))) return true;
      if (/^[a-z0-9 &.\-]+$/.test(cfSp)) {
        const py = pinyinOf(c.company ?? "").filter(Boolean).join("");
        if (cf.length >= 4 && py.includes(cf)) return true;
      }
      return false;
    });
    // the qualifier may also be a name (林副总的 …); only treat it as a company when it matches one
    if (byCompany.length) scope = byCompany;
    else if (person) { const asName = resolveName(company, pool, input.account, world); if (!asName.length) return []; scope = pool; person = person || ""; }
    else {
      const asName = resolveName(company, pool, input.account, world);
      return asName;
    }
    if (role && !person) person = role;
    if (!person) return out(scope, "company");
  }
  let res = resolveName(person, scope, input.account, world, !!company);
  if (!company && res.length && !usedAsName(m, input.sentence, res, pool)) res = [];
  // a company glued to the front of a name / role without 的 / の (某某课长, 某某化工李课长): only when nothing else matched
  if (!company && !res.some((r) => r.why !== "near")) {
    const glued = gluedCompany(m, pool, input.account, world);
    if (glued.length) return glued;
  }
  if (company && !res.length) {
    // the rest is a job / role at that company (<company>的PM / <company>のプロダクトマネージャー)
    const byRole = roleMatch(scope, person.replace(/(さん|さま|様|殿|氏|の方)$/u, ""));
    return byRole.length ? out(byRole, "role") : [];
  }
  return res;
}

// ---------------------------------------------------------------- ordinary word or a name? (r04)
/** Degree adverbs / complements and wish formulas around a word mark it as an ordinary word (做得X一点 / 真X / 祝您…X). */
const ZH_WORD_BEFORE = /(真|很|太|挺|好|更|最|超|特别|特別|非常|十分|比较|比較|蛮|颇|够|得|有点|有些|多么|那么|这么|如此|越来越|不够|不太|还算|算是)$/u;
const ZH_WORD_AFTER = /^(一点|一點|一些|点儿|點兒|些|极了|極了|得很|得多|地|起来|起來|多了|无比|無比)/u;
const ZH_NAME_AFTER = /^(说|說|讲|講|问|問|回|发|發|来|來|去|在|那边|那邊|这边|那儿|的|也|已经|刚|总|老师|先生|女士|小姐|吗|呢|们|和|跟|今天|明天|下周|上次|さん|様|氏|くん|ちゃん)/u;
const ZH_NAME_BEFORE = /(约|約|跟|和|与|與|同|给|給|找|问|問|叫|请|請|让|讓|帮|幫|告诉|通知|联系|聯繫|提醒|催|见|陪|带|向|对|和|把|被|是)$/u;
/** In a Japanese sentence a bare given name is a name only with an honorific or a person particle / verb right after it. */
const JA_NAME_AFTER = /^(さん|さま|様|サマ|くん|君|ちゃん|氏|殿|先生|先輩|から|と(?![しかもいう])|が(?:言|話|来|送|持|書)|は(?:言|何|今|来|どう)|に(?:連絡|電話|メール|送|伝|聞|頼|相談|会|確認|返|渡|報告|お願い|お礼)|へ|の(?:件|メール|資料|予定|案|企画|提案|会社|方|話)|[、。,.!?！？\s]|$)/u;

/**
 * A bare Han / kana mention that settled through a name form (full / given / reading) must be used as a name in the
 * sentence: words used as adjectives / adverbs / ordinary nouns (风格做得X一点, 誠に申し訳, 自然の恵み) are not people.
 */
function usedAsName(mention: string, sentence: string, res: PersonCandidate[], pool: Contact[]): boolean {
  if (!res.every((r) => r.why === "full" || r.why === "given" || r.why === "reading")) return true;
  const m = mention.normalize("NFKC").trim();
  if (!/^[\p{Script=Han}]{1,4}$/u.test(m)) return true;
  const sen = (sentence ?? "").normalize("NFKC");
  const at = sen.indexOf(m);
  if (at < 0) return true;
  const before = sen.slice(0, at), after = sen.slice(at + m.length);
  const japaneseSentence = /[ぁ-ゖァ-ヺ]/.test(sen);
  if (japaneseSentence) {
    // r10: any bare given name (also a Chinese contact's) needs the honorific / person particle in a Japanese sentence
    const jaGivenOnly = res.every((r) => r.why !== "full" && (r.why === "given" || nameForms(pool.find((c) => c.id === r.contactId)!).japanese));
    if (jaGivenOnly && !JA_NAME_AFTER.test(after)) return false;
    return true;
  }
  if (ZH_NAME_AFTER.test(after) || ZH_NAME_BEFORE.test(before)) return true;
  const clause = before.split(/[，,。.!?！？；;\s]/).pop() ?? "";
  if (ZH_WORD_BEFORE.test(before) || ZH_WORD_AFTER.test(after) || /[祝愿願]/.test(clause)) return false;
  // r10: a bare given name glued after a Han noun inside a clause (<noun><given name>才…) with no name cue on either side is a word
  if (res.every((r) => r.why === "given") && clause && /\p{Script=Han}$/u.test(clause) && [...clause].length >= 2 && !/^(要|会|會|想|还|還|又|都|让|讓|叫|打|给|給|约|約|觉得|覺得|认为|認為|准备|準備|负责|負責)/u.test(after)) return false;
  return true;
}

/** The longest leading part (≥ 2 chars) of the mention that a contact's company contains, then the rest as name or role. */
function gluedCompany(m: string, pool: Contact[], account: Account, world: World): PersonCandidate[] {
  const chars = [...m.normalize("NFKC").replace(/\s+/g, "")];
  if (chars.length < 3 || !chars.every((c) => isHan(c) || isKana(c) || c === "ー")) return [];
  for (let k = chars.length - 1; k >= 2; k--) {
    const pre = fold(chars.slice(0, k).join(""));
    const byCompany = pool.filter((c) => fold((c.company ?? "").replace(/\s+/g, "")).includes(pre));
    if (!byCompany.length) continue;
    const rest = chars.slice(k).join("").replace(/^(的|の|那位|这位|那个)/u, "").replace(/(さん|さま|様|殿|氏|の方|那位)$/u, "");
    if (!rest) return [];
    const asName = resolveName(rest, byCompany, account, world, true).filter((r) => r.why !== "near");
    if (asName.length) return asName;
    const byRole = roleMatch(byCompany, rest);
    if (byRole.length) return [...new Set(byRole)].sort(byRecency).map((c) => ({ contactId: c.id, why: "role" as const }));
    return [];
  }
  return [];
}

/** Spelling-tolerant key of a Latin or kana reading (Kondou = Kondo = こんどう = コンドー; si = shi). */
function readKey(x: string): string | undefined {
  if (/^[a-z]{2,}$/.test(x)) return romajiKey(x);
  if (x.length >= 2 && [...x].every(isKana)) return romajiKey(toRomaji(x));
  return undefined;
}
/** A reading list holds x literally, or (Japanese names) under the spelling-tolerant key. */
function readHas(n: NameForms, arr: string[], x: string): boolean {
  if (arr.includes(x)) return true;
  if (!n.japanese) return false;
  const k = readKey(x);
  return !!k && arr.some((r) => readKey(r) === k);
}

/** A pinyin or kana-romaji reading reduced to what a katakana rendering of a Chinese syllable keeps. */
function kanaPinyinKey(x: string): string {
  // r10: a kana glide after a consonant is the pinyin medial i (a kana yu-glide = the medial i) and a long vowel is one vowel
  return x.toLowerCase().replace(/ü|v/g, "yu").replace(/([^aeiouy])y(?=[aeiou])/g, "$1i").replace(/([aeiou])\1+/g, "$1").replace(/ng/g, "n").replace(/zh|ch|q|j/g, "J").replace(/sh|x/g, "S").replace(/ts|c|z/g, "Z").replace(/l/g, "r").replace(/[\s'’\-]/g, "");
}
/** Romaji of a kana rendering; a small ェ after シ / チ / ジ is one syllable (シェ = she). */
const kanaRomaji = (x: string) => { const r = toRomaji(x); return /ぇ|ェ/.test(x) ? r.replace(/(sh|ch|j)ie/g, "$1e") : r; };
const kanaRendersHan = (n: NameForms, x: string, arr: string[]): boolean =>
  !n.japanese && [...n.full].some(isHan) && x.length >= 2 && [...x].every(isKana) && arr.some((r) => /^[a-z]+$/.test(r) && kanaPinyinKey(r) === kanaPinyinKey(kanaRomaji(x)));

function resolveName(mention: string, scope: Contact[], account: Account, world: World, hasCompany = false): PersonCandidate[] {
  const out = (cs: Contact[], why: PersonCandidate["why"]) => [...new Set(cs)].sort(byRecency).map((c) => ({ contactId: c.id, why }));
  const raw = mention.trim();
  const f = fold(nospace(raw));
  if (!f) return [];
  // alias table (bare said form only; a company qualifier wins over it, D6)
  if (!hasCompany) {
    const al = world.aliases.filter((a) => a.account === account && fold(nospace(a.said)) === f).map((a) => scope.find((c) => c.id === a.contactId)).filter(Boolean) as Contact[];
    if (al.length) return out(al, "alias");
  }
  const forms = scope.map((c) => [c, nameForms(c)] as const);
  const saved = forms.filter(([, n]) => n.aliases.includes(f)).map(([c]) => c);
  if (saved.length) return out(saved, "alias");
  const full = forms.filter(([, n]) => n.full === f).map(([c]) => c);
  if (full.length) return out(full, "full");
  // r07: a Latin full name written in the other order (given first or family first): the same set of name words
  const mtoks = raw.normalize("NFKC").split(/[\s　,]+/).filter(Boolean);
  if (mtoks.length >= 2 && mtoks.every((t) => /^[A-Za-zÀ-ɏ'’.\-]+$/.test(t))) {
    const key = (ts: string[]) => ts.map((t) => fold(nospace(t))).sort().join(" ");
    const mk = key(mtoks);
    const swapped = forms.filter(([, n]) => n.latinTokens.length === mtoks.length && [...n.latinTokens].sort().join(" ") === mk).map(([c]) => c);
    if (swapped.length) return out(swapped, "full");
  }
  const [base, title] = splitTitle(raw);
  const b = fold(nospace(base));
  if (title) {
    const full2 = forms.filter(([, n]) => n.full === b).map(([c]) => c);
    if (full2.length) return out(full2, "full");
    const saved2 = forms.filter(([, n]) => n.aliases.includes(b)).map(([c]) => c);
    if (saved2.length) return out(saved2, "alias");
  }
  const read = forms.filter(([, n]) => readHas(n, n.readFull, f) || (!!title && readHas(n, n.readFull, b))).map(([c]) => c);
  if (read.length) return out(read, "reading");
  if (/^[A-Z]{2,4}$/.test(raw.replace(/(さん|様)$/, "")) || /^[A-Z]{2,4}$/.test(base)) {
    const ini = (/^[A-Z]{2,4}$/.test(base) ? base : raw.replace(/(さん|様)$/, "")).toLowerCase();
    const hit = forms.filter(([, n]) => n.initials.includes(ini)).map(([c]) => c);
    if (hit.length) return out(hit, "reading");
  }
  // a given-name initial + surname (an initial, a dot or space, a Latin surname): the surname reads, the given name starts with the initial
  const im = base.normalize("NFKC").trim().match(/^([A-Za-z])(?:\.\s*|\s+)([A-Za-z][A-Za-z'’\-]+)$/);
  if (im) {
    const ini = im[1].toLowerCase(), sur = fold(nospace(im[2]));
    const hit = forms.filter(([, n]) => {
      const famOk = (n.latinTokens.length > 1 && n.latinTokens[n.latinTokens.length - 1] === sur) || readHas(n, n.readFamily, sur);
      const givens = [...(n.latinTokens.length > 1 ? [n.latinTokens[0]] : []), ...n.readGiven.filter((g) => /^[a-z]+$/.test(g))];
      return famOk && givens.some((g) => g.startsWith(ini));
    }).map(([c]) => c);
    if (hit.length) return out(hit, "reading");
  }
  // surname (+ title)
  // a Han surname also names a Latin-written contact through its pinyin (the pinyin of the surname equals the Latin family name) or a Chinese-form alias
  const hanPy = (x: string) => { const cs = [...x]; if (!cs.length || cs.length > 2 || !cs.every(isHan)) return ""; const py = pinyinOf(x); return py.every(Boolean) ? py.join("") : ""; };
  const surnameMatch = (x: string) => forms.filter(([, n]) =>
    (n.family && n.family === x) || n.aliasFamily.includes(x) || (n.latinTokens.length > 1 && !!hanPy(x) && n.latinTokens[n.latinTokens.length - 1] === hanPy(x)) || readHas(n, n.readFamily, x) || kanaRendersHan(n, x, n.readFamily) || (n.latinTokens.length > 1 && n.latinTokens.slice(1).includes(x)) || (n.latinTokens.length > 0 && !!title && n.latinTokens[0] === x)).map(([c]) => c);
  const tryTitle = (x: string, t: string): PersonCandidate[] | undefined => {
    let cs = surnameMatch(x);
    if (!cs.length) return undefined;
    const tf = fold(t);
    if (t && !PURE_HONORIFIC.has(tf) && !/^(mr|mrs|ms|miss|dr|prof|san|sama|sensei|-san|sir)\.?$/i.test(t)) {
      const narrowed = titleNarrow(cs, t);
      if (narrowed.length) cs = narrowed;
    }
    // the honorific's language hints at the reading of a Han surname: 林さん → はやし, 林总 → Lin
    if (t && [...x].some(isHan) && cs.length > 1) {
      const jaHon = JA_TITLES.map(fold).includes(tf) && !ZH_TITLES.map(fold).includes(tf);
      const zhHon = ZH_TITLES.map(fold).includes(tf) && !JA_TITLES.map(fold).includes(tf);
      const pref = jaHon ? cs.filter((c) => nameForms(c).japanese) : zhHon ? cs.filter((c) => !nameForms(c).japanese) : [];
      if (pref.length) cs = pref;
    }
    return out(cs, "surname-title");
  };
  if (title) { const r = tryTitle(b, title); if (r) return r; }
  // r10: the romanised forms (Lao / Xiao / A + <surname pinyin>): the pinyin of 老 / 小 / 阿 + a surname reading
  const xlLatin = raw.normalize("NFKC").match(/^(lao|xiao|ah|a)[\s\-]+([a-z]+)$/i);
  if (xlLatin) {
    const asSur = surnameMatch(fold(xlLatin[2])).filter((c) => !nameForms(c).latinTokens.length);
    if (asSur.length) return out(asSur, "surname-title");
  }
  // 小X / 老X / 阿X
  const xl = raw.match(/^([小老阿])(.+)$/u);
  if (xl) {
    const rest = fold(xl[2]);
    const asSur = surnameMatch(rest);
    // a two-character Japanese surname starting with 小 (小林) is tried before as a plain surname
    const plain = surnameMatch(f);
    if (plain.length) return out(plain, "surname-title");
    if (asSur.length) return out(asSur, "surname-title");
    const asGiven = forms.filter(([, n]) => n.given === rest || readHas(n, n.readGiven, rest)).map(([c]) => c);
    if (asGiven.length) return out(asGiven, "given");
    // r08: 阿 / 小 + the last character of a two-character Chinese given name (阿X / 小X as a pet name)
    if (/^[阿小]$/u.test(xl[1]) && [...rest].length === 1 && isHan(rest)) {
      const pet = forms.filter(([, n]) => !n.japanese && !n.latinTokens.length && !!n.given && [...n.given].length >= 2 && n.given.endsWith(rest)).map(([c]) => c);
      if (pet.length) return out(pet, "given");
    }
  }
  // r10: the comparison fold merges ue / u (German spellings), but in pinyin a final -ue is another syllable than -u
  // xu / yu / ju: a single Latin word with ue / üe / ve only reads a Han name part whose own pinyin has that vowel
  const rawLatin = /^[A-Za-zÀ-ɏ]+$/.test(nospace(base)) ? nospace(base).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/v/g, "u") : "";
  const pyOf = (x?: string) => { if (!x || ![...x].every(isHan)) return undefined; const p = pinyinOf(x); return p.every(Boolean) ? p.join("").toLowerCase().replace(/ü|v/g, "u") : undefined; };
  const vowelOk = (part?: string) => { if (!rawLatin || !/ue/.test(rawLatin + (pyOf(part) ?? ""))) return true; const p = pyOf(part); return p === undefined || p === rawLatin; };
  const bare = surnameMatch(f).filter((c) => vowelOk(nameForms(c).family));
  const given = forms.filter(([, n]) => (n.given === b || readHas(n, n.readGiven, b) || n.aliasGiven.includes(b) || (n.latinTokens.length > 0 && n.latinTokens[0] === b)) && vowelOk(n.given)).map(([c]) => c);
  // r10: a bare romanised syllable that reads both a surname and a Han given name (pinyin of a one-character given
  // name) can mean either: keep both, the given-name holders first
  if (bare.length && given.length && rawLatin && !title && given.some((c) => !nameForms(c).latinTokens.length)) return [...out(given, "given"), ...out(bare.filter((c) => !given.includes(c)), "surname-title")];
  if (bare.length) return out(bare, "surname-title");
  if (given.length) return out(given, "given");
  // surname + a job title written out (陈设计师, 李会计): the rest of the mention is part of that contact's job title
  const st = forms.filter(([c, n]) => n.family && !n.latinTokens.length && b.startsWith(n.family) && b.length > n.family.length && fold(c.title ?? "").includes(b.slice(n.family.length))).map(([c]) => c);
  if (st.length) return out(st, "surname-title");
  const bb0 = [...b];
  // English nickname / spelling of a saved first name (Will = William, Liz = Elizabeth), alone or with the surname
  const firstOf = (n: NameForms) => [n.latinTokens[0], ...n.aliases.filter((a) => /^[a-z]+$/.test(a))].filter(Boolean) as string[];
  const latinWords = base.normalize("NFKC").trim().split(/[\s　]+/).map((w) => fold(nospace(w)));
  if (latinWords.length <= 2 && latinWords.every((w) => /^[a-z]+$/.test(w))) {
    const eq = nickSet(latinWords[0]);
    if (eq.size > 1) {
      const hit = forms.filter(([, n]) => firstOf(n).some((t) => t !== latinWords[0] && eq.has(t)) &&
        (latinWords.length === 1 || n.latinTokens.slice(1).includes(latinWords[1]))).map(([c]) => c);
      if (hit.length) return out(hit, latinWords.length === 1 ? "given" : "full");
    }
    // a short form that is the start of a saved first name (Rob, Chris, Alex …: clipped nicknames)
    const w0 = latinWords[0];
    const minP = (plan as { person: { clipMinLength: number } }).person.clipMinLength;
    if (w0.length >= minP) {
      const hit = forms.filter(([, n]) => firstOf(n).some((t) => t.length > w0.length && t.startsWith(w0)) &&
        (latinWords.length === 1 || n.latinTokens.slice(1).includes(latinWords[1]))).map(([c]) => c);
      if (hit.length) return out(hit, latinWords.length === 1 ? "given" : "full");
      // a clipped name with a pet-name ending (-e / -y / -ie / -o): the stem starts a saved first name
      const stem = w0.replace(/(?:ie|e|y|o)$/, "");
      if (stem !== w0 && stem.length >= minP) {
        const hit2 = forms.filter(([, n]) => firstOf(n).some((t) => t.length > stem.length && t.startsWith(stem) && t !== w0) &&
          (latinWords.length === 1 || n.latinTokens.slice(1).includes(latinWords[1]))).map(([c]) => c);
        if (hit2.length) return out(hit2, latinWords.length === 1 ? "given" : "full");
      }
    }
    // Wade-Giles spelling of a Chinese name (Chang = Zhang, Hsu = Xu, Chiang = Jiang)
    const wgFull = forms.filter(([, n]) => n.altFull.includes(b)).map(([c]) => c);
    if (wgFull.length) return out(wgFull, "reading");
    if (latinWords.length === 1) {
      let wgFam = forms.filter(([, n]) => n.altFamily.includes(b)).map(([c]) => c);
      if (wgFam.length && title && !PURE_HONORIFIC.has(fold(title)) && !/^(mr|mrs|ms|miss|dr|prof|san|sama|sensei|-san)\.?$/i.test(title)) {
        const nar = titleNarrow(wgFam, title);
        if (nar.length) wgFam = nar;
      }
      if (wgFam.length) return out(wgFam, "surname-title");
    }
  }
  // a common Chinese rendering of an English given name (威廉 = William)
  if (bb0.length >= 1 && bb0.every(isHan)) {
    const en = ZH_EN.get(b);
    if (en) {
      const eq = nickSet(en);
      const hit = forms.filter(([, n]) => firstOf(n).some((t) => eq.has(t))).map(([c]) => c);
      if (hit.length) return out(hit, "given");
    }
  }
  // a Chinese phonetic rendering of a Latin name (彼得 ≈ Peter): pinyin skeleton against the Latin name words
  if (bb0.length >= 2 && bb0.length <= 5 && bb0.every((ch) => TRANSLIT.has(foldCharHan(ch)))) {
    const py = pinyinOf(b);
    if (py.every(Boolean)) {
      const zk = loanKey(py.join("")), zr = liquidKey(py.join(""), true), zh0 = headSound(py.join(""), true);
      const latinOf = (n: NameForms) => [...n.latinTokens, ...n.aliases.filter((a) => /^[a-z]+$/.test(a))];
      const fits = (t: string, exact: boolean) => {
        if (headSound(t, false) !== zh0) return false;
        const lk = loanKey(t), lr = liquidKey(t, false);
        const near = (a: string, b: string) => a.length >= 2 && (a === b || (!exact && b.length <= a.length + 1 && isSubseq(a, b)));
        return near(zk, lk) || near(zr, lr);
      };
      // same skeleton first; a Latin name with one more consonant (one consonant dropped in the rendering) only when nothing sounds the same
      for (const exact of [true, false]) {
        const hit = forms.filter(([, n]) => latinOf(n).some((t) => fits(t, exact))).map(([c]) => c);
        if (hit.length) return out(hit, "given");
      }
    }
  }
  // katakana sound of a Latin name (スミス ≈ Smith, ジョーンズ ≈ Jones, ポーター ≈ Porter, short names too)
  if ([...b].every(isKana) && b.length >= 2) {
    const k = soundKey(toRomaji(b));
    const pp = (plan as { person: { kanaLatinMinKey: number; kanaLatinShortKana: number; kanaLatinShortLatin: number } }).person;
    const minKey = pp.kanaLatinMinKey;
    const shortOk = (t: string) => k.length >= minKey || (b.length <= pp.kanaLatinShortKana && t.length <= pp.kanaLatinShortLatin);
    if (k.length >= 1) {
      const noR = (s: string) => s[0] + s.slice(1).replace(/r/g, "");
      // Latin name tokens and Latin saved aliases (a katakana rendering of a saved Latin nickname)
      const latinOf = (n: NameForms) => [...n.latinTokens, ...n.aliases.filter((a) => /^[a-z]+$/.test(a))];
      const keysOf = (t: string) => [soundKey(t), latinSoundKey(t)];
      // a full name in katakana (ジョン・スミス): every part sounds like one of the Latin name words
      const kparts = base.normalize("NFKC").split(/[・·\s　=＝]+/).map((x) => fold(x)).filter(Boolean);
      if (kparts.length >= 2 && kparts.every((x) => [...x].every(isKana))) {
        const pk = kparts.map((x) => soundKey(toRomaji(x)));
        const noRk = (x: string) => x[0] + x.slice(1).replace(/r/g, "");
        // r07: a glide inside a Latin name part is often not written in katakana (a -wo- / -yo- syllable written as a plain vowel): w / y dropped after the first sound
        const noGlide = (x: string) => x[0] + x.slice(1).replace(/[wy]/g, "");
        const partHit = (n: NameForms, k: string) => latinOf(n).some((t) => keysOf(t).some((x) => x === k || (noRk(x).length >= 2 && noRk(x) === noRk(k)) || (x.length >= 2 && looseSoundKey(noRk(x)) === looseSoundKey(noRk(k))) || (x.length >= 2 && noGlide(noRk(x)) === noGlide(noRk(k)))));
        const full = forms.filter(([, n]) => n.latinTokens.length >= 2 && pk.every((k) => partHit(n, k))).map(([c]) => c);
        if (full.length) return out(full, "reading");
      }
      let hit = forms.filter(([, n]) => latinOf(n).some((t) => shortOk(t) && keysOf(t).includes(k))).map(([c]) => c);
      // r08: a clipped first name (the kana sounds exactly like the start of a saved first name) before the loose r-dropping keys
      if (!hit.length && b.length >= 3 && k.length >= 2) hit = forms.filter(([, n]) => latinOf(n).slice(0, 1).some((t) => {
        for (let L = (plan as { person: { clipMinLength: number } }).person.clipMinLength; L < t.length; L++) if (soundKey(t.slice(0, L)) === k) return true;
        return false;
      })).map(([c]) => c);
      if (!hit.length && noR(k).length >= 2) hit = forms.filter(([, n]) => latinOf(n).some((t) => keysOf(t).some((x) => noR(x) === noR(k)))).map(([c]) => c);
      if (!hit.length && noR(k).length >= 3) hit = forms.filter(([, n]) => latinOf(n).some((t) => keysOf(t).some((x) => looseSoundKey(noR(x)) === looseSoundKey(noR(k))))).map(([c]) => c);
      // r10: a short name (two-consonant key) whose final consonant is voiced in katakana (ズ for a final s): the loose key,
      // only with at least kanaLatinShortKana kana and the same number of consonants
      if (!hit.length && k.length === 2 && b.length >= pp.kanaLatinShortKana) hit = forms.filter(([, n]) => latinOf(n).some((t) => keysOf(t).some((x) => x.length === 2 && x[0] === k[0] && looseSoundKey(x) === looseSoundKey(k)))).map(([c]) => c);
      if (hit.length) return out(hit, "reading");
      // katakana of a clipped nickname (a short form of a saved Latin first name): the kana sounds like the name's start
      if (b.length >= 3 && k.length >= 2) {
        const clipHit = forms.filter(([, n]) => latinOf(n).slice(0, 1).some((t) => {
          for (let L = (plan as { person: { clipMinLength: number } }).person.clipMinLength; L < t.length; L++) if (soundKey(t.slice(0, L)) === k) return true;
          return false;
        })).map(([c]) => c);
        if (clipHit.length) return out(clipHit, "reading");
      }
    }
  }
  // a name typed in kanji for a Japanese name saved in kana (由美さん = ゆみ): settles; the same reading in other kanji
  // than a name saved in kanji (same reading, other kanji) is only proposed (near)
  const kanaNear: Contact[] = [];
  if (bb0.length >= 1 && bb0.length <= 4 && bb0.every(isHan)) {
    const kanaOf = (arr: string[]) => arr.filter((r) => [...r].every(isKana));
    const hit: Contact[] = [];
    for (const [c, n] of forms) {
      if (!n.japanese || n.given === b || n.family === b) continue;
      const reads = [...kanaOf(n.readGiven), ...(bb0.length >= 2 ? kanaOf(n.readFull) : []), ...(title ? kanaOf(n.readFamily) : [])];
      if (!reads.some((r) => kanjiReadsAs(b, r))) continue;
      if ([...n.full].some(isKana)) hit.push(c); else kanaNear.push(c);
    }
    if (hit.length) return out(hit, "reading");
  }
  // one character off: propose only
  const near: Contact[] = [];
  const bb = [...b];
  if (bb.length >= (plan as { person: { nearMinLength: number } }).person.nearMinLength && bb.every((ch) => isHan(ch) || isKana(ch))) {
    for (const [c, n] of forms) {
      const nn = [...n.full];
      if (nn.length !== bb.length) continue;
      let diff = 0;
      for (let i = 0; i < nn.length; i++) if (nn[i] !== bb[i]) diff++;
      if (diff === 1) near.push(c);
    }
  }
  return out([...near, ...kanaNear], "near");
}
