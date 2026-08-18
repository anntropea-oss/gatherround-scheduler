import { addResponse } from "@/db/polls";

function errorResponse(error: unknown) {
  if (error instanceof Response) {
    return error;
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 500 },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const payload = await request.json();
    const result = await addResponse(id, {
      name: payload.name,
      email: payload.email,
      note: payload.note,
      slots: Array.isArray(payload.slots) ? payload.slots : [],
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
