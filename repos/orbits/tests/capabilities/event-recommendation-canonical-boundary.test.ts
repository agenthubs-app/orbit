import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const recommendationToolSource = readFileSync(
  new URL(
    "../../features/events/event-recommendation-tool.ts",
    import.meta.url,
  ),
  "utf8",
);
const canonicalReaderSource = readFileSync(
  new URL(
    "../../features/events/core/event-recommendation-reader.ts",
    import.meta.url,
  ),
  "utf8",
);

test("event recommendations depend on the canonical Event Core reader only", () => {
  assert.match(
    recommendationToolSource,
    /from "\.\/core\/event-recommendation-reader"/u,
  );
  assert.doesNotMatch(
    recommendationToolSource,
    /from "\.\/public-catalogue"|readPublicEventCatalogueRecords|publicCatalogueRecords|defaultMockFixtures/u,
  );
  assert.match(
    canonicalReaderSource,
    /createConfiguredCanonicalPublicEventCatalogue/u,
  );
  assert.doesNotMatch(
    canonicalReaderSource,
    /from "\.\.\/public-catalogue"|readPublicEventCatalogueRecords|defaultMockFixtures/u,
  );
});

test("canonical recommendation reader consumes one batched catalogue snapshot", () => {
  assert.equal(
    canonicalReaderSource.match(/input\.catalogue\.readRecords\(\)/gu)?.length,
    1,
  );
  assert.doesNotMatch(canonicalReaderSource, /\.readRecord\(|\.read\(\)/u);
});
