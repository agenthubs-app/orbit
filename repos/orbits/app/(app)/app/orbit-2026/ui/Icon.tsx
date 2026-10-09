import { designIcons, designIconSpec, type DesignIconName, type DesignIconShape, type DesignIconSize } from "../../../../../shared/design/icons";

export type IconName = DesignIconName;
export type IconSize = DesignIconSize;

// R02: the one way the redesigned Web draws an icon. Shapes come from
// shared/design/icons.ts (generated from icons.json); the stroke spec is the design
// kit's (24 × 24, 1.7, round caps and joins, no fill). The colour defaults to the
// surrounding text colour, so `color: var(--ink-2)` on the parent tints it.
// Ionicons → icon lookup: docs/designs/redesign-2026-10/sprints/R02-icons/icon-mapping.md.
//
// An icon next to its text is decoration and stays out of the accessibility tree.
// An icon that carries the meaning on its own (an icon-only button) must pass
// `accessibilityLabel`.
export function Icon({
  name,
  size = designIconSpec.defaultSize,
  color = "currentColor",
  accessibilityLabel,
  className,
}: {
  name: IconName;
  size?: IconSize;
  color?: string;
  accessibilityLabel?: string;
  className?: string;
}) {
  const a11y = accessibilityLabel ? { role: "img", "aria-label": accessibilityLabel } : { "aria-hidden": true };
  return (
    <svg
      {...a11y}
      className={className}
      width={size}
      height={size}
      viewBox={designIconSpec.viewBox}
      fill="none"
      stroke={color}
      strokeWidth={designIconSpec.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {designIcons[name].map((shape, index) => <IconShape key={index} shape={shape} tint={color} />)}
    </svg>
  );
}

function IconShape({ shape, tint }: { shape: DesignIconShape; tint: string }) {
  // A solid dot takes the stroke colour, so it follows the theme and a passed colour.
  const fill = shape.fill ? { fill: tint } : {};
  if (shape.tag === "circle") return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...fill} />;
  if (shape.tag === "rect") return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...fill} />;
  return <path d={shape.d} strokeDasharray={shape.strokeDasharray} {...fill} />;
}
