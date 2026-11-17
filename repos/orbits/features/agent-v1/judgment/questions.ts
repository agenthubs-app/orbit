/**
 * The judgment questions of 设计稿附录 C (agent-design AG08): a fixed id, a type, its options, the conservative
 * result of §3.8's table and the wording, versioned. Code builds every request from here; a model never names
 * a question or an option.
 *
 * Types on the wire (gemini-decision.ts): 评级 → `score` with the levels lowest first, 选择 → `choice`, 是非 → `noul`.
 * `conservative` is what a below-threshold, timed-out, unavailable or not enabled answer becomes. It may be a
 * value that is not an option (followup.owner's "doubtful": listed read-only and marked as such).
 */
import type { DecisionQuestionType } from "./gemini-decision";

export type JudgmentLanguage = "zh" | "ja" | "en";

export const QUESTION_IDS = [
  "match.level",
  "quote.sentence",
  "evidence.sameEntity",
  "evidence.sameTime",
  "evidence.sameBasis",
  "evidence.supports",
  "interaction.happened",
  "followup.owner",
  "duplicate.same",
  "outbound.extra",
  "intent.explicitWrite",
] as const;
export type JudgmentQuestionId = (typeof QUESTION_IDS)[number];

export interface JudgmentQuestion {
  id: JudgmentQuestionId;
  type: DecisionQuestionType;
  /** The answers code works with: levels lowest first (score), options (choice), ["yes", "no"] (noul). */
  options: readonly string[];
  conservative: string;
  /** The wording's version; a change of wording is a new version and needs a new calibration. */
  version: string;
  /** What §3.8 uses it for. */
  usedIn: string;
  /** The sprint that calibrates and enables it, when not this one. */
  enabledBy?: "AG09" | "AG10";
  /** The instruction for one item (`subject` names it: a candidate key, a sentence, the message). */
  instructions(language: JudgmentLanguage, subject: string): string;
  /** score: the level labels as sent; choice: option → description. */
  criteria?(language: JudgmentLanguage): Record<string, string> | readonly string[];
}

const by = (zh: string, ja: string, en: string) => (language: JudgmentLanguage) => (language === "zh" ? zh : language === "ja" ? ja : en);
const fill = (template: string, subject: string) => template.split("{x}").join(subject);

