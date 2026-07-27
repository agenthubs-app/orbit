import { NextResponse } from "next/server";

import { auth } from "../../../auth";
import { failure, runtimeBoundaryHeaders } from "../../../shared/api/envelope";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { AppError } from "../../../shared/errors/app-error";

export interface AuthenticatedApiActor {
  email?: string | null;
  id: string;
  name?: string | null;
}

export type ResolveAuthenticatedApiActor = () => Promise<
  AuthenticatedApiActor | null
>;

export async function resolveAuthenticatedApiActor(): Promise<AuthenticatedApiActor | null> {
  const session = await auth();

  return session?.user?.id
    ? {
        email: session.user.email,
        id: session.user.id,
        name: session.user.name,
      }
    : null;
}

export function authenticatedApiActorRequiredResponse(
  mode: FeatureMode,
): Response {
  return NextResponse.json(
    failure(new AppError("UNAUTHORIZED", "Sign in to access this resource."), {
      boundary: "runtime",
      mode,
      privacy: "authenticated-actor-required",
      provenance:
        "The request was rejected before any profile service or storage provider ran.",
      service: "authenticated-api-actor",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: 401,
    },
  );
}
