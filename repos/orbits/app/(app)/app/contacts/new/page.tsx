import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveBusinessCardCaptureAvailability } from "../../../../../features/acquisition/business-card-capture-availability";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealCardsImport } from "../orbit-real-cards-import";

export const dynamic = "force-dynamic";

/**
 * Contact acquisition is an action workspace, not a batch preflight.
 *
 * Loading the page must never run OCR, QR, attendee import, address-book
 * import, referral, merge, or signal services. Each supported source owns its
 * readiness/error state and is invoked only after an explicit user action.
 */
export default async function AppContactScanPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fcontacts%2Fnew");
  }

  const businessCardAvailability =
    resolveBusinessCardCaptureAvailability();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealCardsImport
        businessCardAvailability={businessCardAvailability}
      />
    </>
  );
}