export const QUESTIONS: Record<JudgmentQuestionId, JudgmentQuestion> = {
  "match.level": {
    conservative: "insufficient",
    criteria: (language) => [
      by("证据不足：候选的记录里看不出与排序依据有关", "根拠不足：候補の記録から並べ替えの基準との関係が読み取れない", "insufficient: nothing in the candidate's record relates to the ranking basis")(language),
      by("部分匹配：记录里有相关的内容，但不完全对口", "一部一致：記録に関連する内容はあるが、完全には合っていない", "partial: the record has something related, but not a full fit")(language),
      by("匹配：记录直接表明候选对口", "一致：記録が候補の適合を直接示している", "match: the record directly shows the candidate fits")(language),
    ],
    id: "match.level",
    instructions: (language, subject) => fill(by("只依据输入里候选 {x} 的记录，判断它与排序依据的匹配程度。", "入力にある候補 {x} の記録だけに基づき、並べ替えの基準との一致の程度を判断してください。", "Using only candidate {x}'s record in the input, rate how well it fits the ranking basis.")(language), subject),
    options: ["insufficient", "partial", "match"],
    type: "score",
    usedIn: "候选匹配（§3.5 排序、§5.3 定时任务）",
    version: "match.level@1",
  },
  "quote.sentence": {
    conservative: "none",
    id: "quote.sentence",
    instructions: (language, subject) => fill(by("输入里哪一句支持这个判断：{x}", "入力のどの文がこの判断を支えていますか：{x}", "Which sentence of the input supports this judgment: {x}")(language), subject),
    options: ["none"],
    type: "choice",
    usedIn: "取回支持判断的原句",
    version: "quote.sentence@1",
  },
  "evidence.sameEntity": {
    conservative: "no",
    id: "evidence.sameEntity",
    instructions: (language, subject) => fill(by("这段原文说的是不是结论里的同一个人或同一件事：{x}", "この原文は結論と同じ人・同じ事柄について述べていますか：{x}", "Is the source text about the same person or thing as the claim: {x}")(language), subject),
    options: ["yes", "no"],
    type: "noul",
    usedIn: "证据是否支持（§3.4）",
    version: "evidence.sameEntity@1",
  },
  "evidence.sameTime": {
    conservative: "no",
    id: "evidence.sameTime",
    instructions: (language, subject) => fill(by("这段原文说的是不是结论里的同一时间：{x}", "この原文は結論と同じ時期について述べていますか：{x}", "Is the source text about the same time as the claim: {x}")(language), subject),
    options: ["yes", "no"],
    type: "noul",
    usedIn: "证据是否支持（§3.4）",
    version: "evidence.sameTime@1",
  },
  "evidence.sameBasis": {
    conservative: "no",
    id: "evidence.sameBasis",
    instructions: (language, subject) => fill(by("这段原文与结论是不是同一口径（同一种价格、同一种计数）：{x}", "この原文と結論は同じ基準（同じ種類の価格・数え方）ですか：{x}", "Do the source text and the claim use the same basis (the same kind of price or count): {x}")(language), subject),
    options: ["yes", "no"],
    type: "noul",
    usedIn: "证据是否支持（§3.4）",
    version: "evidence.sameBasis@1",
  },
  "evidence.supports": {
    conservative: "no",
    id: "evidence.supports",
    instructions: (language, subject) => fill(by("这段原文是否支持这条结论：{x}", "この原文はこの結論を裏付けていますか：{x}", "Does the source text support this claim: {x}")(language), subject),
    options: ["yes", "no"],
    type: "noul",
    usedIn: "证据是否支持（§3.4）",
    version: "evidence.supports@1",
  },
  "interaction.happened": {
    conservative: "no",
    enabledBy: "AG10",
    id: "interaction.happened",
    instructions: (language, subject) => fill(by("这一条是不是作者本人与该联系人之间已经发生的往来：{x}", "これは筆者本人とその連絡先との間で実際にあったやり取りですか：{x}", "Is this an interaction that already happened between the author and this contact: {x}")(language), subject),
    options: ["yes", "no"],
    type: "noul",
    usedIn: "提取复核（§3.5）",
    version: "interaction.happened@1",
  },
  "followup.owner": {
    conservative: "doubtful",
    criteria: (language) => ({
      me: by("本人承诺", "本人の約束", "the author's own commitment")(language),
      other: by("对方承诺", "相手の約束", "the other person's commitment")(language),
      suggestion: by("仅供考虑", "検討事項にすぎない", "only a suggestion to consider")(language),
    }),
    enabledBy: "AG10",
    id: "followup.owner",
    instructions: (language, subject) => fill(by("这项承诺属于谁：{x}", "この約束は誰のものですか：{x}", "Whose commitment is this: {x}")(language), subject),
    options: ["me", "other", "suggestion"],
    type: "choice",
    usedIn: "提取复核（§3.5）",
    version: "followup.owner@1",
  },
  "duplicate.same": {
    conservative: "unsure",
    criteria: (language) => ({
      different: by("不同：说的是另一次、另一件事", "別：別の機会・別の事柄について", "different: another occasion or another matter")(language),
      same: by("同一件事：两条说的是同一次、同一件事", "同じ：二つは同じ機会・同じ事柄について", "same: both are about the same occasion or matter")(language),
      unsure: by("说不准：凭记录分不清", "判断できない：記録からは区別できない", "unsure: the records do not tell")(language),
    }),
    id: "duplicate.same",
    instructions: (language, subject) => fill(by("新记的这一条与已有记录 {x} 是不是同一件事。", "新しく記録するものと既存の記録 {x} は同じ事柄ですか。", "Is the new entry about the same thing as the existing record {x}?")(language), subject),
    options: ["same", "different", "unsure"],
    type: "choice",
    usedIn: "重复判断（§3.2、§3.5、§6）",
    version: "duplicate.same@1",
  },
  "outbound.extra": {
    conservative: "yes",
    enabledBy: "AG09",
    id: "outbound.extra",
    // AG09:  names what may be in a query and what may not;  was read too broadly (a clean query was judged "yes" when the
    // message also asked about the user's notes). A new wording is a new version and was calibrated again (judgment-thresholds-v2.md).
    instructions: (language, subject) => fill(by(
      "检索词：{x}。除了要查的公开名称（公司、产品、机构或公众人物的名字）和要查的项目（如官网、价格、现任、职务、代表作、简介、新闻）之外，这条检索词里还有没有别的词——例如关于用户或他人的私事、健康、家庭、钱款、打算、谈判条件、内部消息或评价？",
      "検索語：{x}。調べる公開の名前（会社・製品・組織・公人の名前）と調べる項目（公式サイト、料金、現在、役職、代表作、プロフィール、ニュースなど）以外に、この検索語にほかの言葉が入っていますか。たとえばユーザーや他人の私事、健康、家族、お金、予定や意図、交渉条件、内部情報、評価などです。",
      "Search query: {x}. Besides the public name to look up (a company, product, organization or public person) and what to look up about it (such as official site, pricing, current, role, works, profile, news), does this query contain any other words — for example about the user's or another person's private matters, health, family, money, plans, negotiating terms, internal information or opinions?",
    )(language), subject),
    options: ["yes", "no"],
    type: "noul",
    usedIn: "出站把关的第二道闸（§3.4）",
    version: "outbound.extra@2",
  },
  "intent.explicitWrite": {
    conservative: "no",
    id: "intent.explicitWrite",
    instructions: (language, subject) => fill(by("用户的这句话是否明确要求现在新增或修改一条记录（只是告知、提问、假设或转述都不算）：{x}", "ユーザーのこの発言は、今記録を追加または変更するようはっきり求めていますか（伝えるだけ、質問、仮定、伝聞は含みません）：{x}", "Does the user's message explicitly ask to add or change a record now (telling, asking, supposing or reporting does not count): {x}")(language), subject),
    options: ["yes", "no"],
    type: "noul",
    usedIn: "写入意图复核（§3.11）",
    version: "intent.explicitWrite@1",
  },
};

export function questionOf(id: JudgmentQuestionId): JudgmentQuestion {
  return QUESTIONS[id];
}

/** The question versions of this build (for the manifest and the trace). */
export function questionVersions(): Record<JudgmentQuestionId, string> {
  return Object.fromEntries(QUESTION_IDS.map((id) => [id, QUESTIONS[id].version])) as Record<JudgmentQuestionId, string>;
}
