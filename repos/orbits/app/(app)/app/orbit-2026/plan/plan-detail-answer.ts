// 计划详情与人物类型详情在「上次结果」缓存（orbit-last-answer）里的键：计划页读到的整份计划，
// 人物类型详情页直接复用（同一账号、同一语言）。
import type { OrbitLanguage } from "../../../../../shared/contract/language";

export const planDetailAnswerKey = (planId: string, language: OrbitLanguage): string => `plan.v2:${planId}:${language}`;
export const planTypeAnswerKey = (planId: string, itemId: string, language: OrbitLanguage): string => `plan.v2.type:${planId}:${itemId}:${language}`;
