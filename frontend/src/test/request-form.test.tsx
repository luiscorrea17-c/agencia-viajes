import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, RequestActor, TravelRequest } from "@/api/requests";
import { RequestForm } from "@/components/app/RequestForm";

const { createRequest } = vi.hoisted(() => ({
  createRequest: vi.fn(),
}));

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return { ...actual, createRequest };
});

const actor: RequestActor = {
  id: "user-uuid",
  name: "Cliente de prueba",
  email: "client@example.com",
  role: "Cliente",
  avatarUrl: "",
  branch: "",
  active: true,
};

const linkedClient: Client = {
  id: "client-record-uuid",
  name: "Cliente de prueba",
  email: "client@example.com",
  phone: "",
  createdAt: "",
  createdBy: "",
};

describe("RequestForm", () => {
  beforeEach(() => {
    createRequest.mockReset();
    createRequest.mockResolvedValue({ id: "request-1" } as TravelRequest);
  });

  it("uses the linked client record ID instead of the user ID", async () => {
    render(
      <RequestForm
        actor={actor}
        clients={[linkedClient]}
        request={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Destino"), {
      target: { value: "Cartagena" },
    });
    fireEvent.change(screen.getByLabelText("Salida"), {
      target: { value: "2026-12-10" },
    });
    fireEvent.change(screen.getByLabelText("Regreso"), {
      target: { value: "2026-12-15" },
    });
    fireEvent.change(screen.getByLabelText("Presupuesto total (COP)"), {
      target: { value: "4500000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(createRequest).toHaveBeenCalledOnce());
    expect(createRequest.mock.calls[0]?.[0]).toEqual(actor);
    expect(createRequest.mock.calls[0]?.[1]).toMatchObject({
      clientId: linkedClient.id,
      destination: "Cartagena",
    });
    expect(createRequest.mock.calls[0]?.[1].clientId).not.toBe(actor.id);
  });

  it("explains and blocks submission when the client has no linked record", () => {
    render(
      <RequestForm
        actor={actor}
        clients={[]}
        request={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tu cuenta aún no tiene un expediente de cliente vinculado.",
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(createRequest).not.toHaveBeenCalled();
  });
});
