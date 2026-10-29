type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  body?: unknown;
  auth?: boolean;
};

const API_URL = import.meta.env["VITE_API_URL"]?.trim().replace(/\/+$/, "");

export const isBackendEnabled = () => Boolean(API_URL);

function storedToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem("tr-session");
  if (!raw) return undefined;
  try {
    const session = JSON.parse(raw) as { token?: unknown };
    return typeof session.token === "string" ? session.token : undefined;
  } catch {
    return undefined;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  if (!API_URL) throw new Error("Configura VITE_API_URL para conectar con el backend.");
  const headers = new Headers();
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const token = options.auth === false ? undefined : storedToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "detail" in payload
        ? (payload as { detail: unknown }).detail
        : payload;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((issue) => (typeof issue === "object" && issue && "msg" in issue ? issue.msg : String(issue))).join(" ")
          : `Error de conexión con el servidor (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}
