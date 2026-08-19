import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export type SessionInfo = {
  signedIn: boolean;
  email: string;
  displayName: string;
  superAdmin: boolean;
};

function superAdminEmails() {
  const raw = typeof env.SUPER_ADMIN_EMAILS === "string" ? env.SUPER_ADMIN_EMAILS : "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function getSessionInfo(): Promise<SessionInfo> {
  const user = await getChatGPTUser();
  const email = user?.email.toLowerCase() ?? "";
  return {
    signedIn: Boolean(user),
    email,
    displayName: user?.displayName ?? "",
    superAdmin: Boolean(email && superAdminEmails().has(email)),
  };
}
