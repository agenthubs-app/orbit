import { StyleSheet, View } from "react-native";

import type { MeetingDetailsContract } from "../../api/contract/appointments";
import { Button } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { spacing } from "../../design/tokens";

export function MeetingDetailActions({ meeting, blocked, busy, labels, onMove, onCancel }: {
  meeting: MeetingDetailsContract;
  blocked: boolean;
  busy: boolean;
  labels: { move: string; cancel: string };
  onMove: () => void;
  onCancel: () => void;
}) {
  const { styles } = useStyles();
  if (meeting.visibility !== "participants" || meeting.status !== "confirmed" || !meeting.confirmed || !meeting.contactId) return null;
  return <View style={styles.actions}>
    <Button label={labels.move} disabled={blocked || busy} onPress={onMove} />
    <Button label={labels.cancel} variant="dangerGhost" disabled={blocked || busy} onPress={onCancel} />
  </View>;
}

const useStyles = createThemedStyles(() => StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
}));
