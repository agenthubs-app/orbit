import { OrbitStarfieldHome } from "./(app)/app/orbit-starfield-home";
import { auth } from "../auth";

// The starfield journey is Orbit's homepage: `/` and `/app` render the same page.
export default async function Page() {
  const session = await auth();

  return <OrbitStarfieldHome authenticated={Boolean(session?.user?.id)} />;
}
