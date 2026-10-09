// Component kind of each shared/copy entry, for the length and tone rules.
// Group default first, then per-key overrides ("group.key").
export const GROUP_KINDS = {
  nav: "nav",
  taskSegments: "tab",
  action: "button",
  chip: "chip",
  toast: "toast",
  confirm: "sentence",
  filter: "button",
  aiCard: "button",
  offline: "banner",
  error: "dialogTitle",
  degraded: "dialogTitle",
  loading: "banner",
  sample: "banner",
  quota: "chip",
  push: "menu",
  permission: "button",
  homeEdit: "button",
  draftBoundary: "button",
};

export const KEY_KINDS = {
  "nav.main": "label",
  "nav.back": "button",
  "nav.backTo": "label",
  "nav.askIorbit": "label",
  "action.tomorrow": "swipe",
  "confirm.deleteTitle": "confirmTitle",
  "confirm.delete": "button",
  "confirm.keepGoing": "button",
  "aiCard.why": "label",
  "aiCard.added": "toast",
  "aiCard.addFailed": "dialogTitle",
  "aiCard.nothingWritten": "sentence",
  "offline.pending": "chip",
  "offline.synced": "toast",
  "error.checkConnection": "sentence",
  "error.inputKept": "sentence",
  "error.screenFailedBody": "sentence",
  "error.needsNetworkBody": "sentence",
  "error.viewCached": "button",
  "degraded.iorbitStopped": "sentence",
  "loading.loading": "label",
  "sample.tag": "chip",
  "quota.reached": "banner",
  "push.openedFromPush": "banner",
  "homeEdit.comingSoon": "toast",
  "draftBoundary.notice": "banner",
  "draftBoundary.noMessage": "banner",
};

export function kindOf(group, key) {
  return KEY_KINDS[`${group}.${key}`] ?? GROUP_KINDS[group];
}
