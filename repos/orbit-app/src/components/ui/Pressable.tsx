import { forwardRef, type ReactNode } from "react";
import { Pressable as RNPressable, type PressableProps, type StyleProp, type View, type ViewStyle } from "react-native";

import { tapHaptic } from "./haptics";
import { useReducedMotion } from "./motion";

// R04 unified press: scale .96 while pressed plus a light haptic; with Reduce
// Motion the scale is dropped (opacity only). Every tappable ui component uses it.
// Touch targets must be ≥44: components pass hitSlop when they draw smaller.
export type UiPressableProps = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  pressedScale?: number;
  haptic?: boolean;
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
};

export const UiPressable = forwardRef<View, UiPressableProps>(function UiPressable(
  { style, pressedScale = 0.96, haptic = true, onPress, disabled, children, ...rest },
  ref,
) {
  const reduced = useReducedMotion();
  return (
    <RNPressable
      ref={ref}
      {...rest}
      disabled={disabled}
      onPress={(event) => {
        if (haptic) tapHaptic();
        onPress?.(event);
      }}
      style={(state) => {
        const base = typeof style === "function" ? style(state) : style;
        if (!state.pressed || disabled) return base;
        return [base, reduced ? { opacity: 0.7 } : { transform: [{ scale: pressedScale }], opacity: 0.96 }];
      }}
    >
      {children}
    </RNPressable>
  );
});
