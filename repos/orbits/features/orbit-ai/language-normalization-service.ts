/**
 * language-normalization-service.ts
 *
 * 用现有模型 provider 做两件事，服务于"关系检索"这个能力：
 * 1. translateToEnglish：录入时把中文/日文关系文本翻成英文，供子串检索使用
 *    （translate-on-ingest）。原文仍保留用于展示。
 * 2. extractSearchTerms：查询时把用户任意自然语言抽成英文检索关键词，喂给现有
 *    确定性子串搜索（understanding in model, deterministic retrieval in code）。
 *
 * 两个方法都 fail closed 且不抛错：缺 key、请求失败或输出为空时返回"未处理"，
 * 让调用方回退到原文/正则词表，绝不阻塞写入或查询。
 */
import {
  runOrbitAgentModelText,
  type GeminiOrbitAgentProviderConfig,
} from "./gemini-provider";

export interface EnglishTranslationResult {
  englishText: string | null;
  translated: boolean;
}

export interface SearchTermExtractionResult {
  intent: string | null;
  searchTerms: string | null;
}

function scriptCounts(text: string): { cjk: number; latin: number } {
  return {
    cjk: (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? [])
      .length,
    latin: (text.match(/[A-Za-z]/g) ?? []).length,
  };
}

// 已经以拉丁字母为主的文本无需翻译（避免多余的 provider 调用）。
function isPredominantlyLatin(text: string): boolean {
  const { cjk, latin } = scriptCounts(text);

  return latin > 0 && latin >= cjk;
}

function stripWrappingQuotes(text: string): string {
  return text.replace(/^["'“”『「]+|["'“”』」]+$/g, "").trim();
}

function cleanModelText(text: string): string {
  return stripWrappingQuotes(text.trim()).replace(/\s+/g, " ").trim();
}

function parseExtraction(text: string): SearchTermExtractionResult {
  const empty: SearchTermExtractionResult = { intent: null, searchTerms: null };

  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text) as Record<string, unknown>;
    const searchTerms =
      typeof parsed.searchTerms === "string" && parsed.searchTerms.trim()
        ? parsed.searchTerms.trim().toLowerCase()
        : null;
    const intent =
      typeof parsed.intent === "string" && parsed.intent.trim()
        ? parsed.intent.trim().toLowerCase()
        : null;

    return { intent, searchTerms };
  } catch {
    return empty;
  }
}

const TRANSLATION_INSTRUCTION = [
  "You translate short relationship/contact notes into concise, natural English.",
  "The text describes a person, their role, company, interests, or what they are looking for.",
  "Output ONLY the English translation as plain text: no quotes, no labels, no original text, no explanation.",
  "Preserve proper names. Keep it compact.",
].join("\n");

const EXTRACTION_INSTRUCTION = [
  "You extract search keywords for a contact/relationship recommendation search.",
  "The user request may be in any language (Chinese, Japanese, English).",
  "Return ONLY a compact JSON object with two string fields:",
  '{"searchTerms":"<space-separated lowercase English keywords for the domain/industry and who they are looking for>","intent":"partnership|intro|customer|investor|hire|general"}',
  "searchTerms must be English words that would appear in an English professional profile",
  "(examples: restaurant, hospitality, ecommerce, retail, saas, manufacturing, marketing, investor, tourism, education).",
  "Do not include the person's own name. No prose, no code fences.",
].join("\n");

export function createOrbitLanguageNormalizationService(
  config: GeminiOrbitAgentProviderConfig = {},
) {
  return {
    // 录入时调用：中文/日文 -> 英文。返回 translated=false 时调用方应只存原文。
    async translateToEnglish(text: string): Promise<EnglishTranslationResult> {
      const trimmed = typeof text === "string" ? text.trim() : "";

      if (!trimmed || isPredominantlyLatin(trimmed)) {
        return { englishText: null, translated: false };
      }

      const result = await runOrbitAgentModelText({
        config,
        systemInstruction: TRANSLATION_INSTRUCTION,
        userText: trimmed,
      });

      if (result.success !== true) {
        return { englishText: null, translated: false };
      }

      const english = cleanModelText(result.text);

      return english
        ? { englishText: english, translated: true }
        : { englishText: null, translated: false };
    },

    // 查询时调用：任意语言 -> 英文检索词。返回 searchTerms=null 时调用方回退正则词表。
    async extractSearchTerms(query: string): Promise<SearchTermExtractionResult> {
      const trimmed = typeof query === "string" ? query.trim() : "";

      if (!trimmed) {
        return { intent: null, searchTerms: null };
      }

      const result = await runOrbitAgentModelText({
        config,
        systemInstruction: EXTRACTION_INSTRUCTION,
        userText: trimmed,
      });

      if (result.success !== true) {
        return { intent: null, searchTerms: null };
      }

      return parseExtraction(result.text);
    },
  };
}

// 录入时把原文和英文译文合成一段可搜索文本（沿用种子数据的 "原文 / English" 格式，
// 展示端的卡片清洗器会自动挑选当前语言）。
export function composeBilingualSearchText(
  original: string,
  english: string | null,
): string {
  const base = typeof original === "string" ? original.trim() : "";

  if (!english) {
    return base;
  }

  const englishTrimmed = english.trim();

  if (!englishTrimmed || base.toLowerCase().includes(englishTrimmed.toLowerCase())) {
    return base;
  }

  return base ? `${base} / ${englishTrimmed}` : englishTrimmed;
}
