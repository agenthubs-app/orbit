export type OrbitAccountAuthMode = "login" | "signup" | "forgot";

// The auth modal writes all of its own wording with t() (orbit-2026/auth-public);
// this view model only carries the mode and the default return path. The old
// Chinese-only title / description / button labels were never rendered and
// were removed so they cannot leak into the ja / en UI.
export interface OrbitAccountAuthViewModel {
  defaultNext: string;
  mode: OrbitAccountAuthMode;
}

export function getOrbitAccountAuthViewModel(mode: OrbitAccountAuthMode): OrbitAccountAuthViewModel {
  return {
    defaultNext: "/app/home",
    mode,
  };
}
