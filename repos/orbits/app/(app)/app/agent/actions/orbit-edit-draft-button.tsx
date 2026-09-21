"use client";

import { openRelationshipInboxCompose } from "../../inbox/relationship-inbox-panel";

export function OrbitEditDraftButton({
  body,
  organization,
  recipient,
  subject,
}: {
  body: string;
  organization?: string;
  recipient?: string;
  subject: string;
}) {
  return (
    <button
      className="btn btn-quiet"
      onClick={() =>
        openRelationshipInboxCompose({
          body,
          organization,
          recipient,
          subject,
        })
      }
      type="button"
    >
      打开沟通编辑器
    </button>
  );
}
