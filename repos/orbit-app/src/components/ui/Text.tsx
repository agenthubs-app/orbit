import { Children, useContext, type Context, type ReactNode } from "react";
import { Platform, StyleSheet, Text as RNText, type TextProps, type TextStyle } from "react-native";

import { designFont } from "../../api/design/tokens";
import * as LocaleContextModule from "../../i18n/OrbitLocaleContext";
import { currentOrbitLanguage } from "../../i18n/locale-core";

// R04: text for ui components. Japanese and Chinese break by phrase on iOS
// (lineBreakStrategyIOS "standard" applies kinsoku rules: no lone 「た」 or split
// 「表示」 at large text sizes, R03 review). Text always scales with the system
// size unless a component caps it.
//
// R05 (user 2026-10-12, choice (b)): in the Japanese UI on iOS, kana / kanji / full-width
// punctuation are set in Hiragino Sans at the face the design renders for each weight
// (tokens font.face.ja), while Latin letters and digits stay in the system font (SF).
// iOS's own fallback for CJK is a narrower interface cut, so each CJK run of a string
// child is wrapped in a nested Text with the explicit face.
// Read through the namespace: render-test fixtures stub the locale module without the
// context; then the language published above the provider applies.
const LocaleContext = (LocaleContextModule as { OrbitLocaleContext?: Context<{ language: string } | null> }).OrbitLocaleContext;
const useLocaleLanguage: () => string | undefined = LocaleContext ? () => useContext(LocaleContext)?.language : () => undefined;

// UX-1: the App sizes are already the iOS defaults, so system text size can grow them by up to
// 1.7× (≈ the old kit sizes at 2×, the range the layout tests cover); a caller may cap lower.
export const UI_TEXT_MAX_FONT_SCALE = 1.7;

export function UiText({ lineBreakStrategyIOS = "standard", maxFontSizeMultiplier = UI_TEXT_MAX_FONT_SCALE, children, ...props }: TextProps) {
  const language = useLocaleLanguage();
  const japanese = Platform.OS === "ios" && (language ?? currentOrbitLanguage()) === "ja";
  return (
    <RNText lineBreakStrategyIOS={lineBreakStrategyIOS} maxFontSizeMultiplier={maxFontSizeMultiplier} {...props}>
      {japanese ? withJapaneseFaces(children, StyleSheet.flatten(props.style) ?? {}) : children}
    </RNText>
  );
}

// Kana, kanji and full-width forms, plus the symbols the design draws in Hiragino Sans
// because SF lacks them (CDP-checked on the kit stack: ― ‥ ※, box lines, ⑩–⑳, ◆◇◉◎◯,
// ☀–☃ ☎ ♪). Symbols SF has (✓ → … × — ① ●) stay in SF, as in the design.
// The middle dot · (U+00B7, East Asian width "ambiguous") is set in Hiragino too: left in
// the system font, iOS draws it from a fallback face whose line box makes that line ~5pt
// taller than lineHeight (R23–25 App rework, 2026-10-13, measured on the kit's 「A · B」
// labels); Hiragino's · has the same width and position as the design's.
const CJK = "[\\u00b7\\u3000-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef\\u2015\\u2025\\u203b\\u2500-\\u254b\\u2469-\\u2471\\u2473\\u25c6\\u25c7\\u25c9\\u25ce\\u25ef\\u2600-\\u2603\\u260e\\u266a]+";
const HAS_CJK = new RegExp(CJK, "u");
const FACES: Readonly<Record<string, string>> = designFont.face.ja;

/** The face for a CSS weight: the nearest listed weight at or below it (CSS-style for ≥ 400). */
export function faceFor(weight: string | number | undefined): string {
  const value = weight === undefined || weight === "normal" ? 400 : weight === "bold" ? 700 : Number(weight) || 400;
  const listed = Object.keys(FACES).map(Number).sort((a, b) => a - b);
  const chosen = listed.filter((step) => step <= value).pop() ?? listed[0]!;
  return FACES[String(chosen)]!;
}

