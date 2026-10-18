import type { ReactNode } from "react";

import { AppScreen } from "./AppScreen";
import { IconButton } from "./ui/IconButton";

// R31a (R11a request): the full-page edit container — b5 #42–#43 連絡先を編集: kit .topbar with a ✕ round button
// (キャンセル) on the left, the centred title, an ink ✓ round button (保存) on the right, then the scrolling form on
// the kit .scroll inset (AppScreen inset="kit"). Both buttons are icon-only; their labels are what VoiceOver reads.
// The form itself (fields, sections) is the caller's.
export function FormScreen({ title, subtitle, cancelLabel, saveLabel, onCancel, onSave, saveDisabled = false, children }: {
  title: string;
  subtitle?: string;
  cancelLabel: string;
  saveLabel: string;
  onCancel: () => void;
  onSave: () => void;
  /** while saving or with an invalid form: the ✓ is dimmed and does nothing */
  saveDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <AppScreen
      inset="kit"
      title={title}
      subtitle={subtitle}
      backIcon="x"
      backAccessibilityLabel={cancelLabel}
      onBack={onCancel}
      headerActions={<IconButton icon="check" solid accessibilityLabel={saveLabel} disabled={saveDisabled} onPress={onSave} />}
    >
      {children}
    </AppScreen>
  );
}
