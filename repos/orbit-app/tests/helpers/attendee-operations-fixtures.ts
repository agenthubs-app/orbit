export function attendeeFixture() {
  const person = (participantId: string, displayName: string) => ({ participantId, displayName, company: "Orbit", role: "Engineer", industry: "Technology", topics: ["AI"], experienceHighlight: null, languages: ["zh"], needs: ["Partners"], offers: ["Engineering"] });
  const table = (seat: string) => ({ tableNumber: 1, theme: "Collaboration", rationale: "Shared interests", icebreakers: ["What are you building?"], memberPrompts: { p_me: ["My question"] }, memberRationales: { p_me: "Your interests" }, members: [{ participantId: "p_me", seat }, { participantId: "p_other", seat: "A2" }] });
  return {
    eventId: "event_1", configuration: { eventId: "event_1", checkInOpensAt: "2026-09-17T00:00:00Z", eventStartsAt: "2026-09-17T01:00:00Z", eventEndsAt: "2026-09-17T23:00:00Z", profileEditDeadlineAt: "2026-09-16T00:00:00Z", resultsAvailableAt: "2026-09-17T00:00:00Z", roundOneStartsAt: "2026-09-17T01:00:00Z", roundTwoStartsAt: "2026-09-17T02:00:00Z" },
    me: person("p_me", "My name"), directory: [person("p_me", "My name"), person("p_other", "Other person")],
    checkIn: null, checkInAvailable: true, profileEditable: false, resultsState: "ready",
    recommendations: { sourceParticipantId: "p_me", noMatchReason: null, recommendations: [{ targetParticipantId: "p_other", score: 90, reasons: ["Shared AI interests"], icebreakers: ["Talk about AI"], memberHint: "Say hello" }] },
    roundOneTable: table("A1"), roundTwoTable: table("B2"), contactRequests: [] as unknown[], graph: null,
  };
}
export function participantFixture() {
  return { company: "Orbit", displayName: "Other person", industry: "Technology", participantId: "p_other", role: "Engineer", topics: ["AI"], profileCompleteness: "complete", profileVersion: 1, sourceContext: "published_generation", responses: [{ answer: "Find collaborators", answeredAt: null, fieldKey: "goals", label: { en: "Goals", zh: "目标" }, prompt: null, questionSource: "ai_adaptive" }], recommendation: null, placements: [{ groupingRationale: "Shared interests", icebreakers: ["Hello"], roundNumber: 1, seat: "A2", tableNumber: 1, theme: "Collaboration" }], contactRequest: { contactId: null, direction: null, requestId: null, revision: null, status: "none" } };
}
