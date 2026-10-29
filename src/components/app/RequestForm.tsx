import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import {
  createRequest,
  updateRequest,
  REQUEST_STATUSES,
  type Client,
  type TravelRequest,
  type RequestInput,
  type RequestActor,
} from "@/api";
import { OperationModal, Notice, fieldClass } from "./OperationUi";
import { Button } from "./ui";

export function RequestForm({
  actor,
  clients,
  request,
  prefill,
  onClose,
  onSaved,
}: {
  actor: RequestActor;
  clients: Client[];
  request: TravelRequest | null;
  prefill?: Partial<RequestInput> | undefined;
  onClose: () => void;
  onSaved: (request: TravelRequest) => Promise<void>;
}) {
  const [input, setInput] = useState<RequestInput>({
    clientId: request?.clientId ?? prefill?.clientId ?? (actor.role === "Cliente" ? actor.id : ""),
    destination: request?.destination ?? prefill?.destination ?? "",
    startDate: request?.startDate ?? prefill?.startDate ?? "",
    endDate: request?.endDate ?? prefill?.endDate ?? "",
    budgetCOP: request?.budgetCOP ?? prefill?.budgetCOP ?? 0,
    travelersCount: request?.travelersCount ?? prefill?.travelersCount ?? 1,
    status: request?.status ?? prefill?.status ?? "Abierta",
    notes: request?.notes ?? prefill?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof RequestInput>(key: K, value: RequestInput[K]) =>
    setInput((previous) => ({ ...previous, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = request
        ? await updateRequest(actor, request.id, input)
        : await createRequest(actor, input);
      await onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar la solicitud.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OperationModal
      title={request ? "Editar solicitud" : "Nueva solicitud"}
      subtitle={request ? request.code : undefined}
      maxWidthClass="max-w-xl"
      onClose={() => !busy && onClose()}
    >
      <Notice error text={error} />
      <form onSubmit={submit} className="space-y-4">
        {actor.role !== "Cliente" && (
          <label className="block text-sm font-medium">
            Cliente
            <select
              className={fieldClass}
              required
              value={input.clientId}
              onChange={(e) => set("clientId", e.target.value)}
            >
              <option value="">Seleccionar cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-sm font-medium">
          Destino
          <input
            autoFocus
            className={fieldClass}
            required
            maxLength={100}
            placeholder="Ciudad o país"
            value={input.destination}
            onChange={(e) => set("destination", e.target.value)}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Salida
            <input
              type="date"
              required
              className={fieldClass}
              value={input.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Regreso
            <input
              type="date"
              required
              min={input.startDate || undefined}
              className={fieldClass}
              value={input.endDate}
              onChange={(e) => set("endDate", e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Presupuesto total (COP)
            <input
              type="number"
              required
              min={1}
              step={1}
              className={fieldClass}
              value={input.budgetCOP || ""}
              onChange={(e) => set("budgetCOP", Number(e.target.value))}
            />
          </label>
          <label className="block text-sm font-medium">
            Viajeros
            <input
              type="number"
              required
              min={1}
              step={1}
              className={fieldClass}
              value={input.travelersCount || ""}
              onChange={(e) => set("travelersCount", Number(e.target.value))}
            />
          </label>
        </div>

        {request && actor.role !== "Cliente" && (
          <label className="block text-sm font-medium">
            Estado
            <select
              className={fieldClass}
              value={input.status}
              onChange={(e) => set("status", e.target.value as RequestInput["status"])}
            >
              {REQUEST_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-sm font-medium">
          Notas (opcional)
          <textarea
            rows={2}
            maxLength={2000}
            className={fieldClass}
            placeholder="Preferencias de hotel, horario o equipaje…"
            value={input.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </OperationModal>
  );
}
