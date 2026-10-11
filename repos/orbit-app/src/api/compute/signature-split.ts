/**
 * R12（DESIGN §2.3、§3.4、§5、§9 #13）：把粘贴的邮件签名按规则拆成联系人字段，不调 AI。
 * Owner: 甲 (R12). Used by: Web「人脈を追加 · 手入力」抽屉（高亮原文片段并预填字段）；App 可同用。
 *
 * 返回 `{ field, value, start, end, confidence }[]`（按 start 排序），start / end 是原文里的下标（UTF-16），
 * 界面直接用来高亮。识别顺序（先认出的片段占位，后面的规则不再看这段文字）：
 *   1. 邮箱、URL（http(s) / www. / 「URL:」「Web:」后的域名）；
 *   2. 带标记的邮编（〒 / 郵便番号 / 邮编 / ZIP）；
 *   3. 电话（日本 / 国际 / 中国大陆格式，9–15 位数字；FAX 标记的号码跳过）——放在不带标记的邮编之前，
 *      所以「03-1234-5678」不会被拆出「1234-5678」或「123-4567」当成邮编；
 *   4. 不带标记的邮编（「123-4567」形、前后不接数字或连字符、所在行像地址）；
 *   5. 逐行看剩下的文字：法人后缀词典 → 会社；像地址 → 住所；含职位 / 部门词 → 役職；
 *      第一个剩下的像人名的片段 → 姓名。
 * 纯函数，不碰 IO 与时钟。
 */

export type SignatureField = "displayName" | "organization" | "role" | "email" | "phone" | "postalCode" | "address" | "url";
export type SignatureConfidence = "high" | "medium" | "low";

export interface SignatureSpan {
  field: SignatureField;
  value: string;
  start: number;
  end: number;
  confidence: SignatureConfidence;
}

const DIGIT = "[0-9\uff10-\uff19]";
const SEP = "[ \u3000.\\-\u2010\u2011\u2013\u2014\u2212\uff0d]";
const DASH = "[-\u2010\u2011\u2212\uff0d]";
const CJK = "\u3005\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const URL_PLAIN = /(?:https?:\/\/|www\.)[^\s<>"'\u3001\u3002\uff08\uff09\u300c\u300d\uff0c]+/gi;
const URL_LABELED = /(?:URL|Web(?:site)?|HP|\u30db\u30fc\u30e0\u30da\u30fc\u30b8|\u7f51\u5740|\u5b98\u7f51)\s*[:\uff1a]?\s*([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[^\s]*)?)/gi;
const POSTAL_LABELED = new RegExp(`(?:\u3012|\u90f5\u4fbf\u756a\u53f7|\u90ae\u7f16|\u90ae\u653f\u7f16\u7801|Postal\\s*Code|ZIP)\\s*[:\uff1a]?\\s*(${DIGIT}{3}${DASH}?${DIGIT}{4}|[0-9]{6}|[0-9]{5}(?:-[0-9]{4})?)(?!${DIGIT})`, "gi");
const PHONE = new RegExp(`(?:\\+${DIGIT}{1,3}${SEP}?)?(?:[(\uff08]${DIGIT}{1,5}[)\uff09]${SEP}?)?(?:${DIGIT}{6,15}|${DIGIT}{1,5}(?:${SEP}${DIGIT}{1,5}){0,4})`, "g");
const POSTAL_PLAIN = new RegExp(`${DIGIT}{3}${DASH}${DIGIT}{4}`, "g");

const FAX_LABEL = /(?:fax|\uff46\uff41\uff58|\u30d5\u30a1\u30c3\u30af\u30b9|\u30d5\u30a1\u30af\u30b9|\u4f20\u771f|\u50b3\u771f|(?:^|[^A-Za-z])F\s*[.:\uff1a])\s*[.:\uff1a]?\s*$/i;
const PHONE_LABEL = /(?:tel|phone|mobile|mob|cell|\u643a\u5e2f|\u96fb\u8a71|\u624b\u673a|\u624b\u6a5f|\u7535\u8bdd|\u76f4\u901a|\u4ee3\u8868|(?:^|[^A-Za-z])[TM]\s*[.:\uff1a])\s*[.:\uff1a]?\s*$/i;

