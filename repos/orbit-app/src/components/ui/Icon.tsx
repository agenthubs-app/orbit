import { Platform } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { designIcons, designIconSpec, type DesignIconName, type DesignIconShape, type DesignIconSize } from "../../api/design/icons";
import { useOrbitTheme } from "../../design/theme";

export type IconName = DesignIconName;
export type IconSize = DesignIconSize;

// R02: the one way the App draws an icon. Shapes come from the generated copy of
// orbits/shared/design/icons.json (src/api/design/icons.ts); the stroke spec is the
// design kit's (24 × 24, 1.7, round caps and joins, no fill). Names and the
// Ionicons → icon lookup: docs/designs/redesign-2026-10/sprints/R02-icons/icon-mapping.md.
//
// An icon next to its text is decoration and stays out of the accessibility tree.
// An icon that carries the meaning on its own (an icon-only button) must pass
// `accessibilityLabel`.
export function Icon({
  name,
  size = designIconSpec.defaultSize,
  color,
  accessibilityLabel
}: {
  name: IconName;
  size?: IconSize;
  color?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useOrbitTheme();
  const tint = color ?? colors.ink;
  const a11y = iconAccessibility(accessibilityLabel);
  return (
    <Svg
      {...a11y}
      width={size}
      height={size}
      viewBox={designIconSpec.viewBox}
      fill="none"
      stroke={tint}
      strokeWidth={designIconSpec.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {designIcons[name].map((shape, index) => <IconShape key={index} shape={shape} tint={tint} />)}
    </Svg>
  );
}

// react-native-svg hands its props to the DOM on web, so the web build gets ARIA
// attributes and native builds get the React Native accessibility props.
export function iconAccessibility(label: string | undefined, platform: string = Platform.OS) {
  if (platform === "web") return label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true };
  return label
    ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label }
    : { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const };
}

function IconShape({ shape, tint }: { shape: DesignIconShape; tint: string }) {
  // A solid dot is filled with the icon's own colour, so it follows the theme.
  const fill = shape.fill ? { fill: tint } : {};
  if (shape.tag === "circle") return <Circle cx={shape.cx} cy={shape.cy} r={shape.r} {...fill} />;
  if (shape.tag === "rect") return <Rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} {...(shape.rx === undefined ? {} : { rx: shape.rx })} {...fill} />;
  return <Path d={shape.d} {...(shape.strokeDasharray ? { strokeDasharray: shape.strokeDasharray } : {})} {...fill} />;
}
