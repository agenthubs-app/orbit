// Imperative confirm / action sheet requests for code that is not a screen (for
// example AuthSessionProvider, which used Alert.alert). UI-free on purpose: the
// requester only needs this module; <UiFeedbackHost /> (feedback-host.tsx), mounted
// once at the root, registers itself as the presenter. Without a host a request
// resolves as cancelled.
export type ConfirmRequest = { title: string; message?: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean };
export type ActionSheetRequest = { title: string; effects?: { icon: string; text: string }[]; options: { key: string; label: string; destructive?: boolean }[] };
export type FeedbackRequest =
  | ({ kind: "confirm"; resolve: (value: boolean) => void } & ConfirmRequest)
  | ({ kind: "sheet"; resolve: (value: string | null) => void } & ActionSheetRequest);

let presenter: ((request: FeedbackRequest) => void) | null = null;

export function registerFeedbackPresenter(next: ((request: FeedbackRequest) => void) | null): void {
  presenter = next;
}

export function presentConfirm(options: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => (presenter ? presenter({ kind: "confirm", ...options, resolve }) : resolve(false)));
}

/** Resolves with the chosen key, or null when dismissed. */
export function presentActionSheet(options: ActionSheetRequest): Promise<string | null> {
  return new Promise((resolve) => (presenter ? presenter({ kind: "sheet", ...options, resolve }) : resolve(null)));
}
