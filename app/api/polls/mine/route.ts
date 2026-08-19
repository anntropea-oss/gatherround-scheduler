import { listPolls } from "@/db/polls";
import { getSessionInfo } from "@/app/api/server-auth";

function errorResponse(error: unknown) {
  if (error instanceof Response) {
    return error;
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const session = await getSessionInfo();
    const result = await listPolls({
      organizerKey: payload.organizerKey,
      superAdmin: session.superAdmin,
    });

    return Response.json({ ...result, session });
  } catch (error) {
    return errorResponse(error);
  }
}
