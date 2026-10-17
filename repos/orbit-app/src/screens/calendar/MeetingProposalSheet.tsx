export interface MeetingProposalSheetProps {
  open: boolean;
  contactId: string;
  onClose: () => void;
  onSent?: (appointmentId: string) => void;
  appointmentId?: string;
  initialCandidates?: readonly { startsAt: string; endsAt: string }[];
}

/** R20a SC-11a: stable R11 integration surface; proposal behavior follows in SC-11. */
export function MeetingProposalSheet({ open, onClose }: MeetingProposalSheetProps) {
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  return (
    <BottomSheet visible={open} onClose={onClose} accessibilityLabel={t("calendar.proposal.title")}>
      <View style={styles.body}>
        <UiText accessibilityRole="header" style={styles.title}>{t("calendar.proposal.title")}</UiText>
        <UiText accessibilityRole="header" style={styles.step}>{t("calendar.proposal.candidates")}</UiText>
        <UiText accessibilityRole="header" style={styles.step}>{t("calendar.proposal.format")}</UiText>
        <UiText accessibilityRole="header" style={styles.step}>{t("calendar.proposal.review")}</UiText>
      </View>
    </BottomSheet>
  );
}
import { StyleSheet, View } from "react-native";
import { BottomSheet, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { spacing, textStyles } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";


const useStyles = createThemedStyles(colors => StyleSheet.create({
  body: { gap: spacing.lg },
  title: { ...textStyles.title, color: colors.ink },
  step: { ...textStyles.listTitle, color: colors.ink },
}));
