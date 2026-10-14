/** Kit surfaces that act as controls (.drop, .li, .cbx) without the library `.btn` look: role + Enter / Space. */
export function pressProps(onPress: () => void, disabled = false) {
  return {
    tabIndex: disabled ? -1 : 0,
    "aria-disabled": disabled || undefined,
    onClick: () => { if (!disabled) onPress(); },
    onKeyDown: (event: { key: string; preventDefault: () => void }) => {
      if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      onPress();
    },
  };
}

