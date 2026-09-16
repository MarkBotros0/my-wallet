import { getCurrentUser } from "@/server/auth";
import { handle, json } from "@/server/http";

/**
 * GET /api/auth/me — the user identified by the current token.
 *
 * The role comes from the DB row, not the token, so a role change lands on the
 * client's next page load (AuthProvider calls this on every mount).
 */
export const GET = handle(async (req: Request) => {
  const user = await getCurrentUser(req);
  return json({ id: user.id, username: user.username, role: user.role });
});