const LEADING_LABEL = /^(?:tel|phone|mobile|mob|cell|fax|e-?mail|mail|url|web|hp|address|addr|\u4f4f\u6240|\u6240\u5728\u5730|\u96fb\u8a71|\u643a\u5e2f|\u30e1\u30fc\u30eb|\u624b\u673a|\u7535\u8bdd|\u90ae\u7bb1|\u5730\u5740|\u7f51\u5740|\u4f20\u771f|\u90ae\u7f16|\u90f5\u4fbf\u756a\u53f7|\u3012|[TMFE])\s*(?:[.:\uff1a]\s*|$)/i;
const TRAILING_LABEL = /(?:^|\s)(?:tel|phone|mobile|mob|cell|fax|e-?mail|mail|url|web|hp|\u96fb\u8a71|\u643a\u5e2f|\u30e1\u30fc\u30eb|\u624b\u673a|\u7535\u8bdd|\u90ae\u7bb1|\u7f51\u5740|\u4f20\u771f|[TMFE]\s*[.:\uff1a])\s*[.:\uff1a]?\s*$/i;
const SIGN_OFF = /^(?:(?:best|kind|warm)\s+regards|regards|thanks|thank you|sincerely|cheers|sent from|\u3088\u308d\u3057\u304f\u304a\u9858\u3044|\u5b9c\u3057\u304f\u304a\u9858\u3044|\u4ee5\u4e0a|\u656c\u5177|\u6b64\u81f4|\u8c22\u8c22|\u795d\u597d|\u987a\u795d)/i;
const PUNCTUATION_ONLY = /^[\s\-_=*~#.\u2500-\u257f\u30fb\u00b7|\uff5c/\uff0f,\uff0c:\uff1a]*$/;

/** 法人后缀词典（会社名の手がかり）。前置型：株式会社オービット；后置型：オービット株式会社 / 轨道科技有限公司。 */
const CJK_COMPANY_PREFIX = /(?:\u682a\u5f0f\u4f1a\u793e|\u6709\u9650\u4f1a\u793e|\u5408\u540c\u4f1a\u793e|\u5408\u8cc7\u4f1a\u793e|\u5408\u540d\u4f1a\u793e|\u4e00\u822c\u793e\u56e3\u6cd5\u4eba|\u4e00\u822c\u8ca1\u56e3\u6cd5\u4eba|\u516c\u76ca\u793e\u56e3\u6cd5\u4eba|\u516c\u76ca\u8ca1\u56e3\u6cd5\u4eba|\u7279\u5b9a\u975e\u55b6\u5229\u6d3b\u52d5\u6cd5\u4eba|NPO\u6cd5\u4eba|\u5b66\u6821\u6cd5\u4eba|\u533b\u7642\u6cd5\u4eba|\u793e\u4f1a\u798f\u7949\u6cd5\u4eba|\u3231|\u3232|[(\uff08]\u682a[)\uff09]|[(\uff08]\u6709[)\uff09])/;
const CJK_COMPANY_SUFFIX = /(?:\u80a1\u4efd\u6709\u9650\u516c\u53f8|\u6709\u9650\u8d23\u4efb\u516c\u53f8|\u6709\u9650\u516c\u53f8|\u516c\u53f8|\u96c6\u56e2|\u4e8b\u52d9\u6240|\u4e8b\u52a1\u6240)/;
const LATIN_COMPANY_SUFFIX = /(?:Co\.,?\s*Ltd\.?|Co\.|Inc\.?|Corp\.?|Corporation|Company|L\.?L\.?C\.?|LLP|Ltd\.?|Limited|GmbH|K\.K\.|PLC|Pte\.?\s*Ltd\.?|Holdings)(?=$|[\s,|/\uff5c\uff0f])/;

const CJK_ROLE = /(?:\u4ee3\u8868\u53d6\u7de0\u5f79|\u53d6\u7de0\u5f79|\u57f7\u884c\u5f79\u54e1|\u526f\u793e\u9577|\u793e\u9577|\u4f1a\u9577|\u5c02\u52d9|\u5e38\u52d9|\u672c\u90e8\u9577|\u90e8\u9577|\u6b21\u9577|\u8ab2\u9577|\u4fc2\u9577|\u5ba4\u9577|\u6240\u9577|\u652f\u5e97\u9577|\u5e97\u9577|\u4e3b\u4efb|\u4e3b\u67fb|\u30de\u30cd\u30fc\u30b8\u30e3\u30fc|\u30de\u30cd\u30b8\u30e3\u30fc|\u30c7\u30a3\u30ec\u30af\u30bf\u30fc|\u30d7\u30ed\u30c7\u30e5\u30fc\u30b5\u30fc|\u30a8\u30f3\u30b8\u30cb\u30a2|\u30c7\u30b6\u30a4\u30ca\u30fc|\u30b3\u30f3\u30b5\u30eb\u30bf\u30f3\u30c8|\u30ea\u30fc\u30c0\u30fc|\u62c5\u5f53|\u7814\u7a76\u54e1|\u6559\u6388|\u5f01\u8b77\u58eb|\u7a0e\u7406\u58eb|\u4f1a\u8a08\u58eb|\u5f01\u7406\u58eb|\u8463\u4e8b\u957f|\u8463\u4e8b|\u603b\u7ecf\u7406|\u7e3d\u7d93\u7406|\u7ecf\u7406|\u7d93\u7406|\u603b\u76d1|\u7e3d\u76e3|\u4e3b\u7ba1|\u521b\u59cb\u4eba|\u5275\u59cb\u4eba|\u5408\u4f19\u4eba|\u5de5\u7a0b\u5e08|\u5de5\u7a0b\u5e2b|\u8bbe\u8ba1\u5e08|\u987e\u95ee|\u9867\u554f|\u4e13\u5458|\u5c08\u54e1|\u9996\u5e2d|CEO|CTO|COO|CFO|CMO|CIO|VP)/;
const CJK_DEPARTMENT = /(?:\u90e8|\u8ab2|\u5ba4|\u672c\u90e8|\u4e8b\u696d\u90e8|\u30b0\u30eb\u30fc\u30d7|\u30c1\u30fc\u30e0|\u90e8\u95e8|\u90e8\u9580|\u4e8b\u4e1a\u90e8|\u4e2d\u5fc3)$/;
const LATIN_ROLE = /\b(?:CEO|CTO|COO|CFO|CMO|CIO|CPO|S?VP|EVP|President|Director|Manager|Engineer|Developer|Designer|Founder|Co-?founder|Partner|Head|Lead|Consultant|Officer|Executive|Chairman|Chair|Owner|Principal|Analyst|Specialist|Architect|Associate|Representative|Sales|Marketing|Professor|Researcher|Attorney|Lawyer|Accountant|Coordinator|Administrator|Advisor|Adviser|Secretary)\b/i;

const JP_PREFECTURE = /(?:\u5317\u6d77\u9053|\u6771\u4eac\u90fd|\u4eac\u90fd\u5e9c|\u5927\u962a\u5e9c|[\u4e00-\u9fff]{2,3}\u770c)/;
const LATIN_ADDRESS = /\b(?:Street|St\.|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Suite|Ste\.|Floor|Fl\.|Drive|Dr\.|Lane|Ln\.|Way|Building|Bldg\.?|Tower|Plaza|[A-Za-z]+-ku|[A-Za-z]+-shi|Tokyo|Osaka|Japan|USA|Singapore|London|Beijing|Shanghai|Hong Kong)\b/i;
const HAS_DIGIT = new RegExp(DIGIT);
const HAS_CJK = new RegExp(`[${CJK}]`);
const CJK_NAME = new RegExp(`^[${CJK}\u30fc]{1,6}(?:[ \u3000][${CJK}\u30fc]{1,6})?$`);
const LATIN_NAME = /^[A-Z][A-Za-z'\u2019.-]*(?:\s+[A-Z][A-Za-z'\u2019.-]*){1,3}$/;

