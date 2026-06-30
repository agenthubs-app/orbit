import {
  mockEmptyRelationshipNaturalSearchFixture,
  mockEmptyRelationshipNaturalSearchSuggestionsFixture,
  mockPendingRelationshipNaturalSearchFixture,
  mockPendingRelationshipNaturalSearchSuggestionsFixture,
  mockRelationshipNaturalSearchFailureProvenance,
  mockRelationshipNaturalSearchFixture,
  mockRelationshipNaturalSearchResults,
  mockRelationshipNaturalSearchSuggestionsFixture,
} from "../fixtures";
import type { RelationshipSearchStore } from "../backend";

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

export function createFixtureRelationshipSearchStore(): RelationshipSearchStore {
  return {
    kind: "fixture",

    readFailureProvenance() {
      return clonePayload(mockRelationshipNaturalSearchFailureProvenance);
    },

    readRelationshipResults() {
      return clonePayload(mockRelationshipNaturalSearchResults);
    },

    readScenarioPayloads() {
      return {
        empty: clonePayload(mockEmptyRelationshipNaturalSearchFixture),
        pending: clonePayload(mockPendingRelationshipNaturalSearchFixture),
        success: clonePayload(mockRelationshipNaturalSearchFixture),
      };
    },

    readSuggestionScenarioPayloads() {
      return {
        empty: clonePayload(mockEmptyRelationshipNaturalSearchSuggestionsFixture),
        pending: clonePayload(
          mockPendingRelationshipNaturalSearchSuggestionsFixture,
        ),
        success: clonePayload(mockRelationshipNaturalSearchSuggestionsFixture),
      };
    },
  };
}
