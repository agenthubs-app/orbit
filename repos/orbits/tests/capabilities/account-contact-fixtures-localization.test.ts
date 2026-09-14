import assert from "node:assert/strict";
import test from "node:test";
import { buildAccountContactFixtures } from "../../shared/mock/account-contact-fixtures";

test("account contact fixtures expose detailed Chinese product copy in contact and relationship projections", () => {
  const records = buildAccountContactFixtures("industry-fixture-account");
  assert.deepEqual(records.map(({ contact }) => contact.displayName), [
    "林玫", "佐藤健司", "田中爱子", "普丽娅·拉奥", "索菲娅·马丁内斯", "奥马尔·拉赫曼",
    "森花", "陈立安", "艾玛·威尔逊", "小林大地", "诺拉·费舍尔", "拉菲尔·科斯塔",
  ]);
  for (const { contact, connection, evidenceRecords } of records) {
    assert.ok(connection.summary.length >= 55, contact.id);
    assert.ok(contact.nextAction && contact.nextAction.text.length >= 28, contact.id);
    assert.ok(contact.publicProfile?.bio);
    assert.ok(contact.publicProfile.selfIntroduction);
    assert.equal(contact.profileSnippet, contact.publicProfile.bio);
    assert.notEqual(contact.profileSnippet, connection.summary);
    assert.equal(evidenceRecords.length, 3);
    assert.ok(evidenceRecords.every((evidence) => evidence.summary.length > 0));
  }
});
