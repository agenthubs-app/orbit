// @ts-nocheck -- conversation/impl/concepts.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/rsi/archive/r09-maintenance/impl/concepts.ts
// (lab commit 567915f70, r09 = r08 + reference spans stop at function words). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * Cross-language matching helpers (general vocabulary, nothing of this world):
 *   - CONCEPTS: common business / office nouns in zh / ja / en, each group one concept, so a reply in one language can
 *     meet an option or a record written in another (a Japanese reply naming a Chinese-titled report);
 *   - sound skeletons: a katakana word and a Latin word that sound alike reduce to the same consonant skeleton, so a
 *     name written in katakana can meet the Latin name of a contact or company.
 * Everything is compared after fold() (simplified Chinese, hiragana, lower case).
 */
import { containsTerm, fold, squash } from "./text";

const GROUPS: string[][] = [
  ["报告", "報告", "报告书", "レポート", "report"],
  // r07: everyday event / meal words
  ["葡萄酒", "红酒", "ワイン", "wine"],
  ["交流会", "懇親会", "networking", "mixer"],
  ["午餐", "午饭", "ランチ", "昼食", "lunch"],
  ["晚餐", "晚饭", "ディナー", "夕食", "dinner"],
  ["审计", "監査", "审核", "audit"],
  ["报价", "見積", "見積もり", "見積書", "报价单", "quote", "quotation", "estimate"],
  ["运费", "運賃", "海运", "海运费", "船便", "送料", "运输", "輸送", "freight", "shipping"],
  ["调研", "调查", "調査", "リサーチ", "市场调查", "市場調査", "research", "survey"],
  ["纪要", "議事録", "会議録", "minutes"],
  ["合同", "契約", "契约", "契約書", "contract", "agreement"],
  ["发票", "請求書", "インボイス", "invoice", "billing"],
  ["样品", "サンプル", "样本", "sample", "samples"],
  ["测试", "テスト", "試験", "检测", "test", "testing"],
  ["仓库", "倉庫", "warehouse"],
  ["物流", "ロジスティクス", "logistics"],
  ["销售", "営業", "セールス", "sales"],
  ["采购", "購買", "調達", "purchasing", "procurement", "buyer"],
  ["质量", "品質", "品质", "クオリティ", "quality"],
  ["律师", "弁護士", "法律", "法務", "lawyer", "legal", "attorney"],
  ["设计", "デザイン", "design", "designer"],
  ["市场", "マーケティング", "marketing"],
  ["价格", "価格", "料金", "定价", "pricing", "price"],
  ["酒店", "ホテル", "宾馆", "hotel"],
  ["晚饭", "晚餐", "吃饭", "饭局", "会食", "夕食", "ディナー", "dinner"],
  ["午饭", "午餐", "ランチ", "昼食", "lunch"],
  ["高尔夫", "ゴルフ", "golf"],
  ["牙医", "看牙", "歯科", "dentist", "dental"],
  ["体检", "健診", "checkup", "medical"],
  ["音乐会", "演唱会", "コンサート", "ライブ", "concert"],
  ["研讨会", "セミナー", "讲座", "seminar", "workshop"],
  ["展会", "展示会", "展览", "博览会", "見本市", "expo", "exhibition", "tradeshow"],
  ["出席记录", "出席記録", "参加记录", "参加記録", "attendance"],
  ["周报", "週報", "weeklyreport"],
  ["税", "税金", "税务", "税務", "tax"],
  ["提案", "方案", "企画", "proposal", "pitch"],
  ["反馈", "フィードバック", "意见", "feedback"],
  ["邮件", "メール", "email", "mail"],
  ["电话", "電話", "通话", "コール", "call", "phone"],
  ["交货", "納品", "配送", "发货", "出荷", "delivery", "shipment"],
  ["付款", "支払い", "支払", "入金", "汇款", "振込", "payment"],
  ["预算", "予算", "budget"],
  ["招聘", "採用", "hiring", "recruiting"],
  ["培训", "研修", "training"],
  ["面试", "面接", "interview"],
  ["拜访", "訪問", "上门", "visit"],
  ["工厂", "工場", "factory", "plant"],
  ["投资", "投資", "investment", "investor"],
  ["银行", "銀行", "bank"],
  ["公关", "広報", "publicrelations"],
  ["仓储", "保管", "storage"],
  ["展位", "ブース", "booth"],
  ["签约", "調印", "signing"],
  ["机场", "空港", "airport"],
  ["生日", "誕生日", "birthday"],
  ["礼物", "プレゼント", "ギフト", "gift"],
  ["名单", "リスト", "清单", "list"],
  ["规格", "仕様", "スペック", "spec", "specs", "specification"],
  ["演示", "デモ", "demo"],
  ["复盘", "振り返り", "review", "retro"],
];

interface Form { text: string; latin: boolean }
const CONCEPTS: Form[][] = GROUPS.map((g) => g.map((w) => { const f = fold(w); return { text: /^[a-z0-9 ]+$/.test(f) ? f : squash(w), latin: /^[a-z0-9 ]+$/.test(f) }; }));

/** The concepts (group indexes) a text names. `folded` keeps spaces (Latin words by boundary); `squashed` may be a record's text. */
export function conceptsOf(folded: string, squashed = folded.replace(/\s+/g, "")): Set<number> {
  const out = new Set<number>();
  CONCEPTS.forEach((forms, i) => {
    for (const f of forms) {
      if (f.latin ? (containsTerm(folded, f.text) || (f.text.length >= 5 && squashed.includes(f.text))) : squashed.includes(f.text)) { out.add(i); return; }
    }
  });
  return out;
}

// ---------------------------------------------------------------- sound skeletons (katakana ↔ Latin)

