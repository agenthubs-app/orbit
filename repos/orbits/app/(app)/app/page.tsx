import { redirect } from "next/navigation";

import { OrbitStarfieldHome } from "./orbit-starfield-home";
import { OrbitReferenceStyles } from "./orbit-reference-styles";
import { auth } from "../../../auth";

// The starfield journey stays the anonymous homepage; a signed-in member's
// home is the personal console at /app/home, so every login lands on the
// unified "what should I do now" surface instead of the marketing journey.
export default async function AppHomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/app/home");
  }

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitStarfieldHome authenticated={false} />
    </>
  );
}
