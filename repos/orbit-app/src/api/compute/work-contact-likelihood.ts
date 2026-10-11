/**
 * R16（DESIGN add-and-invite §2.7、§3.4、§9 #20）：通讯录里「像工作关系的人」的规则预选，两端共用。
 * Owner: 甲 (R16). Used by: App 連絡先导入的选人页（预选 + `?` 展开依据）；Web 连絡先（vCard）如需预选也用它。
 *
 * - 依据（按固定顺序）：`company` 有公司名；`work_email` 有一个不是免费邮箱 / 手机邮箱的地址；`job_title` 有职称（职称栏有字，或名字里写着职称：「佐藤部長」）。
 * - 排除（个人用的名字，优先于依据）：`family`（母、父、お母さん、mom…）、`shop`（〜店、〜屋、ショップ…）、
 *   `medical`（病院、クリニック、歯科、薬局…）、`service`（タクシー、宅配、修理…）。名字与公司名都会检查；
 *   家人称呼只认整段名字（「母袋 健」不是家人）。
 * - 预选 = 没被排除且至少一条依据。不调 AI；纯函数，不碰 IO 与时钟。
 */
import { lowerText } from "./compute-text";

export type WorkContactReason = "company" | "work_email" | "job_title";
export type WorkContactExclusion = "family" | "shop" | "medical" | "service";

export interface WorkContactInput {
  displayName: string;
  organization?: string | null;
  role?: string | null;
  emails: readonly string[];
  phones?: readonly string[];
}

export interface WorkContactLikelihood {
  likely: boolean;
  /** 依据键（界面按键取文案）。 */
  reasons: WorkContactReason[];
  /** 被排除的原因；没被排除为 null。 */
  excludedBy: WorkContactExclusion | null;
}

/** 免费邮箱与日本手机运营商邮箱（不说明公司）。按域名或其子域匹配。 */
export const FREE_MAIL_DOMAINS: readonly string[] = [
  "gmail.com", "googlemail.com", "yahoo.co.jp", "ymail.ne.jp", "yahoo.com", "icloud.com", "me.com", "mac.com",
  "hotmail.com", "hotmail.co.jp", "outlook.com", "outlook.jp", "live.com", "live.jp", "msn.com", "aol.com",
  "proton.me", "protonmail.com", "gmx.com", "yandex.com", "mail.com", "zoho.com",
  "docomo.ne.jp", "ezweb.ne.jp", "au.com", "softbank.ne.jp", "i.softbank.jp", "disney.ne.jp", "ymobile.ne.jp", "y-mobile.ne.jp",
  "rakuten.jp", "nifty.com", "biglobe.ne.jp", "ocn.ne.jp", "so-net.ne.jp", "plala.or.jp", "dion.ne.jp",
  "qq.com", "163.com", "126.com", "sina.com", "foxmail.com", "naver.com",
];

const FAMILY_WORDS = new Set([
  "母", "父", "母さん", "父さん", "お母さん", "お父さん", "おかあさん", "おとうさん", "かあさん", "とうさん", "ママ", "パパ", "おふくろ", "おやじ",
  "兄", "姉", "弟", "妹", "兄さん", "姉さん", "お兄ちゃん", "お姉ちゃん", "妻", "夫", "嫁", "旦那", "息子", "娘",
  "祖母", "祖父", "おばあちゃん", "おじいちゃん", "ばあちゃん", "じいちゃん", "叔母", "叔父", "伯母", "伯父", "おば", "おじ", "義母", "義父",
  "実家", "自宅", "家", "妈妈", "爸爸", "妈", "爸", "老婆", "老公", "哥哥", "姐姐", "弟弟", "妹妹",
  "mom", "mum", "mother", "dad", "father", "mama", "papa", "home", "wife", "husband", "grandma", "grandpa", "sister", "brother",
]);

const EXCLUSION_PATTERNS: readonly [WorkContactExclusion, RegExp][] = [
  ["medical", /(病院|医院|クリニック|診療所|歯科|眼科|皮膚科|耳鼻|整骨院|接骨院|薬局|ドラッグ|動物病院|clinic|hospital|dental|pharmacy)/iu],
  ["service", /(タクシー|ハイヤー|宅配|宅急便|運輸|引越|修理|クリーニング|管理会社|不動産管理|ガス|水道|電力|カスタマーセンター|サポートセンター|予約センター|taxi|delivery|customer\s*(service|support))/iu],
  ["shop", /(店$|店\s|店（|ショップ|ストア|商店|食堂|レストラン|カフェ|居酒屋|美容院|美容室|ヘアサロン|サロン|ネイル|ジム|塾|教室|屋$|屋\s|shop$|store$|salon|restaurant|cafe|café)/iu],
];

/** 名字里写着职称（「佐藤部長」「田中 CTO」这种存法）。拉丁字母的词按整词匹配（Victor 里的 cto 不算）。 */
const TITLE_IN_NAME_CJK = /(社長|会長|代表|取締役|役員|部長|次長|課長|係長|室長|所長|支店長|本部長|マネージャー|ディレクター|弁護士|税理士|会計士|经理|总监|总裁|主管|顾问|董事)/u;
const TITLE_IN_NAME_LATIN = /\b(ceo|cto|cfo|coo|cmo|vp|founder|president|director|manager|partner)\b/iu;

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

/** 邮箱的域名（小写）；不是邮箱返回 null。 */
export function emailDomain(email: string): string | null {
  const value = lowerText(text(email));
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const domain = value.slice(at + 1);
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/u.test(domain) ? domain : null;
}

export function isFreeMailDomain(domain: string): boolean {
  const value = lowerText(text(domain));
  return FREE_MAIL_DOMAINS.some((free) => value === free || value.endsWith(`.${free}`));
}

function exclusionOf(displayName: string, organization: string): WorkContactExclusion | null {
  const name = lowerText(displayName).replace(/[\s　]+/gu, "");
  if (name && FAMILY_WORDS.has(name)) return "family";
  for (const [kind, pattern] of EXCLUSION_PATTERNS) {
    if (pattern.test(displayName) || (organization && pattern.test(organization))) return kind;
  }
  return null;
}

export function workContactLikelihood(input: WorkContactInput): WorkContactLikelihood {
  const displayName = text(input.displayName);
  const organization = text(input.organization);
  const role = text(input.role);
  const reasons: WorkContactReason[] = [];
  if (organization) reasons.push("company");
  if (input.emails.some((email) => {
    const domain = emailDomain(email);
    return domain !== null && !isFreeMailDomain(domain);
  })) reasons.push("work_email");
  if (role || TITLE_IN_NAME_CJK.test(displayName) || TITLE_IN_NAME_LATIN.test(displayName)) reasons.push("job_title");
  const excludedBy = exclusionOf(displayName, organization);
  return { excludedBy, likely: excludedBy === null && reasons.length > 0, reasons };
}
