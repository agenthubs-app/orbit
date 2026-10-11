// R12 人脈を追加 as a bottom sheet (DESIGN §2.1, app.html 人脈「＋」): the same doors as the
// `contacts/new` page inside the R04 BottomSheet. R11 opens it from the 人脈 「＋」 button;
// until then it lives on the component showcase. Choosing a door closes the sheet first.
import { type Href, useRouter } from "expo-router";
import { View } from "react-native";

import { BottomSheet, UiText } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AddContactDoors } from "./AddContactDoors";
import { useAddStyles } from "./add-ui";

export function AddContactSheet({ visible, onClose, draftCount = 0, onOpen }: { visible: boolean; onClose: () => void; draftCount?: number; onOpen?: (href: string) => void }) {
  const router = useRouter();
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const open = (href: string) => {
    onClose();
    if (onOpen) onOpen(href);
    else router.push(href as Href);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("add.doors.sheetLabel")}>
      <View style={styles.stack} testID="add-contact-sheet">
        <UiText accessibilityRole="header" style={styles.title}>{t("add.doors.title")}</UiText>
        <AddContactDoors draftCount={draftCount} onOpen={open} />
      </View>
    </BottomSheet>
  );
}