/** Consonant class of each hiragana mora (katakana is folded to hiragana before this). */
const KANA_C: Record<string, string> = {};
const ROWS: [string, string][] = [
  ["かきくけこがぎぐげご", "K"], ["さしすせそざじずぜぞ", "S"], ["たちつてとだぢづでど", "T"], ["なにぬねの", "N"],
  ["はひふへほ", "H"], ["ばびぶべぼぱぴぷぺぽゔ", "B"], ["まみむめも", "M"], ["らりるれろ", "R"], ["ん", "N"],
];
for (const [cs, c] of ROWS) for (const ch of cs) KANA_C[ch] = c;

/** The consonant skeleton of a hiragana word (vowels, long marks, small kana and y / w moras dropped; repeats collapsed). */
export function kanaSkeleton(h: string): string {
  let out = "";
  for (const ch of h) { const c = KANA_C[ch]; if (c && !out.endsWith(c)) out += c; }
  return out;
}

/** The consonant skeleton of a Latin word, as a Japanese rendering would keep it (a vowel-final mora per consonant: "-er" before a consonant is silent, l = r, v = b). */
export function latinSkeleton(w: string): string {
  let s = fold(w).replace(/[^a-z]/g, "");
  s = s.replace(/ck/g, "k").replace(/ch/g, "t").replace(/sh/g, "s").replace(/th/g, "s").replace(/ph/g, "f").replace(/qu/g, "k").replace(/x/g, "ks")
    .replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/([aeiou])r(?![aeiou])/g, "$1");
  const cls: Record<string, string> = { k: "K", g: "K", q: "K", s: "S", z: "S", j: "S", t: "T", d: "T", n: "N", h: "H", f: "H", b: "B", v: "B", p: "B", m: "M", r: "R", l: "R" };
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "h" && i > 0 && !"aeiou".includes(s[i - 1])) continue;
    const c = cls[ch];
    if (c && !out.endsWith(c)) out += c;
  }
  return out;
}

/** The kana words (≥ 2 moras) of a folded text. */
export function kanaWords(folded: string): string[] {
  const strip = (w: string) => { let x = w, y = ""; while (x !== y) { y = x; x = x.replace(/(さん|さま|くん|ちゃん|のほう|ほう|です|でした|で|の|は|が|を|に|と|も)$/u, ""); } return x; };
  return (folded.match(/[ぁ-ゖー]{2,}/gu) ?? []).map(strip).filter((w) => w.length >= 2);
}

/** The concepts a reply names, each with the surface form found (for a negation check next to it). */
export function conceptHits(folded: string, squashed = folded.replace(/\s+/g, "")): Map<number, string> {
  const out = new Map<number, string>();
  CONCEPTS.forEach((forms, i) => {
    for (const f of forms) {
      if (f.latin ? containsTerm(folded, f.text) : squashed.includes(f.text)) { out.set(i, f.text); return; }
    }
  });
  return out;
}

// ---------------------------------------------------------------- kana → romaji (Hepburn), for Latin spellings of kana readings

const MORA: Record<string, string> = {};
const BASE = "あいうえお|かきくけこ|さしすせそ|たちつてと|なにぬねの|はひふへほ|まみむめも|やゆよ|らりるれろ|わを|がぎぐげご|ざじずぜぞ|だぢづでど|ばびぶべぼ|ぱぴぷぺぽ".split("|");
const ROM = ["a i u e o", "ka ki ku ke ko", "sa shi su se so", "ta chi tsu te to", "na ni nu ne no", "ha hi fu he ho", "ma mi mu me mo", "ya yu yo", "ra ri ru re ro", "wa o", "ga gi gu ge go", "za ji zu ze zo", "da ji zu de do", "ba bi bu be bo", "pa pi pu pe po"].map((r) => r.split(" "));
BASE.forEach((row, i) => [...row].forEach((ch, j) => { MORA[ch] = ROM[i][j]; }));
MORA["ん"] = "n";
const SMALL: Record<string, string> = { ゃ: "a", ゅ: "u", ょ: "o" };

/** Hepburn romaji of a hiragana string, with long vowels shortened (さくら → sakura, ちゃわん → chawan, とうふ → tofu). */
export function romaji(h: string): string {
  let out = "";
  const cs = [...h];
  for (let i = 0; i < cs.length; i++) {
    const ch = cs[i];
    if (ch === "っ") { const nx = MORA[cs[i + 1]]; if (nx) out += nx[0]; continue; }
    if (ch === "ー") continue;
    const sm = SMALL[cs[i + 1]];
    let r = MORA[ch];
    if (r === undefined) { out += /[a-z]/.test(ch) ? ch : ""; continue; }
    if (sm) { r = /^(shi|chi|ji)$/.test(r) ? r.slice(0, -1) + sm : r.slice(0, -1) + "y" + sm; i++; }
    out += r;
  }
  return out.replace(/ou/g, "o").replace(/oo/g, "o").replace(/uu/g, "u").replace(/aa/g, "a").replace(/ii/g, "i");
}

/**
 * r06: the concepts that describe what a person does or where they work (a department, an occupation, an industry) —
 * the only ones that may tell two people of the same name apart by their stored title / company / industry. Things one
 * does with anyone (a call, an email, a quote, a report, a visit, a meal …) say nothing about who the person is.
 */
const FIELD_HEADS = ["仓库", "物流", "销售", "采购", "质量", "律师", "设计", "市场", "税", "招聘", "工厂", "投资", "银行", "公关", "仓储"].map((w) => squash(w));
export const FIELD_CONCEPTS = new Set<number>(GROUPS.map((g, i) => (FIELD_HEADS.includes(squash(g[0])) ? i : -1)).filter((i) => i >= 0));
