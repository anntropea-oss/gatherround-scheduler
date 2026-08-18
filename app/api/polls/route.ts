import { createPoll } from "@/db/polls";

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
    const result = await createPoll({
      title: payload.title,
      description: payload.description,
      organizerName: payload.organizerName,
      timezone: payload.timezone,
      pollType: payload.pollType,
      options: Array.isArray(payload.options) ? payload.options : [],
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
