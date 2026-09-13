import { layout, radius, spacing, textStyles, type OrbitColors } from "./tokens";

// Layout and appearance only: consumers retain their own state and handlers.
export function createControlStyles(colors: OrbitColors) {
  return {
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.ink,
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
      fontWeight: "700",
      textAlign: "center"
    },
    secondaryButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.control,
      borderWidth: 1,
      borderColor: colors.ink,
      justifyContent: "center",
      minHeight: 46,
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
      backgroundColor: colors.ink
    },
    selectedChipText: {
      color: colors.onAccent
    }
  } as const;
}
