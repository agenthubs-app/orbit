/**
 * R12（DESIGN §2.2 第 5 步、§3.4、§9 #5 #9）：名片读完后「哪些卡自动进人脈」的规则，两端共用。
 * Owner: 甲 (R12). Used by: Web card-batch-0918（card-batch-model 的 isAutoImportEligible / isAutoMergeEligible
 * 改为调用这里）、App 名刺スキャン（R12）。
 *
 * 规则原样搬自 Web `card-batch-model.ts`（2026-09 起在用，真机 17 张验收）与 `use-card-batch.ts` 的自动导入筛选：
 *   - 自动导入：识别完成、没有 reviewIssue、正反面不冲突、没有过期来源、补全（行业 / 职级 / 地区）不需复核、有姓名；
 *   - 自动并入：与已有联系人完全一致（候选 identical）时，只要识别完成、没有失败面、没有正反面冲突、补全不需复核；
 *   - W0015：有活动归属候选的卡留给用户（默认勾选不是用户的决定）；
 *   - 有候选但不完全一致（含同名候选，identical 恒为 false）→ 留给用户；
 *   - 查重请求没成功（不知道有没有同名 / 相似的人）→ 留给用户（复核 m9：确认接口不看同名，不能靠它兜底）。
 * 输入是与端无关的最小字段集，由调用方从各自的视图模型取出。纯函数，不碰 IO 与时钟。
 */

/** 判定一张卡能否自动导入 / 自动并入所需的事实。 */
export interface CardAutoImportFacts {
  /** 这张卡可以复核（识别完成或识别失败可手填）。 */
  reviewable: boolean;
  /** 每一面都识别完成。 */
  allExtracted: boolean;
  /** 每一面都已确认。 */
  allConfirmed: boolean;
  /** 正反面结构不合法（例如两张表面）。 */
  invalidStructure: boolean;
  /** 有面缺图片摘要。 */
  hasMissingImageDigest: boolean;
  /** 有面识别彻底失败。 */
  hasTerminalFailure: boolean;
  /** reviewIssues 的条数（规则校验 + 二次逐字符核验）。 */
  issueCount: number;
  /** 正反面不一致的字段数。 */
  conflictedFieldCount: number;
  /** 来源已过期的字段数。 */
  staleFieldCount: number;
  /** 行业、职级、地区任一行正反面冲突且未处理（W0045）。 */
  enrichmentNeedsReview: boolean;
  /** 当前草稿里的姓名。 */
  displayName: string;
}

/** 「识别可靠，已自动导入」：只要有一条疑点就交给用户确认。 */
export function isCardAutoImportEligible(facts: CardAutoImportFacts): boolean {
  return facts.reviewable
    && facts.allExtracted
    && !facts.allConfirmed
    && !facts.invalidStructure
    && !facts.hasMissingImageDigest
    && !facts.hasTerminalFailure
    && facts.issueCount === 0
    && facts.conflictedFieldCount === 0
    && facts.staleFieldCount === 0
    && !facts.enrichmentNeedsReview
    && Boolean(facts.displayName.trim());
}

/**
 * 与已有联系人完全一致的卡直接并入（哪怕识别有疑点——每个字段都和人脈里的记录对得上）的前提：
 * 识别完成、没有失败面、没有正反面冲突；补全两面不一致时也不并入（字段对得上不代表该补哪个值）。
 */
export function isCardAutoMergeEligible(facts: Pick<CardAutoImportFacts, "allExtracted" | "hasTerminalFailure" | "conflictedFieldCount" | "enrichmentNeedsReview">): boolean {
  return facts.allExtracted
    && !facts.hasTerminalFailure
    && facts.conflictedFieldCount === 0
    && !facts.enrichmentNeedsReview;
}

export interface CardAutoActionInput extends CardAutoImportFacts {
  /** 这张卡有活动归属候选（W0015：留给用户）。 */
  hasEventCandidate: boolean;
  /** 「可能是同一个联系人」的查询结果；null = 没有候选。 */
  candidate: { identical: boolean } | null;
  /** 这张卡的查重请求失败了（null 候选不可信）。缺省 = 查到了。 */
  candidateLookupFailed?: boolean;
  /** 这张卡的每一面都被跳过 / 排除。 */
  skipped: boolean;
}

/** import = 自动走确认接口新建；merge = 自动并入候选联系人；review = 不自动处理（留给用户或已处理）。 */
export type CardAutoAction = "import" | "merge" | "review";

/** 一张卡读完后的自动处理决定，与 Web `use-card-batch` 的自动导入筛选逐条一致。 */
export function decideCardAutoAction(input: CardAutoActionInput): CardAutoAction {
  if (!input.reviewable || input.allConfirmed || input.skipped) return "review";
  if (input.hasEventCandidate) return "review";
  if (input.candidateLookupFailed) return "review";
  if (input.candidate) return input.candidate.identical && isCardAutoMergeEligible(input) ? "merge" : "review";
  return isCardAutoImportEligible(input) ? "import" : "review";
}
