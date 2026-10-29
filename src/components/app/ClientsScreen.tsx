import { Suspense, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { FolderOpen, Mail, Pencil, Phone, Plus, Users } from "lucide-react";
import { canCreateClient, canEditClient, CLIENT_SEGMENTS, CLIENT_TYPES, type ClientActor, type ClientRecord } from "@/api/clients";
import { useAuth } from "@/lib/auth";
import { CollapsibleSection, Filters, Notice } from "./OperationUi";
import { Button, KpiCard, LoadingState, MaskedField, PageHeader } from "./ui";
import { TableWithPanel, type Column } from "./TableWithPanel";
import { clientQuery } from "./client-query";
import { ClientForm } from "./ClientForm";

const selectCls = "h-9 max-w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus:border-primary";
const date = (value: string) => new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));

export function ClientsScreen() {
  const { session } = useAuth();
  if (!session) return null;
  return <Suspense fallback={<LoadingState label="Cargando expedientes…" />}><ClientList key={`${session.user.id}-${session.user.role}`} actor={session.user} /></Suspense>;
}

function ClientList({ actor }: { actor: ClientActor }) {
  const { data: records } = useSuspenseQuery(clientQuery(actor));
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [segment, setSegment] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<{ record: ClientRecord | null } | null>(null);
  const [notice, setNotice] = useState("");
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const rows = records.filter((record) => (!type || record.type === type) && (!segment || record.segment === segment) && normalize(`${record.name} ${record.code} ${record.email}`).includes(normalize(search)));
  const columns: Column<ClientRecord>[] = [
    { key: "name", header: "Cliente / expediente", render: (record) => <div className="flex min-w-48 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><FolderOpen className="h-4 w-4" /></span><div><p className="font-semibold">{record.name}</p><p className="mt-0.5 font-mono text-xs text-muted-foreground">{record.code}</p></div></div> },
    { key: "type", header: "Tipo", render: (record) => record.type },
    { key: "segment", header: "Segmento", render: (record) => <span className="whitespace-nowrap rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium">{record.segment}</span> },
    { key: "travelers", header: "Acompañantes", render: (record) => <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-muted-foreground" />{record.companions.length}</span> },
  ];
  return <div>
    <PageHeader
      title={actor.role === "Cliente" ? "Mi expediente" : "Expedientes y viajeros"}
      subtitle={actor.role === "Cliente" ? "Documentos protegidos, vigencia de pasaporte y viajeros frecuentes." : "Registra titulares, documentos protegidos, facturación y acompañantes."}
      actions={canCreateClient(actor) && <Button variant="primary" onClick={() => setForm({ record: null })}><Plus className="h-4 w-4" />Registrar cliente</Button>}
    />
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4"><KpiCard label="Expedientes" value={records.length} /><KpiCard label="Personas" value={records.filter((record) => record.type === "Persona").length} /><KpiCard label="Empresas" value={records.filter((record) => record.type === "Empresa").length} /><KpiCard label="Acompañantes" value={records.reduce((total, record) => total + record.companions.length, 0)} /></div>
    <Notice text={notice} onDismiss={() => setNotice("")} />
    <Filters
      search={search}
      onSearch={setSearch}
      label="expedientes"
      placeholder="Buscar cliente, correo o código…"
      hasExtraActive={Boolean(type || segment)}
      onClear={() => { setSearch(""); setType(""); setSegment(""); }}
      extra={
        <>
          <select aria-label="Filtrar por tipo" value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
            <option value="">Todos los tipos</option>
            {CLIENT_TYPES.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select aria-label="Filtrar por segmento" value={segment} onChange={(e) => setSegment(e.target.value)} className={selectCls}>
            <option value="">Todos los segmentos</option>
            {CLIENT_SEGMENTS.map((value) => <option key={value}>{value}</option>)}
          </select>
        </>
      }
    />
    <TableWithPanel rows={rows} columns={columns} getId={(record) => record.id} selectedId={selected} onSelect={setSelected} collapseEmptyPanel emptyTitle="Sin expedientes" emptyDescription="No hay expedientes que coincidan con la búsqueda." panelLabel="Detalle de expediente" renderPanel={(record) => <ClientDetail record={record} editable={canEditClient(actor, record.id)} onEdit={() => setForm({ record })} />} />
    <p className="mt-3 text-xs text-muted-foreground">{rows.length} de {records.length} expedientes</p>
    {form && <ClientForm record={form.record} actor={actor} onClose={() => setForm(null)} onSaved={async (record) => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["client-records"] }), queryClient.invalidateQueries({ queryKey: ["requests"] })]); const wasEdit = Boolean(form.record); setForm(null); setSearch(""); setType(""); setSegment(""); setSelected(record.id); setNotice(wasEdit ? "Expediente actualizado correctamente." : `Expediente ${record.code} registrado correctamente.`); }} />}
  </div>;
}

