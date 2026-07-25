import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "contacts", "ContactIntrosScreen.tsx"),
  "utf8"
);

test("contact intros can prepare and confirm staged Orbit invitations", () => {
  assert.match(screenSource, /useOrbitApiClient/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.contactInvitations/u);
  assert.match(screenSource, /buildContactInvitationPrepareRequest/u);
  assert.match(screenSource, /buildContactInvitationConfirmRequest/u);
  assert.match(screenSource, /contactInvitationToView/u);
  assert.match(screenSource, /client\.post<unknown>/u);
  assert.match(screenSource, /client\.patch<unknown>/u);
  assert.match(screenSource, /TextInput/u);
  assert.match(screenSource, /"生成邀请草稿"/u);
  assert.match(screenSource, /"确认邀请"/u);
  assert.match(screenSource, /InvitationDraftCard/u);
  assert.match(screenSource, /invitationSubject/u);
  assert.match(screenSource, /invitationBody/u);
  assert.doesNotMatch(screenSource, /邀请已发送|邮件已发送|messageSent=true/u);
});

test("contact intros keeps prepared invitations visible as local intro records", () => {
  assert.match(screenSource, /preparedInvitations/u);
  assert.match(screenSource, /setPreparedInvitations/u);
  assert.match(screenSource, /PreparedInvitationRecordsCard/u);
  assert.match(screenSource, /"本次引荐记录"/u);
  assert.match(screenSource, /draftCount/u);
  assert.match(screenSource, /readyCount/u);
  assert.match(screenSource, /草稿/u);
  assert.match(screenSource, /待投递/u);
  assert.match(screenSource, /没有外发/u);
  assert.match(screenSource, /确认后再进入发送前复核/u);
  assert.doesNotMatch(screenSource, /后端列表 API|补齐后再同步历史记录/u);
});
