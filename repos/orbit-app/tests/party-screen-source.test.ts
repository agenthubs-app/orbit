import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "party", "PartyModeScreen.tsx"),
  "utf8"
);

test("party graph renders a dedicated connection map before grouped lists", () => {
  const graphStart = screenSource.indexOf("function PartyGraph");
  const boundaryStart = screenSource.indexOf("function CheckInBoundaryCard");
  const graphSource = screenSource.slice(graphStart, boundaryStart);
  const connectionMapIndex = graphSource.indexOf("<PartyConnectionMap");
  const groupListIndex = graphSource.indexOf("party.graphGroups.map");

  assert.ok(graphStart > -1);
  assert.ok(boundaryStart > graphStart);
  assert.ok(connectionMapIndex > -1);
  assert.ok(
    groupListIndex === -1 || connectionMapIndex < groupListIndex,
    "connection map should appear before the lower grouped list"
  );
  assert.match(screenSource, /function PartyConnectionMap/u);
  assert.match(screenSource, /party\.priorityPeople\.slice\(0,\s*5\)\.map/u);
  assert.match(screenSource, /styles\.connectionMapStage/u);
  assert.match(screenSource, /styles\.connectionMapCenter/u);
  assert.match(screenSource, /styles\.connectionNode/u);
});

test("party check-in does not synthesize a code or local success state", () => {
  const checkInStart = screenSource.indexOf("function PartyCheckIn");
  const graphStart = screenSource.indexOf("function PartyGraph");
  const checkInSource = screenSource.slice(checkInStart, graphStart);

  assert.ok(checkInStart > -1);
  assert.ok(graphStart > checkInStart);
  assert.match(checkInSource, /签到尚未连接/u);
  assert.match(checkInSource, /party\.checkIn\.instruction/u);
  assert.doesNotMatch(checkInSource, /useState|setCheckedIn|一键签到|签到完毕/u);
  assert.doesNotMatch(screenSource, /4821|party\.checkIn\.accessCode/u);
});

test("party people surfaces render attendee avatar images when available", () => {
  assert.match(screenSource, /Image,/u);
  assert.match(screenSource, /useOrbitApiBaseUrl/u);
  assert.match(screenSource, /assetUrl/u);
  assert.match(screenSource, /function PartyPersonAvatar/u);
  assert.match(screenSource, /person\.imageUrl/u);
  assert.match(
    screenSource,
    /source=\{\{ uri: assetUrl\(baseUrl, imageUrl\) \}\}/u
  );
  assert.match(screenSource, /styles\.partyPersonAvatarImage/u);
  assert.match(screenSource, /styles\.connectionNodeAvatar/u);
  assert.match(screenSource, /styles\.graphPersonAvatar/u);
});

test("party routes do not synthesize live state when attendee data is absent", () => {
  assert.match(screenSource, /attendeeSourceMissing/u);
  assert.match(screenSource, /title="现场数据尚未连接"/u);
  assert.match(screenSource, /当前不会生成通行码、现场匹配或签到结果/u);
  assert.match(screenSource, /label="返回活动"/u);
});
