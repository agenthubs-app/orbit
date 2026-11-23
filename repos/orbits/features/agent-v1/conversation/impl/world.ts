// @ts-nocheck -- conversation/impl/world.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/rsi/archive/r12-maintenance/impl/world.ts
// (lab commit c13d85089, r12 = r11 + when to ask round 3: contact exact picks, the stated kind wins over title words, a plural pronoun with no recent people goes without binding). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * The world as the implementation sees it: every record by id (with its kind, account, visibility and a searchable
 * text), and person spotting — which contacts of the account a piece of text names, and how (full name, given name,
 * alias, surname with an honorific or role, company, role). Everything is derived from the world passed in at runtime.
 */
import type { Account, LabWorld, RecordKind } from "../types";
import { containsTerm, escapeRe, fold, fre, indexOfTerm, isCjk, isKana, katakanaMask, squash } from "./text";
import { isTranslitChar, kanaSoundsLike, kanjiReadsAs, translitPinyin, translitSoundsLike } from "./names";
import { CITY_WORDS, COMPANY_SUFFIXES, COMPOUND_SURNAMES, EN_COMMON, HONORIFICS, PLACE_TABLE, ROLE_SYNONYMS } from "./lexicon";
import { romaji } from "./concepts";
import { pinyinOf } from "./pinyin";
import { parseTime } from "./time";
/** Romanised surnames that are also everyday English words: never a name on their own. */
const LATIN_WORDS = ["long", "song", "fang", "gang", "bang", "ming", "ding", "wing", "sing", "ling", "hang", "chang", "tang", "pang", "kong", "wong", "zhong", "gong", "dong", "bing", "lang", "sang", "tong", "hong", "mean", "shan", "bian", "nian"];

export interface Rec {
  id: string;
  kind: RecordKind;
  account?: Account;
  deleted: boolean;
  title: string;
  text: string;            // folded, squashed: title + notes / body + location + linked people
  titleF: string;
  contactIds: string[];
  status?: "open" | "done";
  hasDate: boolean;
}

interface PartialLatin { id: string; re: RegExp; fam: string | null; giv: RegExp }

export interface NameForm { text: string; how: "full" | "alias" | "given" | "family" | "company" | "reading"; ids: string[] }

export interface WorldIx {
  world: LabWorld;
  account: Account;
  recs: Map<string, Rec>;
  contacts: Rec[];                       // the account's live contacts
  forms: NameForm[];                     // longest first
  familyOf: Map<string, string>;         // contact id → folded family name
  roleOf: Map<string, string>;           // contact id → folded title
  companyOf: Map<string, string>;        // contact id → folded company
  coresOf: Map<string, string[]>;        // contact id → distinctive company words
  places: string[];                      // folded place words: the locations of the account's schedule and events
  placeDisplay: Map<string, string>;     // r07: folded place word → the world's own spelling (the stored kanji, not its folded simplified form)
  bareGiven: Set<string>;                // given names in kanji of contacts with a kana reading: alone they may be ordinary words
  soundWords: Map<string, string[]>;     // contact id → Latin-letter words of the name and aliases (for katakana / Chinese renderings)
  partialLatin: PartialLatin[];          // Chinese names with a character the pinyin table lacks: the romanised spellings they may still have
  kanaGiven: Map<string, string>;        // contact id → a given name written in kana (it may be written in kanji: 美奈子 for みなこ)
  gender(id: string): "female" | "male" | "unknown";
}

export const kindOfId = (id: string): RecordKind | null =>
  id.startsWith("C-") ? "contact" : id.startsWith("T-") ? "todo" : id.startsWith("M-") ? "memo" : id.startsWith("S-") ? "schedule" : /^[EP]-/.test(id) ? "event" : null;

const uniqStr = (xs: string[]) => [...new Set(xs)];
const PLACE_PREFIXES = uniqStr([...CITY_WORDS, ...PLACE_TABLE.flatMap(([, cs]) => cs.map((x) => x.replace(/\s+/g, "")))]).sort((a, b) => b.length - a.length);

const cache = new WeakMap<LabWorld, Map<Account, WorldIx>>();

export function indexWorld(world: LabWorld, account: Account): WorldIx {
  let byAcc = cache.get(world);
  if (!byAcc) { byAcc = new Map(); cache.set(world, byAcc); }
  const hit = byAcc.get(account);
  if (hit) return hit;
  const ix = build(world, account);
  byAcc.set(account, ix);
  return ix;
}

function familyGiven(name: string): [string, string] | null {
  const n = name.trim();
  if (/\s/.test(n)) {
    const toks = n.split(/\s+/);
    // CJK / kana names keep family first; a Latin-letter name has its family name last, unless the given name after
    // the first word is hyphenated (East Asian order in Latin letters: family, then a two-part given name)
    if (!/^[a-z]/i.test(fold(toks[0])) || (toks.length === 2 && /-/.test(toks[1]) && !/-/.test(toks[0]))) return [toks[0], toks.slice(1).join(" ")];
    return [toks[toks.length - 1], toks.slice(0, -1).join(" ")];
  }
  if ([...n].every((c) => isCjk(c))) {
    const two = n.slice(0, 2);
    if (n.length >= 3 && COMPOUND_SURNAMES.includes(fold(two))) return [two, n.slice(2)];
    return [n.slice(0, 1), n.slice(1)];
  }
  return null;
}

