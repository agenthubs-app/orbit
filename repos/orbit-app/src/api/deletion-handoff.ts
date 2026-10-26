// QA-D: right after a deletion request the server drops the session, and the first 401 sends the App to 登录.
// The deletion page marks the hand-off so that redirect lands on 「已受理删除申请」 instead (for one minute).
let markedAt = 0;

export function markDeletionRequested(now = Date.now()): void {
  markedAt = now;
}

export function takeDeletionRedirect(now = Date.now()): "/account/pending" | null {
  const recent = markedAt > 0 && now - markedAt < 60_000;
  markedAt = 0;
  return recent ? "/account/pending" : null;
}
