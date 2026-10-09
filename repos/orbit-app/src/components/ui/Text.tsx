import { Text as RNText, type TextProps } from "react-native";

// R04: text for ui components. Japanese and Chinese break by phrase on iOS
// (lineBreakStrategyIOS "standard" applies kinsoku rules: no lone 「た」 or split
// 「表示」 at large text sizes, R03 review). Text always scales with the system
// size unless a component caps it.
export function UiText({ lineBreakStrategyIOS = "standard", ...props }: TextProps) {
  return <RNText lineBreakStrategyIOS={lineBreakStrategyIOS} {...props} />;
}
