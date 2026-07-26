import { OrbitStarfieldHome } from "./orbit-starfield-home";
import { auth } from "../../../auth";

// The starfield journey is the Orbit system's homepage: /app renders the same
// page as /. The previous reference landing page has been removed.
export default async function AppHomePage() {
  const session = await auth();

  return <OrbitStarfieldHome authenticated={Boolean(session?.user?.id)} />;
}
