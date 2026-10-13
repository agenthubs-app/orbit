// R12 人脈を追加 as a bottom sheet (app.html 人脈「＋」, b12 N08; D19). `contacts/new` shows it
// over 人脈; R11 opens it from 人脈 「＋」. Choosing a door closes the sheet first.
import { type Href, useRouter } from "expo-router";
import { View } from "react-native";

import { BottomSheet } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AddContactDoors } from "./AddContactDoors";

export function AddContactSheet({ visible, onClose, draftCount = 0, onOpen }: { visible: boolean; onClose: () => void; draftCount?: number; onOpen?: (href: string) => void }) {
  const router = useRouter();
  const { t } = useOrbitLocale();
  const open = (href: string) => {
    onClose();
    if (onOpen) onOpen(href);
    else router.push(href as Href);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("add.doors.sheetLabel")}>
      <View testID="add-contact-sheet">
        <AddContactDoors draftCount={draftCount} onOpen={open} onClose={onClose} />
      </View>
    </BottomSheet>
  );
}