interface Piece { start: number; end: number }

class Splitter {
  readonly spans: SignatureSpan[] = [];
  private readonly occupied: boolean[];

  constructor(readonly text: string) {
    this.occupied = new Array<boolean>(text.length).fill(false);
  }

  masked(): string {
    let out = "";
    for (let index = 0; index < this.text.length; index += 1) out += this.occupied[index] ? "\u0000" : this.text[index];
    return out;
  }

  free(start: number, end: number): boolean {
    for (let index = start; index < end; index += 1) if (this.occupied[index]) return false;
    return true;
  }

  claim(start: number, end: number): void {
    for (let index = start; index < end; index += 1) this.occupied[index] = true;
  }

  emit(field: SignatureField, start: number, end: number, confidence: SignatureConfidence): void {
    this.claim(start, end);
    this.spans.push({ field, value: this.text.slice(start, end), start, end, confidence });
  }

  /** 当前行里 start 之前的文字（看标记用）。 */
  linePrefix(start: number): string {
    const lineStart = Math.max(this.text.lastIndexOf("\n", start - 1), this.text.lastIndexOf("\r", start - 1)) + 1;
    return this.text.slice(lineStart, start);
  }

  lineAround(start: number): string {
    const lineStart = Math.max(this.text.lastIndexOf("\n", start - 1), this.text.lastIndexOf("\r", start - 1)) + 1;
    const after = this.text.slice(start).search(/[\r\n]/);
    return this.text.slice(lineStart, after < 0 ? this.text.length : start + after);
  }

