import { NextResponse } from "next/server";
import { auth } from "../../../../../../../auth";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(
  _request: Request,
  _context: Context,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in is required." } },
      { status: 401 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: "LEGACY_MATCHMAKING_READ_ONLY",
        message:
          "Legacy matchmaking writes are gone. Use event operations contact requests.",
      },
    },
    { status: 410 },
  );
}

export async function PATCH(
  _request: Request,
  _context: Context,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in is required." } },
      { status: 401 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: "LEGACY_MATCHMAKING_READ_ONLY",
        message:
          "Legacy matchmaking writes are gone. Use event operations contact requests.",
      },
    },
    { status: 410 },
  );
}
