import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  CLIENT_SEGMENTS,
  CLIENT_TYPES,
  DOC_TYPES,
  createClientRecord,
  updateClientRecord,
  type ClientActor,
  type ClientInput,
  type ClientRecord,
  type Companion,
} from "@/api/clients";
import { CollapsibleSection, Notice, OperationModal, fieldClass } from "./OperationUi";
import { Button } from "./ui";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

export function ClientForm({
  actor,
  record,
  onClose,
  onSaved,
}: {
  actor: ClientActor;
  record: ClientRecord | null;
  onClose: () => void;
  onSaved: (record: ClientRecord) => Promise<void>;
}) {
  const [input, setInput] = useState<ClientInput>(() => ({
    name: record?.name ?? "",
    email: record?.email ?? "",
    phone: record?.phone ?? "",
    type: record?.type ?? "Persona",
    segment: record?.segment ?? "Estándar",
    docType: record?.docType ?? "CC",
    docNumber: record?.docNumber ?? "",
    passportNumber: record?.passportNumber ?? "",
    passportExpiry: record?.passportExpiry ?? "",
    billingAddress: record?.billingAddress ?? "",
    taxRegime: record?.taxRegime ?? "",
    companions: record ? structuredClone(record.companions) : [],
    notes: record ? [...record.notes] : [],
  }));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof ClientInput>(key: K, value: ClientInput[K]) =>
    setInput((previous) => ({ ...previous, [key]: value }));

  const traveler = <K extends keyof Companion>(id: string, key: K, value: Companion[K]) =>
    setInput((previous) => ({
      ...previous,
      companions: previous.companions.map((item) =>
        item.id === id ? { ...item, [key]: value } : item
      ),
    }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = record
        ? await updateClientRecord(actor, record.id, input, reason)
        : await createClientRecord(actor, input);
      await onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar el expediente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OperationModal
      title={record ? "Editar expediente" : "Registrar cliente"}
      subtitle={record ? `${record.code} · ${record.name}` : "Titular, documentos y acompañantes"}
      maxWidthClass="max-w-2xl"
      onClose={() => !busy && onClose()}
    >
      <Notice error text={error} />
      <form className="space-y-5" onSubmit={submit}>
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre o razón social">
            <input
              autoFocus
              required
              maxLength={150}
              className={fieldClass}
              value={input.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Correo electrónico">
            <input
              required
              type="email"
              className={fieldClass}
              value={input.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field label="Teléfono">
            <input
              required
              type="tel"
              className={fieldClass}
              value={input.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select
                className={fieldClass}
                value={input.type}
                onChange={(e) => set("type", e.target.value as ClientInput["type"])}
              >
                {CLIENT_TYPES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Segmento">
              <select
                className={fieldClass}
                value={input.segment}
                onChange={(e) => set("segment", e.target.value as ClientInput["segment"])}
              >
                {CLIENT_SEGMENTS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Documento">
            <div className="mt-1.5 grid grid-cols-[96px_1fr] gap-2">
              <select
                aria-label="Tipo de documento"
                className="rounded-lg border border-input bg-card px-2.5 py-2 text-sm outline-none focus:border-primary"
                value={input.docType}
                onChange={(e) => set("docType", e.target.value as ClientInput["docType"])}
              >
                {DOC_TYPES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <input
                required
                aria-label="Número de documento"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                value={input.docNumber}
                onChange={(e) => set("docNumber", e.target.value)}
              />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pasaporte">
              <input
                className={fieldClass}
                value={input.passportNumber ?? ""}
                onChange={(e) => set("passportNumber", e.target.value)}
              />
            </Field>
            <Field label="Vencimiento">
              <input
                type="date"
                className={fieldClass}
                value={input.passportExpiry ?? ""}
                onChange={(e) => set("passportExpiry", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <CollapsibleSection
          title="Acompañantes"
          count={input.companions.length}
          defaultOpen={input.companions.length > 0}
        >
          <div className="space-y-4">
            {input.companions.map((item, index) => (
              <div key={item.id} className="rounded-xl border border-border bg-muted/30 p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground">
                    Acompañante {index + 1}
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive"
                    title="Quitar acompañante"
                    aria-label={`Quitar viajero ${index + 1}`}
                    onClick={() =>
                      set(
                        "companions",
                        input.companions.filter((companion) => companion.id !== item.id)
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre completo">
                    <input
                      required
                      className={fieldClass}
                      value={item.fullName}
                      onChange={(e) => traveler(item.id, "fullName", e.target.value)}
                    />
                  </Field>
                  <Field label="Nacimiento">
                    <input
                      required
                      type="date"
                      className={fieldClass}
                      value={item.birthDate}
                      onChange={(e) => traveler(item.id, "birthDate", e.target.value)}
                    />
                  </Field>
                  <Field label="Documento">
                    <div className="mt-1.5 grid grid-cols-[88px_1fr] gap-2">
                      <select
                        aria-label="Documento del viajero"
                        className="rounded-lg border border-input bg-card px-2 py-2 text-sm outline-none focus:border-primary"
                        value={item.docType}
                        onChange={(e) =>
                          traveler(item.id, "docType", e.target.value as Companion["docType"])
                        }
                      >
                        {DOC_TYPES.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                      <input
                        required
                        aria-label="Número de documento del viajero"
                        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                        value={item.docNumber}
                        onChange={(e) => traveler(item.id, "docNumber", e.target.value)}
                      />
                    </div>
                  </Field>
                  <Field label="Vencimiento pasaporte">
                    <input
                      type="date"
                      className={fieldClass}
                      value={item.passportExpiry ?? ""}
                      onChange={(e) => traveler(item.id, "passportExpiry", e.target.value)}
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={item.isMinor}
                      onChange={(e) => traveler(item.id, "isMinor", e.target.checked)}
                    />
                    Menor de edad
                  </label>
                </div>
              </div>
            ))}
            <Button
              type="button"
              onClick={() =>
                set("companions", [
                  ...input.companions,
                  {
                    id: crypto.randomUUID(),
                    fullName: "",
                    birthDate: "",
                    isMinor: false,
                    docType: "CC",
                    docNumber: "",
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Añadir acompañante
            </Button>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Facturación y notas">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dirección de facturación">
                <input
                  className={fieldClass}
                  value={input.billingAddress}
                  onChange={(e) => set("billingAddress", e.target.value)}
                />
              </Field>
              <Field label="Régimen tributario">
                <input
                  className={fieldClass}
                  value={input.taxRegime}
                  onChange={(e) => set("taxRegime", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Notas">
              <textarea
                rows={2}
                className={fieldClass}
                value={input.notes.join("\n")}
                onChange={(e) => set("notes", e.target.value.split("\n"))}
              />
            </Field>
            {record && (
              <Field label="Motivo del cambio (opcional)">
                <input
                  maxLength={500}
                  className={fieldClass}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            )}
          </div>
        </CollapsibleSection>

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
