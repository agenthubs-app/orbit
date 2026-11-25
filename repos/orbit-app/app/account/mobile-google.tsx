import { Redirect, type Href } from "expo-router";
import { useEffect, useState } from "react";

import { authReturnStorage } from "../../src/storage/auth-return-storage";
import { loginHrefReturningTo } from "../../src/view-models/account-auth";

/** The Google callback opened the App itself (the sign-in was closed meanwhile): sign in again, still on the way back. */
export default function MobileGoogleRoute() {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => { void authReturnStorage.read().then(next => setHref(loginHrefReturningTo(next))); }, []);
  return href ? <Redirect href={href as Href} /> : null;
}
