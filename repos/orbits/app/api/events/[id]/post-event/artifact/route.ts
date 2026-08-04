import { createAttendeePostEventAiArtifactGetHandler, createAttendeePostEventAiArtifactPostHandler } from "./handler";

export const dynamic = "force-dynamic";

export const GET = createAttendeePostEventAiArtifactGetHandler();
export const POST = createAttendeePostEventAiArtifactPostHandler();
