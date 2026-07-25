import assert from "node:assert/strict";
import test from "node:test";
import {
  relationshipConnectionIdForContact,
  relationshipValueStateIsEmpty,
  relationshipValueToView
} from "../src/view-models/relationship-value";

test("relationshipConnectionIdForContact resolves a contact's connection id", () => {
  assert.equal(
    relationshipConnectionIdForContact(
      { contact: { connectionId: "connection:direct", id: "contact:maya" } },
      { connections: [] },
      "contact:maya"
    ),
    "connection:direct"
  );

  assert.equal(
    relationshipConnectionIdForContact(
      { contact: { id: "contact:maya" } },
      {
        connections: [
          { contactId: "contact:kenji", id: "connection:kenji" },
          { contactId: "contact:maya", id: "connection:maya" }
        ]
      },
      "contact:maya"
    ),
    "connection:maya"
  );
});

test("relationshipValueToView maps a success payload into a Chinese card", () => {
  const view = relationshipValueToView({
    assessment: {
      contactDisplayName: "Kenji Watanabe",
      priorityScore: {
        band: "critical",
        factors: [
          {
            evidenceIds: [
              "evidence:connection-storage-pilot",
              "evidence:connection-email-context"
            ],
            label: "Clear operator-introduction fit",
            points: 11
          },
          {
            evidenceIds: ["evidence:connection-follow-up"],
            label: "Time-sensitive follow-up path",
            points: 8
          }
        ],
        value: 93
      },
      rationale: {
        evidence: [
          {
            capturedAt: "2026-06-25T19:05:00.000Z",
            contribution: "met_at_event",
            evidenceId: "evidence:connection-climate-dinner",
            label: "Climate founders dinner",
            sourceType: "event_import"
          },
          {
            capturedAt: "2026-06-25T19:05:00.000Z",
            contribution: "business_context",
            evidenceId: "evidence:connection-storage-pilot",
            label: "Storage pilot note",
            sourceType: "manual"
          }
        ],
        limitations: [
          "The mock score cannot observe live replies, calendar activity, or delivery outcomes."
        ],
        summary:
          "Kenji has high relationship value because the storage pilot operator intro is explicit, timely, and backed by event plus email context."
      },
      relationshipValueType: "strategic_intro",
      suggestedNextAction: {
        channel: "email",
        confidence: "high",
        dueWindow: "before Friday partner review",
        label: "Send the storage pilot operator introduction",
        reason:
          "The evidence says Kenji asked for an operator introduction and the follow-up window is still open."
      }
    },
    nextAction: "Send the storage pilot operator introduction.",
    state: "success",
    summary:
      "Kenji Watanabe is a critical relationship value candidate for a source-backed operator introduction."
  });

  assert.deepEqual(view, {
    evidenceLines: ["活动见过：气候创始人晚宴", "业务背景：储能试点记录"],
    factors: [
      { label: "适合做运营方引荐", pointsLabel: "+11" },
      { label: "跟进窗口还开着", pointsLabel: "+8" }
    ],
    kind: "ready",
    nextAction: "发一条储能试点运营方引荐 · 周五合作方复盘前 · 把握较高",
    priorityLabel: "优先处理",
    safetyText: "只读分析，未发送消息。",
    scoreLabel: "93 分",
    summary: "Kenji Watanabe 适合优先跟进。当前证据支持战略引荐。"
  });
});

test("relationshipValueToView handles empty and pending states", () => {
  assert.equal(
    relationshipValueStateIsEmpty({ assessment: null, state: "empty" }),
    true
  );
  assert.deepEqual(
    relationshipValueToView({
      assessment: null,
      nextAction: "Select a mock connection with evidence before scoring relationship value.",
      state: "empty",
      summary: "No mock relationship value can be scored without evidence."
    }),
    {
      body: "这条关系还没有足够证据。先补来源，再判断是否值得投入时间。",
      kind: "empty",
      nextAction: "先补一条来源证据。"
    }
  );
  assert.deepEqual(
    relationshipValueToView({
      assessment: null,
      nextAction: "Wait for mock evidence review before recomputing relationship value.",
      state: "pending",
      summary:
        "Relationship value scoring is waiting for local fixture review before a priority score is exposed."
    }),
    {
      body: "关系价值还在复核。现在先看来源证据，不急着推进。",
      kind: "pending",
      nextAction: "等证据复核完成。"
    }
  );
});
