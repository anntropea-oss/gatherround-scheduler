import { getPoll, updatePoll } from "@/db/polls";

function errorResponse(error: unknown) {
  if (error instanceof Response) {
    return error;
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 500 },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const adminToken = new URL(request.url).searchParams.get("admin");
    const result = await getPoll(id, adminToken);

    if (!result) {
      return Response.json({ error: "Poll not found." }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const payload = await request.json();
    const result = await updatePoll(id, payload.adminToken, {
      status: payload.status,
      selectedOptionId: payload.selectedOptionId,
      publishNote: payload.publishNote,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