/** Distinctive words of a company name: the name without a leading city and a trailing generic suffix. */
export function companyCores(company: string): string[] {
  const out = new Set<string>();
  const f = squash(company);
  out.add(f);
  if (/^[a-z]/.test(fold(company).trim())) {
    const words = fold(company).trim().split(/\s+/);
    out.add(words[0]);
    if (words.length > 2) out.add(words.slice(0, 2).join(" "));
    return [...out].filter((w) => w.length >= 3);
  }
  let core = f;
  // a leading city / well-known district is not the company's own word (上海<core> / 丸の内<core>)
  for (const c of PLACE_PREFIXES) if (core.startsWith(c) && core.length > c.length + 1) { core = core.slice(c.length); break; }
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of COMPANY_SUFFIXES) if (core.endsWith(s) && core.length > s.length + 1) { core = core.slice(0, -s.length); changed = true; break; }
    for (const s of COMPANY_SUFFIXES) if (core.startsWith(s) && core.length > s.length + 1) { core = core.slice(s.length); changed = true; break; }
  }
  out.add(core);
  if (core.length > 2 && [...core].every(isCjk)) out.add(core.slice(0, 2));
  // a place word alone is the place, never the company (银座 / 丸の内 in a company name)
  return [...out].filter((w) => w.length >= 2 && (w === f || (!PLACE_PREFIXES.includes(w) && !COMPANY_SUFFIXES.includes(w))));
}

