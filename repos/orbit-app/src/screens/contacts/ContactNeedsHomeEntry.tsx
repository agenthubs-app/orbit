import { type Href, useRouter } from "expo-router";

import { useContactNeeds } from "../../hooks/useContactNeeds";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import {
  ContactNeedsEditor,
  ContactNeedsHomeCard,
  contactNeedsErrorMessageKeys,
  contactNeedsSuccessMessageKeys,
} from "./ContactNeedsEditor";

export function ContactNeedsHomeEntry() {
  const locale = useOrbitLocale();
  const router = useRouter();
  const needs = useContactNeeds();
  return (
    <>
      <ContactNeedsHomeCard
        goal={needs.goal}
        loading={needs.loading}
        onEdit={needs.open}
        onOpenMatches={() => router.push("/contacts/matches" as Href)}
        onRetry={needs.refresh}
        unavailable={needs.unavailable}
      />
      <ContactNeedsEditor
        draft={needs.draft}
        error={needs.error ? locale.t(contactNeedsErrorMessageKeys[needs.error]) : null}
        message={needs.message ? locale.t(contactNeedsSuccessMessageKeys[needs.message]) : null}
        onCancel={needs.cancel}
        onChange={needs.setDraft}
        onSave={needs.save}
        saving={needs.saving}
        visible={needs.visible}
      />
    </>
  );
}
