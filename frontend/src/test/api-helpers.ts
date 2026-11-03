import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

export function mockJsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function sessionToken(token = "test.jwt.token") {
  window.localStorage.setItem(
    "tr-session",
    JSON.stringify({
      token,
      expiresAt: Date.now() + 60_000,
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Prueba",
        email: "test@example.com",
        role: "Administrador",
        avatarUrl: "",
        branch: "Bogotá",
        active: true,
      },
    }),
  );
}
