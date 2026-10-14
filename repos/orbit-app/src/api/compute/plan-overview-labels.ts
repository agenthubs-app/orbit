/**
 * 计划概要里两处由计划数据推出的说明文字（web.html / app.html V2：イベント卡「VC と起業家が集まる場へ行く · 参加 1回 …」、
 * 没有新人物的 Step「新しく会う人はいません · Step 3・4 の相手と着地させます」）。两端共用，只做纯计算。
 */

export interface GatherTypeInput {
  key: string;
  allocation: number;
  skipped: boolean;
}

/** イベント卡要去见的人：未スキップ的人物类型按配点从高到低取前 2 个（同分保持原顺序）。 */
export function eventGatherTypeKeys(types: readonly GatherTypeInput[], limit = 2): string[] {
  return types
    .map((type, index) => ({ index, type }))
    .filter(({ type }) => !type.skipped && type.allocation > 0)
    .sort((a, b) => b.type.allocation - a.type.allocation || a.index - b.index)
    .slice(0, limit)
    .map(({ type }) => type.key);
}

/** 没有新人物的 Step：往前最近的、有人物类型的 Step（最多 2 个），返回 1 起的序号，从小到大。 */
export function closingStepNumbers(steps: readonly { personTypeKeys: readonly string[] }[], index: number, eventKey: string, limit = 2): number[] {
  const numbers: number[] = [];
  for (let k = index - 1; k >= 0 && numbers.length < limit; k -= 1) {
    if (steps[k]!.personTypeKeys.some((key) => key !== eventKey)) numbers.unshift(k + 1);
  }
  return numbers;
}

const LATIN_EDGE = /[A-Za-z0-9]/;

/** 日文拼接：拉丁字母 / 数字与日文相邻处补一个半角空格（「VC と起業家」「起業家と VC が」）。 */
export function jaLatinGlue(parts: readonly string[]): string {
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    const last = out.at(-1);
    const first = part[0]!;
    const needsSpace = last !== undefined && last !== " " && first !== " " && LATIN_EDGE.test(last) !== LATIN_EDGE.test(first);
    out += needsSpace ? ` ${part}` : part;
  }
  return out;
}

/**
 * 计划还没开始（一分没得、一个 Step 也没完成）时，Step 行不显示进度 chip（web.html / app.html V2.STAT 只给进行中的计划画了 chip，
 * 新计划 #16 / #20 一个都没有）：此时每行都是「0 / N人」或「まだ」，没有信息量。
 */
export function stepChipsVisible(scoreTotal: number, steps: readonly { completedAt?: string | null }[]): boolean {
  return scoreTotal > 0 || steps.some((step) => Boolean(step.completedAt));
}
