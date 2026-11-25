import React from "react";

import { AttendeeSheet } from "../../src/screens/events/v2/AttendeeSheet";

export function AttendeeSheetHost() {
  return <AttendeeSheet eventId="e1" onClose={() => undefined} person={{ attendeeId: "a1", initial: "佐", name: "佐藤" }} />;
}
