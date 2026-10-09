// R03 review M1: the component kind of each App dictionary key, for copy-qa's length
// and tone rules (`npm run copy:qa -- --app <domain>` in repos/orbits). Patterns use
// `*` for one key segment; the first match wins. A key in a checked domain without a
// kind is reported by copy-qa. Kinds: chip, toast, button, fullButton, swipe, nav, tab,
// dialogTitle, confirmTitle, banner, label, sentence, menu (scripts/copy-qa/README.md).
export const appCopyKinds: readonly (readonly [pattern: string, kind: string])[] = [
  ["shell.parent.*", "label"],
  ["shell.checkingSignInLabel", "label"],
  ["shell.checkingSignIn", "label"],
  ["shell.errorDetails", "label"],
  ["shell.noErrorDetails", "sentence"],
  ["session.pendingChangesTitle", "dialogTitle"],
  ["session.otherAccountTitle", "dialogTitle"],
  ["session.pendingChangesBody", "sentence"],
  ["session.otherAccountBody", "sentence"],
  ["session.keepAndSignOut", "fullButton"],
  ["session.discardAndSignOut", "fullButton"],
  ["session.backToSignIn", "fullButton"],
  ["session.continueWithAccount", "fullButton"],
  ["session.*", "sentence"],
];
