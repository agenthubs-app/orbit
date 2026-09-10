import { layout, radius, spacing, textStyles, type OrbitColors } from "./tokens";

// Layout and appearance only: consumers retain their own state and handlers.
export function createControlStyles(colors: OrbitColors) {
  return {
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: radius.control,
      justifyContent: "center",
      minHeight: layout.primaryControl,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md
    },
    primaryButtonText: {
      ...textStyles.body,
      color: colors.onAccent,
      flexShrink: 1,
      fontWeight: "600",
      textAlign: "center"
    },
    secondaryButton: {
      alignItems: "center",
      backgroundColor: colors.surface2,
      borderRadius: radius.control,
      justifyContent: "center",
      minHeight: layout.control,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md
    },
    secondaryButtonText: {
      ...textStyles.body,
      color: colors.text,
      flexShrink: 1,
      fontWeight: "600",
      textAlign: "center"
    },
    input: {
      ...textStyles.body,
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderRadius: radius.input,
      borderWidth: 1,
      color: colors.text,
      minHeight: layout.control,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    chip: {
      alignItems: "center",
      backgroundColor: colors.surface2,
      borderRadius: radius.control,
      justifyContent: "center",
      minHeight: layout.control,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    chipText: {
      ...textStyles.small,
      color: colors.text2,
      flexShrink: 1,
      fontWeight: "600",
      textAlign: "center"
    },
    selectedChip: {
      backgroundColor: colors.accentSoft
    },
    selectedChipText: {
      color: colors.accent
    }
  } as const;
}