function ClientDetail({ record, editable, onEdit }: { record: ClientRecord; editable: boolean; onEdit: () => void }) {
  const activeNotes = record.notes.filter((note) => note.trim());
  return <div className="space-y-4 break-words">
    <div>
      <p className="font-mono text-xs text-muted-foreground">{record.code}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-display text-xl font-semibold">{record.name}</h2>
        {editable && <Button variant="ghost" className="h-8 w-8 shrink-0 p-0" aria-label="Editar expediente" title="Editar expediente" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{record.type} · {record.segment}{!editable && " · Solo lectura"}</p>
    </div>

    <section className="space-y-2.5 border-t border-border pt-3.5">
      <h3 className="text-sm font-semibold">Contacto y documentos</h3>
      <p className="flex items-start gap-2 break-all text-sm"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{record.email}</p>
      <p className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 shrink-0 text-muted-foreground" />{record.phone}</p>
      <MaskedField key={`${record.id}-doc`} label={record.docType} value={record.docNumber} canReveal />
      {record.passportNumber && <MaskedField key={`${record.id}-passport`} label="Pasaporte" value={record.passportNumber} canReveal />}
      {record.passportExpiry && <p className="text-xs text-muted-foreground">Vencimiento: {date(record.passportExpiry)}</p>}
    </section>

    <CollapsibleSection title="Viajeros acompañantes" count={record.companions.length} defaultOpen={record.companions.length > 0}>
      {record.companions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin acompañantes registrados.</p>
      ) : (
        <div className="space-y-3">
          {record.companions.map((item) => (
            <div key={item.id} className="space-y-1.5 border-l-2 border-border pl-3">
              <p className="text-sm font-medium">{item.fullName}</p>
              <p className="text-xs text-muted-foreground">{date(item.birthDate)} · {item.isMinor ? "Menor de edad" : "Adulto"}</p>
              <MaskedField label={item.docType} value={item.docNumber} canReveal />
              {item.passportExpiry && <p className="text-xs text-muted-foreground">Pasaporte vence: {date(item.passportExpiry)}</p>}
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>

    <CollapsibleSection title="Facturación">
      <dl className="space-y-2 text-sm">
        <div><dt className="text-xs text-muted-foreground">Dirección</dt><dd>{record.billingAddress || "Sin registrar"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Régimen tributario</dt><dd>{record.taxRegime || "Sin registrar"}</dd></div>
      </dl>
    </CollapsibleSection>

    <CollapsibleSection title="Solicitudes vinculadas" count={record.linkedRequests.length}>
      {record.linkedRequests.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin solicitudes vinculadas.</p>
      ) : (
        <div className="space-y-2.5">
          {record.linkedRequests.map((request) => (
            <div key={request.code} className="border-l-2 border-border pl-3">
              <p className="text-sm font-medium">{request.destination}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{request.code} · {date(request.date)} · {request.status}</p>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>

    {activeNotes.length > 0 && (
      <CollapsibleSection title="Notas" count={activeNotes.length}>
        <div className="space-y-2">
          {activeNotes.map((note, index) => (
            <p key={index} className="whitespace-pre-wrap text-sm text-muted-foreground">{note}</p>
          ))}
        </div>
      </CollapsibleSection>
    )}

    <CollapsibleSection title="Historial" count={record.auditLog.length}>
      <ol className="space-y-3">
        {[...record.auditLog].reverse().map((entry) => (
          <li key={entry.id} className="border-l-2 border-border pl-3 text-xs">
            <p className="font-medium text-foreground">{entry.action}</p>
            {entry.reason && <p className="mt-0.5">{entry.reason}</p>}
            <p className="mt-0.5 text-muted-foreground">{entry.user} · {date(entry.timestamp)}</p>
          </li>
        ))}
      </ol>
    </CollapsibleSection>
  </div>;
}