import { getSessionInfo } from "@/app/api/server-auth";
import { addFeedback, listFeedback } from "@/db/feedback";

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
    const result = await addFeedback({
      sentiment: payload.sentiment,
      message: payload.message,
      page: payload.page,
      path: payload.path,
      pollId: payload.pollId,
      role: payload.role,
      userAgent: request.headers.get("user-agent") ?? "",
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  try {
    const session = await getSessionInfo();
    if (!session.superAdmin) {
      return Response.json({ error: "Super admin access required." }, { status: 403 });
    }

    return Response.json({ feedback: await listFeedback() });
  } catch (error) {
    return errorResponse(error);
  }
}
