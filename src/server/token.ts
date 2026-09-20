import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { HttpError } from "./http";

/**
 * JWT signing/verification and the app-wide API gate policy.
 *
 * Deliberately free of any database import: `proxy.ts` runs this on every
 * `/api/*` request, and the gate must stay cheap. Role and active-state are
 * NOT here — see server/auth.ts, which reads them from the row.
 *
 * Rotating AUTH_SECRET invalidates every previously issued token because the
 * HS256 signature no longer verifies, so every client is forced back through
 * /api/auth/login.
 */

export const TOKEN_LIFETIME_DAYS = 30;
const JWT_ALGORITHM = "HS256";

export interface TokenPayload {
  sub: string;
  username: string;
}

function requireSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) {
    throw new HttpError(500, "AUTH_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

export async function createAccessToken(userId: string, username: string): Promise<string> {
  // Role and active-state are deliberately NOT claims. Tokens live 30 days, so
  // a claim would mean disabling a user does nothing for a month — see
  // getCurrentUser in server/auth.ts, which reads them from the row on every
  // request.
  return new SignJWT({ username })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_LIFETIME_DAYS}d`)
    .sign(requireSecret());
}

export async function decodeToken(token: string): Promise<TokenPayload> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, requireSecret(), {
      algorithms: [JWT_ALGORITHM],
    }));
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) {
      throw new HttpError(401, "Token expired");
    }
    throw new HttpError(401, "Invalid token");
  }
  const sub = payload.sub;
  const username = payload.username;
  if (typeof sub !== "string" || !sub || typeof username !== "string" || !username) {
    throw new HttpError(401, "Invalid token payload");
  }
  return { sub, username };
}

/** The raw token from an Authorization header, or a 401 if there is none. */
export function bearerToken(authorization: string | null): string {
  if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) {
    throw new HttpError(401, "Missing bearer token");
  }
  return authorization.slice("bearer ".length).trim();
}

// ---------------------------------------------------------------------------
// The app-wide gate
// ---------------------------------------------------------------------------

/**
 * Every /api/* path is CLOSED unless it appears here. The allowlist is spelled
 * as exact "METHOD /path" pairs so a route cannot be opened by accident.
 *
 * Default-deny is the point: a route added later is locked until someone
 * deliberately opens it. The failure mode becomes "it 401s and I notice
 * immediately" rather than "it has been serving the dataset to the internet
 * since the day it shipped" — which is what nine EGX endpoints were doing
 * before its gate existed.
 */
export const PUBLIC_ENDPOINTS: ReadonlySet<string> = new Set([
  "POST /api/auth/login", // the way in
  "POST /api/auth/register", // the way to a first account
]);

export function isPublicEndpoint(method: string, pathname: string): boolean {
  // Preflights carry no Authorization header by design — blocking them breaks
  // CORS for every browser call, including the login request itself.
  if (method.toUpperCase() === "OPTIONS") return true;
  const path = pathname.replace(/\/+$/, "") || "/";
  return PUBLIC_ENDPOINTS.has(`${method.toUpperCase()} ${path}`);
}
