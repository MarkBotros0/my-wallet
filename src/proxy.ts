import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { bearerToken, decodeToken, isPublicEndpoint } from "@/server/token";
import { HttpError } from "@/server/http";

/**
 * The app is CLOSED. Two gates live here, stated once:
 *
 * 1. PAGES — every route redirects to /login until the visitor signs in. This
 *    is a deny-by-default list, so a page added later is protected without
 *    anyone remembering to add it. Only the login page and the static files
 *    the browser needs to render it are reachable signed out.
 *
 *    This half is UX, not security. The `wallet.auth.present` cookie is set by
 *    client JS and carries no signature, so it proves only that someone
 *    believes they are signed in.
 *
 * 2. API — every /api/* request must carry a Bearer token with a valid
 *    signature unless the route is in PUBLIC_ENDPOINTS (today: login only).
 *    This is the real guard's FIRST layer; route handlers then re-read the
 *    user row (role, is_active) through getCurrentUser, which is the second.
 *    A route added tomorrow is 401 until someone deliberately opens it.
 */
const PUBLIC_PATHS = ["/login"];

const PUBLIC_FILE_PREFIXES = [
  "/_next",
  "/icons",
  "/favicon",
  "/manifest.json",
  "/sw.js",
  "/apple-touch-icon",
];

const PRESENCE_COOKIE = "wallet.auth.present";

async function gateApi(req: NextRequest): Promise<NextResponse> {
  if (isPublicEndpoint(req.method, req.nextUrl.pathname)) {
    return NextResponse.next();
  }
  try {
    await decodeToken(bearerToken(req.headers.get("authorization")));
    return NextResponse.next();
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 401;
    const detail = e instanceof HttpError ? e.detail : "Unauthorized";
    return NextResponse.json({ detail }, { status });
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    return gateApi(req);
  }

  const isPublicFile = PUBLIC_FILE_PREFIXES.some((p) => pathname.startsWith(p));
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const hasAuth = req.cookies.get(PRESENCE_COOKIE)?.value === "1";

  if (isPublicFile) return NextResponse.next();

  if (isPublicPath) {
    // Already signed in? The login page has nothing to offer — send them in.
    if (hasAuth) {
      const home = req.nextUrl.clone();
      home.pathname = "/";
      home.search = "";
      return NextResponse.redirect(home);
    }
    return NextResponse.next();
  }

  if (hasAuth) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  // Preserve where they were headed, so signing in lands them there rather
  // than dumping them on the home page.
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next internals and files with an extension. The
  // in-function checks above still run, so this is only a performance filter.
  matcher: ["/((?!_next/static|_next/image|.*\\.).*)"],
};
