import { createElement, type ComponentType, type ReactNode } from "react";
import type { CircleProps, PathProps, RectProps, SvgProps } from "react-native-svg";

// R04: on the web an icon is a plain DOM <svg> (what react-native-svg's own web
// build renders too); native builds resolve svg.native.ts. React Native-only
// accessibility props are dropped here — Icon passes ARIA attributes on the web.
type Dom = Record<string, unknown> & { children?: ReactNode };

function dom(tag: string) {
  return function DomShape({ accessible: _a, accessibilityElementsHidden: _h, accessibilityLabel: _l, accessibilityRole: _r, importantForAccessibility: _i, pointerEvents: _p, onPress, children, ...props }: Dom) {
    return createElement(tag, onPress ? { ...props, onClick: onPress } : props, children);
  };
}

const Svg = dom("svg") as unknown as ComponentType<SvgProps>;
export const Circle = dom("circle") as unknown as ComponentType<CircleProps>;
export const Path = dom("path") as unknown as ComponentType<PathProps>;
export const Rect = dom("rect") as unknown as ComponentType<RectProps>;
export default Svg;
