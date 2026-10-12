import { Children, useContext, type Context, type ReactNode } from "react";
import { Platform, StyleSheet, Text as RNText, type TextProps } from "react-native";

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

export function UiText({ lineBreakStrategyIOS = "standard", children, ...props }: TextProps) {
  const language = useLocaleLanguage();
  const japanese = Platform.OS === "ios" && (language ?? currentOrbitLanguage()) === "ja";
  return (
    <RNText lineBreakStrategyIOS={lineBreakStrategyIOS} {...props}>
      {japanese ? withJapaneseFaces(children, faceFor(StyleSheet.flatten(props.style)?.fontWeight)) : children}
    </RNText>
  );
}

// Kana, kanji and full-width forms, plus the symbols the design draws in Hiragino Sans
// because SF lacks them (CDP-checked on the kit stack: ― ‥ ※, box lines, ⑩–⑳, ◆◇◉◎◯,
// ☀–☃ ☎ ♪). Symbols SF has (✓ → … × · — ① ●) stay in SF, as in the design.
const CJK = "[\\u3000-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef\\u2015\\u2025\\u203b\\u2500-\\u254b\\u2469-\\u2471\\u2473\\u25c6\\u25c7\\u25c9\\u25ce\\u25ef\\u2600-\\u2603\\u260e\\u266a]+";
const HAS_CJK = new RegExp(CJK, "u");
const FACES: Readonly<Record<string, string>> = designFont.face.ja;

/** The face for a CSS weight: the nearest listed weight at or below it (CSS-style for ≥ 400). */
export function faceFor(weight: string | number | undefined): string {
  const value = weight === undefined || weight === "normal" ? 400 : weight === "bold" ? 700 : Number(weight) || 400;
  const listed = Object.keys(FACES).map(Number).sort((a, b) => a - b);
  const chosen = listed.filter((step) => step <= value).pop() ?? listed[0]!;
  return FACES[String(chosen)]!;
}

function withJapaneseFaces(children: ReactNode, face: string): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child !== "string" || !HAS_CJK.test(child)) return child;
    const parts: ReactNode[] = [];
    let last = 0;
    for (const match of child.matchAll(new RegExp(CJK, "gu"))) {
      if (match.index > last) parts.push(child.slice(last, match.index));
      // fontWeight normal: the face already carries the weight (no synthetic bold on top).
      parts.push(<RNText key={match.index} style={{ fontFamily: face, fontWeight: "normal" }}>{match[0]}</RNText>);
      last = match.index + match[0].length;
    }
    if (last < child.length) parts.push(child.slice(last));
    return parts;
  });
}
