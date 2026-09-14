import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/(app)/app/invitations/[token]/page.tsx", "utf8");
const clientSource = readFileSync("app/(app)/app/invitations/[token]/relationship-invitation-client.tsx", "utf8");

test("invitation page requires sign-in and returns to the exact invitation", () => {
  assert.match(pageSource, /await Promise\.all\(\[params, auth\(\)\]\)/u);
  assert.match(pageSource, /\/app\/account\/login/u);
  assert.match(pageSource, /\/app\/invitations\/\$\{encodeURIComponent\(token\)\}/u);
});

test("invitation client previews first and accepts only from an explicit button", () => {
  assert.match(clientSource, /method: "GET"/u);
  assert.match(clientSource, /confirmed: true/u);
  assert.match(clientSource, /method: "POST"/u);
  assert.match(clientSource, /onClick=\{acceptInvitation\}/u);
  assert.match(clientSource, /接受邀请并建立关系对话/u);
  const previewEffect = clientSource.slice(
    clientSource.indexOf("useEffect(() =>"),
    clientSource.indexOf("}, [endpoint]);"),
  );
  assert.doesNotMatch(previewEffect, /acceptInvitation/u);
});
