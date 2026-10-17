import { Redirect, useLocalSearchParams } from "expo-router";

import { showcaseEnabled } from "../../../src/components/ui/showcase";
import { ComponentSectionScreen } from "../../../src/screens/showcase/ComponentSectionScreen";

// R31a 逐件对照：一个 01-system 规格格一个小节（开发包和 TestFlight，RD-15）。`?theme=light|dark` 预览主题（不保存）。
export default function ComponentSectionRoute() {
  const { section, theme } = useLocalSearchParams<{ section: string; theme?: string }>();
  if (!showcaseEnabled()) return <Redirect href="/" />;
  return <ComponentSectionScreen id={section} theme={theme === "dark" || theme === "light" ? theme : undefined} />;
}