  /** 每一行里没被占用的连续片段。 */
  chunks(): Piece[][] {
    const lines: Piece[][] = [];
    let current: Piece[] = [];
    let runStart = -1;
    const close = (end: number) => {
      if (runStart >= 0) current.push({ start: runStart, end });
      runStart = -1;
    };
    for (let index = 0; index <= this.text.length; index += 1) {
      const character = this.text[index];
      if (index === this.text.length || character === "\n" || character === "\r") {
        close(index);
        if (current.length) lines.push(current);
        current = [];
        continue;
      }
      if (this.occupied[index]) close(index);
      else if (runStart < 0) runStart = index;
    }
    return lines;
  }
}

function digitCount(value: string): number {
  let count = 0;
  for (const character of value) if (/[0-9\uff10-\uff19]/.test(character)) count += 1;
  return count;
}

function trimPiece(text: string, piece: Piece): Piece | null {
  let { start, end } = piece;
  while (start < end && /\s/.test(text[start]!)) start += 1;
  while (end > start && /\s/.test(text[end - 1]!)) end -= 1;
  return start < end ? { start, end } : null;
}

function stripLabels(text: string, piece: Piece): Piece | null {
  let current = trimPiece(text, piece);
  for (let round = 0; current && round < 3; round += 1) {
    const value = text.slice(current.start, current.end);
    const leading = LEADING_LABEL.exec(value);
    if (leading && leading[0].length > 0) {
      current = trimPiece(text, { start: current.start + leading[0].length, end: current.end });
      continue;
    }
    const trailing = TRAILING_LABEL.exec(value);
    if (trailing && trailing[0].length > 0) {
      current = trimPiece(text, { start: current.start, end: current.end - trailing[0].length });
      continue;
    }
    break;
  }
  return current;
}

function looksLikeAddress(value: string): boolean {
  if (JP_PREFECTURE.test(value) || /\u4e01\u76ee|\u756a\u5730/.test(value)) return true;
  if (!HAS_DIGIT.test(value)) return false;
  if (/[\u5e02\u533a\u753a\u6751\u90e1\u7701\u53bf]/.test(value) && /[\u533a\u753a\u6751\u90e1\u53bf\u8def\u8857\u53f7\u4e01]|[0-9\uff10-\uff19]/.test(value)) return true;
  return LATIN_ADDRESS.test(value);
}

/** 片段里法人名的位置（含后缀），找不到返回 null。 */
function companyRange(value: string): { start: number; end: number } | null {
  const boundary = /[\s|\uff5c/\uff0f,\uff0c\u3001]/;
  const runStart = (from: number) => {
    let index = from;
    while (index > 0 && !boundary.test(value[index - 1]!)) index -= 1;
    return index;
  };
  const runEnd = (from: number) => {
    let index = from;
    while (index < value.length && !boundary.test(value[index]!)) index += 1;
    return index;
  };
  const prefix = CJK_COMPANY_PREFIX.exec(value);
  if (prefix) {
    const at = prefix.index;
    const after = at + prefix[0].length;
    if (after < value.length && !boundary.test(value[after]!)) return { start: at, end: runEnd(after) };
    if (at > 0 && !boundary.test(value[at - 1]!)) return { start: runStart(at), end: after };
    // 「株式会社 オービット」：后缀单独成词时接后一个词。
    let next = after;
    while (next < value.length && /\s/.test(value[next]!)) next += 1;
    return next < value.length && !boundary.test(value[next]!) ? { start: at, end: runEnd(next) } : { start: at, end: after };
  }
  const suffix = CJK_COMPANY_SUFFIX.exec(value);
  if (suffix) return { start: runStart(suffix.index), end: suffix.index + suffix[0].length };
  const latin = LATIN_COMPANY_SUFFIX.exec(value);
  if (latin && latin.index > 0) {
    // 英文公司名含空格：从前一个分隔符（| / ，以及不是后缀一部分的逗号）之后开始。
    const before = value.slice(0, latin.index);
    const cut = Math.max(before.lastIndexOf("|"), before.lastIndexOf("\uff5c"), before.lastIndexOf("/"), before.lastIndexOf("\uff0f"), before.lastIndexOf(","), before.lastIndexOf("\uff0c"));
    let start = cut + 1;
    while (start < latin.index && /\s/.test(value[start]!)) start += 1;
    if (start < latin.index) return { start, end: latin.index + latin[0].length };
  }
  return null;
}

