import { getCurrentUser } from "@/server/auth";
import { handle, json } from "@/server/http";

/**
 * GET /api/auth/me — the user identified by the current token, read from the
 * DB row rather than the token (AuthProvider calls this on every mount, so a
 * row deleted by hand signs that browser out on its next page load).
 */
export const GET = handle(async (req: Request) => {
  const user = await getCurrentUser(req);
  return json({ id: user.id, username: user.username });
});
