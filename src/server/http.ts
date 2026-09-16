import { NextResponse } from "next/server";

/**
 * An error that maps straight onto an HTTP response.
 *
 * The body is `{ detail }` — the FastAPI shape the EGX frontend already reads
 * (`data.detail || data.error`), kept here so `lib/api.ts` is the same code.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = "HttpError";
  }
}

export function json<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

/**
 * Wrap a route handler so a thrown HttpError becomes its response and anything
 * else becomes a 500 with the message — never a hung request or an HTML error
 * page, which the client would then try to JSON.parse.
 */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (e: unknown) {
      if (e instanceof HttpError) {
        return json({ detail: e.detail }, e.status);
      }
      const message = e instanceof Error ? e.message : String(e);
      console.error(e);
      return json({ detail: message }, 500);
    }
  };
}

/** Parse a JSON body, or 400 — a malformed body is the caller's problem. */
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
}
