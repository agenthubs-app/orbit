/**
 * R16（DESIGN add-and-invite §2.7、§3.4、§9 #20）：通讯录里「像工作关系的人」的规则预选，两端共用。
 * Owner: 甲 (R16). Used by: App 連絡先导入的选人页（预选 + `?` 展开依据）；Web 连絡先（vCard）如需预选也用它。
 *
 * - 依据（按固定顺序）：`company` 有公司名；`work_email` 有一个不是免费邮箱 / 手机邮箱的地址；`job_title` 有职称（职称栏有字，或名字里写着职称：「佐藤部長」）。
 * - 排除（个人用的名字，R16 复核 M1 收窄）：
 *   - `family`：整段名字是家人称呼（母、お母さん、mom…）；先去掉括号里的标签与「携帯」「自宅」「固定」「cell」「iPhone」这类
 *     号码标签再比（「母 携帯」「Mom (cell)」是家人，「母袋 健」不是）。优先于一切依据。
 *   - `shop` / `service`：**只看名字**，公司名一律不参与（「三菱UFJ銀行 渋谷支店」「東京ガス株式会社」「株式会社岩波書店」
 *     「Delivery Hero SE」都是公司）。名字里带公司写法（株式会社、銀行、Inc…）时也不排除。
 *     - 强写法（名字以「店」结尾或「店」后跟空格 / 括号，但不是支店 / 代理店；ショップ、商店、カフェ、美容院、〜ジム…）总是排除；
 *     - 弱写法（单独一段以「屋」结尾——也可能是姓「古屋」；运输、ガス、電力、水道、delivery——也可能是公司）只在没有
 *       公司邮箱、也没有职称时排除。
 *   - `medical`：名字里有病院 / クリニック等总是排除；只在公司名里有时，没有公司邮箱、也没有职称才排除（「受付 · さくら歯科」
 *     排除，「院长 · 公司邮箱」不排除）。
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

const MEDICAL = /(病院|医院|クリニック|診療所|歯科|眼科|皮膚科|耳鼻|整骨院|接骨院|薬局|ドラッグストア|動物病院|clinic|hospital|dental|pharmacy)/iu;
/** 名字里的「店」：结尾或后跟空格 / 括号；支店 / 代理店 / 本支店是公司的写法。 */
const SHOP_STRONG = /((^|[^支理])店(?=$|[\s(（])|ショップ|ストア|商店|食堂|レストラン|カフェ|居酒屋|美容院|美容室|ヘアサロン|サロン|ネイル|[^\s　・]ジム(?=$|[\s　(（])|塾$|教室|\bshop$|\bstore$|\bsalon\b|\brestaurant\b|\bcafe\b|café|\bgym\b)/iu;
const SERVICE_STRONG = /(タクシー|ハイヤー|宅配|宅急便|引越|修理|クリーニング|管理会社|不動産管理|カスタマーセンター|サポートセンター|予約センター|お客さまセンター|お客様センター|\btaxi\b|customer\s*(service|support))/iu;
const SERVICE_WEAK = /(運輸|ガス|水道|電力|\bdelivery\b)/iu;
/** 名字是公司的写法（不是店铺 / 服务的个人存法）。 */
const COMPANY_MARKERS = /(株式会社|有限会社|合同会社|合資会社|㈱|㈲|銀行|信用金庫|証券|保険|商事|物産|ホールディングス|\b(inc|corp|co|ltd|llc|gmbh|plc|kk)\b\.?)/iu;
/** 家人称呼后面常见的号码标签（「母 携帯」「Mom (cell)」）。 */
const NUMBER_LABEL_SUFFIX = /([\s　]*(携帯|ケータイ|スマホ|自宅|固定|家電|iphone|cell|mobile|home|work|phone|tel))+$/iu;

function familyKey(displayName: string): string {
  const withoutBrackets = displayName.replace(/[(（][^)）]*[)）]/gu, " ").trim();
  const withoutLabels = withoutBrackets.replace(NUMBER_LABEL_SUFFIX, "").trim() || withoutBrackets;
  return lowerText(withoutLabels).replace(/[\s　]+/gu, "");
}

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

function exclusionOf(displayName: string, organization: string, strongWorkSignal: boolean): WorkContactExclusion | null {
  const family = familyKey(displayName);
  if (family && (FAMILY_WORDS.has(family) || FAMILY_WORDS.has(lowerText(displayName).replace(/[\s　]+/gu, "")))) return "family";
  if (MEDICAL.test(displayName)) return "medical";
  if (organization && MEDICAL.test(organization) && !strongWorkSignal) return "medical";
  if (!displayName || COMPANY_MARKERS.test(displayName)) return null;
  if (SHOP_STRONG.test(displayName)) return "shop";
  if (SERVICE_STRONG.test(displayName)) return "service";
  if (strongWorkSignal) return null;
  // 弱写法：单独一段以「屋」结尾（ピザ屋；也可能是姓「古屋」，所以有公司邮箱 / 职称时不排除）。
  if (/^[^\s　]+屋$/u.test(displayName)) return "shop";
  if (SERVICE_WEAK.test(displayName)) return "service";
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
  const excludedBy = exclusionOf(displayName, organization, reasons.includes("work_email") || reasons.includes("job_title"));
  return { excludedBy, likely: excludedBy === null && reasons.length > 0, reasons };
}