// Adjacent full-width punctuation is trimmed by half an em, as Chrome's default
// text-spacing-trim does in the design (R23–25 App rework round 2, decision §19-3; pairs
// CDP-measured with the kit font stack): an opening bracket after an opening bracket,
// closing bracket, comma / full stop, ：；・· or ideographic space loses its leading half;
// a closing bracket or comma / full stop before any of those (or an opening bracket)
// loses its trailing half. Each pair trims once, so either way the first character of the
// pair takes a −½em letter spacing. Pairs split across nested Text children are not seen.
// The sets are built from code points so no CJK string literal sits in this skeleton file (R03 D).
const OPENING = String.fromCharCode(0x300c, 0x300e, 0xff08, 0x3010, 0x3014, 0xff3b, 0xff5b, 0x3008, 0x300a); // 「『（【〔［｛〈《
const CLOSING = String.fromCharCode(0x300d, 0x300f, 0xff09, 0x3011, 0x3015, 0xff3d, 0xff5d, 0x3009, 0x300b, 0x3001, 0x3002, 0xff0c, 0xff0e); // 」』）】〕］｝〉》、。，．
const BEFORE_OPENING = OPENING + CLOSING + String.fromCharCode(0x201c, 0x2018, 0xff1a, 0xff1b, 0x30fb, 0x00b7, 0x3000); // “‘：；・· + ideographic space
const AFTER_CLOSING = OPENING + CLOSING + String.fromCharCode(0x201d, 0x2019, 0xff1a, 0xff1b, 0x30fb, 0x00b7, 0x3000); // ”’：；・· + ideographic space

/** Indexes whose character is the first of a trimmed pair. */
export function trimmedPunctuation(text: string): Set<number> {
  const trimmed = new Set<number>();
  for (let i = 0; i < text.length - 1; i += 1) {
    const [here, next] = [text[i]!, text[i + 1]!];
    if ((OPENING.includes(next) && BEFORE_OPENING.includes(here)) || (CLOSING.includes(here) && AFTER_CLOSING.includes(next))) trimmed.add(i);
  }
  return trimmed;
}

function withJapaneseFaces(children: ReactNode, style: TextStyle): ReactNode {
  const face = faceFor(style.fontWeight);
  // fontWeight normal: the face already carries the weight (no synthetic bold on top).
  const faced = { fontFamily: face, fontWeight: "normal" } as const;
  const trimSpacing = (style.letterSpacing ?? 0) - (style.fontSize ?? 14) / 2;
  return Children.map(children, (child) => {
    if (typeof child !== "string" || !HAS_CJK.test(child)) return child;
    const trimmed = trimmedPunctuation(child);
    const parts: ReactNode[] = [];
    const push = (text: string, at: number, cjk: boolean) => {
      let from = 0;
      for (let i = 0; i < text.length; i += 1) {
        if (!trimmed.has(at + i)) continue;
        if (i > from) parts.push(cjk ? <RNText key={at + from} style={faced}>{text.slice(from, i)}</RNText> : text.slice(from, i));
        parts.push(<RNText key={`${at + i}t`} style={cjk ? [faced, { letterSpacing: trimSpacing }] : { letterSpacing: trimSpacing }}>{text[i]}</RNText>);
        from = i + 1;
      }
      if (from < text.length) parts.push(cjk ? <RNText key={at + from} style={faced}>{text.slice(from)}</RNText> : text.slice(from));
    };
    let last = 0;
    for (const match of child.matchAll(new RegExp(CJK, "gu"))) {
      if (match.index > last) push(child.slice(last, match.index), last, false);
      push(match[0], match.index, true);
      last = match.index + match[0].length;
    }
    if (last < child.length) push(child.slice(last), last, false);
    return parts;
  });
}
