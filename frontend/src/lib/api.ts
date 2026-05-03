// Resolved on the client at build time; on the server we use INTERNAL_API_URL to talk over the
// docker network. Both default to localhost for non-docker dev.
const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || PUBLIC_API_URL;

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function parseDetail(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: string | unknown };
    if (typeof j.detail === "string") return j.detail;
    return JSON.stringify(j.detail ?? res.statusText);
  } catch {
    return res.statusText;
  }
}

/** Client-side fetch — sends browser cookie automatically via credentials: 'include'. */
export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${PUBLIC_API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (!res.ok) throw new ApiError(res.status, await parseDetail(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Server-side fetch from RSC. Forwards request cookies to backend. Always no-store. */
export async function apiServer<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const res = await fetch(`${INTERNAL_API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(opts.headers || {}),
    },
    cache: "no-store",
    ...opts,
  });
  if (!res.ok) throw new ApiError(res.status, await parseDetail(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Try server-fetch; swallow 401/404 to null. Useful for "current user" lookups. */
export async function apiServerOptional<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    return await apiServer<T>(path, opts);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 404)) return null;
    throw err;
  }
}
