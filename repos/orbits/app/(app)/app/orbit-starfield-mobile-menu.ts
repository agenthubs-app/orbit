type StarfieldMobileMenuDocument = Pick<
  Document,
  "addEventListener" | "removeEventListener"
>;

function menuTarget(event: Event): Node | null {
  return event.target as Node | null;
}

export function bindStarfieldMobileMenu(
  host: HTMLElement,
  documentTarget: StarfieldMobileMenuDocument = document,
): () => void {
  const button = host.querySelector<HTMLButtonElement>("#skBurger");
  const navigation = host.querySelector<HTMLElement>("#skMenu");

  if (!button || !navigation) {
    return () => undefined;
  }

  const links = Array.from(
    navigation.querySelectorAll<HTMLAnchorElement>("a[href]"),
  );
  let open = false;

  const setOpen = (
    nextOpen: boolean,
    { restoreFocus = false }: { restoreFocus?: boolean } = {},
  ) => {
    open = nextOpen;
    button.setAttribute("aria-expanded", String(open));
    navigation.hidden = !open;
    navigation.style.display = open ? "flex" : "none";

    if (open) {
      navigation.removeAttribute("inert");
    } else {
      navigation.setAttribute("inert", "");
    }

    if (!open && restoreFocus) {
      button.focus();
    }
  };

  const onButtonClick = (event: MouseEvent) => {
    event.stopPropagation();
    setOpen(!open);
  };
  const onDocumentClick = (event: MouseEvent) => {
    const target = menuTarget(event);

    if (
      open &&
      !navigation.contains(target) &&
      !button.contains(target)
    ) {
      setOpen(false);
    }
  };
  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false, { restoreFocus: true });
    }
  };
  const onLinkClick = () => {
    setOpen(false);
  };

  setOpen(false);
  button.addEventListener("click", onButtonClick);
  documentTarget.addEventListener("click", onDocumentClick);
  documentTarget.addEventListener("keydown", onDocumentKeyDown, true);
  links.forEach((link) => link.addEventListener("click", onLinkClick));

  return () => {
    button.removeEventListener("click", onButtonClick);
    documentTarget.removeEventListener("click", onDocumentClick);
    documentTarget.removeEventListener("keydown", onDocumentKeyDown, true);
    links.forEach((link) => link.removeEventListener("click", onLinkClick));
  };
}
