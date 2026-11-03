const SESSION_KEY = "tr-session";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

function apiUrl(path: string): string {
  const base = import.meta.env["VITE_API_URL"]?.replace(/\/+$/, "") ?? "";
  return `${base}${path}`;
}

function accessToken(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as { token?: unknown };
    return typeof session.token === "string" ? session.token : null;
  } catch {
    return null;
  }
}

async function responseError(response: Response): Promise<ApiError> {
  let message = `La solicitud falló (${response.status}).`;
  try {
    const body = (await response.json()) as { detail?: unknown; message?: unknown };
    const detail = body.detail ?? body.message;
    if (typeof detail === "string") message = detail;
    else if (Array.isArray(detail)) {
      message = detail.map((item) =>
        item && typeof item === "object" && "msg" in item ? String(item.msg) : String(item),
      ).join(" ");
    }
  } catch {
    // Keep the HTTP status message for non-JSON responses.
  }
  return new ApiError(message, response.status);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(apiUrl(path), { ...init, headers });
  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(apiUrl(path), { headers });
  if (!response.ok) throw await responseError(response);
  return response.blob();
}

export const jsonBody = (body: unknown): string => JSON.stringify(body);

export function clearStoredSession(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
}
