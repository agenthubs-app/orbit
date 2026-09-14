import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "contacts", "ContactIntrosScreen.tsx"),
  "utf8"
);

test("contact intros creates an explicit shareable server invitation", () => {
  assert.match(screenSource, /useOrbitApiClient/u);
  assert.match(screenSource, /buildRelationshipInvitationRequest/u);
  assert.match(screenSource, /relationshipCommunicationInvitationsPath/u);
  assert.match(screenSource, /client\.post<unknown>/u);
  assert.match(screenSource, /Share\.share/u);
  assert.match(screenSource, /TextInput/u);
  assert.match(screenSource, /"创建邀请链接"/u);
  assert.match(screenSource, /"系统分享"/u);
  assert.match(screenSource, /InvitationDraftCard/u);
  assert.match(screenSource, /invitationUrl/u);
  assert.doesNotMatch(screenSource, /邀请已发送|邮件已发送|messageSent=true/u);
});

test("contact intros keeps prepared invitations visible as local intro records", () => {
  assert.match(screenSource, /preparedInvitations/u);
  assert.match(screenSource, /setPreparedInvitations/u);
  assert.match(screenSource, /PreparedInvitationRecordsCard/u);
  assert.match(screenSource, /"本次引荐记录"/u);
  assert.match(screenSource, /pendingCount/u);
  assert.match(screenSource, /等待接受/u);
  assert.match(screenSource, /没有外发/u);
  assert.match(screenSource, /打开链接后由对方确认/u);
  assert.doesNotMatch(screenSource, /后端列表 API|补齐后再同步历史记录/u);
});
