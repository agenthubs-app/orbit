import { createElement, type ComponentType, type ReactNode } from "react";
import type { LinearGradientProps } from "react-native-svg";

// R23–R25 像素返工：计划页卡片的 135° 渐变底（kit `linear-gradient(135deg, …)`）。web / 测试打包走这里
// （DOM <linearGradient>），原生走 plan-svg.native.ts（react-native-svg）——同 components/ui/svg 的做法，
// 只是不去改组件库的热点文件。
type Dom = Record<string, unknown> & { children?: ReactNode };
export const LinearGradient = ((props: Dom) => createElement("linearGradient", props, props.children)) as unknown as ComponentType<LinearGradientProps>;
