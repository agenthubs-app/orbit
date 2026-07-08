import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for Sprint 92 panel localization`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

function visibleText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(visibleText).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value).map(visibleText).join(" ");
  }

  return "";
}

function assertNoEnglishPanelLabels(value: unknown) {
  const text = visibleText(value);

  assert.doesNotMatch(
    text,
    /\b(?:Recommended contacts|Recommended events|Follow-up queue|Goal-based contact recommendations|Event matches|Prioritized next actions|Review contact|Review event|Review person|Review source|Preview add to calendar|High confidence|Medium confidence|Evidence-backed|Evidence snippets|Source context|Data source|Local preview only|Unconfirmed|Confirmation unavailable|Orbit could not reply right now|No source-backed upcoming relationship work|People context|Preparation prompt|Profile fit summary|Relationship opportunity graph|Schedule timing record)\b/,
  );
}

test("Orbit AI panel localization exposes one namespace catalog and documented fallback", async () => {
  const module = await importProjectModule<{
    ORBIT_AI_PANEL_LOCALIZATION_NAMESPACES: readonly string[];
  }>("features/orbit-ai/panel-localization.ts");
  const doc = readFileSync(
    join(projectRoot, "features/orbit-ai/PANEL_LOCALIZATION.md"),
    "utf8",
  );

  assert.deepEqual(module.ORBIT_AI_PANEL_LOCALIZATION_NAMESPACES, [
    "panel",
    "artifact",
    "metadata",
    "actions",
    "confidence",
    "calendar",
    "proactive",
    "conversation",
    "recovery",
  ]);

  for (const namespace of module.ORBIT_AI_PANEL_LOCALIZATION_NAMESPACES) {
    assert.match(doc, new RegExp(`\\b${namespace}\\b`));
  }

  assert.match(doc, /missing translation key/i);
  assert.match(doc, /fallback/i);
});

test("Orbit AI localizes follow-up context, contact, event, and general conversation result copy", async () => {
  const module = await importProjectModule<{
    localizeOrbitAiPanelPayload: <T>(value: T, locale: "en" | "zh") => T;
    localizeOrbitAiPanelText: (value: string, locale: "en" | "zh") => string;
  }>("features/orbit-ai/panel-localization.ts");

  const payload = {
    artifacts: [
      {
        result: {
          generatedView: {
            sections: [
              {
                items: [
                  {
                    actions: [
                      {
                        actionId: "contact:review:contact_001",
                        href: "/app/contacts/contact_001",
                        label: "Review contact",
                        requiresConfirmation: true,
                      },
                    ],
                    body:
                      "Evidence snippets: Generated contact profile: profile match. Relationship graph: warm intro path.",
                    confidenceLabel: "High confidence · 94",
                    id: "contact-recommendation:contact_001",
                    metadata: [
                      { label: "Contact", value: "contact_001" },
                      { label: "Source", value: "Generated contact profile" },
                      { label: "Score", value: "94" },
                      { label: "Privacy", value: "full" },
                    ],
                    reason:
                      "Review the relationship path and source evidence before asking for an intro, message, or follow-up.",
                    subtitle: "Founder · North Star Foods",
                    title: "佐藤 健一",
                  },
                ],
                title: "Goal-based contact recommendations",
              },
            ],
            summary: "1 existing relationship path matched the request.",
          },
          nextAction:
            "Open a contact detail page and verify the source snippets before requesting an intro, message, or follow-up.",
          presentation: {
            subtitle: "Matched from existing relationship evidence only",
            title: "Recommended contacts",
          },
          status: "ready",
        },
        task: {
          artifactId: "artifact:contact-recommendations:rules-v1",
          kind: "contact_recommendations",
        },
      },
      {
        result: {
          generatedView: {
            sections: [
              {
                items: [
                  {
                    actions: [
                      {
                        actionId: "event:review:event_001",
                        href: "/app/events/demo-event-1?sourceEventId=event_001",
                        label: "Review event",
                        requiresConfirmation: true,
                      },
                    ],
                    body:
                      "People to meet: investors and founders. Timing: tomorrow morning. Profile fit summary: seed fundraising. Relationship opportunity graph: warm paths. Schedule timing record: available.",
                    confidenceLabel: "Medium confidence · 82",
                    id: "event-recommendation:event_001",
                    metadata: [
                      { label: "Event", value: "event_001" },
                      { label: "Timing", value: "Tomorrow 09:00" },
                      { label: "Source", value: "Profile fit summary" },
                      { label: "Reason", value: "Relationship opportunity graph" },
                      { label: "Data source", value: "Schedule timing record" },
                      { label: "Score", value: "82" },
                    ],
                    reason:
                      "Review event evidence before registering, adding calendar holds, notifying anyone, or taking external action.",
                    title: "Seed Investor and Founder Matching Salon",
                  },
                ],
                title: "Event matches",
              },
            ],
            summary:
              "Orbit AI loaded reviewable event recommendations from Events without registration, calendar writes, notifications, or external actions.",
          },
          nextAction:
            "Review event evidence before registering, adding calendar holds, notifying anyone, or taking external action.",
          presentation: { title: "Recommended events" },
          status: "ready",
        },
        task: {
          artifactId: "artifact:event-recommendations:rules-v1",
          kind: "event_recommendations",
        },
      },
      {
        result: {
          generatedView: {
            sections: [
              {
                items: [
                  {
                    actions: [
                      {
                        actionId: "todo:review:conversation:aoba-pilot-recap",
                        href: "/app/contacts/contact_010",
                        label: "Review person",
                        requiresConfirmation: true,
                      },
                    ],
                    body: "Due: Today 15:00. Source context: conversation.",
                    confidenceLabel: "high priority · 146",
                    id: "conversation:aoba-pilot-recap",
                    metadata: [
                      { label: "Due", value: "Today 15:00" },
                      { label: "Source context", value: "conversation" },
                      { label: "Source", value: "Saved relationship conversation" },
                    ],
                    reason:
                      "Saved conversation context says Aoba Technologies asked for a concise pilot timeline.",
                    title:
                      "Send the Aoba pilot timeline recap before the 15:00 decision window",
                  },
                ],
                title: "Prioritized next actions",
              },
            ],
            summary:
              "No source-backed upcoming relationship work matched this prompt.",
          },
          nextAction:
            "Review the linked person or event before sending, scheduling, notifying, or writing anything.",
          presentation: {
            subtitle: "Conversation and schedule context",
            title: "Upcoming relationship work",
          },
          status: "ready",
        },
        task: {
          artifactId: "artifact:todo-summary:structured-context",
          kind: "followup_queue",
        },
      },
    ],
    assistantMessage:
      "Understood. Keep describing the goal in natural language; if contact, event, or follow-up context is needed, I will explain what to inspect before waiting for confirmation.",
    nextAction: "Orbit could not reply right now. Please try again.",
    proposedToolIntents: [
      {
        intentId: "intent:followup-queue",
        label: "Review follow-up queue",
        reason:
          "The user asked about follow-ups, so a follow-up review artifact can be generated.",
        requiresUserConfirmation: true,
        toolFamily: "followups",
      },
    ],
    provenance: {
      source: "fixture:features/orbit-ai/mock-conversation-service.ts",
      sourceLabel: "Orbit Agent free-form reply rule",
    },
  };
  const localized = module.localizeOrbitAiPanelPayload(payload, "zh");
  const text = visibleText(localized);

  assert.match(text, /推荐人脉/);
  assert.match(text, /联系人/);
  assert.match(text, /来源/);
  assert.match(text, /高可信 · 94/);
  assert.match(text, /证据片段：生成联系人画像/);
  assert.match(text, /推荐活动/);
  assert.match(text, /活动匹配/);
  assert.match(text, /查看活动/);
  assert.match(text, /中等可信 · 82/);
  assert.match(text, /画像匹配摘要/);
  assert.match(text, /关系机会图谱/);
  assert.match(text, /日程时间记录/);
  assert.match(text, /关系待办摘要/);
  assert.match(text, /优先下一步/);
  assert.match(text, /高优先级 · 146/);
  assert.match(text, /复核跟进队列/);
  assert.match(
    module.localizeOrbitAiPanelText(
      "Orbit could not reply right now. Please try again.",
      "zh",
    ),
    /Orbit 现在没有返回结果/,
  );
  assertNoEnglishPanelLabels(localized);
});

test("Orbit AI localizes calendar action and proactive message panel copy without touching technical ids", async () => {
  const module = await importProjectModule<{
    localizeOrbitAiPanelCalendarActionPreview: <T>(value: T, locale: "en" | "zh") => T;
    localizeOrbitAiPanelProactiveContext: <T>(value: T, locale: "en" | "zh") => T;
  }>("features/orbit-ai/panel-localization.ts");
  const calendarPreview = {
    actionId: "calendar-preview:event_001",
    itemId: "event-recommendation:event_001",
    label: "Preview add to calendar",
    source: {
      artifactSource: "runtime:features/orbit-ai/event-recommendation-artifact-service.ts",
      evidenceIds: ["evidence:event:001"],
      label: "Attendee intent notes",
    },
    wouldAdd: {
      reason:
        "Review event evidence before registering, adding calendar holds, notifying anyone, or taking external action.",
      relatedLink: {
        href: "/app/events/demo-event-1?sourceEventId=event_001",
        label: "Review event",
      },
      timeZone: "Asia/Tokyo",
      title: "Seed Investor and Founder Matching Salon",
    },
  };
  const proactiveContext = {
    activityTitle: "Seed investor preparation call",
    peopleContext: "Mina Park: warm intro from last week's founder salon",
    preparationPrompt:
      "Review the investor's climate portfolio and prepare two follow-up paths.",
    relationshipContext:
      "Mina is connected through the founder salon and asked for a short operator update.",
    sourceLabel: "Local calendar fixture",
    timeLabel: "09:45",
  };
  const localizedCalendar =
    module.localizeOrbitAiPanelCalendarActionPreview(calendarPreview, "zh");
  const localizedProactive =
    module.localizeOrbitAiPanelProactiveContext(proactiveContext, "zh");
  const combinedText = visibleText([localizedCalendar, localizedProactive]);

  assert.equal(localizedCalendar.actionId, "calendar-preview:event_001");
  assert.equal(
    localizedCalendar.source.artifactSource,
    "runtime:features/orbit-ai/event-recommendation-artifact-service.ts",
  );
  assert.equal(localizedCalendar.wouldAdd.relatedLink.href, "/app/events/demo-event-1?sourceEventId=event_001");
  assert.match(combinedText, /预览加入日历/);
  assert.match(combinedText, /参会者意图记录/);
  assert.match(combinedText, /查看活动/);
  assert.match(combinedText, /复核活动证据/);
  assert.match(combinedText, /种子投资人准备电话/);
  assert.match(combinedText, /人物上下文/);
  assert.match(combinedText, /本地日历记录/);
  assertNoEnglishPanelLabels([localizedCalendar, localizedProactive]);
});
