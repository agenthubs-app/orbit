// 跨客户端契约：新用户引导（三步版）「扫自己的名片 → 自动填写」。
// 设计稿：docs/designs/redesign-2026-10/onboarding-3step-proposal.html。只增不改。
//
// 一、扫描：POST /api/contact-drafts/business-card/scan（接口不变，multipart `image` 或 JSON `imageBase64`）。
//    响应 data 里引导要读的部分是 OwnCardScanContract：
//      - 名片上印着的（标「名刺から」）：draft 的 displayName / organization / role / email / phone，空串 = 没读到；
//      - AI 判断的（标「AI 推定」）：ocr.structuredExtraction 的行业、职级、地区。文字整理那一次调用顺带给出，不多等一轮；
//        已由服务端校验（行业不合法、一二级不匹配时两项都是 null）。
//    email / phone 写进资料的 handles（PUT /api/profile 的 handles 是**整体替换**，先合并读到的旧值）。
//    handles 不在公开投影里，默认不公开。
//
// 二、推断：POST /api/profile/autofill-inference，请求 ProfileAutofillInferenceRequestContract，
//    成功时 HTTP 200，{ success: true, data: ProfileAutofillInferenceContract }。
//      - **超时、模型失败、没配置、超过每日次数，都是 HTTP 200 且 data.status = "unavailable"**，
//        各字段为 null / 空数组：不阻塞流程，留空让人自己选。服务端 15 秒内一定返回；客户端超时请设 20 秒，超时按 unavailable 处理。
//      - 只有这几种不是 200：401 ACTOR_REQUIRED；403 SAMPLE_READ_ONLY；400 VALIDATION_ERROR
//        （不是 JSON 对象、有未知字段、language 不认识、公司和职位都是空）。
//      - 行业返回的是**行业代码**（INDUSTRY_CATALOG / SECONDARY_INDUSTRY_CATALOG 的 id），不是文案；
//        两项同时有值或同时为 null，且一二级必定匹配。请求里已选的行业只作依据，不会被改写：已选时返回原值。
//      - offering / topics 返回**请求 language 的文案**：候选表（shared/compute/profile-tag-options.ts）里该语言的原文，
//        或很短的自定义词（≤ 24 字符）。offering ≤ 5，topics ≤ 8，已去重。可直接存进资料的 offering / topics。
//      - 只读：不写库。结果只进表单草稿，用户点「次へ」才保存。
//    调用时机：扫描成功后在后台调一次；没扫描时在第 ① 步点「次へ」、公司或职位有值时调一次。
//    结果回来时用户已经动过的字段不要覆盖。
//
// 三、「求めていること」的虚线候选：POST /api/profile/seek-suggestions（原接口）。请求可另带 goal（还没保存的目标原文，
//    即 composeProfileOnboardingGoal 的结果）；带了就用它，不必先保存目标。资料要已保存过（第 ① 步之后）。

import type { IndustryIdCode, SecondaryIndustryIdCode } from "./industries";
import type { OrbitLanguage } from "./language";
import type { SeniorityLevelCode } from "./profile";

/** 扫描响应里引导用到的部分；完整响应还有别的字段，客户端不读。 */
export interface OwnCardScanContract {
  draft: {
    displayName: string;
    organization: string;
    role: string;
    email: string;
    phone: string;
  } | null;
  ocr: {
    structuredExtraction?: {
      primaryIndustryId?: IndustryIdCode | null;
      secondaryIndustryId?: SecondaryIndustryIdCode | null;
      seniorityLevel?: SeniorityLevelCode | null;
      /** ISO 3166-1 alpha-2。 */
      regionCountryCode?: string | null;
      /** 城市英文名（如 Tokyo）。 */
      regionCity?: string | null;
    };
  };
}

export interface ProfileAutofillInferenceRequestContract {
  displayName?: string;
  organization?: string;
  role?: string;
  /** 已选行业（名片已判断或用户已选）；两项一起给。 */
  primaryIndustryId?: IndustryIdCode | null;
  secondaryIndustryId?: SecondaryIndustryIdCode | null;
  /** 界面语言：offering / topics 用这种语言返回。 */
  language: OrbitLanguage;
}

export interface ProfileAutofillInferenceContract {
  status: "ready" | "unavailable";
  primaryIndustryId: IndustryIdCode | null;
  secondaryIndustryId: SecondaryIndustryIdCode | null;
  seniorityLevel: SeniorityLevelCode | null;
  /** 提供できること 的预选，≤ 5。 */
  offering: readonly string[];
  /** 話せる話題 的预选，≤ 8。 */
  topics: readonly string[];
}
