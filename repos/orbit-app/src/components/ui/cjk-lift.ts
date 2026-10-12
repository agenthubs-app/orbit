import { Platform } from "react-native";

// Measured against the kit (R05 rework): in the same line box iOS sets bold glyphs
// about 1pt lower than the browser, and a line that falls back to Hiragino for kana /
// kanji up to 1pt lower again. Shell text lifts itself back to the kit position.
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/u;
// iOS only: browsers (the web App, the render tests) already place text like the kit.
export function cjkLift(text: string, latin = 0, cjk = -1) {
  if (Platform.OS !== "ios") return null;
  return { transform: [{ translateY: CJK.test(text) ? cjk : latin }] };
}
