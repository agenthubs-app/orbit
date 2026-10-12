import { Platform } from "react-native";

// Measured against the kit (R05 rework, after UiText sets kana / kanji in explicit
// Hiragino faces): in the same line box iOS sets bold glyphs up to 1pt lower than the
// browser. Shell text lifts itself back to the kit position.
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/u;
// iOS only: browsers (the web App, the render tests) already place text like the kit.
export function cjkLift(text: string, latin = 0, cjk = -1) {
  if (Platform.OS !== "ios") return null;
  return { transform: [{ translateY: CJK.test(text) ? cjk : latin }] };
}
