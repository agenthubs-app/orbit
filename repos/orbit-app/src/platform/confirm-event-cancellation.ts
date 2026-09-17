import { Alert, Platform } from "react-native";

export function confirmEventCancellation(input: {
  title: string;
  message: string;
  keepLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onUnavailable: () => void;
}) {
  let consumed = false;
  const confirm = () => {
    if (consumed) return;
    consumed = true;
    input.onConfirm();
  };
  if (Platform.OS === "web") {
    let accepted: boolean;
    try {
      if (typeof globalThis.confirm !== "function") {
        input.onUnavailable();
        return;
      }
      accepted = globalThis.confirm(`${input.title}\n\n${input.message}`);
    } catch {
      input.onUnavailable();
      return;
    }
    if (accepted === true) confirm();
    return;
  }
  try {
    Alert.alert(input.title, input.message, [
      { text: input.keepLabel, style: "cancel" },
      { text: input.cancelLabel, style: "destructive", onPress: confirm }
    ]);
  } catch {
    input.onUnavailable();
  }
}