function build(world: LabWorld, account: Account): WorldIx {
  const recs = new Map<string, Rec>();
  const nameOf = new Map<string, string>();
  for (const c of world.contacts) nameOf.set(c.id, `${c.name} ${c.company ?? ""}`);
  const linked = (ids?: string[]) => (ids ?? []).map((i) => nameOf.get(i) ?? "").join(" ");
  const add = (r: Omit<Rec, "titleF">) => recs.set(r.id, { ...r, titleF: squash(r.title) });
  for (const c of world.contacts) add({ id: c.id, kind: "contact", account: c.account, deleted: !!c.deletedAt, title: c.name, text: squash(`${c.name} ${c.reading ?? ""} ${(c.aliases ?? []).join(" ")} ${c.company ?? ""} ${c.title ?? ""} ${c.industry ?? ""}`), contactIds: [c.id], hasDate: false });
  for (const t of world.todos) add({ id: t.id, kind: "todo", account: t.account, deleted: !!t.deletedAt, title: t.title, text: squash(`${t.title} ${t.notes ?? ""} ${linked(t.contactIds)}`), contactIds: t.contactIds ?? [], status: t.status, hasDate: !!(t.plannedDate || t.dueAt) });
  for (const m of world.memos) add({ id: m.id, kind: "memo", account: m.account, deleted: !!m.deletedAt, title: m.title, text: squash(`${m.title} ${m.body} ${linked(m.contactIds)}`), contactIds: m.contactIds ?? [], hasDate: false });
  for (const s of world.schedule) add({ id: s.id, kind: "schedule", account: s.account, deleted: false, title: s.title, text: squash(`${s.title} ${s.location ?? ""} ${linked(s.contactIds)}`), contactIds: s.contactIds ?? [], hasDate: true });
  for (const e of world.platformEvents) add({ id: e.id, kind: "event", deleted: false, title: e.title, text: squash(`${e.title} ${e.location ?? ""} ${e.organizer ?? ""} ${e.summary ?? ""}`), contactIds: [], hasDate: true });
  for (const p of world.privateEvents) add({ id: p.id, kind: "event", account: p.account, deleted: false, title: p.title, text: squash(`${p.title} ${p.location ?? ""}`), contactIds: [], hasDate: true });

  const contacts = world.contacts.filter((c) => c.account === account && !c.deletedAt);
  const formMap = new Map<string, NameForm>();
  const addForm = (text: string, how: NameForm["how"], id: string) => {
    const t = text.trim();
    if (!t) return;
    if ([...t].length < 2 && how !== "family") return;
    const key = `${how}\u0000${t}`;
    const f = formMap.get(key) ?? { text: t, how, ids: [] };
    if (!f.ids.includes(id)) f.ids.push(id);
    formMap.set(key, f);
  };
  const familyOf = new Map<string, string>();
  const bareGiven = new Set<string>();
  const roleOf = new Map<string, string>();
  const companyOf = new Map<string, string>();
  const coresOf = new Map<string, string[]>();
  const soundWords = new Map<string, string[]>();
  const partialLatin: PartialLatin[] = [];
  const kanaGiven = new Map<string, string>();
  /** r07: kanji family name → the romaji of its kana reading, learned from the contacts that store both (a kanji surname → its reading in romaji). */
  const kanjiFamRomaji = new Map<string, Set<string>>();
  for (const c of contacts) {
    const full = fold(c.name).trim();
    addForm(full.replace(/\s+/g, ""), "full", c.id);
    if (/\s/.test(full)) addForm(full, "full", c.id);
    const fg = familyGiven(c.name);
    // r07: a German umlaut is also written with an e (ü → ue, ö → oe, ä → ae)
    if (/[äöüß]/iu.test(c.name)) {
      const alt = c.name.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss");
      const afg = familyGiven(alt);
      addForm(fold(alt).trim(), "full", c.id);
      if (afg) { addForm(fold(afg[0]), "family", c.id); addForm(`${fold(afg[1])} ${fold(afg[0])}`, "full", c.id); }
    }
    if (fg) {
      const [fam, giv] = [fold(fg[0]), fold(fg[1])];
      familyOf.set(c.id, fam);
      addForm(fam, "family", c.id);
      if (/^[a-z]/.test(giv)) { addForm(giv, "given", c.id); for (const w of giv.split(/[\s-]+/)) if (w.length >= 3) addForm(w, "given", c.id); }
      else if ([...giv].length >= 2) { addForm(giv, "given", c.id); if (c.reading && /[぀-ヿ]/u.test(c.reading) && [...giv].every(isCjk)) bareGiven.add(giv); }
    }
    const cjkName = [...fold(c.name).replace(/\s+/g, "")].every((ch) => isCjk(ch));
    if (fg && [...fold(fg[1])].length >= 2 && [...fold(fg[1])].every((ch) => /[ぁ-ゖ]/u.test(ch))) kanaGiven.set(c.id, fold(fg[1]));
    const kanaReading = !!c.reading && /[぀-ヿ]/u.test(c.reading);
    if (c.reading) {
      const r = fold(c.reading).trim();
      if ([...r].every((ch) => isKana(ch) || /\s/.test(ch))) {
        addForm(r.replace(/\s+/g, ""), "reading", c.id);
        const parts = r.split(/\s+/);
        if (parts.length === 2) {
          addForm(parts[1], "given", c.id);
          // the family name's reading in kana (モリ部長 / もりさん): kana forms are names only in name position
          if ([...parts[0]].length >= 2) addForm(parts[0], "family", c.id);
          // the Latin spelling of the reading (family and given reading → their romaji, both orders)
          const [fam, giv] = parts.map(romaji);
          if (fg && [...fold(fg[0])].every((ch) => isCjk(ch)) && fam.length >= 3) { const k = fold(fg[0]); if (!kanjiFamRomaji.has(k)) kanjiFamRomaji.set(k, new Set()); kanjiFamRomaji.get(k)!.add(fam); }
          if (fam.length >= 3) addForm(fam, "family", c.id);
          if (giv.length >= 3) addForm(giv, "given", c.id);
          addForm(`${fam} ${giv}`, "full", c.id);
          addForm(`${giv} ${fam}`, "full", c.id);
        }
      } else {
        addForm(r, "reading", c.id);
        // a Latin-letter reading of a CJK name (a romanisation other than pinyin), in the name's own order: family first;
        // the given part also hyphenated, joined or spaced
        const toks = r.split(/\s+/);
        if (cjkName && toks.length >= 2 && toks.every((x) => /^[a-z][a-z'-]*$/.test(x))) {
          const fam = toks[0], giv = toks.slice(1).join(" ");
          addForm(fam, "family", c.id);
          for (const g of uniqStr([giv, giv.replace(/[\s-]+/g, ""), giv.replace(/[\s-]+/g, " "), giv.replace(/\s+/g, "-")])) {
            if (g.replace(/[\s-]/g, "").length >= 4) addForm(g, "given", c.id);
            addForm(`${fam} ${g}`, "full", c.id); addForm(`${g} ${fam}`, "full", c.id);
          }
        }
      }
    }
    // a Chinese surname character of a Japanese contact also reads in pinyin (Lu for 陆): R16 — a romanised surname
    // fits everyone with that character
    if (kanaReading && fg && [...fold(fg[0])].length === 1 && isCjk(fold(fg[0]))) {
      const fam = pinyinOf(fold(fg[0]));
      if (fam) addForm(fam.join(""), "family", c.id);
    }
    // the romanised spelling of a Chinese name (family + given → "family given", "given family", run together; a two-character given name alone)
    if (!kanaReading && fg && cjkName) {
      const fam = pinyinOf(fold(fg[0])), giv = pinyinOf(fold(fg[1]));
      if (fam && giv && giv.length) {
        const f = fam.join(""), g = giv.join("");
        addForm(`${f} ${g}`, "full", c.id); addForm(`${g} ${f}`, "full", c.id); addForm(f + g, "full", c.id);
        if (giv.length >= 2 && g.length >= 4) addForm(g, "given", c.id);
        // the surname alone: a short or word-like one only in name position (weakLatin, checked when spotting)
        addForm(f, "family", c.id);
      } else {
        // a character the table does not know: the name still fits any romanised spelling that agrees with the
        // characters it does know (a candidate is never dropped for want of a transliteration)
        const syl = (x: string) => (pinyinOf(x)?.[0] ?? null);
        const F = fam ? fam.join("") : "[a-z]{1,6}";
        const G = [...fold(fg[1])].map((ch) => syl(ch) ?? "[a-z]{1,6}").join("");
        if (fam || [...fold(fg[1])].some((ch) => syl(ch))) partialLatin.push({ id: c.id, re: new RegExp(`^(${F}[\\s-]?${G}|${G}[\\s-]?${F})$`), fam: fam ? fam.join("") : null, giv: new RegExp(`^${G}$`) });
      }
    }
    for (const a of c.aliases ?? []) addForm(fold(a), "alias", c.id);
    // a Chinese name stored as an alias of a Latin-named contact whose surname character romanises to the Latin surname
    // (an English name with a Chinese name of the same family): its surname and given name are forms too
    if (fg && /^[a-z]/.test(fold(fg[0]))) {
      for (const a of c.aliases ?? []) {
        const af = fold(a).replace(/\s+/g, "");
        if (![...af].every(isCjk) || af.length < 2 || af.length > 4) continue;
        const py = pinyinOf(af[0]);
        if (py && py[0] === fold(fg[0]).replace(/[^a-z]/g, "")) { addForm(af[0], "family", c.id); if (af.length >= 3) addForm(af.slice(1), "given", c.id); }
      }
    }
    // Latin-letter words of the name and aliases, for katakana / Chinese renderings of them (R20)
    {
      const words = [c.name, ...(c.aliases ?? [])].flatMap((x) => fold(x).split(/[\s]+/)).filter((w) => /^[a-z][a-z'-]{2,}$/.test(w));
      if (words.length) soundWords.set(c.id, uniqStr(words));
    }
    if (c.company) {
      companyOf.set(c.id, squash(c.company));
      const cores = companyCores(c.company);
      coresOf.set(c.id, cores);
      // a shortened company word that is a time expression on its own (a company named after "today" / "spring") is
      // left to the full company name: alone it is the time word
      for (const w of cores) if (w === squash(c.company) || !isTimeWord(w)) addForm(w, "company", c.id);
      // a Chinese company core in pinyin (each core character romanised, run together)
      for (const w of cores) if ([...w].length >= 2 && [...w].length <= 4 && [...w].every((ch) => isCjk(ch))) { const p = pinyinOf(w); if (p && p.join("").length >= 5) addForm(p.join(""), "company", c.id); }
    }
    if (c.title) roleOf.set(c.id, squash(c.title));
  }
  // r07: a Latin-named contact whose family name is the reading of a kanji family name is called by that kanji too
  // (a Latin name whose family name is a Japanese reading is written with that kanji too): the kanji surname then fits every one of them (R16 / R17 count them all)
  for (const c of contacts) {
    const fam = familyOf.get(c.id);
    if (!fam || !/^[a-z]+$/.test(fam)) continue;
    for (const [k, rs] of kanjiFamRomaji) if (rs.has(fam) && [...k].length >= 2) addForm(k, "family", c.id);
  }
  for (const a of world.aliases) {
    if (a.account !== account) continue;
    if (!contacts.some((c) => c.id === a.contactId)) continue;
    addForm(fold(a.said), "alias", a.contactId);
  }
  const forms = [...formMap.values()].sort((a, b) => b.text.length - a.text.length);
  const placeSet = new Set<string>();
  const placeDisplay = new Map<string, string>();
  const locs = [...world.schedule.filter((s) => s.account === account).map((s) => s.location), ...world.platformEvents.map((e) => e.location), ...world.privateEvents.filter((p) => p.account === account).map((p) => p.location)];
  for (const l of locs) {
    if (!l) continue;
    const f = fold(l).trim();
    if (f.length >= 2 && f.length <= 6 && !/\d/.test(f) && /[\u3400-\u9fff]/u.test(f)) placeSet.add(f.replace(/\s+/g, ""));
    for (const raw of l.split(/[\s\d,，、·・()（）/-]+/)) if (raw) placeDisplay.set(fold(raw).trim(), raw.trim());
    if (f.length >= 2 && f.length <= 6) placeDisplay.set(f.replace(/\s+/g, ""), l.trim().replace(/\s+/g, ""));
    for (const tok of f.split(/[\s\d,，、·・()（）/-]+/)) if (tok.length >= 2 && tok.length <= 8 && /[\u3400-\u9fff]/u.test(tok) && ![...tok].every((c) => /[ぁ-ん]/.test(c))) placeSet.add(tok);
  }
  return {
    // a company's own name is not a place
    ...(() => { const cos = [...companyOf.values()]; for (const p of [...placeSet]) if (cos.some((c) => c.includes(p) || p.includes(c))) placeSet.delete(p); return {}; })(),
    world, account, recs, contacts: contacts.map((c) => recs.get(c.id)!), forms, familyOf, roleOf, companyOf, coresOf, places: [...placeSet], placeDisplay, bareGiven, soundWords, partialLatin, kanaGiven,
    gender: (id) => world.genders?.[id] ?? "unknown",
  };
}

const isTimeWord = (w: string) => parseTime(w, "2000-01-03").spans.some(([a, b]) => a === 0 && b >= w.length);

/** A record the account may see: own account (or a shared platform event), not deleted, not gone. */
export function visible(ix: WorldIx, id: string, gone: readonly string[]): boolean {
  const r = ix.recs.get(id);
  if (!r) return false;
  if (r.account && r.account !== ix.account) return false;
  if (r.deleted) return false;
  return !gone.includes(id);
}

// ---------------------------------------------------------------- person spotting

export interface PersonHit { at: [number, number]; ids: string[]; how: NameForm["how"] | "role"; said: string; specific: boolean; name?: string; sex?: "f" | "m" }

const SINGLE_FAMILY_NEXT = fre(/^(总|さん|様|さま|先生|老师|老板|经理|部长|课长|社长|律师|总监|主管|副总|君|ちゃん|氏|女士|小姐|哥|姐|那|的那|这|呢|啊|嘛|吧|の|は|が|に|と|も|で|を|，|。|？|！|,|\.|\?|!|\s|$)/u);
const SINGLE_FAMILY_TITLE = fre(/^(总|さん|様|さま|先生|老师|老板|经理|部长|课长|社长|律师|总监|主管|副总|君|くん|ちゃん|氏|女士|小姐)/u);
const SINGLE_FAMILY_PREV = /(^|[小老姓给跟和找问是向与对个位的、，。\s:：]|[^㐀-鿿])$/u;

/**
 * The contacts a folded text names. Single-character surnames count only in name position (小X / X总 / Xさん /
 * X的那条), never inside other words (a weekday, a time word). A role word next to a surname narrows it (X律师 → the lawyer).
 */
export function spotPeople(ix: WorldIx, t: string): PersonHit[] {
  const hits: PersonHit[] = [];
  // a word inside a longer time expression (next week / 来月 …) is never a name, whatever the account's names are
  const timeSpans = parseTime(t, "2000-01-03").spans.map(([a, b]) => {
    while (a < b && /\s/.test(t[a])) a++;
    while (b > a && /\s/.test(t[b - 1])) b--;
    // an English time modifier right next to the expression belongs to it (the week after next / next week)
    const after = /^\s+(next|last|this|coming|following)\b/.exec(t.slice(b));
    if (after) b += after[0].length;
    const before = /\b(next|last|this|coming|following)\s+$/.exec(t.slice(0, a));
    if (before) a -= before[0].length;
    return [a, b] as [number, number];
  });
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => !taken.some(([x, y]) => a < y && b > x);
  for (const f of ix.forms) {
    let from = 0;
    for (;;) {
      const i = indexOfTerm(t, f.text, from);
      if (i < 0) break;
      from = i + 1;
      const j = i + f.text.length;
      if (!free(i, j)) continue;
      if (timeSpans.some(([a, b]) => a <= i && j <= b && b - a > j - i)) continue;
      if (/^[぀-ゟ]+$/u.test(f.text) && !kanaNamePosition(t, i, j)) continue;
      if (EN_COMMON.has(f.text) && !latinNamePosition(t, i, j)) continue;
      // r06: a Latin form is never one half of a hyphenated word (the -yuan of a hyphenated given name), except before a
      // romanised title (<name>-san / <name>-bucho)
      if (/^[a-z]/.test(f.text) && !f.text.includes("-") && ((t[i - 1] === "-" && /[a-z]/.test(t[i - 2] ?? "")) || (t[j] === "-" && /[a-z]/.test(t[j + 1] ?? "") && !LATIN_HONORIFIC_AFTER.test(t.slice(j)) && !startsWithRole(t.slice(j))))) continue;
      // a romanised surname that is short or also an ordinary word (Xu / Li / Long / He): only with a title or an
      // honorific next to it; any other short surname only in name position
      if (f.how === "family" && /^[a-z]/.test(f.text)) {
        if ((EN_COMMON.has(f.text) || LATIN_WORDS.includes(f.text)) && !titledLatin(t, i, j)) continue;
        if (f.text.length < 4 && !latinNamePosition(t, i, j)) continue;
      }
      if (f.how === "given" && ix.bareGiven.has(f.text) && !givenNamePosition(t, i, j)) continue;
      // a Chinese name that is also an ordinary word (an adjective / noun like 高兴 / 平安) after a degree adverb is the word
      if ((f.how === "full" || f.how === "given") && [...f.text].length === 2 && [...f.text].every(isCjk) && /(很|太|非常|真|挺|特别|比较|更|最|不|没|多么|十分|有点|有些)$/u.test(t.slice(Math.max(0, i - 2), i))) continue;
      if (f.how === "family" || (f.how === "company" && [...f.text].length <= 2)) {
        const single = [...f.text].length === 1;
        const prevCh = t.slice(Math.max(0, i - 1), i);
        const strongPrev = /[小老姓给跟和找问向对约催]/u.test(prevCh);
        // a one-character surname that is really part of a time word (次の週 / 来周 / 每周 / 一周)
        if (single && fre(/[の次来今先下这本上每一两几再]/u).test(prevCh) && !fre(/^(总|さん|様|先生|老师|经理|部长|课长|社长|律师|氏)/u).test(t.slice(j))) continue;
        if (single && !strongPrev && ((!SINGLE_FAMILY_NEXT.test(t.slice(j)) && !startsWithRole(t.slice(j))) || !SINGLE_FAMILY_PREV.test(t.slice(0, i)))) continue;
        // a lone character after kana, or before a Japanese case particle, is a word of the sentence (見る方は / 、何を)
        // unless a title follows it
        if (single && (/[぀-ゟ]$/u.test(prevCh) || (i > 0 && /^[をのがにでへ]/u.test(t.slice(j)))) && !SINGLE_FAMILY_TITLE.test(t.slice(j)) && !startsWithRole(t.slice(j))) continue;
        // the Japanese question word before kana (何を / 何の件) is never a surname
        if (single && /^[何誰]$/u.test(f.text) && /^[぀-ゟ]/u.test(t.slice(j)) && !SINGLE_FAMILY_TITLE.test(t.slice(j))) continue;
        if (single && /^(周|星期)/.test(f.text) && /^[一二三四五六日天末]/.test(t.slice(j))) continue;
      }
      if (f.how === "company" && /^[㐀-鿿]/.test(f.text) && [...f.text].length === 2) {
        // a two-character company word followed by more CJK of a different word is still fine (<company>那个); nothing more to check
      }
      let ids = [...f.ids];
      let end = j;
      let how: PersonHit["how"] = f.how;
      if (f.how === "family" || f.how === "given") {
        // a role / honorific right after the name narrows the family (X律师 / X部長 / X经理)
        const after = t.slice(j, j + 8);
        const role = roleNarrow(ix, ids, after);
        if (role) { const narrowed = role.ids.length < ids.length; ids = role.ids; end = j + role.len; if (narrowed && f.how === "family") how = "family"; }
      }
      // a romanised name also fits the Chinese names whose spelling this table cannot produce but that agree with it
      if (/^[a-z]/.test(f.text) && ix.partialLatin.length) {
        for (const pl of ix.partialLatin) {
          if (ids.includes(pl.id)) continue;
          if ((f.how === "full" && pl.re.test(f.text)) || (f.how === "family" && pl.fam === f.text) || (f.how === "given" && pl.giv.test(f.text))) ids.push(pl.id);
        }
      }
      taken.push([i, end]);
      hits.push({ at: [i, end], ids, how, said: t.slice(i, end), specific: ids.length === 1, name: t.slice(i, j), sex: titleSex(t, i, j) });
    }
  }
  // a Latin-letter name written in katakana (ジョージ / トム) or in Chinese transliteration characters: by sound (R20),
  // only in name position, only for runs that no other form explained
  // a kana given name written in kanji (R20: 美奈子 for みなこ), only right before an honorific or as the whole reply
  if (ix.kanaGiven.size) {
    // r07: or right before a person pointer (<kanji given name>那个 / <kanji given name>の方)
    for (const m of t.matchAll(/[㐀-鿿]{2,3}(?=(さん|さま|様|ちゃん|くん|氏)|(那个|那位|这位|的那|那边|の方|のほう)|\s*$)/gu)) {
      const run = m[0], a = m.index!, b = a + run.length;
      if (!free(a, b) || (!m[1] && !m[2] && t.trim() !== run)) continue;
      // r06: a kanji right before the run is a family name: it must be this contact's own (山田<given>さん is not 森 <given>)
      const prevCjk = a > 0 && isCjk(t[a - 1]);
      const ids = [...ix.kanaGiven].filter(([id, k]) => kanjiReadsAs(run, k) && (!prevCjk || t.slice(0, a).endsWith(ix.familyOf.get(id) ?? "\u0000"))).map(([id]) => id);
      if (!ids.length) continue;
      taken.push([a, b]);
      hits.push({ at: [a, b], ids, how: "given", said: run, specific: ids.length === 1, name: run, sex: titleSex(t, a, b) });
    }
  }
  for (const run of nameRuns(t)) {
    if (!free(run.at[0], run.at[1])) continue;
    const ids: string[] = [];
    for (const [id, words] of ix.soundWords) if (words.some((w) => (run.kana ? kanaSoundsLike(run.text, w, !!run.hon) : translitSoundsLike(run.py!, w)))) ids.push(id);
    if (!ids.length) continue;
    const [a, b] = run.at;
    taken.push([a, b]);
    hits.push({ at: [a, b], ids, how: "alias", said: t.slice(a, b), specific: ids.length === 1, name: t.slice(a, b), sex: titleSex(t, a, b) });
  }
  // a role word alone (律师那条 / 课长のほう) — kept as a weak hit
  for (const [words, roles] of ROLE_SYNONYMS) {
    for (const w of words) {
      const i = indexOfTerm(t, w);
      if (i < 0 || !free(i, i + w.length)) continue;
      const ids = ix.contacts.filter((c) => roles.some((r) => ix.roleOf.get(c.id)?.includes(r))).map((c) => c.id);
      if (!ids.length) continue;
      taken.push([i, i + w.length]);
      hits.push({ at: [i, i + w.length], ids, how: "role", said: w, specific: ids.length === 1 });
    }
  }
  return hits.sort((a, b) => a.at[0] - b.at[0]);
}

const KANA_HONORIFIC = fre(/^(さん|さま|様|ちゃん|くん|君|氏|先生)/u);
/**
 * A name written in kana (a reading, or a name spelled in kana) is a name only in name position: right before an
 * honorific, or standing as its own kana word (no kana right before it, and after it no kana or a single particle).
 * A short one (two kana) needs the honorific. Inside a longer kana run it is just a word (katakana loanwords fold onto
 * hiragana, so they are kana runs too).
 */
function kanaNamePosition(t: string, i: number, j: number): boolean {
  if (KANA_HONORIFIC.test(t.slice(j)) || startsWithRole(t.slice(j))) return true;
  if (j - i <= 2) return false;
  if (/[぀-ゟー]/u.test(t.slice(i - 1, i))) return false;
  const after = t.slice(j, j + 2);
  return !/^[぀-ゟー]/u.test(after) || /^[のはがにとをもへ](?![぀-ゟー])/u.test(after);
}

/**
 * A Latin name form that is also an everyday English word (will / mark / next / grace …) is a name only in name
 * position: a title or a "with / to / from / ask …" right before it, a possessive, an honorific, a pointer or CJK right
 * after it, or a reply that is little more than the name. Otherwise ("mark it done", "next one") it is the word.
 */
function latinNamePosition(t: string, i: number, j: number): boolean {
  const before = t.slice(0, i), after = t.slice(j);
  if (/\b(mr|ms|mrs|dr|miss|with|to|from|ask|asked|call|called|email|emailed|meet|met|tell|told|for|and|or|about|by|is|was|at|of|cc)\.?\s+$/.test(before)) return true;
  if (/^('s|’s)/.test(after) || /^\s*[㐀-鿿぀-ヿ]/u.test(after) || LATIN_HONORIFIC_AFTER.test(after) || startsWithRole(after.replace(/^\s+/, ""))) return true;
  if (/[㐀-鿿぀-ヿ]\s*$/u.test(before) && /^\s*([,.!?，。！？、]|$)/u.test(after)) return true;
  return t.trim().replace(/[\s,.!?，。！？、]+$/u, "").split(/\s+/).length <= 1;
}

/**
 * A Japanese given name in kanji used alone is often an ordinary word too (a name like 未来 / 青空 is also "future" /
 * "blue sky"): it is a name only with an honorific or title after it, a pointer after it (那条 / の方 / のほう / 的), a
 * verb of contact before it (给 / 跟 / 和 / 找 / 问 …), or as the whole reply.
 */
const GIVEN_AFTER = fre(/^(さん|さま|様|ちゃん|くん|君|氏|先生|老师|那|这|的|の方|のほう|のこと|に|へ|と|から|は|が|も|，|,|。|？|\?|！|!|\s*$)/u);
function givenNamePosition(t: string, i: number, j: number): boolean {
  if (GIVEN_AFTER.test(t.slice(j)) && !/[぀-ゟ]$/u.test(t.slice(Math.max(0, i - 1), i))) return true;
  return /[给跟和找问向对约催与]$/u.test(t.slice(Math.max(0, i - 1), i)) || t.trim() === t.slice(i, j);
}

/** Narrow a set of contacts by a role / honorific at the start of `after` (folded). */
export function roleNarrow(ix: WorldIx, ids: string[], after0: string): { ids: string[]; len: number } | null {
  if (!after0) return null;
  // a romanised title joined by a hyphen or a space (Mori-bucho / Lu san)
  const pad = /^[-\s]+(?=[a-z])/.exec(after0)?.[0].length ?? 0;
  for (const off of pad ? [0, pad] : [0]) {
    const after = after0.slice(off);
    for (const [words, roles] of ROLE_SYNONYMS) {
      for (const w of words) {
        if (!after.startsWith(w) || (/^[a-z]/.test(w) && /^[a-z]/.test(after.slice(w.length)))) continue;
        const keep = ids.filter((id) => roles.some((r) => ix.roleOf.get(id)?.includes(r)));
        if (keep.length && keep.length < ids.length) return { ids: keep, len: off + w.length };
        if (keep.length === ids.length) return { ids, len: off + w.length };
      }
    }
    for (const h of HONORIFICS) if (after.startsWith(h) && !(/^[a-z]/.test(h) && /^[a-z]/.test(after.slice(h.length)))) return { ids, len: off + h.length };
  }
  return null;
}

/** Does the text start with a role word (律师 / 部長 / bucho), possibly after a hyphen or a space for a Latin one? */
export function startsWithRole(after: string): boolean {
  const a = after.replace(/^[-\s]+(?=[a-z])/, "");
  return ROLE_SYNONYMS.some(([ws]) => ws.some((w) => (/^[a-z]/.test(w) ? new RegExp(`^${escapeRe(w)}(?![a-z])`).test(a) : a.startsWith(w))));
}

/** Romanised honorifics (Japanese -san / -sama …) after a Latin-letter name. */
const LATIN_HONORIFIC_AFTER = /^[-\s]?(san|sama|sensei|kun|chan|shi)(?![a-z])/;
const TITLE_BEFORE = /\b(mr|mrs|ms|miss|mister|madam|madame|dr|prof)\.?\s*$/;
const CJK_HONORIFIC_AFTER = fre(/^\s*(さん|さま|様|先生|老师|老板|总|君|くん|ちゃん|氏|女士|小姐|太太|夫人)/u);

/** A Latin-letter surname with a title before it or an honorific / role right after it (Mr. Lu / Luさん / Lu 先生 / Mori-san). */
function titledLatin(t: string, i: number, j: number): boolean {
  const before = t.slice(0, i), after = t.slice(j);
  return TITLE_BEFORE.test(before) || LATIN_HONORIFIC_AFTER.test(after) || CJK_HONORIFIC_AFTER.test(after) || startsWithRole(after.replace(/^\s+/, ""));
}

/**
 * The gender a title next to a name states (R17): Mr. / Chinese 先生 male, Ms. / Mrs. / Miss / 女士 / 小姐 female. In a
 * Japanese sentence (any kana) 先生 is a teacher / doctor / lawyer and says nothing; さん / 様 / 老师 never do.
 */
export function titleSex(t: string, i: number, j: number): "f" | "m" | undefined {
  const before = t.slice(Math.max(0, i - 10), i), after = t.slice(j, j + 4);
  if (/\b(mr|mister|sir)\.?\s*$/.test(before)) return "m";
  if (/\b(mrs|ms|miss|madam|madame)\.?\s*$/.test(before)) return "f";
  if (/^\s*(女士|小姐|太太|夫人)/u.test(after)) return "f";
  if (/^\s*先生/u.test(after) && !/[぀-ゟ]/u.test(t)) return "m";
  return undefined;
}

/** Runs of a text that may be a Latin-letter name written in katakana or in Chinese transliteration characters. */
function nameRuns(t: string): { at: [number, number]; text: string; kana: boolean; py?: string; hon?: boolean }[] {
  const out: { at: [number, number]; text: string; kana: boolean; py?: string; hon?: boolean }[] = [];
  const mask = katakanaMask(t);
  // kana: a katakana word (when the script is known), or any kana word right before an honorific
  for (const m of t.matchAll(/[ぁ-ゖー]{2,}/gu)) {
    const a0 = m.index!, run = m[0];
    // the honorific / particle tail of the run, and particles that start it (の / と …) are not the name
    let s = 0;
    const starts = [0, ...[...run].map((ch, k) => (/[のとにはがをもへ]/u.test(ch) ? k + 1 : -1)).filter((k) => k > 0)];
    for (s of starts) {
      for (let e = run.length; e >= s + 2; e--) {
        const word = run.slice(s, e), tail = run.slice(e);
        // an honorific ends the kana word: written in hiragana (not the start of a katakana word) and followed by no
        // more of the same word
        const hm = /^(さん|さま|くん|ちゃん)/u.exec(tail);
        const honKata = !!hm && (!mask || [...Array(hm[0].length).keys()].some((k) => mask[a0 + e + k] === "1"));
        const honEnd = !!hm && (!tail.slice(hm[0].length) || /^[のとにはがをもへでやっ]/u.test(tail.slice(hm[0].length)));
        const hon = (!!hm && !!mask && !honKata && honEnd) || (!!hm && !mask && honEnd) || (!tail && fre(/^(様|氏|先生)/u).test(t.slice(a0 + e)));
        const kata = !!mask && [...Array(word.length).keys()].every((k) => mask[a0 + s + k] === "1");
        if (!hon && !(kata && (!tail || /^[のとにはがをもへでや]/u.test(tail)) && (s === 0 || /[のとにはがをもへ]/u.test(run[s - 1])))) continue;
        if (kata && mask && (mask[a0 + s - 1] === "1" || mask[a0 + e] === "1")) continue;   // inside a longer katakana word
        if (KANA_STOP.has(word)) continue;
        out.push({ at: [a0 + s, a0 + e], text: word, kana: true, hon });
        break;
      }
    }
  }
  // Chinese transliteration characters: a maximal run of 2–4, after a verb / preposition of contact or at the start
  for (const m of t.matchAll(/[㐀-鿿]+/gu)) {
    const cs = [...m[0]];
    let k = 0;
    while (k < cs.length) {
      if (!isTranslitChar(cs[k])) { k++; continue; }
      let e = k;
      while (e < cs.length && isTranslitChar(cs[e])) e++;
      const len = e - k;
      const a = m.index! + k, b = m.index! + e;
      const prev = t.slice(Math.max(0, a - 1), a);
      const okPrev = !prev || /[给跟和找问向对约催与同让叫请\s，,。、：:]/u.test(prev) || /[a-z]/.test(prev);
      const okNext = fre(/^(先生|女士|小姐|那|这|的|说|打|发|聊|见|$|[，,。！？?!\s])/u).test(t.slice(b));
      if (len >= 2 && len <= 4 && (okPrev || okNext) && (okPrev || k === 0)) {
        const py = translitPinyin(cs.slice(k, e).join(""));
        if (py) out.push({ at: [a, b], text: cs.slice(k, e).join(""), kana: false, py });
      }
      k = e;
    }
  }
  return out;
}
const KANA_STOP = new Set(F2(["タスク", "メモ", "ノート", "イベント", "メール", "スケジュール", "カレンダー", "リスト", "セミナー", "フォーラム", "サンプル", "レポート", "テスト", "ミーティング", "ランチ", "ディナー", "ゴルフ", "ホテル", "オフィス", "チーム", "プロジェクト", "リマインド", "コンサート", "ワークショップ", "デザイン", "データ", "ファイル", "これ", "それ", "あれ", "どれ", "ここ", "そこ", "あそこ", "こと", "もの", "とき", "ところ", "ため", "よう", "ほう"]));
function F2(xs: string[]) { return xs.map(fold); }

/** People of a text: the hits merged — a company word next to a surname intersects (<company>那个<surname> → one person). */
const PEOPLE_CACHE = new WeakMap<WorldIx, Map<string, ReturnType<typeof peopleOfRaw>>>();
export function peopleOf(ix: WorldIx, t: string) {
  let m = PEOPLE_CACHE.get(ix);
  if (!m) { m = new Map(); PEOPLE_CACHE.set(ix, m); }
  let r = m.get(t);
  if (!r) { r = peopleOfRaw(ix, t); m.set(t, r); }
  return r;
}
export interface PersonGroup { ids: string[]; at: [number, number]; named: boolean }
function peopleOfRaw(ix: WorldIx, t: string): { specific: string[]; ambiguous: string[][]; hits: PersonHit[]; groups: PersonGroup[]; named: string[] } {
  const hits = spotPeople(ix, t);
  const groups: PersonGroup[] = [];
  const used = new Set<number>();
  for (let a = 0; a < hits.length; a++) {
    if (used.has(a)) continue;
    let ids = hits[a].ids;
    let at: [number, number] = [...hits[a].at];
    let named = hits[a].how !== "company" && hits[a].how !== "role";
    for (let b = a + 1; b < hits.length; b++) {
      if (used.has(b)) continue;
      // r07: not across a clause break or a contrast when the later side names its own person (不是<title>，是<company>的<name>:
      // the title and the name are different people); an elliptical later side still narrows (不是这个林，是<company>那个)
      const broken = /[，,、。；;！!？?]|不是|而是|じゃなく|ではなく|\bnot\b|\bbut\b/u.test(t.slice(at[1], Math.max(at[1], hits[b].at[0])));
      const ownName = hits.slice(b).some((x) => x.how !== "company" && x.how !== "role");
      const near = hits[b].at[0] - at[1] <= 6 && !(broken && ownName);
      const inter = ids.filter((x) => hits[b].ids.includes(x));
      if (near && inter.length && (inter.length < ids.length || inter.length < hits[b].ids.length || inter.length === ids.length)) {
        ids = inter; used.add(b); at = [at[0], hits[b].at[1]];
        named = named || (hits[b].how !== "company" && hits[b].how !== "role");
      }
    }
    groups.push({ ids, at, named });
  }
  const specific = [...new Set(groups.filter((g) => g.ids.length === 1).map((g) => g.ids[0]))];
  const ambiguous = groups.filter((g) => g.ids.length > 1 && !g.ids.some((x) => specific.includes(x))).map((g) => g.ids);
  const negated = (g: PersonGroup) => fre(/^(さん|様|先生|啦|呀|的|那个|那位|の方|のほう)?\s*(じゃなく|ではなく|じゃない|ではない)/u).test(t.slice(g.at[1], g.at[1] + 10))
    || /(不是|并非|不要|not|isn't|不是这个)\s*$/u.test(t.slice(Math.max(0, g.at[0] - 5), g.at[0]))
    || /^\s*(啦|了)?\s*[，,]?\s*(不是|而是)/u.test("") ;
  const named = [...new Set(groups.filter((g) => g.ids.length === 1 && g.named && !negated(g)).map((g) => g.ids[0]))];
  return { specific, ambiguous, hits, groups, named };
}

export { containsTerm };