/** 用分隔符（| ／ , 、 以及两边有空格的破折号）把一段文字拆成几块。 */
function splitParts(text: string, piece: Piece): Piece[] {
  const value = text.slice(piece.start, piece.end);
  const separator = /\s*(?:[|\uff5c/\uff0f]|[,\uff0c\u3001](?!\s*(?:Ltd|Inc|LLC))|\s[-\u2013\u2014]\s)\s*/g;
  const parts: Piece[] = [];
  let last = 0;
  for (let match = separator.exec(value); match; match = separator.exec(value)) {
    if (match[0].length === 0) {
      separator.lastIndex += 1;
      continue;
    }
    parts.push({ start: piece.start + last, end: piece.start + match.index });
    last = match.index + match[0].length;
  }
  parts.push({ start: piece.start + last, end: piece.end });
  return parts.flatMap((part) => {
    const trimmed = trimPiece(text, part);
    return trimmed ? [trimmed] : [];
  });
}

/** 名字后面的读音括号「山田 太郎（やまだ たろう）」不算进姓名。 */
function withoutReading(text: string, piece: Piece): Piece {
  const value = text.slice(piece.start, piece.end);
  const reading = /\s*[(\uff08][^()\uff08\uff09]*[)\uff09]$/.exec(value);
  return reading && reading.index > 0 ? { start: piece.start, end: piece.start + reading.index } : piece;
}

interface NameCandidate extends Piece { line: number }

/** 全角英字（ＣＥＯ）也认：判断前做 NFKC。 */
function isRoleWord(word: string): boolean {
  const folded = word.normalize("NFKC");
  return CJK_ROLE.test(folded) || CJK_DEPARTMENT.test(folded) || LATIN_ROLE.test(folded);
}

function classifyPart(splitter: Splitter, part: Piece, line: number, names: NameCandidate[]): void {
  const text = splitter.text;
  const value = text.slice(part.start, part.end);
  if (PUNCTUATION_ONLY.test(value) || SIGN_OFF.test(value)) return;
  if (looksLikeAddress(value)) {
    splitter.emit("address", part.start, part.end, "medium");
    return;
  }
  if (!HAS_CJK.test(value)) {
    if (LATIN_ROLE.test(value.normalize("NFKC"))) splitter.emit("role", part.start, part.end, "medium");
    else names.push({ ...part, line });
    return;
  }
  // 中日文：按空白拆词，含职位 / 部门词的连续一段是役職，前后剩下的是姓名候选。
  const words: Piece[] = [];
  const wordPattern = /[^\s\u3000]+/g;
  for (let match = wordPattern.exec(value); match; match = wordPattern.exec(value)) {
    words.push({ start: part.start + match.index, end: part.start + match.index + match[0].length });
  }
  const roleIndexes = words.map((word, index) => (isRoleWord(text.slice(word.start, word.end)) ? index : -1)).filter((index) => index >= 0);
  if (!roleIndexes.length) {
    names.push({ ...part, line });
    return;
  }
  const first = roleIndexes[0]!;
  const last = roleIndexes[roleIndexes.length - 1]!;
  splitter.emit("role", words[first]!.start, words[last]!.end, "medium");
  if (first > 0) names.push({ start: words[0]!.start, end: words[first - 1]!.end, line });
  if (last < words.length - 1) names.push({ start: words[last + 1]!.start, end: words[words.length - 1]!.end, line });
}

function nameConfidence(value: string, firstContentLine: boolean): SignatureConfidence {
  const looksLikeName = CJK_NAME.test(value) || LATIN_NAME.test(value);
  if (!looksLikeName) return "low";
  return firstContentLine ? "high" : "medium";
}

