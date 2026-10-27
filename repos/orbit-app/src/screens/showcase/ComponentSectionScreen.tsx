import { useEffect } from "react";
import { Appearance, StyleSheet, View } from "react-native";

import { UiText } from "../../components/ui";
import { getAppearanceChoice, useAppearanceChoice } from "../../design/appearance";
import { createThemedStyles } from "../../design/theme";
import { findComponentSection, SECTION_TOP } from "./component-sections";

// R31a 逐件对照的小节页：inline 规格格固定在 (0, SECTION_TOP)、宽 = 格宽；
// overlay 小节按弹层自身规则定位，b2 的 screen 小节占满页面；门禁按清单里的 rect 裁剪。
// 页面底色 = --bg（规格格的文档雾面底由比对工具换成纯 --bg，见 redesign-pixel-lib specCellsInPage）。
// `theme` 只预览、不写入设置；离开时回到用户自己的外观选择。
export function ComponentSectionScreen({ id, theme }: { id: string | undefined; theme?: "light" | "dark" | undefined }) {
  const { styles } = useStyles();
  // 根布局启动时异步恢复已保存的外观（会覆盖这里的预览）：跟着外观选择的变化再套一次。
  const choice = useAppearanceChoice();
  useEffect(() => {
    if (!theme) return;
    Appearance.setColorScheme?.(theme);
    return () => {
      const saved = getAppearanceChoice();
      Appearance.setColorScheme?.(saved === "system" ? "unspecified" : saved);
    };
  }, [theme, choice]);
  const section = findComponentSection(id);
  if (!section) return <View style={styles.root}><UiText style={styles.missing}>{`unknown section: ${id ?? ""}`}</UiText></View>;
  return (
    <View style={styles.root} testID={`component-section-${section.id}`}>
      {section.placement === "inline" ? <View style={[styles.inline, { width: section.width }]}>{section.render()}</View> : section.render()}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inline: { position: "absolute", left: 0, top: SECTION_TOP },
  missing: { color: colors.ink2, fontSize: 15, marginTop: SECTION_TOP, marginLeft: 16 },
}));
