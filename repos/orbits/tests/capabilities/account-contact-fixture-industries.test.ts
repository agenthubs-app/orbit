import assert from "node:assert/strict";
import test from "node:test";
import { buildAccountContactFixtures } from "../../shared/mock/account-contact-fixtures";

test("account fixture records project confirmed industries without inventing ambiguous children", () => {
  const records = buildAccountContactFixtures("industry-fixture-account");
  assert.equal(records.length, 12);
  const expected = [
    ["finance_investment", "finance_investment.venture_capital"],
    ["manufacturing_supply_chain", "manufacturing_supply_chain.robotics"],
    ["professional_services", "professional_services.startup_services"],
    ["technology_internet", "technology_internet.ai_data"],
    ["retail_consumer", "retail_consumer.ecommerce"],
    ["technology_internet", "technology_internet.cloud_infrastructure"],
    ["community_nonprofit", undefined],
    ["technology_internet", "technology_internet.enterprise_software"],
    ["media_creative", "media_creative.advertising_marketing"],
    ["manufacturing_supply_chain", undefined],
    ["healthcare_life_sciences", undefined],
    ["food_hospitality", "food_hospitality.hotels_tourism"],
  ];
  records.forEach(({ sourceIndex, contact }, index) => {
    assert.equal(sourceIndex, index);
    assert.deepEqual([contact.primaryIndustryId, contact.secondaryIndustryId], expected[index]);
    assert.deepEqual([contact.publicProfile?.primaryIndustryId, contact.publicProfile?.secondaryIndustryId], expected[index]);
    if (!expected[index][1]) {
      assert.equal(Object.hasOwn(contact, "secondaryIndustryId"), false);
      assert.equal(Object.hasOwn(contact.publicProfile!, "secondaryIndustryId"), false);
    }
  });
});

test("account fixture construction preserves deterministic IDs, dates and ownership across projections", () => {
  const records = buildAccountContactFixtures("industry-fixture-account");
  assert.equal(records.length, 12);
  assert.deepEqual(buildAccountContactFixtures("industry-fixture-account"), records);
  const other = buildAccountContactFixtures("another-fixture-account");
  records.forEach(({ contact, connection, evidenceRecords }, index) => {
    assert.equal(connection.accountId, "industry-fixture-account");
    assert.equal(connection.contactId, contact.id);
    assert.equal(evidenceRecords.length, 3);
    assert.deepEqual(contact.evidenceIds, evidenceRecords.map((evidence) => evidence.id));
    assert.deepEqual(connection.evidenceIds, contact.evidenceIds);
    assert.equal(contact.createdAt, evidenceRecords[2].occurredAt);
    assert.equal(contact.updatedAt, evidenceRecords[0].occurredAt);
    assert.notEqual(other[index].contact.id, contact.id);
    assert.notEqual(other[index].contact.personId, contact.personId);
    assert.notEqual(other[index].connection.id, connection.id);
    evidenceRecords.forEach((evidence, interactionIndex) => {
      assert.equal(evidence.createdBy, "industry-fixture-account");
      assert.notEqual(other[index].evidenceRecords[interactionIndex].id, evidence.id);
    });
  });
  assert.equal(records[0].contact.updatedAt, "2026-07-25T09:30:00.000Z");
  assert.equal(records[0].contact.createdAt, "2026-06-09T09:30:00.000Z");
  assert.equal(records[0].contact.displayName, "林玫");
  assert.equal(records[11].contact.displayName, "拉菲尔·科斯塔");
  assert.equal(records[0].contact.id, "orbit-contact-9cb4ed0cd2-01");
  assert.equal(records[0].contact.personId, "orbit-person-9cb4ed0cd2-01");
  assert.equal(records[0].connection.id, "orbit-connection-9cb4ed0cd2-01");
  assert.equal(records[11].contact.id, "orbit-contact-9cb4ed0cd2-12");
  assert.deepEqual(records[0].evidenceRecords.map((evidence) => [evidence.id, evidence.sourceType]), [
    ["orbit-evidence-9cb4ed0cd2-01-1", "calendar_signal"],
    ["orbit-evidence-9cb4ed0cd2-01-2", "email_signal"],
    ["orbit-evidence-9cb4ed0cd2-01-3", "event_import"],
  ]);
});