/** 把粘贴的签名拆成字段片段（按原文位置排序）。空输入返回空数组。 */
export function splitSignature(input: string): SignatureSpan[] {
  const splitter = new Splitter(input);
  const run = (pattern: RegExp, handle: (match: RegExpExecArray, masked: string) => void) => {
    const masked = splitter.masked();
    pattern.lastIndex = 0;
    for (let match = pattern.exec(masked); match; match = pattern.exec(masked)) {
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      handle(match, masked);
    }
  };

  // 1. 邮箱、URL。
  run(EMAIL, (match) => splitter.emit("email", match.index, match.index + match[0].length, "high"));
  run(URL_PLAIN, (match) => {
    const value = match[0].replace(/[.,;:)\]\u3002\u3001\uff09\u300d]+$/, "");
    if (value.length > 4) splitter.emit("url", match.index, match.index + value.length, "high");
  });
  run(URL_LABELED, (match) => {
    const value = match[1]!.replace(/[.,;:)\]\u3002\u3001\uff09\u300d]+$/, "");
    const start = match.index + match[0].length - match[1]!.length;
    if (splitter.free(start, start + value.length)) splitter.emit("url", start, start + value.length, "medium");
  });

  // 2. 带标记的邮编（标记本身也占位，免得落进住所）。
  run(POSTAL_LABELED, (match) => {
    const start = match.index + match[0].length - match[1]!.length;
    splitter.claim(match.index, start);
    splitter.emit("postalCode", start, start + match[1]!.length, "high");
  });

  // 3. 电话：9–15 位数字；FAX 标记的号码占位但不输出。
  run(PHONE, (match, masked) => {
    const start = match.index;
    const end = match.index + match[0].length;
    const before = start > 0 ? masked[start - 1]! : "";
    if (/[0-9\uff10-\uff19A-Za-z@]/.test(before)) return;
    const digits = digitCount(match[0]);
    if (digits < 9 || digits > 15) return;
    const prefix = splitter.linePrefix(start);
    if (FAX_LABEL.test(prefix)) {
      splitter.claim(start, end);
      return;
    }
    const value = match[0];
    const labeled = PHONE_LABEL.test(prefix) || value.startsWith("+");
    const domestic = /^[0\uff10]/.test(value) || /^1[3-9]\d{9}$/.test(value.replace(/[\s-]/g, ""));
    splitter.emit("phone", start, end, labeled ? "high" : domestic ? "medium" : "low");
  });

  // 4. 不带标记的邮编：「123-4567」，前后不接数字或连字符，所在行像地址。
  run(POSTAL_PLAIN, (match, masked) => {
    const start = match.index;
    const end = start + match[0].length;
    if (/[0-9\uff10-\uff19\-\u2010\u2011\u2212\uff0d]/.test(masked[start - 1] ?? "") || /[0-9\uff10-\uff19\-\u2010\u2011\u2212\uff0d]/.test(masked[end] ?? "")) return;
    if (!looksLikeAddress(splitter.lineAround(start).replace(match[0], ""))) return;
    splitter.emit("postalCode", start, end, "medium");
  });

  // 5. 逐行：会社 → 住所 → 役職 → 姓名候选。
  const names: NameCandidate[] = [];
  let contentLine = 0;
  for (const line of splitter.chunks()) {
    let lineHasContent = false;
    for (const raw of line) {
      const piece = stripLabels(input, raw);
      if (!piece) continue;
      const value = input.slice(piece.start, piece.end);
      if (PUNCTUATION_ONLY.test(value) || SIGN_OFF.test(value)) continue;
      lineHasContent = true;
      const company = companyRange(value);
      if (company) {
        splitter.emit("organization", piece.start + company.start, piece.start + company.end, "high");
        const rest = [{ start: piece.start, end: piece.start + company.start }, { start: piece.start + company.end, end: piece.end }];
        for (const segment of rest) {
          const trimmed = trimPiece(input, segment);
          if (trimmed) for (const part of splitParts(input, trimmed)) classifyPart(splitter, part, contentLine, names);
        }
        continue;
      }
      if (looksLikeAddress(value)) {
        splitter.emit("address", piece.start, piece.end, "medium");
        continue;
      }
      for (const part of splitParts(input, piece)) classifyPart(splitter, part, contentLine, names);
    }
    if (lineHasContent) contentLine += 1;
  }

  const name = names.find((candidate) => {
    const value = input.slice(candidate.start, candidate.end);
    return !HAS_DIGIT.test(value) && !value.includes("@") && value.length <= 40 && /[A-Za-z\u3040-\u30ff\u3400-\u9fff]/.test(value);
  });
  if (name) {
    const piece = withoutReading(input, name);
    splitter.emit("displayName", piece.start, piece.end, nameConfidence(input.slice(piece.start, piece.end), name.line === 0));
  }

  return [...splitter.spans].sort((left, right) => left.start - right.start);
}
