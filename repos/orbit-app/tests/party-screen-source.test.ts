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
  const ticketStart = screenSource.indexOf("function TicketCard");
  const graphSource = screenSource.slice(graphStart, ticketStart);
  const connectionMapIndex = graphSource.indexOf("<PartyConnectionMap");
  const groupListIndex = graphSource.indexOf("party.graphGroups.map");

  assert.ok(graphStart > -1);
  assert.ok(ticketStart > graphStart);
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

test("party check-in supports the web one-tap completion flow", () => {
  const checkInStart = screenSource.indexOf("function PartyCheckIn");
  const graphStart = screenSource.indexOf("function PartyGraph");
  const checkInSource = screenSource.slice(checkInStart, graphStart);

  assert.ok(checkInStart > -1);
  assert.ok(graphStart > checkInStart);
  assert.match(screenSource, /useState/u);
  assert.match(checkInSource, /checkedIn/u);
  assert.match(checkInSource, /setCheckedIn\(true\)/u);
  assert.match(checkInSource, /title="签到完毕"/u);
  assert.match(checkInSource, /"一键签到"/u);
  assert.match(checkInSource, /"已签到"/u);
  assert.match(screenSource, /styles\.checkInCompleteCard/u);
  assert.match(screenSource, /styles\.checkInCompleteIcon/u);
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
