import { getSessionInfo } from "@/app/api/server-auth";

export async function GET() {
  const session = await getSessionInfo();
  return Response.json(session);
}
