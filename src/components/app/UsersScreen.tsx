import { useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Pencil, UserCheck, UserX } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ROLES, saveUser, setUserActive, type PublicUser, type UserInput, type Role } from "@/api/auth";
import { usersQuery } from "./operations-query";
import { TableWithPanel, type Column } from "./TableWithPanel";
import { Button, PageHeader, KpiCard, ConfirmDialog } from "./ui";
import { OperationModal, fieldClass, Filters, Notice } from "./OperationUi";

const selectCls = "h-9 max-w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus:border-primary";

export function UsersScreen() { const { session } = useAuth(); return session ? <Users key={`${session.user.id}-${session.user.role}`} actor={session.user} /> : null; }
function Users({ actor }: { actor: PublicUser }) {
  const { data: users } = useSuspenseQuery(usersQuery(actor)); const qc = useQueryClient();
  const [search, setSearch] = useState(""); const [role, setRole] = useState(""); const [status, setStatus] = useState(""); const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<{ id: string | null; input: UserInput } | null>(null); const [pending, setPending] = useState<PublicUser | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState(false);
  const rows = users.filter((u) => (!role || u.role === role) && (!status || String(u.active) === status) && `${u.name} ${u.email} ${u.branch}`.toLowerCase().includes(search.toLowerCase()));
  async function run(action: () => Promise<PublicUser>) { setBusy(true); setMessage(""); try { const u = await action(); await qc.invalidateQueries({ queryKey: ["users"] }); await qc.invalidateQueries({ queryKey: ["dashboard"] }); setSelected(u.id); setForm(null); setPending(null); setError(false); setMessage(`Usuario ${u.name} actualizado correctamente.`); } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "No pudimos guardar el usuario."); } finally { setBusy(false); } }
  const edit = (u: PublicUser) => { setMessage(""); setForm({ id: u.id, input: { name: u.name, email: u.email, role: u.role, branch: u.branch, password: "" } }); };
  const cols: Column<PublicUser>[] = [{ key: "name", header: "Usuario", render: (u) => <div className="flex min-w-48 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{u.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}</span><div><p className="font-semibold">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div></div> }, { key: "role", header: "Rol", render: (u) => u.role }, { key: "branch", header: "Sede", render: (u) => u.branch }, { key: "status", header: "Estado", render: (u) => <UserStatus active={u.active} /> }];
  return <div><PageHeader title="Usuarios" subtitle="Permisos y acceso por rol y sede." actions={<Button variant="primary" onClick={() => { setMessage(""); setForm({ id: null, input: { name: "", email: "", role: "Asesor", branch: "", password: "" } }); }}><Plus className="h-4 w-4" />Crear cuenta</Button>} />
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4"><KpiCard label="Usuarios" value={users.length} /><KpiCard label="Activos" value={users.filter((u) => u.active).length} /><KpiCard label="Inactivos" value={users.filter((u) => !u.active).length} tone="alert" /><KpiCard label="Asesores" value={users.filter((u) => u.role === "Asesor").length} /></div>
    <Notice error={error} text={message} onDismiss={() => setMessage("")} />
    <Filters
      search={search}
      onSearch={setSearch}
      label="usuarios"
      placeholder="Buscar nombre, correo o sede…"
      hasExtraActive={Boolean(role || status)}
      onClear={() => { setSearch(""); setRole(""); setStatus(""); }}
      extra={
        <>
          <select aria-label="Filtrar rol" value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
            <option value="">Todos los roles</option>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select aria-label="Filtrar actividad" value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="">Todos los estados</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </>
      }
    />
    <TableWithPanel rows={rows} columns={cols} getId={(u) => u.id} selectedId={selected} onSelect={setSelected} collapseEmptyPanel emptyTitle="Sin usuarios con estos filtros" panelLabel="Detalle de usuario" renderPanel={(u) => <div><h2 className="font-display text-xl font-semibold">{u.name}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{u.email}</p><div className="mt-2.5"><UserStatus active={u.active} /></div><dl className="my-4 space-y-2.5 border-y border-border py-4 text-sm"><div><dt className="text-xs text-muted-foreground">Rol</dt><dd>{u.role}</dd></div><div><dt className="text-xs text-muted-foreground">Sede</dt><dd>{u.branch}</dd></div></dl><div className="flex flex-wrap gap-2"><Button onClick={() => edit(u)}><Pencil className="h-4 w-4" />Editar</Button><Button variant={u.active ? "destructive" : "primary"} disabled={u.id === actor.id} onClick={() => { setMessage(""); setPending(u); }}>{u.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}{u.active ? "Desactivar" : "Activar"}</Button></div></div>} />
    <p className="mt-3 text-xs text-muted-foreground">{rows.length} de {users.length} usuarios</p>
    {form && <OperationModal title={form.id ? "Editar usuario" : "Nuevo usuario"} onClose={() => !busy && setForm(null)}><Notice error={error} text={message} /><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => saveUser(actor, form.id, form.input)); }}><label className="block text-sm">Nombre completo<input required value={form.input.name} className={fieldClass} onChange={(e) => setForm({ ...form, input: { ...form.input, name: e.target.value } })} /></label><label className="block text-sm">Correo electrónico<input required type="email" value={form.input.email} className={fieldClass} onChange={(e) => setForm({ ...form, input: { ...form.input, email: e.target.value } })} /></label><div className="grid grid-cols-2 gap-4"><label className="text-sm">Rol<select value={form.input.role} className={fieldClass} onChange={(e) => setForm({ ...form, input: { ...form.input, role: e.target.value as Role } })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label><label className="text-sm">Sede<input required value={form.input.branch} className={fieldClass} onChange={(e) => setForm({ ...form, input: { ...form.input, branch: e.target.value } })} /></label></div><label className="block text-sm">{form.id ? "Nueva contraseña (opcional)" : "Contraseña"}<input required={!form.id} minLength={8} type="password" autoComplete="new-password" value={form.input.password ?? ""} className={fieldClass} onChange={(e) => setForm({ ...form, input: { ...form.input, password: e.target.value } })} /></label><div className="flex justify-end"><Button variant="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar usuario"}</Button></div></form></OperationModal>}
    <ConfirmDialog open={!!pending} title={pending?.active ? "¿Desactivar usuario?" : "¿Activar usuario?"} destructive={pending?.active ?? false} confirmLabel={pending?.active ? "Desactivar" : "Activar"} description={<div><p>{pending?.name}. {pending?.active ? "No podrá iniciar sesión." : "Podrá iniciar sesión con su rol asignado."}</p><Notice error={error} text={error ? message : ""} /></div>} onCancel={() => !busy && setPending(null)} onConfirm={() => pending ? run(() => setUserActive(actor, pending.id, !pending.active)) : undefined} />
  </div>;
}
function UserStatus({ active }: { active: boolean }) { return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${active ? "border-success/20 bg-success-soft text-success" : "border-peach/40 bg-peach-soft text-peach-foreground"}`}>{active ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}{active ? "Activo" : "Inactivo"}</span>; }